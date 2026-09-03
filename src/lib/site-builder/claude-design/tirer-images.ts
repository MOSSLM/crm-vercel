/**
 * Tirer les photos d'un site, bande entière — le geste, sans le HTTP.
 *
 * ── POURQUOI CE MODULE EXISTE ─────────────────────────────────────────────
 * Ce tirage vivait ENTIÈREMENT dans `POST /api/site-builder/designs/[siteId]/
 * auto-images`, mêlé au remplacement d'un seul emplacement et à la lecture du
 * corps de requête. Conséquence : une vague de démos fabriquées en lot ne
 * pouvait pas tirer ses images — il aurait fallu ouvrir 77 panneaux à la main,
 * ou recopier la logique dans un script, c'est-à-dire la faire diverger.
 *
 * La route garde ce qui lui appartient : l'authentification, le remplacement
 * d'UN emplacement (`slot`) et le choix manuel d'une photo (`url`), qui sont
 * des gestes d'opérateur devant un panneau. Le tirage de la bande complète,
 * lui, est le même qu'on le déclenche d'un clic ou de mille.
 *
 * ⚠️ CE QUI EST FIGÉ SUR UN SITE D'ENTREPRISE, ET POURQUOI. Un jeu à plusieurs
 * candidats se re-résout à CHAQUE rendu selon les `service_tags` de la fiche
 * (`pickCandidate`). Sur un gabarit c'est toute sa valeur ; sur le site d'une
 * entreprise, ça veut dire qu'un métier ajouté ou retiré change ses photos sans
 * que personne l'ait demandé, et peut faire retomber deux emplacements sur la
 * même image — le doublon que le tirage venait d'écarter.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTO_IMAGE_ZONES, findZone } from "./auto-image-zones";
import {
  companyTags,
  loadDesignPages,
  loadLibrary,
  setGap,
  zoneTargets,
  type DesignPage,
} from "./design-pages";
import { drawImageSets, seededRandom } from "./draw-image-sets";
import { serializeImageSet, type ImageSetCandidate } from "./image-set";
import { clearImageKeys } from "./image-override-keys";
import { pushBackup } from "./override-backups";
import { enregistrerTirage } from "./tirage-entreprise";
import { invalidateSiteCache } from "../site-cache";

/** Un emplacement, tel que le panneau l'affiche. */
export interface EmplacementTire {
  order: number;
  url: string;
  alt: string;
  tag: string | null;
  /** Le stock s'est arrêté là : la carte est masquée plutôt que doublée. */
  hidden: boolean;
}

export interface ZoneTiree {
  zoneId: string;
  label: string;
  pages: Array<{ slug: string; slots: number }>;
  slots: EmplacementTire[];
}

export interface ResultatTirage {
  ok: true;
  seed: number;
  zones: ZoneTiree[];
  pools: ReturnType<typeof drawImageSets>["pools"];
  emptyTags: string[];
  distinctAvailable: number;
  hiddenSlots: number;
  written: number;
  dryRun: boolean;
  /** Le tirage est en base, donc protégé d'une refonte. */
  enregistre: boolean;
}

export interface EchecTirage {
  ok: false;
  erreur: string;
  /** Le code que la route rendra tel quel. */
  status: number;
}

export interface OptionsTirage {
  entrepriseId?: number | null;
  /** Les zones demandées ; toutes par défaut. */
  zones?: string[];
  seed?: number;
  dryRun?: boolean;
  /** Qui a tiré. `null` quand c'est un lot : personne n'a regardé. */
  tirePar?: string | null;
}

/**
 * Sur un gabarit, le jeu COMPLET ; sur le site d'une entreprise, une seule
 * photo. Voir l'en-tête : c'est la garantie « ce que l'opérateur a tiré reste
 * ce que le prospect voit ».
 */
const jeuAEcrire = (candidates: ImageSetCandidate[], isTemplate: boolean): string =>
  serializeImageSet(isTemplate ? candidates : candidates.slice(0, 1));

