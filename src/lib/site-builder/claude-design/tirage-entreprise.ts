/**
 * Le dernier tirage de photos d'une entreprise — lecture, écriture, invariants.
 *
 * POURQUOI CE MODULE EXISTE. Le tirage ne vivait que dans
 * `site_section_instances.content.__overrides`. La refonte depuis un modèle et
 * le clonage SUPPRIMENT puis réinsèrent ces lignes : le 12/08/2026, 34 sites
 * ont ainsi repris le JSON du gabarit une heure et demie après leur tirage,
 * ramenant des photos hors métier, des doublons, et deux images entre-temps
 * supprimées de la médiathèque. Rien n'était rattrapable — aucune sauvegarde
 * sur ce chemin, et la graine n'était stockée nulle part.
 *
 * Désormais le tirage est écrit ICI, sur l'entreprise (voir
 * `sql/20260817_tirages_photos_entreprise.sql`), et les pages n'en sont plus
 * que l'affichage. `appliquer-tirage.ts` les repeuple depuis cette table après
 * toute recréation.
 *
 * DEUX INVARIANTS, tenus à l'écriture et pas seulement au tirage :
 *
 *  1. **Jamais deux fois la même photo visible.** Le tirage l'assure déjà pour
 *     l'entreprise pour laquelle il est fait ; l'invariant est réaffirmé ici
 *     parce que la bande peut aussi être recomposée par une réparation (une
 *     photo supprimée remplacée par une autre) et qu'un doublon introduit à ce
 *     moment-là ne passerait devant aucun autre garde-fou.
 *  2. **Une carte plutôt qu'un doublon.** Quand il ne reste rien à mettre, la
 *     carte est masquée — une bande de cinq vaut mieux qu'une bande de six
 *     avec un jumeau dedans.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const TABLE_TIRAGES = "entreprise_tirages_photos";

/** Un emplacement de la bande, tel qu'il sera servi — pas un candidat parmi
 *  d'autres à re-choisir au rendu. */
export interface SlotTire {
  /** Rang dans la bande, 1-based, comme `AutoImageSlot.order`. */
  ordre: number;
  url: string;
  alt: string;
  /** Le métier avec lequel l'emplacement a été tiré (clé canonique), pour
   *  qu'un re-tirage à l'unité reste sur ce métier. */
  tag: string | null;
  /** La carte est retirée de la bande : stock épuisé. */
  masque: boolean;
}

export interface TirageZone {
  zoneId: string;
  slots: SlotTire[];
  seed: number | null;
  tireLe: string | null;
}

interface LigneTirage {
  entreprise_id: number;
  zone_id: string;
  slots: unknown;
  seed: number | string | null;
  tire_le: string | null;
}

function versSlot(brut: unknown): SlotTire | null {
  const s = brut as Partial<SlotTire> | null;
  if (!s || typeof s.url !== "string" || !s.url.trim()) return null;
  const ordre = Number(s.ordre);
  if (!Number.isFinite(ordre) || ordre < 1) return null;
  return {
    ordre: Math.floor(ordre),
    url: s.url.trim(),
    alt: typeof s.alt === "string" ? s.alt : "",
    tag: typeof s.tag === "string" && s.tag !== "" ? s.tag : null,
    masque: s.masque === true,
  };
}

/**
 * Applique l'invariant d'unicité : le premier emplacement garde la photo, les
 * suivants qui la répètent sont masqués plutôt que dupliqués.
 *
 * Masquer et non retirer : la carte doit disparaître de la grille sans laisser
 * un cadre vide, et c'est le marqueur de `remove` qui fait ça (voir
 * `setGap`). Un emplacement déjà masqué le reste.
 */
export function sansDoublon(slots: readonly SlotTire[]): SlotTire[] {
  const vues = new Set<string>();
  return [...slots]
    .sort((a, b) => a.ordre - b.ordre)
    .map((slot) => {
      if (slot.masque) return { ...slot };
      if (vues.has(slot.url)) return { ...slot, masque: true };
      vues.add(slot.url);
      return { ...slot };
    });
}

