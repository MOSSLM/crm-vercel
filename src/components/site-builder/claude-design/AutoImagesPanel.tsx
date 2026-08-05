"use client";

import React from "react";
import { toast } from "sonner";
import { Shuffle, AlertTriangle, Wand2 } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";

interface DrawnSlot {
  order: number;
  url: string;
  alt: string;
  tag: string | null;
}

interface ZoneInfo {
  id: string;
  label: string;
  hint: string;
  slotCount: number;
  pages: Array<{ slug: string; slots: number }>;
  /** What the band shows right now — present from the first load. */
  slots: DrawnSlot[];
}

interface Pool {
  tag: string;
  label: string;
  available: number;
  needed: number;
}

interface State {
  zones: ZoneInfo[];
  companyTags: string[];
  pools: Pool[];
  emptyTags: string[];
  librarySize: number;
}

interface DrawResponse {
  seed: number;
  zones: Array<{ zoneId: string; label: string; pages: Array<{ slug: string; slots: number }>; slots: DrawnSlot[] }>;
  pools: Pool[];
  emptyTags: string[];
  written: number;
}

/**
 * Right-inspector card that fills the design's "réalisations" band from the
 * media library, for the company currently applied.
 *
 * That band is the one place where the number of photos is FIXED (six, on the
 * home page and on every service page) and only their subject depends on the
 * company's trades — everywhere else either the page or the section count itself
 * varies, which is why nothing else is auto-filled here.
 *
 * A draw writes tagged image SETS, so it serves the company it was made for and
 * still resolves correctly for any other company the design is shown to. The
 * pool counts below the button are the operator's cue to import more photos:
 * a trade with fewer images than slots repeats itself.
 */
