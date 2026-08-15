import { SITE_DOMAIN, normalizeHost } from "@/lib/site-domain";

/**
 * Le trafic MAISON — comment on l'empêche d'être compté.
 *
 * Le problème qu'il résout : deux personnes démarchent toute la journée depuis
 * le CRM, et chaque fois qu'elles ouvrent la démo d'un prospect pour vérifier
 * qu'elle est belle avant d'envoyer le lien, GA4 enregistre une visite sur
 * l'hôte de ce prospect. Le radar lit ces visites, `scoreIntent` (voir
 * src/lib/analytics-radar/intent.ts) y voit un retour, un changement
 * d'appareil, des pages clés ouvertes — et remonte une fiche « 🔥 à rappeler
 * aujourd'hui » alors que le prospect n'a jamais rien ouvert. Le commercial
 * décroche en disant « je vois que vous êtes repassé sur votre site » à
 * quelqu'un qui n'y est jamais allé.
 *
 * LE PRINCIPE : on ne filtre pas après coup, on n'ÉMET PAS. Le seul point de
 * mesure du parc est `PublicAnalytics` (le tag GA4 + le tag Clarity du layout
 * `(public)`). Une page qui ne charge pas ces deux scripts est invisible
 * partout à la fois — GA4, l'export BigQuery qui en découle, Clarity, et donc
 * le radar et les scores d'intention. C'est la seule façon d'avoir UN endroit
 * à maintenir plutôt qu'un filtre à recopier dans chaque lecture.
 *
 * DEUX MANIÈRES d'être reconnu comme interne, et il en faut deux :
 *
 *  1. Le PARAMÈTRE d'URL (`?sama_interne=1`). Tous les liens « Ouvrir » du CRM
 *     le portent — c'est `lienNonMesure()` qui les habille. L'agent n'a donc
 *     rien à faire ni à retenir : ouvrir une démo depuis le CRM ne compte
 *     jamais, y compris sur un poste neuf ou en navigation privée.
 *  2. Le COOKIE, posé par la première visite paramétrée et valable deux ans.
 *     Il couvre ce que le paramètre ne peut pas couvrir : le lien recollé à la
 *     main, le favori, le bouton « précédent », le rechargement. Il est posé
 *     sur `.{SITE_DOMAIN}`, donc il vaut pour TOUS les sous-domaines du parc
 *     (chaque démo a le sien) et pour le sous-domaine des rapports d'audit.
 *
 * `?sama_interne=0` fait l'inverse et efface le cookie : indispensable sur un
 * poste partagé, et c'est aussi la porte de sortie si quelqu'un se marque par
 * erreur — sans elle, le seul recours serait d'aller purger les cookies.
 *
 * CE QUE ÇA NE FAIT PAS : effacer le passé. Les visites déjà envoyées restent
 * dans GA4 et dans l'export BigQuery ; rien, dans aucun outil, ne permet de
 * les retirer rétroactivement. Pour ça — et pour couvrir un navigateur qui
 * n'aurait ni paramètre ni cookie — il faut la règle IP côté GA4 et Clarity,
 * décrite dans docs/exclure-le-trafic-interne.md. Les deux couches sont
 * complémentaires : celle-ci suit la personne, l'autre suit le bureau.
 */

/** Le paramètre d'URL qui dit « cette visite est la nôtre ». */
export const PARAM_TRAFIC_INTERNE = "sama_interne";

/** Le cookie qui s'en souvient d'une visite à l'autre. */
export const COOKIE_TRAFIC_INTERNE = "sama_interne";

/**
 * Deux ans. Assez long pour qu'on n'y repense jamais, assez court pour qu'un
 * poste revendu finisse par redevenir un visiteur ordinaire.
 */
const DUREE_COOKIE_S = 60 * 60 * 24 * 730;

/**
 * Le marqueur posé sur l'URL donnée au service de capture de vignettes
 * (`urlPourCapture`, dans site-builder/demo-share-url.ts).
 *
 * Il est traité ici comme du trafic interne, et ce n'est pas un détail : le
 * robot de capture ouvre un vrai navigateur sur la vraie démo. Chaque vignette
 * régénérée valait donc une session de plus sur l'hôte du prospect, à une
 * heure choisie par un cron — le faux signal le plus difficile à démasquer,
 * puisqu'il ne correspond au geste de personne.
 */
const PARAM_CAPTURE = "sama_shot";

/** Valeurs qui veulent dire « non » dans une URL écrite à la main. */
const NON = new Set(["0", "false", "non", "off", "no"]);

function parametres(search: string): URLSearchParams {
  const brut = search ?? "";
  return new URLSearchParams(brut.startsWith("?") ? brut.slice(1) : brut);
}

