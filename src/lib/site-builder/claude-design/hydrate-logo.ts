/**
 * La marque en en-tête : le vrai logo quand il existe, sinon une SIGNATURE
 * TYPOGRAPHIQUE composée avec le nom de l'entreprise.
 *
 * CE QUE ÇA RÉPARE, mesuré. 296 des 300 entreprises de la cohorte de démarchage
 * n'ont aucun logo en base. Le design leur réserve pourtant une image :
 * `<img class="brand-img" src="{{ entreprise.logo_url }}">`, dans 482 des 492
 * sections qui portent ce token. Un token vide rend `src=""`, et un `src` vide
 * n'est PAS une image absente — le navigateur redemande l'URL de la page, la
 * reçoit en HTML, et pose un pictogramme d'image cassée à l'endroit exact où
 * l'œil cherche l'identité. La démo qu'on envoie au prospect s'ouvre sur un
 * défaut, en haut à gauche, avant même le premier mot.
 *
 * Un artisan sans logo n'a pas un problème de logo : il n'a jamais payé de
 * graphiste. Son nom, bien composé, EST son identité. Le repli n'est donc ni un
 * cadre vide, ni un aplat gris, ni une initiale dans un rond — c'est son nom,
 * lisible, à la place que le design lui réservait.
 *
 * ── POURQUOI CE N'EST PAS LA RÈGLE INVERSE DE `hydrate-certifications` ──
 *
 * Le voisin SUPPRIME son bloc quand il n'a rien à montrer, et c'est la bonne
 * règle CHEZ LUI : un logo de certification est une ALLÉGATION, l'afficher sans
 * preuve serait mentir sur un site qu'on produit. Ici la matière est d'une autre
 * nature — le nom d'une entreprise est un FAIT, qu'on tient de sa propre fiche,
 * et que le pied de page et la balise `<title>` affichent déjà en toutes
 * lettres. Le montrer une fois de plus n'ajoute aucune affirmation nouvelle.
 *
 * Les deux modules obéissent donc à une seule et même règle : **on ne montre que
 * ce qu'on peut tenir**. Ce qui change n'est pas la règle, c'est ce qu'on tient.
 * Sans preuve, le silence ; avec un fait, la bonne composition. Un repli n'est
 * pas « supprimer » ou « garnir » par tempérament : c'est la conséquence de ce
 * que la donnée autorise.
 *
 * ── LE CONTRAT `data-*`, comme chez les voisins ──
 *   - `[data-brand]`      → le bloc de marque      (rattrapage : `.brand`)
 *   - `[data-brand-logo]` → l'image à garnir       (rattrapage : `img.brand-img`)
 *   - `[data-brand-name]` → la signature composée  (rattrapage : `.brand-name`)
 *
 * Les rattrapages par classe ne sont pas de la politesse : AUCUNE des 544
 * sections en base ne porte les attributs, et 482 portent `.brand-img`. Sans
 * eux, ce module ne s'appliquerait à rien de ce qui existe. Même raison que
 * `.certif-row` dans `hydrate-certifications`.
 *
 * La signature réutilise `.brand-name`, la classe que le design définit
 * lui-même (`font-family: var(--serif)` dans les 128 sites qui ont une feuille
 * partagée) et qu'il compose déjà à côté du logo dans son menu mobile et son
 * pied de page. C'est ce qui garantit que la police est CELLE DU DESIGN et
 * jamais une police choisie ici : on ne pose que ce que la composition impose
 * en plus — la taille optique et l'interlettrage.
 *
 * Pur et isomorphe, même pipeline `node-html-parser` que ses voisins.
 */
import { parse, type HTMLElement } from "node-html-parser";

import { stripDomPathStamps } from "./dom-paths";

