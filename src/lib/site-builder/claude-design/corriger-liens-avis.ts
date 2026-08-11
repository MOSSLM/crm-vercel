/**
 * Fait pointer les liens « avis » d'un site vers la VRAIE fiche Google du client.
 *
 * LE PROBLÈME
 * Sur les sites démo, « Voir tous les avis » ouvrait
 * `google.com/search?q=avis` — une page de résultats Google pour le mot
 * « avis », sans rapport avec le client. Vu depuis un prospect à qui on vient
 * d'envoyer sa démo par WhatsApp, c'est le lien le plus visible de la section
 * qui prouve sa réputation, et il tombe dans le vide.
 *
 * LA CAUSE
 * `entreprises.google_url` n'a jamais été exposée aux variables du générateur
 * (`resolve-variables.ts`). Le design n'avait donc rien vers quoi pointer, et
 * une URL de recherche a été écrite en dur — d'abord dans un template, puis
 * recopiée dans chaque génération.
 *
 * CE QUE FAIT CE MODULE
 * Deux choses, dans cet ordre :
 *
 *   1. `[data-avis-lien]` — le contrat propre, pour les designs à venir : on
 *      pose l'URL sur l'attribut `href`, quoi qu'il contienne.
 *   2. Le rattrapage — tout `<a>` dont le `href` est une RECHERCHE Google
 *      (`/search?q=`, `/maps/search/`) est réécrit vers la fiche. C'est ce qui
 *      répare les démos déjà générées sans avoir à les régénérer une par une.
 *
 * Ce qui n'est PAS touché : un lien qui pointe déjà vers une fiche
 * (`/maps/place/`, `g.page`, `goo.gl/maps`) — il est déjà bon — et tout lien
 * hors Google. Sans `google_url` connue pour l'entreprise, le module ne fait
 * rien : mieux vaut le lien bancal existant qu'un `href` vide qui recharge la
 * page.
 *
 * Pur et isomorphe, même pipeline `node-html-parser` que `hydrate-reviews`.
 */
import { parse } from "node-html-parser";

/** Marqueur explicite posé par le design sur son bouton « voir les avis ». */
const ATTR_LIEN_AVIS = "data-avis-lien";

/**
 * Vrai pour `google.com`, `www.google.fr`, `google.co.uk` — et FAUX pour
 * `google.com.example.fr`.
 *
 * Un simple `hostname.includes("google.")` fait de n'importe quel domaine
 * sosie un domaine Google. Ici on exige que le label `google` soit suivi d'un
 * suffixe d'une ou deux étiquettes purement alphabétiques, ce qui couvre les
 * domaines nationaux (`.fr`, `.co.uk`) sans laisser passer un sous-domaine
 * placé devant un autre nom de domaine.
 */
function estDomaineGoogle(hostname: string): boolean {
  const labels = hostname.toLowerCase().split(".");
  const i = labels.lastIndexOf("google");
  if (i === -1) return false;
  const suffixe = labels.slice(i + 1);
  if (suffixe.length < 1 || suffixe.length > 2) return false;
  return suffixe.every((l) => /^[a-z]{2,}$/.test(l));
}

/** Une URL de recherche Google — le symptôme qu'on répare. */
export function estRechercheGoogle(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (!estDomaineGoogle(url.hostname)) return false;
  return url.pathname === "/search" || url.pathname.startsWith("/maps/search");
}

/**
 * Vrai quand le lien mène déjà à une fiche d'établissement. On n'y touche pas :
 * si quelqu'un a pris la peine de coller la bonne URL à la main, elle gagne.
 */
export function estFicheGoogle(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  const hote = url.hostname.toLowerCase();
  if (hote === "g.page" || hote.endsWith(".g.page")) return true;
  if (hote === "goo.gl" && url.pathname.startsWith("/maps")) return true;
  if (!estDomaineGoogle(hote)) return false;
  return url.pathname.startsWith("/maps/place") || url.searchParams.has("cid");
}

/**
 * Réécrit les liens d'avis du HTML vers `urlFiche`.
 *
 * Retourne le HTML inchangé s'il n'y a pas d'URL de fiche, ou rien à corriger —
 * le cas de très loin le plus fréquent, d'où les sorties courtes avant de payer
 * le parsing du document.
 */
export function corrigerLiensAvis(html: string, urlFiche: string | null | undefined): string {
  const fiche = urlFiche?.trim();
  if (!fiche) return html;
  if (!html.includes(ATTR_LIEN_AVIS) && !html.includes("google.")) return html;

  const root = parse(html);
  let modifie = false;

  for (const a of root.querySelectorAll(`a[${ATTR_LIEN_AVIS}]`)) {
    a.setAttribute("href", fiche);
    modifie = true;
  }

  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (estFicheGoogle(href)) continue;
    if (!estRechercheGoogle(href)) continue;
    a.setAttribute("href", fiche);
    modifie = true;
  }

  if (!modifie) return html;

  // Un lien d'avis sort du site : sans `target`, le prospect perd la démo qu'on
  // vient de lui envoyer et ne revient pas.
  for (const a of root.querySelectorAll("a[href]")) {
    if (a.getAttribute("href") !== fiche) continue;
    if (!a.getAttribute("target")) a.setAttribute("target", "_blank");
    if (!a.getAttribute("rel")) a.setAttribute("rel", "noopener noreferrer");
  }

  return root.toString();
}
