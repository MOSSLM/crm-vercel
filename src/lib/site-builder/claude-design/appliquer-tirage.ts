/**
 * Repose le dernier tirage d'une entreprise sur les pages de son site.
 *
 * C'est la pièce qui empêche le retour en arrière. Les pages d'un design
 * Claude sont RECRÉÉES par deux chemins — la refonte depuis un modèle
 * (`rebuild-site-from-template`, DELETE + INSERT) et le clonage
 * (`clone-template-site`) — et elles reviennent alors avec les photos du
 * gabarit. Ce module les repeuple depuis `entreprise_tirages_photos`, qui fait
 * foi, AVANT toute republication : le public ne voit jamais l'état
 * intermédiaire.
 *
 * TROIS GARANTIES, dans cet ordre de priorité :
 *
 *  1. **Tel quel.** L'emplacement reçoit un jeu à UN SEUL candidat : la photo
 *     tirée. Un jeu à plusieurs candidats se re-résout au rendu selon les
 *     `service_tags` de l'entreprise (`pickCandidate`) — c'est ce qui fait
 *     qu'un gabarit sert toutes les entreprises, et c'est exactement ce qu'on
 *     ne veut plus sur le site d'UNE entreprise : la photo choisie ne doit plus
 *     dépendre de rien. Les gabarits, eux, gardent leurs jeux complets.
 *
 *  2. **Aucune photo morte.** Supprimer une image de la médiathèque efface
 *     aussi le fichier du storage : une bande qui la référence encore affiche
 *     un cadre cassé. Les URLs sont donc revérifiées ici, et un emplacement
 *     dont la photo a disparu est retiré au sort à nouveau, dans son métier.
 *
 *  3. **Aucun doublon.** L'unicité est réaffirmée après remplacement (voir
 *     `sansDoublon`) : à défaut de photo disponible, la carte est masquée.
 *
 * Le tirage corrigé est RÉENREGISTRÉ : la réparation d'aujourd'hui est
 * l'état de référence de demain, sinon chaque refonte relancerait la même
 * recherche de remplaçantes.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTO_IMAGE_ZONES } from "./auto-image-zones";
import {
  companyTags,
  loadDesignPages,
  loadLibrary,
  setGap,
  zoneTargets,
  type DesignPage,
  type ZoneTarget,
} from "./design-pages";
import { redrawSlot, seededRandom, type LibraryImage } from "./draw-image-sets";
import { serializeImageSet } from "./image-set";
import { clearImageKeys } from "./image-override-keys";
import {
  enregistrerTirage,
  lireTirages,
  sansDoublon,
  urlsVisibles,
  type SlotTire,
  type TirageZone,
} from "./tirage-entreprise";

/**
 * `next/cache` est chargé À L'APPEL, pas à l'import.
 *
 * Ce module est tiré par `clone-template-site` et `rebuild-site-from-template`,
 * eux-mêmes tirés par `_board.ts` — donc par des suites de tests qui n'ont rien
 * à voir avec le rendu. Or `next/cache` embarque tout le runtime serveur de
 * Next (`Request`, `TextEncoder`…), absent de jsdom : un import statique fait
 * échouer ces suites AU CHARGEMENT, loin de ce qu'elles vérifient. Le report
 * garde l'invalidation en production et l'arbre d'imports propre ailleurs.
 */
async function invaliderLeCache(siteId: string): Promise<void> {
  try {
    const { invalidateSiteCache } = await import("@/lib/site-builder/site-cache");
    invalidateSiteCache(siteId);
  } catch (e) {
    console.warn("[appliquer-tirage] cache non invalidé", e instanceof Error ? e.message : e);
  }
}

