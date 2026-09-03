import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { AUTO_IMAGE_ZONES, findZone } from "@/lib/site-builder/claude-design/auto-image-zones";
import {
  companyTags,
  loadDesignPages,
  loadLibrary,
  placedSlots,
  setGap,
  zoneTargets,
  type DesignPage,
} from "@/lib/site-builder/claude-design/design-pages";
import {
  chooseSlotImage,
  drawImageSets,
  redrawSlot,
  seededRandom,
  type LibraryImage,
} from "@/lib/site-builder/claude-design/draw-image-sets";
import { serializeImageSet, type ImageSetCandidate } from "@/lib/site-builder/claude-design/image-set";
import { clearImageKeys } from "@/lib/site-builder/claude-design/image-override-keys";
import { pushBackup } from "@/lib/site-builder/claude-design/override-backups";
import { enregistrerTirage } from "@/lib/site-builder/claude-design/tirage-entreprise";
import { tirerImagesPourSite } from "@/lib/site-builder/claude-design/tirer-images";
import { invalidateSiteCache } from "@/lib/site-builder/site-cache";
import { serviceTagKey } from "@/utils/serviceTags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { siteId: string };

/** A library photo as the panel's per-slot picker needs it: canonical tag keys,
 *  so the picker filters by trade the way the rest of the codebase compares
 *  tags ("Pompe à chaleur" ≡ "pompe-a-chaleur"). An untagged photo comes out
 *  with no tag at all and counts as generic, exactly like `isUniversal`. */
function pickableImages(library: LibraryImage[]): Array<{ id: string; url: string; alt: string; tags: string[] }> {
  return library.map((img) => ({
    id: img.id,
    url: img.url,
    alt: img.alt ?? "",
    tags: [...new Set((img.tags ?? []).map(serviceTagKey).filter(Boolean))],
  }));
}

/**
 * Ce qui est réellement écrit sur l'emplacement.
 *
 * Sur un GABARIT, le jeu complet : ses candidats par métier sont ce qui lui
 * permet de servir n'importe quelle entreprise, et c'est toute sa raison
 * d'être. Sur le site d'UNE entreprise, la photo est FIGÉE — un seul candidat.
 *
 * Pourquoi figer. Un jeu à plusieurs candidats se re-résout à chaque rendu
 * selon les `service_tags` de l'entreprise (`pickCandidate`). Sur un site
 * d'entreprise, ça veut dire qu'un métier ajouté ou retiré sur la fiche change
 * les photos sans que personne l'ait demandé, et peut faire retomber deux
 * emplacements sur la même image — le doublon que le tirage venait justement
 * d'écarter. Ce que l'opérateur a tiré doit rester ce que le prospect voit.
 */
function jeuAEcrire(candidates: ImageSetCandidate[], isTemplate: boolean): string {
  return serializeImageSet(isTemplate ? candidates : candidates.slice(0, 1));
}

/**
 * GET /api/site-builder/designs/[siteId]/auto-images
 *
 * What the panel needs before anything is drawn: the zones this design actually
 * carries (with the pages and slot count behind each), the company's trades, the
 * size of the library pool per trade — the number that tells the operator
 * whether more photos need importing — and the photos themselves, so a slot can
 * be filled by hand from the trade the operator wants instead of at random.
 *
 * `?entreprise_id=` overrides the site's own company, so a TEMPLATE previewed as
 * a company can be filled for that company.
 */
export const GET = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  const supabase = getServiceClient();
  const loaded = await loadDesignPages(supabase, siteId);
  if ("error" in loaded) return jsonError(loaded.error, loaded.status);

  const override = new URL(req.url).searchParams.get("entreprise_id");
  const enterpriseId = override ? Number(override) : loaded.enterpriseId;
  const tags = enterpriseId != null && Number.isFinite(enterpriseId) ? await companyTags(supabase, enterpriseId) : [];

  const library = await loadLibrary(supabase, tags);
  if ("error" in library) return jsonError(library.error, 500);

  const targets = zoneTargets(loaded.pages, AUTO_IMAGE_ZONES.map((z) => z.id));
  const zones = targets.map((t) => {
    const zone = findZone(t.zoneId)!;
    return {
      id: zone.id,
      label: zone.label,
      hint: zone.hint,
      slotCount: t.slotCount,
      pages: t.pages.map((p) => ({ slug: p.slug, slots: p.slots.length })),
      /** What the band shows right now, so the panel can offer a per-photo swap
       *  without having to draw first. */
      slots: placedSlots(t, tags),
    };
  });

  // Pools are reported for the company's OWN trades: those are the ones that
  // must be stocked, and an empty one is why a band looks generic.
  const { pools, emptyTags, distinctAvailable } = drawImageSets(
    { slotCount: targets[0]?.slotCount ?? 0, companyTags: tags, library, random: seededRandom(1) },
    targets[0]?.alts ?? [],
  );

  return json({
    zones,
    companyTags: tags,
    enterpriseId,
    pools,
    emptyTags,
    /** Distinct photos the trades hold between them — under the slot count, the
     *  band cannot be filled without a repeat and gives up the extra cards. */
    distinctAvailable,
    librarySize: library.length,
    /** Everything the picker may offer — already narrowed to this company's
     *  trades (plus the generic photos) by `loadLibrary`. */
    library: pickableImages(library),
  });
});

