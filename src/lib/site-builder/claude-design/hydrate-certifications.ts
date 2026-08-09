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
 * `data-certifications` est le contrat explicite, à privilégier pour les
 * nouveaux designs. `.certif-row` est celle que les templates CVC livrés
 * portent DÉJÀ : les reconnaître évite d'avoir à reprendre chaque template
 * avant que le contrôle ADEME serve à quelque chose. C'est la même raison qui
 * fait accepter `img` à défaut d'un `[data-certification-logo]`.
 */
const CONTENEURS = ["[data-certifications]", ".certif-row"];
const ITEMS = "[data-certification-item], .certif-logo";
const IMG = "[data-certification-logo]";

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
  if (!html.includes("data-certifications") && !html.includes("certif-row")) return html;

  const root = parse(html);
  const conteneurs = CONTENEURS.flatMap((sel) => root.querySelectorAll(sel));
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