export interface ResultatReapplication {
  /** Le tirage a été reposé (même s'il n'y avait rien à corriger). */
  applique: boolean;
  /** Pourquoi rien n'a été fait — un gabarit, un site sans entreprise, une
   *  entreprise jamais tirée. Ce n'est pas une erreur : c'est l'état normal
   *  d'un site qui n'a pas encore de bande à lui. */
  raison?: string;
  zones: string[];
  /** Emplacements réécrits, toutes pages confondues. */
  emplacements: number;
  /** Photos disparues de la médiathèque, remplacées au passage. */
  remplacees: number;
  /** Cartes masquées faute de remplaçante. */
  masquees: number;
  pagesEcrites: number;
}

const RIEN = (raison: string): ResultatReapplication => ({
  applique: false,
  raison,
  zones: [],
  emplacements: 0,
  remplacees: 0,
  masquees: 0,
  pagesEcrites: 0,
});

/** Le jeu d'un emplacement, figé sur la photo tirée. Un seul candidat : quels
 *  que soient les métiers de l'entreprise au moment du rendu, `pickCandidate`
 *  ne peut rendre que celui-là. */
function jeuFige(slot: SlotTire): string {
  return serializeImageSet([
    { url: slot.url, tags: slot.tag ? [slot.tag] : [], alt: slot.alt || undefined },
  ]);
}

/** Les URLs encore présentes dans la médiathèque, parmi celles demandées. */
async function urlsVivantes(supabase: SupabaseClient, urls: readonly string[]): Promise<Set<string>> {
  const cherchees = [...new Set(urls)].filter(Boolean);
  if (cherchees.length === 0) return new Set();
  const { data, error } = await supabase
    .from("media_library")
    .select("public_url")
    .in("public_url", cherchees);
  // En cas d'erreur on considère tout vivant : mieux vaut reposer le tirage
  // tel qu'il est que le démolir sur une requête qui a échoué.
  if (error) return new Set(cherchees);
  return new Set(((data ?? []) as Array<{ public_url: string }>).map((r) => r.public_url));
}

/**
 * La bande complète d'une zone : le tirage enregistré, ses trous rebouchés.
 *
 * Un trou, c'est un emplacement dont la photo n'est plus dans la médiathèque,
 * ou que le tirage ne couvre pas (la bande a gagné une carte depuis). Les deux
 * se traitent pareil — il faut une photo, on la tire dans le métier de
 * l'emplacement en évitant celles que la bande montre déjà.
 */
function reboucher(
  tirage: TirageZone,
  target: ZoneTarget,
  tags: string[],
  library: LibraryImage[],
  vivantes: Set<string>,
  seed: number,
): { slots: SlotTire[]; remplacees: number } {
  const parOrdre = new Map(tirage.slots.map((s) => [s.ordre, s]));
  const retenus: SlotTire[] = [];
  let remplacees = 0;

  for (let ordre = 1; ordre <= target.slotCount; ordre++) {
    const existant = parOrdre.get(ordre);
    const alt = target.alts[ordre - 1] ?? "";

    // Une carte que le tirage a volontairement masquée le reste : c'est une
    // décision du tirage (stock épuisé), pas un trou à reboucher.
    if (existant?.masque) {
      retenus.push({ ...existant, alt: existant.alt || alt });
      continue;
    }
    if (existant && vivantes.has(existant.url)) {
      retenus.push({ ...existant, alt: existant.alt || alt });
      continue;
    }

    const remplacant = redrawSlot(
      {
        slotCount: target.slotCount,
        companyTags: tags,
        library,
        random: seededRandom(seed + ordre),
        slotIndex: ordre - 1,
        usedUrls: urlsVisibles(retenus),
        currentUrl: existant?.url,
        leadTag: existant?.tag ?? undefined,
      },
      alt,
    );

    if (!remplacant?.chosen) {
      // Plus rien à mettre : la carte s'efface plutôt que de doubler une voisine.
      retenus.push({ ordre, url: existant?.url ?? "", alt, tag: existant?.tag ?? null, masque: true });
      continue;
    }
    if (existant) remplacees++;
    retenus.push({
      ordre,
      url: remplacant.chosen.url,
      alt: remplacant.chosen.alt ?? alt,
      tag: remplacant.leadTag ?? existant?.tag ?? null,
      masque: false,
    });
  }

  // Un emplacement sans photo ET sans masque n'existe pas : `reboucher` masque
  // déjà ce cas. `sansDoublon` ferme l'invariant d'unicité après remplacement.
  return { slots: sansDoublon(retenus), remplacees };
}

