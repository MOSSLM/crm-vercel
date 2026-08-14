import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EchantillonMediane } from "./mesures";
import { versAuditLu } from "@/lib/audit-site/lecture";

/**
 * La médiane des notes du parc — le repère central de la réglette.
 *
 * POURQUOI PAS UNE REQUÊTE SQL. `percentile_cont` demanderait une fonction RPC,
 * donc une migration ; or elles s'appliquent à la main ici, et un appel à une
 * fonction absente échoue au moment le plus coûteux — pendant la préparation
 * d'un audit. On rapatrie donc les lignes et on médiane en mémoire ; le cache
 * ci-dessous évite d'y revenir à chaque rendu.
 *
 * SUR QUOI PORTE LA MÉDIANE — le point délicat, et un bug vécu.
 *
 * Elle portait sur `note_globale`, notre barème de tri. Le repère du prospect,
 * lui, était passé à `note_document` sans que la médiane suive : la réglette
 * comparait donc une note fondée sur la mesure de Google à une médiane fondée
 * sur nos heuristiques. Mesuré sur le parc : médiane maison 77, médiane des
 * performances PageSpeed 66, et jusqu'à quarante points d'écart sur un même
 * site. N'importe quel prospect apparaissait très en dessous du parc sans que
 * rien ne l'ait mesuré — le commentaire qui vivait ici l'interdisait déjà, en
 * décrivant exactement ce qui s'est produit.
 *
 * D'où le passage par `versAuditLu`, LA MÊME FONCTION que celle qui calcule la
 * note du prospect. Même instrument par construction, et non par vigilance :
 * une formule réimplémentée ici aurait recommencé à diverger au premier
 * changement de barème.
 *
 * CE QUE ÇA COÛTE : la ligne entière au lieu d'une colonne, `signaux` et
 * `detail` compris — quelques mégaoctets sur le parc, une fois toutes les dix
 * minutes. C'est le prix d'une comparaison qui veut dire quelque chose.
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
    .select("*")
    .not("note_globale", "is", null);

  if (error || !data) return vide;

  // Les lignes sans note publiable — site injoignable, aucun axe assez sûr —
  // sortent de l'échantillon plutôt que d'y entrer à zéro. Une médiane tirée
  // vers le bas par des sites qu'on n'a pas su mesurer flatterait tous les
  // autres, ce qui est le sens de biais le plus coûteux ici.
  const notes = (data as Array<Record<string, unknown>>)
    .map((row) => versAuditLu(row).note_document)
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