/**
 * POST /api/site-builder/designs/[siteId]/auto-images   (JSON)
 *
 * Fills the design's auto zones (see auto-image-zones.ts) from the media
 * library, for one company's trades.
 *
 * Le tirage est écrit à DEUX endroits, et c'est délibéré :
 *
 *   - sur les pages du site, ce qui s'affiche ;
 *   - sur l'ENTREPRISE (`entreprise_tirages_photos`), ce qui fait foi.
 *
 * Le second existe parce que le premier ne survit pas : refaire un site depuis
 * un modèle supprime ses pages et les réinsère depuis le gabarit. Le 12/08/2026,
 * 34 sites ont perdu leur tirage comme ça, une heure et demie après l'avoir
 * reçu. Ce qui est enregistré ici est reposé automatiquement par
 * `appliquer-tirage.ts` à chaque recréation des pages.
 *
 * The same draw is written to EVERY page carrying the zone: the réalisations
 * band is the same band on the home page and on each service page, and the
 * operator asked for the same photos throughout.
 *
 * With `slot` (1-based), only THAT slot is redrawn — the operator likes the
 * band but wants one photo swapped. The slot keeps its trade and avoids the
 * photos the other slots already show; everything else is left untouched.
 *
 * With `slot` AND `url`, that slot takes the photo the operator picked in the
 * library rather than a random one. The set is still rebuilt whole, so the
 * design keeps serving the other companies.
 *
 * Body: { zones?: string[], entrepriseId?: number, seed?: number, slot?: number,
 *         url?: string, dryRun?: boolean }
 * → { seed, zones: [{ zoneId, pages: [{slug, slots}], slots: [{order, url, alt, tag}] }],
 *     pools, emptyTags, written, enregistre }
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params, user }) => {
  const siteId = params.siteId?.trim();
  if (!siteId) return jsonError("siteId requis.", 400);

  let body: {
    zones?: string[]; entrepriseId?: number; seed?: number; slot?: number; url?: string; dryRun?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }
  const dryRun = body.dryRun === true;
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31);

  const supabase = getServiceClient();

  // `slot` (1-based) → swap that photo only, keeping the rest of the band.
  const slotDemande = Number.isFinite(body.slot) ? Math.floor(Number(body.slot)) : null;
  // `url` → the operator picked it himself; without a slot there is nothing to
  // put it on, and silently redrawing the whole band would throw the pick away.
  const urlChoisie = typeof body.url === "string" ? body.url.trim() : "";
  if (urlChoisie && slotDemande === null) return jsonError("Choisir une photo demande aussi son emplacement.", 400);

  // ── LA BANDE ENTIÈRE EST LE MÊME GESTE QU'ON LE FASSE UNE FOIS OU MILLE.
  // Elle vit donc dans `tirer-images.ts`, appelable depuis un lot ; la route
  // garde ce qui lui appartient — l'authentification, et les deux gestes
  // d'opérateur ci-dessous, qui n'ont de sens que devant un panneau.
  if (slotDemande === null && !urlChoisie) {
    const r = await tirerImagesPourSite(supabase, siteId, {
      entrepriseId: Number.isFinite(body.entrepriseId) ? Number(body.entrepriseId) : undefined,
      zones: body.zones,
      seed,
      dryRun,
      tirePar: user.id,
    });
    if (!r.ok) return jsonError(r.erreur, r.status);
    const { ok: _ok, ...corps } = r;
    return json(corps);
  }

  const loaded = await loadDesignPages(supabase, siteId);
  if ("error" in loaded) return jsonError(loaded.error, loaded.status);

  const enterpriseId = Number.isFinite(body.entrepriseId) ? Number(body.entrepriseId) : loaded.enterpriseId;
  if (enterpriseId == null || !Number.isFinite(enterpriseId)) {
    return jsonError("Aucune entreprise : choisis-en une pour tirer des images adaptées à ses services.", 400);
  }
  const tags = await companyTags(supabase, enterpriseId);
  if (tags.length === 0) {
    return jsonError("Cette entreprise n'a aucun service tag — impossible de choisir des photos adaptées.", 422);
  }

  const library = await loadLibrary(supabase, tags);
  if ("error" in library) return jsonError(library.error, 500);
  if (library.length === 0) {
    return jsonError("Aucune image de la médiathèque ne porte les services de cette entreprise.", 422);
  }

  const requested = Array.isArray(body.zones) && body.zones.length > 0 ? body.zones : AUTO_IMAGE_ZONES.map((z) => z.id);
  const targets = zoneTargets(loaded.pages, requested);
  if (targets.length === 0) return jsonError("Ce design ne contient aucune zone à remplir automatiquement.", 422);

  // One draw per zone, replayed identically on every page of that zone — the
  // random source is re-seeded per zone so a zone's result never depends on how
  // many zones were requested alongside it.
  const report: Array<{
    zoneId: string;
    label: string;
    pages: Array<{ slug: string; slots: number }>;
    slots: Array<{ order: number; url: string; alt: string; tag: string | null; hidden: boolean }>;
  }> = [];
  const writesByInstance = new Map<string, {
    page: DesignPage;
    overrides: Record<string, unknown>;
    /** True when the slots hold something a draw did not put there. */
    replacesHandwork: boolean;
  }>();
  let written = 0;
  let pools: ReturnType<typeof drawImageSets>["pools"] = [];
  let emptyTags: string[] = [];
  /** Distinct photos this company's trades hold — what decides whether the band
   *  can be filled without a repeat, and by how much it falls short. */
  let distinctAvailable = 0;
  /** Cards the band gave up on: stock exhausted. */
  let hiddenSlots = 0;

  // Lus plus haut : à partir d'ici, l'un des deux est forcément posé.
  const oneSlot = slotDemande;
  const pickedUrl = urlChoisie;

  for (const target of targets) {
    const zone = findZone(target.zoneId)!;
    const full = drawImageSets(
      { slotCount: target.slotCount, companyTags: tags, library, random: seededRandom(seed) },
      target.alts,
    );
    pools = full.pools;
    emptyTags = full.emptyTags;
    distinctAvailable = full.distinctAvailable;

    // What the band shows today — the baseline a single-slot swap edits, and
    // the set of photos the new one must not duplicate.
    const placed = oneSlot === null ? [] : placedSlots(target, tags);
    let single: ReturnType<typeof redrawSlot> = null;
    if (oneSlot !== null) {
      if (oneSlot < 1 || oneSlot > target.slotCount) {
        return jsonError(`Emplacement ${oneSlot} inconnu dans cette section.`, 422);
      }
      const current = placed.find((p) => p.order === oneSlot);
      const common = {
        slotCount: target.slotCount,
        companyTags: tags,
        library,
        random: seededRandom(seed),
        slotIndex: oneSlot - 1,
      };
      const alt = target.alts[oneSlot - 1] ?? "";
      single = pickedUrl
        ? chooseSlotImage({ ...common, url: pickedUrl }, alt)
        : redrawSlot(
            {
              ...common,
              usedUrls: placed.filter((p) => p.order !== oneSlot).map((p) => p.url),
              currentUrl: current?.url,
              // Stay on the trade the slot SHOWS: a hand-picked photo may have
              // moved it off its round-robin trade, and re-rolling is meant to
              // change the photo, not to undo that choice.
              leadTag: current?.tag ?? undefined,
            },
            alt,
          );
      if (!single) {
        return jsonError(
          pickedUrl
            ? "Cette photo n'est plus dans la médiathèque, ou ne concerne pas cette entreprise."
            : "Pas d'autre photo disponible pour ce métier — importe-en dans la médiathèque.",
          422,
        );
      }
    }

    // The report always describes the WHOLE band, so the panel refreshes its
    // thumbnails from one answer whether one photo changed or all six.
    const slotsReport = full.slots.map((drawnSlot, i) => {
      const order = i + 1;
      const alt = target.alts[i] ?? "";
      if (oneSlot === null) {
        return {
          order,
          url: drawnSlot.chosen?.url ?? "",
          alt: drawnSlot.chosen?.alt ?? alt,
          tag: drawnSlot.leadTag,
          // The stock stopped here: the card is hidden rather than doubled.
          hidden: drawnSlot.repeated,
        };
      }
      if (order === oneSlot) {
        // Acting on a slot always reopens it — the operator put a photo there.
        return { order, url: single!.chosen?.url ?? "", alt: single!.chosen?.alt ?? alt, tag: single!.leadTag, hidden: false };
      }
      const kept = placed.find((p) => p.order === order);
      return { order, url: kept?.url ?? "", alt: kept?.alt ?? alt, tag: kept?.tag ?? null, hidden: kept?.hidden ?? false };
    });

    hiddenSlots = slotsReport.filter((s) => s.hidden).length;
    report.push({
      zoneId: zone.id,
      label: zone.label,
      pages: target.pages.map((p) => ({ slug: p.slug, slots: p.slots.length })),
      slots: slotsReport,
    });

    if (dryRun) continue;

    for (const { page, slots } of target.pages) {
      const entry = writesByInstance.get(page.instanceId)
        ?? { page, overrides: { ...page.overrides }, replacesHandwork: false };
      for (const slot of slots) {
        // Single-slot swap: leave every other slot exactly as it is.
        if (oneSlot !== null && slot.order !== oneSlot) continue;
        // A page with fewer slots than the zone's max takes the first ones.
        const drawn = oneSlot !== null
          ? single
          : full.slots[slot.order - 1] ?? full.slots[slots.indexOf(slot)];
        if (!drawn || drawn.candidates.length === 0) continue;
        // Only a photo the operator placed by hand is worth a backup slot. A
        // re-draw replaces a previous draw, and backing THAT up would push the
        // hand-placed state out of the five kept — losing the one state anybody
        // would want back.
        const hadSingle = ["image", "bg_image", "image_mobile"].some((k) => `${slot.path}:${k}` in page.overrides);
        if (hadSingle) entry.replacesHandwork = true;
        // A set and a single image are mutually exclusive on a slot: drop the
        // single-image keys this set replaces, or both would apply.
        clearImageKeys(entry.overrides, slot.path, ["image_set"]);
        entry.overrides[`${slot.path}:image_set`] = {
          kind: "image_set",
          value: jeuAEcrire(drawn.candidates, loaded.isTemplate),
        };
        // The set is written even for a slot this company cannot fill: hiding
        // the card is about THIS company's stock, and a company with a fuller
        // library — this design cloned onto its site — resolves it normally.
        setGap(entry.overrides, slot.cardPath, drawn.repeated);
        written++;
      }
      writesByInstance.set(page.instanceId, entry);
    }
  }

  let enregistre = false;
  if (!dryRun) {
    for (const { page, overrides, replacesHandwork } of writesByInstance.values()) {
      // Snapshot only when a hand-placed photo is being replaced — see above.
      const content = replacesHandwork
        ? pushBackup(page.content, {
            at: new Date().toISOString(),
            reason: "auto-images",
            label: page.slug,
            overrides: page.overrides,
          })
        : page.content;
      const { error } = await supabase
        .from("site_section_instances")
        .update({ content: { ...content, __overrides: overrides } })
        .eq("id", page.instanceId);
      if (error) return jsonError(error.message, 500);
    }
    invalidateSiteCache(siteId);

    // Le tirage devient une donnée de l'entreprise. Pas sur un gabarit : ses
    // photos ne sont celles de personne, elles servent de point de départ à
    // toutes les démos qui en sortent.
    if (!loaded.isTemplate) {
      const ecritures = await Promise.all(
        report.map((zone) =>
          enregistrerTirage(supabase, {
            entrepriseId: enterpriseId,
            zoneId: zone.zoneId,
            slots: zone.slots.map((s) => ({
              ordre: s.order,
              url: s.url,
              alt: s.alt,
              tag: s.tag,
              masque: s.hidden,
            })),
            seed,
            tirePar: user.id,
          }),
        ),
      );
      // Un enregistrement raté ne fait pas échouer le tirage : les photos sont
      // posées et visibles. Le drapeau dit au panneau qu'elles ne sont pas
      // encore protégées d'une refonte, ce qui est une information utile.
      enregistre = ecritures.every((e) => e.ok);
    }
  }

  return json({ seed, zones: report, pools, emptyTags, distinctAvailable, hiddenSlots, written, dryRun, enregistre });
});