/** Pose la bande sur toutes les pages qui portent la zone. Renvoie ce qui a
 *  effectivement changé, pour n'écrire que les pages concernées. */
function poserSurLesPages(
  target: ZoneTarget,
  slots: readonly SlotTire[],
  modifiees: Map<string, { page: DesignPage; overrides: Record<string, unknown> }>,
): number {
  const parOrdre = new Map(slots.map((s) => [s.ordre, s]));
  let emplacements = 0;

  for (const { page, slots: emplacementsPage } of target.pages) {
    const entree = modifiees.get(page.instanceId) ?? { page, overrides: { ...page.overrides } };
    for (const emplacement of emplacementsPage) {
      const slot = parOrdre.get(emplacement.order);
      if (!slot) continue;
      // Une carte masquée garde son marqueur et rien d'autre : écrire une URL
      // vide poserait un `src=""`, que le navigateur résout en rechargeant la
      // page courante comme si c'était une image.
      if (!slot.masque && slot.url) {
        clearImageKeys(entree.overrides, emplacement.path, ["image_set"]);
        entree.overrides[`${emplacement.path}:image_set`] = { kind: "image_set", value: jeuFige(slot) };
        emplacements++;
      }
      setGap(entree.overrides, emplacement.cardPath, slot.masque);
    }
    modifiees.set(page.instanceId, entree);
  }
  return emplacements;
}

/**
 * Repose le tirage enregistré de l'entreprise sur son site.
 *
 * Ne throw jamais : appelée depuis la refonte et le clonage, elle ne doit
 * jamais faire échouer l'opération qui l'a déclenchée. Un site sans tirage
 * enregistré garde simplement les photos du modèle, comme avant.
 */