export async function tirerImagesPourSite(
  supabase: SupabaseClient,
  siteId: string,
  opts: OptionsTirage = {},
): Promise<ResultatTirage | EchecTirage> {
  const dryRun = opts.dryRun === true;
  const seed = Number.isFinite(opts.seed) ? Number(opts.seed) : Math.floor(Math.random() * 2 ** 31);

  const loaded = await loadDesignPages(supabase, siteId);
  if ("error" in loaded) return { ok: false, erreur: loaded.error, status: loaded.status };

  const enterpriseId = Number.isFinite(opts.entrepriseId) ? Number(opts.entrepriseId) : loaded.enterpriseId;
  if (enterpriseId == null || !Number.isFinite(enterpriseId)) {
    return {
      ok: false,
      erreur: "Aucune entreprise : choisis-en une pour tirer des images adaptées à ses services.",
      status: 400,
    };
  }

  const tags = await companyTags(supabase, enterpriseId);
  if (tags.length === 0) {
    return {
      ok: false,
      erreur: "Cette entreprise n'a aucun service tag — impossible de choisir des photos adaptées.",
      status: 422,
    };
  }

  const library = await loadLibrary(supabase, tags);
  if ("error" in library) return { ok: false, erreur: library.error, status: 500 };
  if (library.length === 0) {
    return {
      ok: false,
      erreur: "Aucune image de la médiathèque ne porte les services de cette entreprise.",
      status: 422,
    };
  }

  const demandees = opts.zones && opts.zones.length > 0 ? opts.zones : AUTO_IMAGE_ZONES.map((z) => z.id);
  const targets = zoneTargets(loaded.pages, demandees);
  if (targets.length === 0) {
    return { ok: false, erreur: "Ce design ne contient aucune zone à remplir automatiquement.", status: 422 };
  }

  const zones: ZoneTiree[] = [];
  const writesByInstance = new Map<
    string,
    { page: DesignPage; overrides: Record<string, unknown>; replacesHandwork: boolean }
  >();
  let written = 0;
  let pools: ReturnType<typeof drawImageSets>["pools"] = [];
  let emptyTags: string[] = [];
  let distinctAvailable = 0;
  let hiddenSlots = 0;

  for (const target of targets) {
    const zone = findZone(target.zoneId)!;
    // Un tirage par zone, rejoué à l'identique sur chaque page de la zone : la
    // source aléatoire est re-semée par zone, pour qu'un résultat ne dépende
    // jamais du nombre de zones demandées à côté.
    const full = drawImageSets(
      { slotCount: target.slotCount, companyTags: tags, library, random: seededRandom(seed) },
      target.alts,
    );
    pools = full.pools;
    emptyTags = full.emptyTags;
    distinctAvailable = full.distinctAvailable;

    const slots: EmplacementTire[] = full.slots.map((drawnSlot, i) => ({
      order: i + 1,
      url: drawnSlot.chosen?.url ?? "",
      alt: drawnSlot.chosen?.alt ?? target.alts[i] ?? "",
      tag: drawnSlot.leadTag,
      hidden: drawnSlot.repeated,
    }));
    hiddenSlots = slots.filter((s) => s.hidden).length;
    zones.push({
      zoneId: zone.id,
      label: zone.label,
      pages: target.pages.map((p) => ({ slug: p.slug, slots: p.slots.length })),
      slots,
    });

    if (dryRun) continue;

    for (const { page, slots: emplacements } of target.pages) {
      const entry =
        writesByInstance.get(page.instanceId) ??
        { page, overrides: { ...page.overrides }, replacesHandwork: false };
      for (const emplacement of emplacements) {
        // Une page portant moins d'emplacements que le maximum de la zone prend
        // les premiers.
        const drawn = full.slots[emplacement.order - 1] ?? full.slots[emplacements.indexOf(emplacement)];
        if (!drawn || drawn.candidates.length === 0) continue;
        // Seule une photo posée À LA MAIN vaut une sauvegarde. Un re-tirage
        // remplace un tirage précédent, et l'archiver pousserait l'état posé à
        // la main hors des cinq gardés — en perdant le seul qu'on voudrait.
        const hadSingle = ["image", "bg_image", "image_mobile"].some(
          (k) => `${emplacement.path}:${k}` in page.overrides,
        );
        if (hadSingle) entry.replacesHandwork = true;
        // Un jeu et une image simple s'excluent sur un emplacement : on retire
        // les clés d'image simple que le jeu remplace, ou les deux s'appliquent.
        clearImageKeys(entry.overrides, emplacement.path, ["image_set"]);
        entry.overrides[`${emplacement.path}:image_set`] = {
          kind: "image_set",
          value: jeuAEcrire(drawn.candidates, loaded.isTemplate),
        };
        setGap(entry.overrides, emplacement.cardPath, drawn.repeated);
        written++;
      }
      writesByInstance.set(page.instanceId, entry);
    }
  }

  let enregistre = false;
  if (!dryRun) {
    for (const { page, overrides, replacesHandwork } of writesByInstance.values()) {
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
      if (error) return { ok: false, erreur: error.message, status: 500 };
    }
    invalidateSiteCache(siteId);

    // Le tirage devient une donnée de l'ENTREPRISE, pas du site : c'est ce qui
    // le fait survivre à une refonte. Pas sur un gabarit — ses photos ne sont
    // celles de personne, elles servent de départ à toutes les démos.
    if (!loaded.isTemplate) {
      const ecritures = await Promise.all(
        zones.map((zone) =>
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
            tirePar: opts.tirePar ?? null,
          }),
        ),
      );
      // Un enregistrement raté ne fait pas échouer le tirage : les photos sont
      // posées et visibles. Le drapeau dit qu'elles ne sont pas encore
      // protégées d'une refonte, ce qui est une information utile.
      enregistre = ecritures.every((e) => e.ok);
    }
  }

  return { ok: true, seed, zones, pools, emptyTags, distinctAvailable, hiddenSlots, written, dryRun, enregistre };
}
