import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EchantillonMediane } from "./mesures";

/**
 * La médiane des notes du parc — le repère central de la réglette.
 *
 * POURQUOI PAS UNE REQUÊTE SQL. `percentile_cont` demanderait une fonction RPC,
 * donc une migration ; or elles s'appliquent à la main ici, et un appel à une
 * fonction absente échoue au moment le plus coûteux — pendant la préparation
 * d'un audit. On rapatrie donc les notes et on médiane en mémoire. À 430 lignes
 * c'est quelques kilo-octets ; le cache ci-dessous évite d'y revenir à chaque
 * rendu.
 *
 * SUR QUOI PORTE LA MÉDIANE, et c'est le point délicat : sur `note_globale`,
 * c'est-à-dire sur NOTRE barème pondéré — celui-là même qui donne la note du
 * prospect, que Google ait mesuré ou non. Les deux repères sortent donc du même
 * instrument, ce qui est la seule condition pour qu'ils puissent partager un axe.
 * Comparer une note PageSpeed de performance à une médiane maison ferait
 * apparaître n'importe quel prospect très en dessous du parc sans que rien ne
 * l'ait mesuré.
 */

/** Dix minutes : assez pour une session de préparation, trop court pour figer. */
const TTL_MS = 10 * 60 * 1000;

let cache: { a: EchantillonMediane; jusqua: number } | null = null;

/** Vide le cache — pour les tests, et après un rescorage du parc. */
export function oublierMediane(): void {
  cache = null;
}

/**
 * Ne lève jamais : sans médiane, la réglette s'affiche à deux repères. Une page
 * d'audit ne doit pas tomber parce qu'une statistique de confort manque.
 */
export async function lireMedianeParc(
  sb: SupabaseClient,
  maintenant = Date.now(),
): Promise<EchantillonMediane> {
  if (cache && cache.jusqua > maintenant) return cache.a;

  const vide: EchantillonMediane = { valeur: null, effectif: 0 };

  const { data, error } = await sb
    .from("entreprises_audit_site")
    .select("note_globale")
    .not("note_globale", "is", null);

  if (error || !data) return vide;

  const notes = (data as Array<{ note_globale: number | null }>)
    .map((r) => r.note_globale)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);

  if (notes.length === 0) return vide;

  const a: EchantillonMediane = { valeur: mediane(notes), effectif: notes.length };
  cache = { a, jusqua: maintenant + TTL_MS };
  return a;
}

/** Médiane d'une liste DÉJÀ triée. Arrondie : on affiche un entier sur 100. */
export function mediane(triees: readonly number[]): number | null {
  if (triees.length === 0) return null;
  const milieu = Math.floor(triees.length / 2);
  const v =
    triees.length % 2 === 1 ? triees[milieu] : (triees[milieu - 1] + triees[milieu]) / 2;
  return Math.round(v);
}