export async function appliquerTiragePourSite(
  supabase: SupabaseClient,
  siteId: string,
  opts: { entrepriseId?: number | null; seed?: number } = {},
): Promise<ResultatReapplication> {
  try {
    const charge = await loadDesignPages(supabase, siteId);
    if ("error" in charge) return RIEN(charge.error);
    // Un gabarit doit garder ses jeux à plusieurs candidats : c'est ce qui lui
    // permet de servir n'importe quelle entreprise. Figer une photo dessus
    // casserait toutes les démos qui en sortent.
    if (charge.isTemplate) return RIEN("Ce site est un gabarit : son tirage sert toutes les entreprises.");

    const entrepriseId = opts.entrepriseId ?? charge.enterpriseId;
    if (entrepriseId == null || !Number.isFinite(entrepriseId)) {
      return RIEN("Site sans entreprise : aucun tirage ne lui appartient.");
    }

    const tirages = (await lireTirages(supabase, entrepriseId)).filter((t) => t.slots.length > 0);
    if (tirages.length === 0) return RIEN("Cette entreprise n'a pas encore de tirage enregistré.");

    const cibles = new Map(
      zoneTargets(charge.pages, AUTO_IMAGE_ZONES.map((z) => z.id)).map((t) => [t.zoneId, t]),
    );

    const modifiees = new Map<string, { page: DesignPage; overrides: Record<string, unknown> }>();
    const zones: string[] = [];
    let emplacements = 0;
    let remplacees = 0;
    let masquees = 0;

    for (const tirage of tirages) {
      const target = cibles.get(tirage.zoneId);
      // Le design n'a pas cette bande (autre modèle, page retirée) : le tirage
      // reste enregistré, il repartira si la zone revient.
      if (!target) continue;

      const aVerifier = tirage.slots.filter((s) => !s.masque).map((s) => s.url);
      const vivantes = await urlsVivantes(supabase, aVerifier);
      const complet = tirage.slots.length >= target.slotCount;
      const toutesVivantes = aVerifier.every((u) => vivantes.has(u));

      let slots = tirage.slots;
      let corriges = 0;
      if (!complet || !toutesVivantes) {
        const tags = await companyTags(supabase, entrepriseId);
        const bibliotheque = await loadLibrary(supabase, tags);
        if ("error" in bibliotheque) {
          // Médiathèque illisible : on repose le tirage tel qu'il est plutôt
          // que de renoncer. Une photo morte vaut mieux qu'un gabarit entier.
          slots = tirage.slots;
        } else {
          const rebouche = reboucher(
            tirage,
            target,
            tags,
            bibliotheque,
            vivantes,
            opts.seed ?? tirage.seed ?? 1,
          );
          slots = rebouche.slots;
          corriges = rebouche.remplacees;
        }
      }

      emplacements += poserSurLesPages(target, slots, modifiees);
      remplacees += corriges;
      masquees += slots.filter((s) => s.masque).length;
      zones.push(tirage.zoneId);

      // Le tirage réparé devient la référence — sinon chaque refonte
      // recommencerait la même recherche de remplaçantes.
      if (slots !== tirage.slots) {
        await enregistrerTirage(supabase, {
          entrepriseId,
          zoneId: tirage.zoneId,
          slots,
          seed: tirage.seed,
        });
      }
    }

    if (zones.length === 0) return RIEN("Ce design ne porte aucune des zones tirées.");

    let pagesEcrites = 0;
    for (const { page, overrides } of modifiees.values()) {
      const { error } = await supabase
        .from("site_section_instances")
        .update({ content: { ...page.content, __overrides: overrides } })
        .eq("id", page.instanceId);
      if (error) {
        console.warn("[appliquer-tirage] page non réécrite", page.slug, error.message);
        continue;
      }
      pagesEcrites++;
    }
    if (pagesEcrites > 0) await invaliderLeCache(siteId);

    return { applique: true, zones, emplacements, remplacees, masquees, pagesEcrites };
  } catch (e) {
    console.warn("[appliquer-tirage] abandon", e instanceof Error ? e.message : e);
    return RIEN(e instanceof Error ? e.message : "Réapplication impossible.");
  }
}

/**
 * Retire des tirages les photos qu'on vient de supprimer de la médiathèque, et
 * repose les bandes concernées.
 *
 * Appelée par la suppression d'image : sans ça, la ligne et le fichier
 * partent, et les sites qui montraient la photo affichent un cadre cassé —
 * personne n'est prévenu, et la seule façon de s'en rendre compte est d'ouvrir
 * les sites un par un.
 */
export async function reparerPhotosSupprimees(
  supabase: SupabaseClient,
  entrepriseIds: readonly number[],
): Promise<{ entreprises: number; sites: number; remplacees: number }> {
  const ids = [...new Set(entrepriseIds)].filter((id) => Number.isFinite(id));
  if (ids.length === 0) return { entreprises: 0, sites: 0, remplacees: 0 };

  const { data, error } = await supabase
    .from("sites")
    .select("id, enterprise_id")
    .in("enterprise_id", ids)
    .eq("is_claude_design", true);
  if (error) {
    console.warn("[appliquer-tirage] sites introuvables pour réparation", error.message);
    return { entreprises: ids.length, sites: 0, remplacees: 0 };
  }

  let sites = 0;
  let remplacees = 0;
  for (const site of (data ?? []) as Array<{ id: string; enterprise_id: number | null }>) {
    const res = await appliquerTiragePourSite(supabase, site.id, { entrepriseId: site.enterprise_id });
    if (!res.applique) continue;
    sites++;
    remplacees += res.remplacees;
  }
  return { entreprises: ids.length, sites, remplacees };
}
