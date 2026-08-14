import type { Preuve } from "./types";

/**
 * Combien le web renvoie vers ce domaine — le seul axe qu'on ne répare pas.
 *
 * POURQUOI IL EST QUAND MÊME LÀ. Un site neuf et vide n'a aucun lien entrant, et
 * c'est précisément le profil que la vitesse flattait : rapide parce que rien
 * dedans, invisible parce que personne n'y renvoie. Le netlinking constate cette
 * seconde moitié. Il fonde une offre SEO optionnelle du catalogue, pas une
 * promesse de la colonne « Après » — on ne vend pas des liens avec une vitrine,
 * et le document ne doit rien laisser croire de tel.
 *
 * LA SOURCE : Open PageRank, qui rejoue l'algorithme de PageRank sur le graphe
 * de liens public de Common Crawl. Gratuite avec une clé, cent domaines par
 * appel, trente mille par mois — le parc entier passe en vingt-huit appels. Et
 * Common Crawl ne se rafraîchit que mensuellement : mesurer plus souvent
 * consommerait du quota pour relire le même chiffre.
 *
 * CE QU'ON N'AFFICHE PAS, ET POURQUOI. Le rang brut est un 0-10 logarithmique :
 * « votre domaine vaut 2,4 » ne veut rien dire pour un artisan et ne se vérifie
 * pas d'instinct. On le garde comme mesure — il figure dans la preuve, avec son
 * seuil, et il se rejoue sur n'importe quel vérificateur public — mais ce que le
 * document montre est un niveau, pas un nombre nu.
 *
 * ON N'INVENTE SURTOUT PAS UN NOMBRE DE LIENS. Open PageRank rend un rang, pas
 * un décompte de domaines référents ; en déduire « 3 sites pointent vers vous »
 * serait un chiffre fabriqué, c'est-à-dire exactement ce que ce document existe
 * pour ne jamais contenir.
 */

/** Common Crawl ne bouge qu'une fois par mois : au-delà, on remesure. */
export const TTL_NETLINKING_JOURS = 30;

/**
 * Sous ce rang, personne ne renvoie vers le domaine.
 *
 * Calibré sur ce que rend Open PageRank pour un site d'artisan : un domaine
 * jamais cité tourne autour de 0 à 1,5 ; un site correctement référencé
 * localement — annuaires, fédération, partenaires, presse locale — dépasse 3.
 * Le seuil ne vise pas l'excellence, il vise « quelqu'un parle de vous ».
 */
export const SEUIL_RANG = 3;

/** Sous ce rang, ce n'est plus une nuance : le domaine est invisible. */
export const RANG_GRAVE = 1.5;

export interface MesureNetlinking {
  domaine: string;
  /** 0 à 10, tel que rendu par Open PageRank. `null` si le domaine est inconnu. */
  rang: number | null;
}

const POINT_ENTREE = "https://openpagerank.com/api/v1.0/getPageRank";
/** Le maximum accepté par l'API en un appel. */
export const MAX_DOMAINES_PAR_APPEL = 100;

/** Le domaine nu — sans schéma, sans `www.`, sans chemin. */
export function domaineDe(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Interroge Open PageRank pour cent domaines au plus.
 *
 * Ne lève jamais : sans clé, sans réseau ou sur une réponse inattendue, elle
 * rend une carte vide. Un axe absent est un axe qui ne s'affiche pas — c'est la
 * règle de tout ce module — alors qu'une exception ferait échouer une
 * préparation d'audit entière pour un signal qui pèse dix points.
 */
export async function mesurerNetlinking(domaines: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const cle = process.env.OPEN_PAGERANK_API_KEY;
  const uniques = [...new Set(domaines.filter(Boolean))].slice(0, MAX_DOMAINES_PAR_APPEL);
  if (!cle || uniques.length === 0) return out;

  const params = new URLSearchParams();
  for (const d of uniques) params.append("domains[]", d);

  try {
    const res = await fetch(`${POINT_ENTREE}?${params}`, {
      headers: { "API-OPR": cle },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return out;
    const corps = (await res.json()) as {
      response?: Array<{ domain?: string; page_rank_decimal?: number | string; status_code?: number }>;
    };
    for (const ligne of corps.response ?? []) {
      const domaine = typeof ligne.domain === "string" ? ligne.domain.toLowerCase() : null;
      if (!domaine) continue;
      // `status_code` 200 = domaine connu du graphe. 404 = jamais vu, ce qui
      // n'est pas une erreur : c'est le constat lui-même, et il vaut zéro.
      const brut = Number(ligne.page_rank_decimal);
      out.set(domaine, Number.isFinite(brut) ? brut : ligne.status_code === 404 ? 0 : null);
    }
  } catch {
    return out;
  }
  return out;
}

/** Un rang se lit sur 10, avec une décimale, à la française. */
function rangFormate(n: number): string {
  return `${n.toFixed(1).replace(".", ",")} / 10`;
}

/**
 * La preuve stockée dans `detail.netlinking`, d'où la note se recalcule.
 *
 * Pas de colonne dédiée, exactement comme `contenu` et `popularite` : un
 * `upsert` qui nomme une colonne absente échoue ENTIÈREMENT, et les migrations
 * s'appliquent ici à la main. Une preuve dans le JSONB existant ne peut pas
 * faire tomber l'écriture d'une ligne.
 */
export function preuvesNetlinking(rang: number | null): Preuve[] {
  if (rang == null) return [];
  const verdict = rang >= SEUIL_RANG ? "ok" : rang >= RANG_GRAVE ? "moyen" : "probleme";
  return [
    {
      cle: "opr_rang",
      libelle: "Autorité de votre domaine sur le web",
      valeur: rangFormate(rang),
      seuil: rangFormate(SEUIL_RANG),
      poids: 100,
      verdict,
      // Zéro lien connu est le pire cas absolu, et il est fréquent : la gravité
      // suit donc la distance au seuil, ramenée à 1 quand le domaine est ignoré
      // de tout le graphe.
      gravite: verdict === "ok" ? undefined : Math.min(1, (SEUIL_RANG - rang) / SEUIL_RANG),
    },
  ];
}

/** Une mesure de plus de trente jours ne vaut plus : Common Crawl a bougé. */
export function netlinkingEstFrais(mesureLe: string | null | undefined): boolean {
  if (!mesureLe) return false;
  const t = Date.parse(mesureLe);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < TTL_NETLINKING_JOURS * 24 * 3600 * 1000;
}