export function AutoImagesPanel({
  siteId,
  entrepriseId,
  companyName,
  onDone,
}: {
  siteId: string;
  /** The company the preview is showing — null with sample data. */
  entrepriseId: number | null;
  companyName: string | null;
  onDone?: () => void;
}) {
  const [state, setState] = React.useState<State | null>(null);
  /** The band as last known — seeded by the GET, replaced by every draw. */
  const [slots, setSlots] = React.useState<DrawnSlot[]>([]);
  const [busy, setBusy] = React.useState(false);
  /** The slot being swapped, so only its thumbnail shows the spinner. */
  const [swapping, setSwapping] = React.useState<number | null>(null);

  // Reload the zones + pools whenever the applied company changes: the pools are
  // reported for ITS trades, and a stale list would advertise the wrong stock.
  // The response also carries what the band currently shows, so the per-photo
  // swap works on a freshly opened editor, not only right after a draw.
  React.useEffect(() => {
    let alive = true;
    const qs = entrepriseId != null ? `?entreprise_id=${entrepriseId}` : "";
    authedFetch(`/api/site-builder/designs/${siteId}/auto-images${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: State | null) => {
        if (!alive) return;
        setState(d);
        setSlots(d?.zones?.[0]?.slots ?? []);
      })
      .catch(() => { if (alive) { setState(null); setSlots([]); } });
    return () => { alive = false; };
  }, [siteId, entrepriseId]);

  /** `slot` omitted → redraw the whole band; `slot` given → swap that photo. */
  const run = async (slot?: number) => {
    if (entrepriseId == null) return;
    if (slot === undefined) setBusy(true); else setSwapping(slot);
    const t = toast.loading(slot === undefined ? "Tirage des photos…" : `Nouvelle photo ${slot}…`);
    try {
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/auto-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrepriseId, ...(slot === undefined ? {} : { slot }) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || "Tirage impossible");
      const result = body as DrawResponse;
      setSlots(result.zones[0]?.slots ?? []);
      setState((prev) => (prev ? { ...prev, pools: result.pools, emptyTags: result.emptyTags } : prev));
      if (slot === undefined) {
        const pages = result.zones.reduce((n, z) => n + z.pages.length, 0);
        toast.success(`${result.written} emplacement(s) remplis sur ${pages} page(s)`, { id: t });
      } else {
        toast.success(`Photo ${slot} remplacée`, { id: t });
      }
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tirage impossible", { id: t });
    } finally {
      setBusy(false);
      setSwapping(null);
    }
  };

  if (!state || state.zones.length === 0) return null;

  const zone = state.zones[0];
  const short = state.pools.filter((p) => p.available > 0 && p.available < p.needed);
  const totalPages = state.zones.reduce((n, z) => n + z.pages.length, 0);

  return (
    <div className="cd-autoimg">
      <div className="cd-missimg-hd">
        <span className="cd-missimg-ic"><Wand2 className="ico-sm" /></span>
        <div className="cd-grow">
          <b>Photos de réalisations</b>
          <span>{zone.hint}</span>
        </div>
        <span className="cd-missimg-count">{zone.slotCount}</span>
      </div>

      <div className="cd-autoimg-body">
        {entrepriseId == null ? (
          <p className="cd-autoimg-note">
            Choisis une entreprise (bouton « Tester » en haut) : les photos sont tirées selon ses services.
          </p>
        ) : (
          <>
            <p className="cd-autoimg-note">
              {zone.slotCount} photos tirées de la médiathèque selon les services de <b>{companyName ?? "l’entreprise"}</b>,
              posées à l’identique sur les {totalPages} pages qui portent la section.
            </p>

            {state.companyTags.length === 0 ? (
              <p className="cd-autoimg-warn">
                <AlertTriangle className="ico-xs" />
                Cette entreprise n’a aucun service tag — impossible de choisir des photos adaptées.
              </p>
            ) : (
              <div className="cd-autoimg-pools">
                {state.pools.map((p) => (
                  <span
                    key={p.tag}
                    className={"cd-autoimg-pool" + (p.available === 0 ? " empty" : p.available < p.needed ? " short" : "")}
                    title={
                      p.available === 0
                        ? "Aucune image de la médiathèque ne porte ce service"
                        : `${p.available} image(s) en médiathèque · ${p.needed} nécessaire(s) pour ne pas répéter`
                    }
                  >
                    {p.label}
                    <b>{p.available}</b>
                  </span>
                ))}
              </div>
            )}

            {state.emptyTags.length > 0 && (
              <p className="cd-autoimg-warn">
                <AlertTriangle className="ico-xs" />
                Aucune photo taguée « {state.emptyTags.join(" », « ")} » — importe-en dans la médiathèque.
              </p>
            )}
            {short.length > 0 && (
              <p className="cd-autoimg-warn">
                <AlertTriangle className="ico-xs" />
                Trop peu de photos pour {short.map((p) => p.label).join(", ")} : certaines se répéteront.
              </p>
            )}

            <button
              className="cd-btn accent"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={busy || swapping !== null || state.companyTags.length === 0}
              onClick={() => run()}
            >
              <Shuffle className="ico-sm" />{slots.length > 0 ? "Retirer au sort" : "Tirer les photos"}
            </button>

            {slots.length > 0 && (
              <>
                <div className="cd-autoimg-grid">
                  {slots.map((s) => (
                    <figure
                      key={s.order}
                      className="cd-autoimg-thumb"
                      title={`${s.alt || "Sans description"}${s.tag ? ` · ${s.tag}` : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt={s.alt} loading="lazy" />
                      {s.tag ? <figcaption>{s.tag}</figcaption> : null}
                      {/* Remplace CETTE photo seulement — le reste de la bande
                          ne bouge pas, et le métier de l'emplacement est
                          conservé pour ne pas casser l'alternance. */}
                      <button
                        type="button"
                        className="cd-autoimg-swap"
                        aria-label={`Changer la photo ${s.order}`}
                        title="Changer cette photo"
                        disabled={busy || swapping !== null}
                        onClick={() => run(s.order)}
                      >
                        <Shuffle className="ico-xs" />
                      </button>
                      {swapping === s.order ? <span className="cd-autoimg-busy" /> : null}
                    </figure>
                  ))}
                </div>
                <p className="cd-autoimg-note">
                  Survole une photo et clique l’icône pour ne changer que celle-là.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AutoImagesPanel;
