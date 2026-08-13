// Globe.ts — port of an-globe.js (voxel-relief globe) to an ES module.
//
// Faithful port: same rendering technique (instanced-mesh cube relief, great-
// circle arcs, city markers, drag/zoom/hover), same "v2 bleu" theme as the
// design. Turned the original singleton IIFE into a factory (createAnGlobe)
// so each mounted <GlobeStage/> owns its own THREE scene instead of sharing
// module-level state — the original assumed exactly one globe on the page at
// a time, which React's strict-mode double-effect would violate.
import * as THREE from "three";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import { LOW_VOLUME_TOTAL, reliefKm, SHADES, shadeIndex } from "./globe-scale";

const DEG = Math.PI / 180;
const KM = 1 / 6371; // 1 km en unités monde (rayon = 1)
const LAND_URLS = [
  "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json",
  "https://unpkg.com/world-atlas@2.0.2/countries-110m.json",
];

async function fetchLand(): Promise<Topology> {
  let err: unknown;
  for (const u of LAND_URLS) {
    try {
      const r = await fetch(u, { mode: "cors" });
      if (r.ok) return (await r.json()) as Topology;
      err = new Error(String(r.status));
    } catch (e) {
      err = e;
    }
  }
  throw err instanceof Error ? err : new Error("land unavailable");
}

// Thème « Sama CRM » bleu / blanc — aligné sur la DA du CRM (an-v2.css).
const TH = {
  ocean: "#B9D2EC",
  oceanDeep: "#A6C4E4",
  land: "#FBFDFF",
  landAlt: "#EDF3FA",
  rim: "#7FB6F5",
  grat: "#9FBCDD",
  gratOp: 0.34,
  arc: "#2F7AE0",
  arcDot: "#123E86",
  ping: "#2F7AE0",
  marker: "#123E86",
};

const SHADE_COLORS = SHADES.map((c) => new THREE.Color(c));
function ll2v(lat: number, lon: number, r = 1, out = new THREE.Vector3()) {
  const la = lat * DEG;
  const lo = lon * DEG;
  const cl = Math.cos(la);
  return out.set(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
}
function discTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, "rgba(255,255,255,1)");
  rad.addColorStop(0.4, "rgba(255,255,255,.95)");
  rad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rad;
  g.beginPath();
  g.arc(32, 32, 32, 0, 7);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// grille fine (Europe / France) et grille monde
const FINE = { lat0: 32, lat1: 62, lon0: -14, lon1: 28, step: 0.22 }; // ≈ 24 km
const WORLD = { step: 0.68 }; // ≈ 75 km
const SIGMA_KM = 78;

export interface GlobeHubRow {
  c: string;
  lat: number | null;
  lon: number | null;
  /** Visites (sessions GA4) rattachées à cette ville. */
  n: number;
  rg?: string;
  /** Part des visites totales, 0..1 — calculée côté API sur les vraies sessions. */
  share?: number;
  /** Sites démo distincts réellement consultés depuis cette ville (GA4). */
  visitedSites?: number;
  /** Sites démo publiés pour des entreprises de cette ville (base CRM). */
  citySites?: number;
}

export interface AnGlobeHandle {
  mount(el: HTMLElement, opts?: { onHover?: (tip: (GlobeHubRow & { x: number; y: number }) | null) => void; onSelect?: (city: string) => void; origin?: { c: string; lat: number; lon: number } }): void;
  setData(rows: GlobeHubRow[]): void;
  ping(city: string): void;
  focus(city: string): void;
  resize(): void;
  setSpin(v: boolean): void;
  getSpin(): boolean;
  zoomBy(d: number): void;
  reset(): void;
  isReady(): boolean;
  dispose(): void;
}

