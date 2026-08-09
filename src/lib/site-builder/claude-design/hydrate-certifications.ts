/**
 * Hydratation des logos de certification pour le HTML brut d'un design Claude.
 *
 * CE QUE CE TWEAK EMPÊCHE, et c'est sa seule raison d'être : qu'un site de démo
 * affiche une qualification RGE que l'entreprise ne détient pas. Les designs
 * livrent un bandeau d'exemple garni de Qualibat, QualiPAC et compagnie ; laissé
 * tel quel, il attribue à chaque client les certifications du gabarit.
 *
 * Trois comportements, et le troisième est le plus important :
 *
 *   1. des logos vérifiés  → on remplace ceux du design par les vrais ;
 *   2. un logo manquant    → la carte est simplement retirée de la rangée ;
 *   3. AUCUNE qualification → **le bloc entier disparaît**. Pas un cadre vide,
 *      pas un titre orphelin, pas de placeholder. Un bandeau « Nos
 *      certifications » sans rien dessous est pire qu'absent : il attire l'œil
 *      sur un manque.
 *
 * Contrat `data-*`, aligné sur `hydrate-stats` et `hydrate-reviews` :
 *   - `data-certifications`      → le conteneur à supprimer quand il n'y a rien
 *   - `data-certification-item`  → la carte-modèle (la 1re sert de gabarit)
 *   - `data-certification-logo`  → le `<img>` à remplir
 *
 * Différence assumée avec `hydrate-stats` : sans donnée, `hydrate-stats` LAISSE
 * les cartes d'exemple, parce qu'un chiffre décoratif ne trompe personne sur un
 * fait vérifiable. Ici c'est l'inverse — un logo de certification EST une
 * allégation. Le repli est donc la suppression, jamais l'exemple.
 *
 * Pur et isomorphe, même pipeline `node-html-parser` que ses voisins.
 */
import { parse } from "node-html-parser";

import { stripDomPathStamps } from "./dom-paths";

export interface LogoCertification {
  cle: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  alt: string;
}

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Remplit une carte-gabarit avec un logo vérifié. */
const remplirCarte = (gabarit: string, logo: LogoCertification): string => {
  const carte = parse(gabarit).querySelector(ITEMS);
  if (!carte) return "";
  const img = carte.querySelector(IMG) ?? carte.querySelector("img");
  if (img) {
    img.setAttribute("src", escapeAttr(logo.src));
    img.setAttribute("srcset", escapeAttr(logo.srcSet));
    img.setAttribute("alt", escapeAttr(logo.alt));
    // Les dimensions du gabarit normalisé : elles évitent le saut de mise en
    // page au chargement, et disent au navigateur le ratio réel. Les fichiers
    // sont déjà équilibrés optiquement — on ne les redimensionne pas un par un.
    img.setAttribute("width", String(logo.width));
    img.setAttribute("height", String(logo.height));
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  }
  return carte.toString();
};

/**
 * Remplit — ou supprime — le bloc de certifications.
 *
 * @param html   markup brut du design
 * @param logos  les logos VÉRIFIÉS ; une liste vide déclenche la suppression
 */
/**
 * Les deux conventions reconnues, dans cet ordre.
 *
 * `data-certifications` est le contrat explicite : les templates CVC le portent
 * depuis leur révision du 09/08/2026. `.certif-row` reste indispensable pour les
 * sections DÉJÀ importées en base, qui ne l'ont pas et ne l'auront jamais
 * — 47 d'entre elles affichent des logos en dur. Les abandonner rendrait le
 * contrôle ADEME muet exactement là où il sert. C'est la même raison qui fait
 * accepter `img` à défaut d'un `[data-certification-logo]`.
 *
 * Deux conventions pour une seule rangée, ça veut dire qu'un même bloc peut
 * répondre plusieurs fois. `conteneursGarnis` tranche : LE PLUS PROFOND GAGNE.
 */
const CONTENEURS = ["[data-certifications]", ".certif-row"];

/** `parent` contient-il `enfant` ? (remontée de chaîne, pas de `contains`) */
const contient = (parent: unknown, enfant: unknown): boolean => {
  let cur = (enfant as { parentNode?: unknown } | null)?.parentNode;
  while (cur) {
    if (cur === parent) return true;
    cur = (cur as { parentNode?: unknown }).parentNode;
  }
  return false;
};