/** Le bloc de marque : un `<a>` en en-tête, un `<span>` ailleurs. */
const CONTENEURS = "[data-brand], .brand";
/** L'image de logo à garnir — ou à remplacer par la signature. */
const IMG = "[data-brand-logo], img.brand-img";
/** La signature typographique, telle que le design la nomme. */
const SIGNATURE = "[data-brand-name], .brand-name";

/** Le gabarit de dernier recours, quand le design ne compose le nom nulle part. */
const GABARIT_DEFAUT = '<span class="brand-name"></span>';

export interface MarqueEntreprise {
  /** Raison sociale telle qu'elle est en base — capitales comprises. */
  nom?: string | null;
  /** Logo vérifié, déjà résolu (celui du projet prime sur celui de l'entreprise). */
  logoUrl?: string | null;
}

/**
 * Ce markup porte-t-il un bloc de marque ?
 *
 * Exporté pour que les appelants court-circuitent l'appel sans payer le parsing
 * sur chaque section de chaque page publiée. Volontairement PLUS LARGE que les
 * sélecteurs (`data-brand` attrape aussi `data-brand-logo`) : un filtre trop
 * large ne fait perdre qu'un parsing, un filtre trop étroit laisserait le site
 * publié afficher l'image cassée que l'aperçu, lui, aurait réparée. C'est
 * exactement la divergence que `porteDesCertifications` a coûté une fois.
 */
export const porteUneMarque = (html: string): boolean =>
  html.includes("data-brand") || html.includes("brand-img") || html.includes("brand-name");

const echapperTexte = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 8 raisons sociales de la cohorte portent un `&`, et un `&` nu casse l'attribut. */
const echapperAttr = (s: string): string => echapperTexte(s).replace(/"/g, "&quot;");

/** Espaces normalisés : les raisons sociales importées en portent de doubles. */
const normaliser = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * L'emplacement est-il VIDE, au sens du rendu ?
 *
 * Un token non résolu (`{{ entreprise.logo_url }}`) compte comme vide : il
 * arrive tel quel depuis l'aperçu de l'éditeur, où toutes les variables ne sont
 * pas fournies, et il produit exactement la même image cassée qu'un `src=""`.
 */
const estSrcVide = (src: string | undefined): boolean => {
  const v = (src ?? "").trim();
  return v === "" || /^\{\{[^}]*\}\}$/.test(v);
};

/**
 * Tout en capitales ? Vrai pour « ECLATS ANTIVOLS », faux pour « Éclats », faux
 * pour « 74000 » — un libellé sans lettre n'a pas de casse à corriger.
 *
 * Pas de `\p{Lu}` : le projet cible ES2017, où les échappements de propriété
 * Unicode ne compilent pas. La comparaison de casse, elle, connaît les accents.
 */
const estToutCapitales = (s: string): boolean => s === s.toUpperCase() && s !== s.toLowerCase();

/**
 * Les séparateurs derrière lesquels un titre Google cesse d'être un nom.
 *
 * `entreprises.name` vient de la fiche Google, et une fiche Google se
 * référence : « Atlantic Service | Plombier - Chauffagiste - Spécialiste Pompe
 * à chaleur - Climatisation - Rénovation - Entretien PAC, Clim » fait 123
 * caractères, dont 107 de mots-clés. Ce n'est pas un nom long, c'est un nom
 * suivi d'un argumentaire.
 *
 * Un tiret n'est un séparateur que s'il a un blanc d'au moins un côté : sinon
 * « Dupont-Martin » perdrait la moitié de sa raison sociale.
 */