/**
 * Ce que l'URL décide : `true` ne plus compter, `false` recompter, `null`
 * l'URL ne dit rien et c'est au cookie de trancher.
 *
 * Le paramètre nu (`?sama_interne`) vaut `true` — c'est la forme qu'on tape
 * quand on bricole une adresse à la main, et la lire comme un « non » serait
 * l'exact contraire de l'intention.
 */
export function decisionDeLUrl(search: string): boolean | null {
  const p = parametres(search);
  // La capture ne se « décide » pas : elle ne mesure jamais, et ne laisse
  // aucun cookie derrière elle (voir `PublicAnalytics`).
  if (p.has(PARAM_CAPTURE) && !NON.has((p.get(PARAM_CAPTURE) ?? "").trim().toLowerCase())) return true;
  if (!p.has(PARAM_TRAFIC_INTERNE)) return null;
  return !NON.has((p.get(PARAM_TRAFIC_INTERNE) ?? "").trim().toLowerCase());
}

/** Vrai quand la visite vient d'une capture de vignette, pas d'un humain. */
export function estCapture(search: string): boolean {
  const p = parametres(search);
  return p.has(PARAM_CAPTURE) && !NON.has((p.get(PARAM_CAPTURE) ?? "").trim().toLowerCase());
}

/** Ce dont le navigateur se souvient. Absent ou « 0 » ⇒ visiteur ordinaire. */
export function decisionDuCookie(cookie: string): boolean {
  for (const morceau of (cookie ?? "").split(";")) {
    const sep = morceau.indexOf("=");
    const nom = (sep === -1 ? morceau : morceau.slice(0, sep)).trim();
    if (nom !== COOKIE_TRAFIC_INTERNE) continue;
    const valeur = sep === -1 ? "" : decodeURIComponent(morceau.slice(sep + 1).trim());
    return !NON.has(valeur) && valeur !== "";
  }
  return false;
}

/**
 * Sur quel domaine poser le cookie.
 *
 * `.{SITE_DOMAIN}` dès qu'on est chez nous : c'est ce qui fait qu'un marquage
 * posé sur `plomberie-durand.samadigitalstudio.fr` vaut aussi pour les 300
 * autres démos, pour `rapport.` et pour le CRM lui-même — sans quoi il
 * faudrait se marquer une fois par prospect, ce qui ne tient pas.
 *
 * `null` (cookie d'hôte) pour un domaine client ou pour localhost : on n'a
 * aucun droit à écrire sur le domaine d'un client, et le navigateur refuserait
 * de toute façon.
 */
export function domaineCookie(hostname: string, siteDomain: string = SITE_DOMAIN): string | null {
  const host = normalizeHost(hostname);
  if (!host || !siteDomain) return null;
  if (host === siteDomain || host.endsWith(`.${siteDomain}`)) return `.${siteDomain}`;
  return null;
}

/** La chaîne à affecter à `document.cookie` pour marquer (ou démarquer). */
export function chaineCookie(
  exclu: boolean,
  hostname: string,
  opts: { secure?: boolean; siteDomain?: string } = {},
): string {
  const { secure = true, siteDomain = SITE_DOMAIN } = opts;
  const domaine = domaineCookie(hostname, siteDomain);
  return [
    `${COOKIE_TRAFIC_INTERNE}=${exclu ? "1" : "0"}`,
    "Path=/",
    "SameSite=Lax",
    // Effacer, c'est poser la même clé avec un âge nul : sans `Max-Age=0` le
    // « 0 » resterait deux ans et démarquer deviendrait irréversible.
    exclu ? `Max-Age=${DUREE_COOKIE_S}` : "Max-Age=0",
    domaine ? `Domain=${domaine}` : null,
    // `Secure` en http (dev local) fait silencieusement refuser le cookie.
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

/** La question à laquelle `PublicAnalytics` répond : mesure-t-on cette page ? */
export function estTraficInterne(search: string, cookie: string): boolean {
  const url = decisionDeLUrl(search);
  return url ?? decisionDuCookie(cookie);
}

/**
 * L'adresse d'une démo telle qu'on l'ouvre DEPUIS LE CRM.
 *
 * À n'utiliser que sur les liens qu'un agent clique. Jamais sur l'URL copiée,
 * envoyée en WhatsApp, collée dans un e-mail ou posée dans une carte
 * OpenGraph : celles-là partent chez le prospect, et c'est justement sa visite
 * à lui qu'on veut mesurer.
 */
export function lienNonMesure(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(PARAM_TRAFIC_INTERNE, "1");
    return u.toString();
  } catch {
    // Adresse relative ou mal formée : on concatène en gardant l'ancre, qui
    // doit rester en dernier sous peine d'atterrir dans la valeur du paramètre.
    const [avant, ...ancre] = url.split("#");
    const sep = avant.includes("?") ? "&" : "?";
    const suffixe = ancre.length ? `#${ancre.join("#")}` : "";
    return `${avant}${sep}${PARAM_TRAFIC_INTERNE}=1${suffixe}`;
  }
}