/** Les photos que la bande montre réellement — ce que « pas de doublon » et
 *  « telle quelle » portent sur. */
export function urlsVisibles(slots: readonly SlotTire[]): string[] {
  return slots.filter((s) => !s.masque).map((s) => s.url);
}

/** Le dernier tirage de l'entreprise, une entrée par zone. Tableau vide quand
 *  elle n'a jamais été tirée — le cas normal d'un site tout juste créé. */
export async function lireTirages(
  supabase: SupabaseClient,
  entrepriseId: number,
): Promise<TirageZone[]> {
  const { data, error } = await supabase
    .from(TABLE_TIRAGES)
    .select("entreprise_id, zone_id, slots, seed, tire_le")
    .eq("entreprise_id", entrepriseId);
  // Jamais bloquant : un tirage illisible ne doit pas empêcher une refonte
  // d'aboutir, il doit juste laisser les pages telles que le modèle les pose.
  if (error || !data) return [];

  return (data as LigneTirage[]).map((ligne) => ({
    zoneId: ligne.zone_id,
    slots: sansDoublon(
      (Array.isArray(ligne.slots) ? ligne.slots : [])
        .map(versSlot)
        .filter((s): s is SlotTire => s !== null),
    ),
    seed: ligne.seed == null ? null : Number(ligne.seed),
    tireLe: ligne.tire_le,
  }));
}

export interface EcritureTirage {
  entrepriseId: number;
  zoneId: string;
  slots: readonly SlotTire[];
  seed?: number | null;
  tirePar?: string | null;
}

/**
 * Enregistre le tirage d'une zone — c'est LUI qui fait foi ensuite.
 *
 * Ne throw jamais : un tirage qui s'affiche correctement sur le site mais que
 * l'on n'a pas su enregistrer reste un tirage réussi du point de vue de
 * l'opérateur. Le motif remonte pour être journalisé, et la prochaine
 * réapplication repartira des pages.
 */
export async function enregistrerTirage(
  supabase: SupabaseClient,
  ecriture: EcritureTirage,
): Promise<{ ok: boolean; error?: string }> {
  const slots = sansDoublon(ecriture.slots);
  const ligne: Record<string, unknown> = {
    entreprise_id: ecriture.entrepriseId,
    zone_id: ecriture.zoneId,
    slots,
    seed: ecriture.seed ?? null,
  };
  if (ecriture.tirePar) ligne.tire_par = ecriture.tirePar;

  const { error } = await supabase
    .from(TABLE_TIRAGES)
    .upsert(ligne, { onConflict: "entreprise_id,zone_id" });
  if (error) {
    console.warn("[tirage-entreprise] enregistrement impossible", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Les entreprises dont le tirage montre l'une de ces photos.
 *
 * C'est l'index qui rend réparable une suppression dans la médiathèque :
 * supprimer une image effaçait la ligne et le fichier, en laissant les sites
 * qui la référencent pointer dans le vide. On part maintenant de l'URL pour
 * retrouver qui la montre, et on retire la photo de ces bandes-là.
 */
export async function entreprisesMontrant(
  supabase: SupabaseClient,
  urls: readonly string[],
): Promise<number[]> {
  const cherchees = [...new Set(urls.filter((u) => typeof u === "string" && u.trim() !== ""))];
  if (cherchees.length === 0) return [];

  // `slots @> [{"url": …}]` par URL : l'index GIN de la migration porte
  // exactement là-dessus. Une requête par URL, et pas un `or()` de conditions
  // jsonb — PostgREST ne sait pas composer `contains` proprement dans un `or`.
  const trouvees = new Set<number>();
  for (const url of cherchees) {
    const { data, error } = await supabase
      .from(TABLE_TIRAGES)
      .select("entreprise_id")
      .contains("slots", [{ url }]);
    if (error) {
      console.warn("[tirage-entreprise] recherche par url impossible", error.message);
      continue;
    }
    for (const ligne of (data ?? []) as Array<{ entreprise_id: number }>) {
      trouvees.add(ligne.entreprise_id);
    }
  }
  return [...trouvees];
}