const SEPARATEUR = /\s[-–—:]|[-–—:]\s|[|·•]|\s\/\s|,|\(/;

/**
 * Au-delà, on simplifie le libellé. En deçà, le nom passe INTACT : 213 des 300
 * fiches de la cohorte tiennent sous ce seuil, et il n'y a aucune raison de
 * toucher au nom de celles-là.
 */
const SEUIL_SIMPLIFICATION = 28;

/** Largeur de la signature, en `ch` : bornée pour ne pas pousser la navigation
 *  hors de l'en-tête. */
const LARGEUR_CH = 24;

/** Ce que DEUX lignes de cette largeur peuvent porter. Au-delà, aucune taille
 *  optique ne rattrape : il faut renoncer à des mots. */
const LIMITE_SIGNATURE = LARGEUR_CH * 2;

/** La tête du titre, avant l'argumentaire. Rendue telle quelle si la coupe ne
 *  laisse pas de quoi identifier quelqu'un. */
const couperAuSeparateur = (nom: string): string => {
  const m = SEPARATEUR.exec(nom);
  if (!m) return nom;
  const tete = nom.slice(0, m.index).trim();
  return tete.length >= 3 ? tete : nom;
};

/**
 * Coupe au MOT, jamais dedans.
 *
 * Une signature tronquée au milieu d'un mot ne se lit pas comme un nom long,
 * elle se lit comme un bug — c'est le repli qu'on est venu supprimer. Un premier
 * mot plus long que la limite est donc gardé entier : mieux vaut une signature
 * large qu'un moignon.
 */
const couperAuMot = (texte: string): string => {
  if (texte.length <= LIMITE_SIGNATURE) return texte;
  const mots = texte.split(" ");
  let garde = "";
  for (const mot of mots) {
    const essai = garde ? `${garde} ${mot}` : mot;
    if (essai.length > LIMITE_SIGNATURE) break;
    garde = essai;
  }
  return garde || mots[0];
};

/**
 * Le texte de la signature.
 *
 * Toujours un PRÉFIXE du nom, mot à mot — et cette propriété n'est pas
 * cosmétique. Le design pose `aria-label="{{ entreprise.nom }} : accueil"` sur
 * le lien de marque : tant que le texte visible est contenu dans le nom
 * accessible, la commande vocale « clique sur Atlantic Service » atteint le
 * lien (WCAG 2.5.3). Une reformulation, même plus jolie, casserait ça.
 */
export const composerSignature = (nom: string): string => {
  const propre = normaliser(nom);
  if (propre.length <= SEUIL_SIMPLIFICATION) return propre;
  return couperAuMot(couperAuSeparateur(propre));
};

/**
 * La composition, et rien d'autre : ni police, ni couleur, ni graisse — elles
 * appartiennent au design, qui les tient dans `.brand-name`.
 *
 * Les capitales comptent pour 15 % de plus : elles sont plus larges à corps
 * égal, et 175 des 300 raisons sociales de la cohorte sont écrites tout en
 * capitales. Le design leur applique `letter-spacing: -0.01em`, un
 * interlettrage négatif taillé pour du bas-de-casse ; sur « ECLATS ANTIVOLS »
 * il colle les fûts et le mot cesse de se lire. On l'ouvre.
 *
 * Au-delà de 28 (12 fiches entre 29 et 40, 13 au-dessus), le `white-space:
 * nowrap` du design ferait sortir la signature de l'en-tête : on autorise le
 * retour à la ligne, borné en largeur, et `overflow-wrap: normal` interdit
 * explicitement la coupure au milieu d'un mot.
 */
const styleSignature = (texte: string): string => {
  const capitales = estToutCapitales(texte);
  const optique = capitales ? Math.round(texte.length * 1.15) : texte.length;

  const regles: string[] = [];
  if (optique > 40) regles.push("font-size:0.86rem");
  else if (optique > 28) regles.push("font-size:0.98rem");
  else if (optique > 18) regles.push("font-size:1.08rem");
  if (optique > 28) {
    regles.push(
      "white-space:normal",
      `max-width:${LARGEUR_CH}ch`,
      "line-height:1.15",
      "overflow-wrap:normal",
    );
  }
  if (capitales) regles.push("letter-spacing:0.05em");
  return regles.join(";");
};

/** Écrit le nom dans une signature, en conservant le style du design devant. */
const poserSignature = (el: HTMLElement, texte: string, style: string): void => {
  el.set_content(echapperTexte(texte));
  el.setAttribute("data-brand-name", "");
  const propre = (el.getAttribute("style") ?? "").trim().replace(/;$/, "");
  const fusion = [propre, style].filter(Boolean).join(";");
  if (fusion) el.setAttribute("style", fusion);
};

/**
 * Le gabarit de signature : celui du design quand il en a un.
 *
 * Le menu mobile et le pied de page composent déjà `<span class="brand-name">`
 * à côté du logo — c'est la mise en forme que le design a prévue pour son propre
 * nom, avec ses classes et sa hiérarchie. La cloner vaut mieux que d'inventer un
 * `<span>` : elle hérite de tout ce que la feuille partagée lui donne.
 *
 * Le clone perd ses tampons `data-cdp` : deux nœuds ne peuvent pas porter le
 * même chemin, sinon un override d'édition inline s'appliquerait au mauvais
 * élément (cf. `claude-design/dom-paths.ts`). Même règle que les cartes
 * dupliquées de `hydrate-stats`.
 */
const gabaritSignature = (root: HTMLElement): string | null => {
  const modele = root.querySelector(SIGNATURE);
  return modele ? stripDomPathStamps(modele.toString()) : null;
};

/** Une signature neuve, prête à prendre la place de l'image. */
const construireSignature = (gabarit: string | null, texte: string, style: string): string => {
  const racine = parse(gabarit ?? GABARIT_DEFAUT);
  const el = racine.querySelector(SIGNATURE) ?? racine.querySelector("span");
  if (!el) return `<span class="brand-name">${echapperTexte(texte)}</span>`;
  poserSignature(el, texte, style);
  return el.toString();
};

/**
 * Garnit les blocs de marque du HTML. Retourne le HTML inchangé s'il n'y a pas
 * de bloc, pas d'image à reprendre, ou rien à mettre à la place.
 */
export function hydrateLogo(html: string, marque: MarqueEntreprise): string {
  if (!html || !porteUneMarque(html)) return html;

  const nom = normaliser(marque.nom ?? "");
  const logo = (marque.logoUrl ?? "").trim();
  // Ni logo ni nom : rien à composer. Retirer l'image laisserait un lien VIDE,
  // que plus aucun lecteur d'écran ne sait annoncer — l'emplacement du design,
  // avec son `alt`, reste le moindre mal.
  if (!logo && !nom) return html;

  const root = parse(html);
  const conteneurs = root.querySelectorAll(CONTENEURS);
  if (conteneurs.length === 0) return html;

  const texte = composerSignature(nom);
  const style = styleSignature(texte);
  const gabarit = gabaritSignature(root);

  for (const conteneur of conteneurs) {
    const img = conteneur.querySelector(IMG);
    // Un bloc de marque sans image n'attendait pas de logo (monogramme SVG du
    // design, par exemple) : on ne lui en invente pas un manque.
    if (!img) continue;

    // ── Cas 1 : un logo vérifié → le vrai remplace celui du design.
    if (logo) {
      img.setAttribute("src", echapperAttr(logo));
      if (nom) img.setAttribute("alt", echapperAttr(nom));
      continue;
    }

    // Une image réellement garnie n'est pas un emplacement vide : logo en dur du
    // gabarit, ou édition inline posée à la main. Elle gagne.
    if (!estSrcVide(img.getAttribute("src"))) continue;

    // ── Cas 2 : aucun logo → la signature typographique prend la place.
    const existante = conteneur.querySelector(SIGNATURE);
    if (existante) {
      // Menu mobile et pied de page composent déjà le nom À CÔTÉ du logo. Leur
      // signature reste — c'est la même identité, dans la même composition — et
      // l'image vide s'en va.
      poserSignature(existante, texte, style);
      img.remove();
      continue;
    }
    img.replaceWith(construireSignature(gabarit, texte, style));
  }

  return root.toString();
}
