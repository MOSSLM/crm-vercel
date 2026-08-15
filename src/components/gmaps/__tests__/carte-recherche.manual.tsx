/**
 * Relecture À L'ŒIL du suivi de recherche — ce n'est pas un test.
 *
 * jsdom ne met rien en page : il ne dit ni si les tuiles se superposent, ni si
 * la teinte du fond passe sur le thème sombre, ni si la vignette de situation
 * chevauche la légende. Ce fichier rejoue le composant avec un VRAI statut de
 * crawl capturé en production, puis écrit la page rendue sur disque pour qu'on
 * l'ouvre au navigateur.
 *
 *     npx jest --testMatch='**\/carte-recherche.manual.tsx'
 *
 * Le statut vient de `scratchpad/statut-reel.json` ; à défaut, un statut de
 * démonstration est fabriqué, pour que le fichier reste exécutable ailleurs.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { act, render } from "@testing-library/react";
import { SuiviRecherche } from "../SuiviRecherche";
import { FileRecherches } from "../FileRecherches";
import { JobStatusSchema } from "@/lib/gmaps/contract";

const RACINE = path.resolve(__dirname, "../../../..");
const SORTIE = path.join(os.tmpdir(), "apercu-suivi-recherche.html");
/**
 * Statut de crawl à rejouer. Pour regarder de VRAIES données plutôt que le
 * jeu de démonstration, capturer un job en cours puis pointer dessus :
 *
 *     curl -H "Authorization: Bearer $API_TOKEN" \
 *       http://localhost:3000/crawl/<jobId> > /tmp/statut.json
 *     STATUT_CRAWL=/tmp/statut.json npx jest --testMatch='**\/carte-recherche.manual.tsx'
 */
const STATUT_REEL = process.env.STATUT_CRAWL || "";

/** Le fond de carte est servi depuis public/ : on le sert ici depuis le disque. */
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  global.fetch = jest.fn(async (url: unknown) => {
    const cible = String(url);
    // Les repères de villes passent par une route authentifiée : hors du
    // navigateur, on sert un extrait capturé de `communes_fr`.
    const fichier = cible.startsWith("/api/geo/communes/contours")
      ? process.env.CONTOURS_CRAWL || ""
      : cible.startsWith("/api/geo/communes")
        ? process.env.COMMUNES_CRAWL || ""
        : path.join(RACINE, "public", cible);
    if (!fichier || !fs.existsSync(fichier)) return { ok: false, status: 404 } as Response;
    return {
      ok: true,
      json: async () => JSON.parse(fs.readFileSync(fichier, "utf8")),
    } as Response;
  }) as unknown as typeof fetch;
});

function statutDeDemonstration() {
  return {
    jobId: "demo",
    status: "running",
    found: 49,
    inserted: 31,
    merged: 18,
    saved: 31,
    pages: 0,
    tilesDone: 2,
    tilesTotal: 6,
    rechercheIds: {},
    error: null,
    metadata: {},
    grille: {
      latitudes: [45.9282898, 45.8782898, 45.8282898],
      longitudes: [1.1462757, 1.1962757, 1.2462757, 1.2962757],
      rangees: 2,
      colonnes: 3,
      total: 6,
      tileStep: 0.05,
      source: "openstreetmap",
    },
    tuiles: [31, 18, null, null, null, null],
    points: [],
    pointsDepuis: 0,
    pointsTotal: 0,
  };
}

it("écrit un aperçu du suivi de recherche", async () => {
  const brut = STATUT_REEL && fs.existsSync(STATUT_REEL)
    ? { ...JSON.parse(fs.readFileSync(STATUT_REEL, "utf8")), jobId: "reel" }
    : statutDeDemonstration();
  const statut = JobStatusSchema.parse(brut);

  const { container } = render(
    <div className="space-y-4">
      <SuiviRecherche
      motCle="plombier"
      lieu="Limoges, France"
      status={statut.status}
      stats={statut}
      points={statut.points}
        contour={statut.contour}
      />
      <FileRecherches
        jobs={[
          {
            jobId: "en-cours",
            status: "running",
            location: "Limoges, France",
            businessTypes: ["plombier"],
            found: statut.found,
            inserted: statut.inserted,
            merged: statut.merged,
            tilesDone: statut.tilesDone,
            tilesTotal: statut.tilesTotal,
          },
          {
            jobId: "attente-1",
            status: "pending",
            location: "Nemours, France",
            businessTypes: ["plombier"],
            found: 0, inserted: 0, merged: 0, tilesDone: 0, tilesTotal: 0,
          },
          {
            jobId: "attente-2",
            status: "pending",
            location: "Corbeil-Essonnes, France",
            businessTypes: ["electricien", "chauffagiste"],
            found: 0, inserted: 0, merged: 0, tilesDone: 0, tilesTotal: 0,
          },
        ]}
        jobAffiche="en-cours"
        onAfficher={() => {}}
      />
    </div>,
  );

  // Le fond de carte arrive par une promesse : sans ce tour de boucle, on
  // écrirait la page AVANT que les contours de départements ne soient posés.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");
  // Seuls les jetons de couleur sont repris de globals.css : le reste du
  // fichier est du Tailwind, que ce montage n'a pas à compiler.
  const globals = lire("src/app/(crm)/globals.css");
  const jetons = (globals.match(/:root\s*\{[\s\S]*?\}/) ?? [""])[0];
  const jetonsSombres = (globals.match(/\.dark\s*\{[\s\S]*?\}/) ?? [""])[0];

  // UNE page par thème, et non deux panneaux dans le même document : les deux
  // SVG partageraient alors les identifiants de leur <defs>, et `url(#rlive-trame)`
  // du second résoudrait vers le motif du premier. Travers de l'aperçu, pas du
  // composant — l'application n'affiche jamais deux suivis à la fois.
  const page = (theme: "clair" | "sombre") => `<!doctype html><meta charset="utf-8">
<title>Aperçu — suivi de recherche (${theme})</title>
<style>
${jetons}
${jetonsSombres}
body { margin:0; padding:24px; font-family: var(--font-family-base, system-ui, sans-serif);
       background: ${theme === "sombre" ? "#071426" : "var(--bg)"}; }
.volet { max-width: 760px; margin: 0 auto; }
${lire("src/app/(crm)/carte/carte.css")}
${lire("src/components/gmaps/carte-recherche.css")}
</style>
<body class="${theme === "sombre" ? "dark" : ""}">
<div class="volet">${container.innerHTML}</div>`;

  fs.writeFileSync(SORTIE.replace(".html", "-clair.html"), page("clair"));
  fs.writeFileSync(SORTIE.replace(".html", "-sombre.html"), page("sombre"));
  // eslint-disable-next-line no-console
  console.log("aperçus écrits :", SORTIE.replace(".html", "-{clair,sombre}.html"),
    `(${statut.points.length} points)`);
});