/**
 * Les conteneurs à garnir : distincts, et les plus profonds seulement.
 *
 * Deux situations imposent ce filtre, et la seconde abîme le rendu :
 *
 *   - MÊME nœud, deux fois. Le template révisé écrit
 *     `.certif-row[data-certifications]` : il répond aux deux sélecteurs. Le
 *     garnir deux fois est sans conséquence visible mais gaspille le travail,
 *     et fait appeler `remove()` sur un nœud déjà détaché quand il n'y a rien.
 *
 *   - Conteneurs IMBRIQUÉS. Un design qui poserait `data-certifications` sur la
 *     `<section>` en gardant `.certif-row` à l'intérieur ferait garnir la
 *     section elle-même : `set_content` y remplace TOUT, donc la rangée flex et
 *     son chapeau disparaissent, et les cartes se retrouvent nues dans la
 *     section. La mise en page s'effondre sans que rien ne signale l'erreur.
 *
 * Garnir le plus profond règle les deux : c'est la rangée qui porte la mise en
 * forme, jamais son enveloppe. La suppression, elle, remonte toujours à la
 * `<section>` porteuse — cf. `aRetirer`.
 */
const conteneursGarnis = (root: ReturnType<typeof parse>) => {
  const tous: ReturnType<typeof root.querySelectorAll> = [];
  for (const sel of CONTENEURS) {
    for (const el of root.querySelectorAll(sel)) {
      if (!tous.includes(el)) tous.push(el);
    }
  }
  return tous.filter((el) => !tous.some((autre) => autre !== el && contient(el, autre)));
};
const ITEMS = "[data-certification-item], .certif-logo";
const IMG = "[data-certification-logo]";

/**
 * Ce markup porte-t-il un bloc de certifications ?
 *
 * Exporté pour que les appelants qui court-circuitent l'appel — parser du HTML
 * pour rien coûte cher sur chaque section de chaque page publiée — testent la
 * MÊME chose que la fonction. Une liste de marqueurs recopiée à la main avait
 * déjà divergé une fois, et du côté publié : les sections en `.certif-row`
 * gardaient les logos du template sur le site en ligne.
 */
export const porteDesCertifications = (html: string): boolean =>
  html.includes("data-certifications") || html.includes("certif-row");

/**
 * Ce qu'il faut retirer quand il n'y a AUCUNE qualification.
 *
 * Pas la rangée seule : le template CVC met au-dessus un chapeau
 * « Certifications & qualifications reconnues par l'État ». Supprimer la rangée
 * en laissant cette phrase produirait exactement le titre orphelin qu'on veut
 * éviter — une section qui annonce des certifications et n'en montre aucune.
 * On remonte donc à la `<section>` porteuse quand elle existe.
 */
const aRetirer = (conteneur: ReturnType<typeof parse>): ReturnType<typeof parse> => {
  let cur: any = conteneur;
  while (cur?.parentNode) {
    const parent = cur.parentNode;
    const tag = String(parent.rawTagName ?? "").toLowerCase();
    const id = String(parent.getAttribute?.("id") ?? "");
    const cls = String(parent.getAttribute?.("class") ?? "");
    if (tag === "section" && (id.startsWith("sec-certif") || cls.includes("certif-band"))) {
      return parent;
    }
    if (tag === "body" || tag === "html" || !tag) break;
    cur = parent;
  }
  return conteneur;
};

export function hydrateCertifications(html: string, logos: LogoCertification[]): string {
  if (!porteDesCertifications(html)) return html;

  const root = parse(html);
  const conteneurs = conteneursGarnis(root);
  if (conteneurs.length === 0) return html;

  for (const conteneur of conteneurs) {
    // ── Cas 3 : rien de vérifié → le bloc entier s'en va, chapeau compris.
    if (logos.length === 0) {
      (aRetirer(conteneur as never) as unknown as { remove: () => void }).remove();
      continue;
    }

    const gabaritEl = conteneur.querySelector(ITEMS);
    if (!gabaritEl) continue;

    // La première carte sert de gabarit : elle porte la mise en forme du design
    // (cadre, ombre, espacement) qu'on veut conserver.
    const gabarit = gabaritEl.toString();

    // Seule la 1re carte garde les tampons `data-cdp` du gabarit : deux nœuds ne
    // peuvent pas porter le même chemin, sinon les overrides d'édition inline
    // s'appliquent au mauvais élément (cf. claude-design/dom-paths.ts). Même
    // règle que `hydrate-stats`.
    const cartes = logos
      .map((logo, i) => (i === 0 ? remplirCarte(gabarit, logo) : stripDomPathStamps(remplirCarte(gabarit, logo))))
      .join("");

    // `set_content` remplace la rangée ENTIÈRE : les cartes d'exemple du design
    // ne doivent jamais survivre à côté des vraies.
    conteneur.set_content(cartes);
  }

  return root.toString();
}
