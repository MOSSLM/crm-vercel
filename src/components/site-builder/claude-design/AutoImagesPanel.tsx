"use client";

import React from "react";
import { toast } from "sonner";
import { Shuffle, AlertTriangle, Wand2, Images, X, ImageOff } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { serviceTagKey } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";

interface DrawnSlot {
  order: number;
  url: string;
  alt: string;
  tag: string | null;
  /** The card was dropped: the library had nothing left for it that the band
   *  was not already showing. Acting on the slot brings it back. */
  hidden: boolean;
}

/** A media-library photo the picker may offer, tags already canonical. */
interface PickableImage {
  id: string;
  url: string;
  alt: string;
  tags: string[];
}

/** The picker's chip for photos that document no particular trade. */
const GENERIC_CHIP = "__generic";

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
  /** Distinct photos the company's trades hold between them. Below the slot
   *  count, the band gives up its extra cards rather than repeat a photo. */
  distinctAvailable: number;
  librarySize: number;
  /** Everything the per-slot picker may offer — already narrowed to the
   *  company's trades (plus the generic photos) by the API. */
  library: PickableImage[];
}

interface DrawResponse {
  seed: number;
  zones: Array<{ zoneId: string; label: string; pages: Array<{ slug: string; slots: number }>; slots: DrawnSlot[] }>;
  pools: Pool[];
  emptyTags: string[];
  distinctAvailable: number;
  hiddenSlots: number;
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
 *
 * Three ways to fill a slot, from the fastest to the most deliberate: draw the
 * whole band, re-roll one photo, or pick one by hand — the picker lists the
 * library BY TRADE, so choosing the climatisation photo of slot 3 never means
 * scrolling past the ventilation ones.
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
  /** The slot whose library picker is open, and the trade it is filtered on. */
  const [picking, setPicking] = React.useState<number | null>(null);
  const [pickTag, setPickTag] = React.useState<string>(GENERIC_CHIP);

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
        // Another company means another library and other trades: a picker left
        // open would be filtered on a trade this one may not even have.
        setPicking(null);
      })
      .catch(() => { if (alive) { setState(null); setSlots([]); setPicking(null); } });
    return () => { alive = false; };
  }, [siteId, entrepriseId]);

  /**
   * `slot` omitted → redraw the whole band; `slot` given → change that photo
   * only, at random or — with `url` — for the one the operator picked.
   */
  const run = async (slot?: number, url?: string) => {
    if (entrepriseId == null) return;
    if (slot === undefined) setBusy(true); else setSwapping(slot);
    const t = toast.loading(
      slot === undefined ? "Tirage des photos…" : url ? `Photo ${slot}…` : `Nouvelle photo ${slot}…`,
    );
    try {
      const res = await authedFetch(`/api/site-builder/designs/${siteId}/auto-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrepriseId, ...(slot === undefined ? {} : { slot }), ...(url ? { url } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || "Tirage impossible");
      const result = body as DrawResponse;
      setSlots(result.zones[0]?.slots ?? []);
      setState((prev) => (prev
        ? { ...prev, pools: result.pools, emptyTags: result.emptyTags, distinctAvailable: result.distinctAvailable }
        : prev));
      if (slot === undefined) {
        const pages = result.zones.reduce((n, z) => n + z.pages.length, 0);
        toast.success(`${result.written} emplacement(s) remplis sur ${pages} page(s)`, { id: t });
      } else {
        toast.success(url ? `Photo ${slot} choisie` : `Photo ${slot} remplacée`, { id: t });
        setPicking(null);
      }
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tirage impossible", { id: t });
    } finally {
      setBusy(false);
      setSwapping(null);
    }
  };

  // The picker is modeless (it pushes the panel's content down rather than
  // floating over it), so nothing else would close it on Escape.
  React.useEffect(() => {
    if (picking === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  /** Opens the picker on a slot, filtered on the trade it already shows — the
   *  operator wants ANOTHER climatisation photo far more often than a photo of
   *  something else. */
  const openPicker = (slot: DrawnSlot, chips: Array<{ key: string }>) => {
    const key = slot.tag ? serviceTagKey(slot.tag) : "";
    setPickTag(chips.some((c) => c.key === key) ? key : chips[0]?.key ?? GENERIC_CHIP);
    setPicking(slot.order);
  };

  if (!state || state.zones.length === 0) return null;

  const zone = state.zones[0];
  const totalPages = state.zones.reduce((n, z) => n + z.pages.length, 0);

  // Two different shortages, and confusing them is what made the old warning
  // useless. `gap` is the blocking one: fewer DISTINCT photos than the band has
  // slots, so cards are dropped — importing anything tagged for one of these
  // trades fixes it. `short` is cosmetic: a trade below its share, so the band
  // leans on the others; nothing repeats, nothing disappears.
  const gap = Math.max(0, zone.slotCount - state.distinctAvailable);
  const short = state.pools
    .filter((p) => p.available > 0 && p.available < p.needed)
    .map((p) => ({ ...p, missing: p.needed - p.available }));
  const stocked = state.pools.filter((p) => p.available >= p.needed && p.needed > 0);

  // What the picker offers, trade by trade: the company's own trades as the
  // library stocks them, then the generic photos — those fit any slot.
  const library = state.library ?? [];
  const genericImages = library.filter(
    (img) => img.tags.length === 0 || img.tags.includes(MEDIA_LIBRARY_UNIVERSAL_TAG),
  );
  const chips = [
    ...state.pools
      .map((p) => ({ key: p.tag, label: p.label, images: library.filter((img) => img.tags.includes(p.tag)) }))
      .filter((chip) => chip.images.length > 0),
    ...(genericImages.length > 0
      ? [{ key: GENERIC_CHIP, label: "Génériques", images: genericImages }]
      : []),
  ];
  const shown = chips.find((chip) => chip.key === pickTag)?.images ?? [];
  // A photo already on the band: still pickable, but worth flagging — the whole
  // point of the draw is that the six are distinct.
  const bandUrls = new Set(slots.map((s) => s.url));

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
                        : p.available < p.needed
                          ? `${p.available} photo(s) en médiathèque · ${p.needed} pour que ce service tienne sa part de la bande`
                          : `${p.available} photo(s) en médiathèque · ${p.needed} suffisent, ce service n’en demande pas plus`
                    }
                  >
                    {p.label}
                    <b>{p.available}</b>
                    {p.available > 0 && p.available < p.needed ? <i>+{p.needed - p.available}</i> : null}
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

            {/* Combien importer, et de quoi : le seul chiffre qui décide, c'est
                le nombre de photos DISTINCTES — une photo taguée pour deux
                services ne remplit qu'un emplacement. */}
            {gap > 0 && (
              <div className="cd-autoimg-plan short">
                <p>
                  <AlertTriangle className="ico-xs" />
                  <span>
                    <b>{state.distinctAvailable} photo(s) distincte(s)</b> pour {zone.slotCount} emplacements :
                    {" "}{gap} carte(s) sont retirées de la bande — jamais deux fois la même photo.
                  </span>
                </p>
                <p className="cd-autoimg-todo">
                  Importe <b>{gap} photo(s) de plus</b>, taguée(s)
                  {" "}{state.pools.length > 0
                    ? `« ${state.pools.map((p) => p.label).join(" », « ")} »`
                    : "aux services de l’entreprise"} : les cartes reviennent au prochain tirage.
                </p>
              </div>
            )}
            {gap === 0 && short.length > 0 && (
              <div className="cd-autoimg-plan">
                <p className="cd-autoimg-todo">
                  Les {zone.slotCount} photos sont distinctes. Pour équilibrer l’alternance :
                  {" "}{short.map((p) => `+${p.missing} « ${p.label} »`).join(", ")}.
                  {stocked.length > 0 && ` ${stocked.map((p) => `« ${p.label} »`).join(", ")} n’en `}
                  {stocked.length > 0 && (stocked.length > 1 ? "ont pas besoin de plus." : "a pas besoin de plus.")}
                </p>
              </div>
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
                      className={"cd-autoimg-thumb" + (picking === s.order ? " on" : "") + (s.hidden ? " gone" : "")}
                      title={
                        s.hidden
                          ? "Carte retirée de la bande : pas de photo disponible sans répéter une autre. Choisis-en une pour la remettre."
                          : `${s.alt || "Sans description"}${s.tag ? ` · ${s.tag}` : ""}`
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt={s.alt} loading="lazy" />
                      {s.hidden
                        ? <figcaption className="gone"><ImageOff className="ico-xs" />Retirée</figcaption>
                        : s.tag ? <figcaption>{s.tag}</figcaption> : null}
                      {/* Les deux actions ne touchent que CET emplacement : le
                          reste de la bande ne bouge pas, et le métier est
                          conservé pour ne pas casser l'alternance. */}
                      <div className="cd-autoimg-tools">
                        <button
                          type="button"
                          className="cd-autoimg-tool"
                          aria-label={`Choisir la photo ${s.order} dans la médiathèque`}
                          aria-expanded={picking === s.order}
                          title="Choisir la photo dans la médiathèque"
                          disabled={busy || swapping !== null || chips.length === 0}
                          onClick={() => (picking === s.order ? setPicking(null) : openPicker(s, chips))}
                        >
                          <Images className="ico-xs" />
                        </button>
                        <button
                          type="button"
                          className="cd-autoimg-tool"
                          aria-label={`Changer la photo ${s.order}`}
                          title="Tirer une autre photo au sort"
                          disabled={busy || swapping !== null}
                          onClick={() => run(s.order)}
                        >
                          <Shuffle className="ico-xs" />
                        </button>
                      </div>
                      {swapping === s.order ? <span className="cd-autoimg-busy" /> : null}
                    </figure>
                  ))}
                </div>

                {picking !== null ? (
                  <div className="cd-autoimg-picker">
                    <div className="cd-autoimg-picker-hd">
                      <b>Emplacement {picking}</b>
                      <span className="cd-grow">choisis sa photo par service</span>
                      <button
                        type="button"
                        className="cd-autoimg-picker-x"
                        aria-label="Fermer le sélecteur"
                        onClick={() => setPicking(null)}
                      >
                        <X className="ico-xs" />
                      </button>
                    </div>
                    <div className="cd-autoimg-chips">
                      {chips.map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          className={"cd-autoimg-chip" + (chip.key === pickTag ? " on" : "")}
                          onClick={() => setPickTag(chip.key)}
                        >
                          {chip.label}<b>{chip.images.length}</b>
                        </button>
                      ))}
                    </div>
                    <div className="cd-autoimg-choices">
                      {shown.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          className={
                            "cd-autoimg-choice"
                            + (slots.find((s) => s.order === picking)?.url === img.url ? " on" : "")
                            + (bandUrls.has(img.url) ? " used" : "")
                          }
                          title={
                            (img.alt || "Sans description")
                            + (bandUrls.has(img.url) ? " · déjà dans la bande" : "")
                          }
                          disabled={busy || swapping !== null}
                          onClick={() => run(picking, img.url)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.alt} loading="lazy" />
                          {bandUrls.has(img.url) ? <span className="cd-autoimg-dup">déjà</span> : null}
                        </button>
                      ))}
                    </div>
                    <p className="cd-autoimg-note">
                      La photo choisie est posée sur cet emplacement des {totalPages} pages ; les autres
                      entreprises gardent une photo de leur propre métier.
                    </p>
                  </div>
                ) : null}

                <p className="cd-autoimg-note">
                  Survole une photo : <b>l’icône médiathèque</b> pour choisir la tienne par service,
                  <b> les flèches</b> pour en tirer une autre au sort. Une photo posée n’est jamais
                  reprise ailleurs dans la bande, même si elle porte plusieurs services — quitte à
                  retirer une carte plutôt qu’à la doubler.
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