type Grid = {
  mesh: THREE.InstancedMesh;
  lats: Float32Array;
  lons: Float32Array;
  wx: Float32Array;
  wz: Float32Array;
  n: number;
  /** Visites pondérées (somme gaussienne) — pilote la HAUTEUR du cube. */
  vals: Float32Array;
  /** Proximité à une ville, 0..1, indépendante du nombre de visites —
   *  pilote seulement le fondu du bord, pour que la NUANCE reste celle de la
   *  part de visites et non un simple dégradé radial. */
  prox: Float32Array;
};
type PlacedHubRow = GlobeHubRow & { lat: number; lon: number };
type Marker = { grp: THREE.Group; pk: THREE.Mesh; h: number; ht: number; data: PlacedHubRow };
type Arc = { line: THREE.Line; dot: THREE.Sprite; curve: THREE.QuadraticBezierCurve3; t: number; sp: number };
type Ping = { wrap: THREE.Group; mesh: THREE.Mesh; t: number; zs: number };

export function createAnGlobe(): AnGlobeHandle {
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let cam: THREE.PerspectiveCamera | null = null;
  let globe: THREE.Group | null = null;
  let grids: Grid[] = [];
  const markers = new Map<string, Marker>();
  let pickG: THREE.Group | null = null;
  let arcs: Arc[] = [];
  const pings: Ping[] = [];
  let raf = 0;
  let host: HTMLElement | null = null;
  let cb: { onHover?: (tip: (GlobeHubRow & { x: number; y: number }) | null) => void; onSelect?: (city: string) => void } = {};
  let rotX = 44 * DEG;
  let rotY = -6 * DEG;
  let velY = 0;
  let drag: { x: number; y: number } | null = null;
  let spin = true;
  let zoom = 4.15;
  let zoomT = 4.15;
  let hovered: string | null = null;
  let dotTex: THREE.CanvasTexture | null = null;
  let ready = false;
  let origin = { c: "Nantes", lat: 47.2184, lon: -1.5536 };
  let lastRows: GlobeHubRow[] = [];
  let resizeObserver: ResizeObserver | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-2, -2);
  let lastPointer = { x: 0, y: 0 };

  function buildSphere() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.9975, 96, 64),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(TH.ocean) }),
    );
    core.name = "core";
    g.add(core);
    const pts: THREE.Vector3[] = [];
    for (let lat = -60; lat <= 60; lat += 30)
      for (let lon = -180; lon < 180; lon += 4) {
        pts.push(ll2v(lat, lon, 1.0015).clone(), ll2v(lat, lon + 4, 1.0015).clone());
      }
    for (let lon = -180; lon < 180; lon += 30)
      for (let lat = -86; lat < 86; lat += 4) {
        pts.push(ll2v(lat, lon, 1.0015).clone(), ll2v(lat + 4, lon, 1.0015).clone());
      }
    g.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: new THREE.Color(TH.grat), transparent: true, opacity: TH.gratOp }),
      ),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.075, 48, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: { uC: { value: new THREE.Color(TH.rim) } },
        vertexShader:
          "varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; gl_Position=projectionMatrix*mv; }",
        fragmentShader:
          "varying vec3 vN; varying vec3 vP; uniform vec3 uC; void main(){ float d=abs(dot(normalize(vN),normalize(-vP))); float i=pow(1.0-d,2.9)*0.5; gl_FragColor=vec4(uC,i); }",
      }),
    );
    halo.name = "halo";
    g.add(halo);
    return g;
  }

  function makeGrid(cells: Array<{ lat: number; lon: number; wx: number; wz: number }>, name: string, inset: number): Grid {
    const n = cells.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const lats = new Float32Array(n);
    const lons = new Float32Array(n);
    const wx = new Float32Array(n);
    const wz = new Float32Array(n);
    cells.forEach((c, i) => {
      lats[i] = c.lat;
      lons[i] = c.lon;
      wx[i] = c.wx * inset;
      wz[i] = c.wz * inset;
    });
    return { mesh, lats, lons, wx, wz, n, vals: new Float32Array(n), prox: new Float32Array(n) };
  }

  async function buildLand(parent: THREE.Group) {
    const topo = await fetchLand();
    const countriesObj = topo.objects.countries as GeometryCollection;
    const fc = feature(topo, countriesObj);
    const W = 2048;
    const H = 1024;
    const cvs = document.createElement("canvas");
    cvs.width = W;
    cvs.height = H;
    const ctx = cvs.getContext("2d")!;
    const proj = geoEquirectangular().translate([W / 2, H / 2]).scale(W / (2 * Math.PI));
    const p = geoPath(proj, ctx as unknown as CanvasRenderingContext2D);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    // topojson-client's `feature` on a GeometryCollection returns a FeatureCollection.
    p(fc as unknown as Parameters<typeof p>[0]);
    ctx.fill();
    const px = ctx.getImageData(0, 0, W, H).data;
    const isLand = (lat: number, lon: number) => {
      const x = Math.min(W - 1, Math.max(0, Math.round(((lon + 180) / 360) * W)));
      const y = Math.min(H - 1, Math.max(0, Math.round(((90 - lat) / 180) * H)));
      return px[(y * W + x) * 4 + 3] > 120;
    };
    const inFine = (lat: number, lon: number) => lat >= FINE.lat0 && lat <= FINE.lat1 && lon >= FINE.lon0 && lon <= FINE.lon1;

    const fine: Array<{ lat: number; lon: number; wx: number; wz: number }> = [];
    const world: Array<{ lat: number; lon: number; wx: number; wz: number }> = [];
    for (let lat = FINE.lat0; lat <= FINE.lat1; lat += FINE.step) {
      const cl = Math.max(0.2, Math.cos(lat * DEG));
      const lonStep = FINE.step / cl;
      for (let lon = FINE.lon0; lon <= FINE.lon1; lon += lonStep) {
        if (!isLand(lat, lon)) continue;
        fine.push({ lat, lon, wx: lonStep * DEG * cl, wz: FINE.step * DEG });
      }
    }
    for (let lat = -84; lat <= 84; lat += WORLD.step) {
      const cl = Math.max(0.18, Math.cos(lat * DEG));
      const lonStep = WORLD.step / cl;
      for (let lon = -180; lon < 180; lon += lonStep) {
        if (inFine(lat, lon) || !isLand(lat, lon)) continue;
        world.push({ lat, lon, wx: lonStep * DEG * cl, wz: WORLD.step * DEG });
      }
    }
    if (disposed) return;
    grids = [makeGrid(world, "gridWorld", 0.9), makeGrid(fine, "gridFine", 0.86)];
    grids.forEach((g) => parent.add(g.mesh));
    updateRelief(lastRows);
    ready = true;
  }

  const _n = new THREE.Vector3();
  const _e = new THREE.Vector3();
  const _no = new THREE.Vector3();
  const _Y = new THREE.Vector3(0, 1, 0);
  const _m = new THREE.Matrix4();
  const _c = new THREE.Color();
  const cBase = new THREE.Color(TH.land);
  const cAlt = new THREE.Color(TH.landAlt);

  function updateRelief(rows: GlobeHubRow[]) {
    if (!grids.length) return;
    const pts = (rows || [])
      .filter((r): r is GlobeHubRow & { lat: number; lon: number } => r.lat != null && r.lon != null)
      .map((r) => ({ v: ll2v(r.lat, r.lon, 1).clone(), n: r.n }));
    // Total des visites placées sur le globe — la part de chaque ville se
    // calcule là-dessus, pas sur le total général : une ville sans
    // coordonnées connues ne peut pas diluer les nuances de celles qu'on
    // affiche vraiment.
    const total = pts.reduce((s, p) => s + p.n, 0);
    const lowVolume = total < LOW_VOLUME_TOTAL;
    const sig = SIGMA_KM * KM;
    const cut = sig * 3.4;
    const cut2 = cut * cut;
    grids.forEach((g) => {
      for (let i = 0; i < g.n; i++) {
        ll2v(g.lats[i], g.lons[i], 1, _n);
        let v = 0;
        let prox = 0;
        for (let k = 0; k < pts.length; k++) {
          const d2 = _n.distanceToSquared(pts[k].v);
          if (d2 > cut2) continue;
          const falloff = Math.exp(-d2 / (sig * sig));
          v += pts[k].n * falloff;
          if (falloff > prox) prox = falloff;
        }
        g.vals[i] = v;
        g.prox[i] = prox;
      }
    });
    grids.forEach((g) => {
      for (let i = 0; i < g.n; i++) {
        const v = g.vals[i];
        const h = reliefKm(v) * KM; // strictement linéaire : +PER_VISIT_KM par visite
        ll2v(g.lats[i], g.lons[i], 1, _n);
        _e.crossVectors(_Y, _n);
        if (_e.lengthSq() < 1e-8) _e.set(1, 0, 0);
        _e.normalize();
        _no.crossVectors(_n, _e).normalize();
        _m.makeBasis(_e.multiplyScalar(g.wx[i]), _n.clone().multiplyScalar(h), _no.multiplyScalar(g.wz[i]));
        _m.setPosition(_n.multiplyScalar(0.999 + h / 2));
        g.mesh.setMatrixAt(i, _m);

        if (v < 0.02) {
          // Terre sans visite — texture neutre, jamais bleue.
          _c.copy(i % 7 === 0 || i % 11 === 0 ? cAlt : cBase);
        } else {
          // La NUANCE vient de la part de visites de la ville (constante sur
          // toute sa zone) ; seul le fondu vers la terre suit la distance,
          // pour que le bord ne soit pas un disque à arête franche.
          const shade = SHADE_COLORS[shadeIndex(total > 0 ? v / total : 0, lowVolume)];
          const blend = Math.min(1, 0.35 + g.prox[i] * 1.25);
          _c.copy(cBase).lerp(shade, blend);
        }
        g.mesh.setColorAt(i, _c);
      }
      g.mesh.instanceMatrix.needsUpdate = true;
      if (g.mesh.instanceColor) g.mesh.instanceColor.needsUpdate = true;
    });
  }

  function orient(obj: THREE.Object3D, lat: number, lon: number, r = 1) {
    const n = ll2v(lat, lon, 1);
    obj.position.copy(n).multiplyScalar(r);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  }

  function cityHeight(v: number) {
    return reliefKm(v) * KM;
  }

  function setData(rows: GlobeHubRow[]) {
    lastRows = rows || [];
    if (!globe || !dotTex || !pickG) return;
    updateRelief(lastRows);
    // Même base de calcul que updateRelief : les villes placées sur le globe.
    const placedTotal = lastRows.reduce((s, r) => (r.lat != null && r.lon != null ? s + r.n : s), 0);
    const lowVolume = placedTotal < LOW_VOLUME_TOTAL;
    const max = Math.max(1, ...lastRows.map((r) => r.n));
    const seen = new Set<string>();
    lastRows.forEach((r) => {
      if (r.lat == null || r.lon == null) return;
      const lat = r.lat;
      const lon = r.lon;
      seen.add(r.c);
      const t = Math.pow(r.n / max, 0.62);
      const shade = SHADE_COLORS[shadeIndex(placedTotal > 0 ? r.n / placedTotal : 0, lowVolume)];
      const h = cityHeight(r.n) + 0.004;
      let m = markers.get(r.c);
      if (!m) {
        const grp = new THREE.Group();
        const dot = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: dotTex, color: new THREE.Color(TH.marker), transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }),
        );
        dot.name = "dot";
        grp.add(dot);
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(TH.marker), transparent: true, opacity: 0.5, depthWrite: false }),
        );
        stem.geometry.translate(0, 0.5, 0);
        stem.name = "stem";
        grp.add(stem);
        orient(grp, lat, lon, 0.999);
        globe!.add(grp);
        const pk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.042, 0.042, 1, 6),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        );
        pk.geometry.translate(0, 0.5, 0);
        orient(pk, lat, lon, 0.999);
        pk.userData.city = r.c;
        pickG!.add(pk);
        m = { grp, pk, h, ht: h, data: { ...r, lat, lon } };
        markers.set(r.c, m);
      }
      m.ht = h;
      m.data = { ...r, lat, lon };
      const dotMesh = m.grp.getObjectByName("dot") as THREE.Sprite;
      (dotMesh.material as THREE.SpriteMaterial).color.copy(shade.clone().lerp(new THREE.Color("#FFFFFF"), 0.15));
      (dotMesh.material as THREE.SpriteMaterial).opacity = 0.5 + 0.5 * t;
      (m as Marker & { dotS?: number }).dotS = 0.009 + 0.011 * t;
      m.grp.visible = true;
      m.pk.visible = true;
    });
    markers.forEach((m, c) => {
      if (!seen.has(c)) {
        m.ht = 0;
        m.grp.visible = false;
        m.pk.visible = false;
      }
    });
    buildArcs(lastRows.slice(0, 9));
  }

  function buildArcs(rows: GlobeHubRow[]) {
    arcs.forEach((a) => {
      globe!.remove(a.line);
      globe!.remove(a.dot);
    });
    arcs = [];
    const o = ll2v(origin.lat, origin.lon, 1);
    rows.forEach((r, i) => {
      if (r.c === origin.c || r.lat == null || r.lon == null) return;
      const b = ll2v(r.lat, r.lon, 1);
      const d = o.distanceTo(b);
      const mid = o.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(1 + Math.min(0.3, d * 0.26));
      const curve = new THREE.QuadraticBezierCurve3(o.clone().multiplyScalar(1.004), mid, b.clone().multiplyScalar(1.004));
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(72));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(TH.arc), transparent: true, opacity: 0.3, depthWrite: false }));
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex!, color: new THREE.Color(TH.arcDot), transparent: true, opacity: 0.9, depthWrite: false }));
      dot.scale.setScalar(0.02);
      globe!.add(line);
      globe!.add(dot);
      arcs.push({ line, dot, curve, t: (i * 0.13) % 1, sp: 0.11 + Math.random() * 0.06 });
    });
  }

  function ping(city: string) {
    const m = markers.get(city);
    if (!m) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.009, 0.015, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(TH.ping), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = m.h + 0.004;
    const wrap = new THREE.Group();
    wrap.add(mesh);
    orient(wrap, m.data.lat, m.data.lon, 1.001);
    globe!.add(wrap);
    pings.push({ wrap, mesh, t: 0, zs: Math.max(0.26, Math.min(1.2, zoom / 4.15)) });
  }

  function focus(city: string) {
    const m = markers.get(city);
    if (!m) return;
    rotY = -m.data.lon * DEG;
    rotX = Math.max(-1.15, Math.min(1.15, m.data.lat * DEG));
    velY = 0;
    zoomT = Math.min(zoomT, 1.85);
  }

  function resize() {
    if (!renderer || !host || !cam) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  let lastFrame = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    step();
  }
  function step() {
    if (!renderer || !scene || !cam || !globe) return;
    lastFrame = performance.now();
    if (spin && !drag) velY += (0.0013 - velY) * 0.03;
    else velY *= 0.9;
    rotY += velY;
    globe.rotation.y += (rotY - globe.rotation.y) * 0.12;
    globe.rotation.x += (rotX - globe.rotation.x) * 0.12;
    zoom += (zoomT - zoom) * 0.1;
    cam.position.z = zoom;
    const zs = Math.max(0.24, Math.min(1.15, zoom / 4.15));
    markers.forEach((m) => {
      m.h += (m.ht - m.h) * 0.14;
      const dot = m.grp.getObjectByName("dot")!;
      const stem = m.grp.getObjectByName("stem")!;
      dot.position.y = m.h + 0.008 * zs;
      dot.scale.setScalar(((m as Marker & { dotS?: number }).dotS || 0.012) * zs);
      stem.scale.set(Math.max(0.35, zs), Math.max(0.0001, m.h + 0.008 * zs), Math.max(0.35, zs));
      m.pk.scale.y = Math.max(0.05, m.h + 0.02);
    });
    const now = performance.now() / 1000;
    arcs.forEach((a) => {
      a.t = (a.t + a.sp * 0.016) % 1;
      a.curve.getPoint(a.t, a.dot.position);
      a.dot.scale.setScalar(0.02 * zs);
      (a.dot.material as THREE.SpriteMaterial).opacity = 0.35 + 0.6 * Math.sin(Math.PI * a.t);
      (a.line.material as THREE.LineBasicMaterial).opacity = 0.2 + 0.12 * Math.sin(now * 1.4 + a.t * 3);
    });
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i];
      p.t += 0.02;
      p.mesh.scale.setScalar((1 + p.t * 5) * (p.zs || 1));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - p.t));
      if (p.t >= 1) {
        globe.remove(p.wrap);
        pings.splice(i, 1);
      }
    }
    if (pointer.x > -1.5 && pickG) {
      ray.setFromCamera(pointer, cam);
      let c: string | null = null;
      const hit = ray.intersectObjects(pickG.children.filter((o) => o.visible), false)[0];
      if (hit) c = hit.object.userData.city as string;
      else {
        const core = globe.getObjectByName("core");
        const gh = core ? ray.intersectObject(core, false)[0] : null;
        if (gh) {
          const p = globe.worldToLocal(gh.point.clone()).normalize();
          let best: string | null = null;
          let bd = 1e9;
          markers.forEach((m, name) => {
            if (!m.grp.visible) return;
            const d = ll2v(m.data.lat, m.data.lon, 1).distanceTo(p);
            if (d < bd) {
              bd = d;
              best = name;
            }
          });
          if (best && bd < 190 * KM) c = best;
        }
      }
      if (c !== hovered) {
        hovered = c;
        if (host) host.style.cursor = c ? "pointer" : "grab";
        cb.onHover?.(c ? { ...markers.get(c)!.data, x: lastPointer.x, y: lastPointer.y } : null);
      }
    }
    renderer.render(scene, cam);
  }

  function mount(
    el: HTMLElement,
    opts: { onHover?: (tip: (GlobeHubRow & { x: number; y: number }) | null) => void; onSelect?: (city: string) => void; origin?: { c: string; lat: number; lon: number } } = {},
  ) {
    host = el;
    cb = opts;
    if (opts.origin) origin = opts.origin;
    dotTex = discTexture();
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    cam.position.set(0, 0, zoom);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 2.25));
    const dl = new THREE.DirectionalLight(0xffffff, 1.3);
    dl.position.set(2.2, 2.4, 3);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xbfd8f5, 0.5);
    dl2.position.set(-3, -1.2, -1.5);
    scene.add(dl2);
    globe = buildSphere();
    globe.rotation.set(rotX, rotY, 0);
    scene.add(globe);
    pickG = new THREE.Group();
    globe.add(pickG);
    buildLand(globe).catch((e) => {
      ready = true;
      console.warn("globe land", e);
    });

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    host.style.cursor = "grab";
    dom.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY };
      host!.style.cursor = "grabbing";
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener("pointermove", (e) => {
      const r = dom.getBoundingClientRect();
      lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (!drag) {
        if (hovered) cb.onHover?.({ ...markers.get(hovered)!.data, x: lastPointer.x, y: lastPointer.y });
        return;
      }
      const k = Math.max(0.26, (zoom - 1) / 2.1);
      rotY += (e.clientX - drag.x) * 0.006 * k;
      rotX = Math.max(-1.2, Math.min(1.2, rotX + (e.clientY - drag.y) * 0.005 * k));
      drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => {
      drag = null;
      if (host) host.style.cursor = hovered ? "pointer" : "grab";
    };
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("pointerleave", () => {
      pointer.set(-2, -2);
      if (hovered) {
        hovered = null;
        cb.onHover?.(null);
      }
    });
    dom.addEventListener("click", () => {
      if (hovered) cb.onSelect?.(hovered);
    });
    dom.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        zoomT = Math.max(1.22, Math.min(7.4, zoomT + e.deltaY * 0.0026 * Math.max(0.42, zoomT / 3)));
      },
      { passive: false },
    );
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(el);
    resize();
    loop();
    pollInterval = setInterval(() => {
      if (performance.now() - lastFrame > 150) step();
    }, 55);
  }

  function dispose() {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (pollInterval) clearInterval(pollInterval);
    resizeObserver?.disconnect();
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
    }
  }

  return {
    mount,
    setData,
    ping,
    focus,
    resize,
    setSpin: (v: boolean) => {
      spin = v;
    },
    getSpin: () => spin,
    zoomBy: (d: number) => {
      zoomT = Math.max(1.22, Math.min(7.4, zoomT + d * Math.max(0.4, zoomT / 3.4)));
    },
    reset: () => {
      rotX = 44 * DEG;
      rotY = -6 * DEG;
      zoomT = 4.15;
    },
    isReady: () => ready,
    dispose,
  };
}
