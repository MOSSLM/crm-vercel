/**
 * Ancrage des overrides d'édition inline : chemin positionnel + tampon stable.
 *
 * Un override est enregistré sous une clé `"3.1.0:image"` — les indices
 * d'enfants-éléments depuis la racine de section. C'est compact et lisible, mais
 * ça ne survit à AUCUN retrait de nœud : conditionner la page pour une
 * entreprise (retirer les cartes des services qu'elle n'a pas) décale tous les
 * chemins qui suivent, et l'image de la carte 4 atterrit sur la carte 2.
 *
 * Le contrat « appliquer les overrides AVANT tout retrait » tenait sur le rendu
 * serveur mais était violé par l'aperçu du builder et par l'hydrateur du site
 * déployé — deux endroits où le DOM disponible est déjà conditionné, sans moyen
 * de revenir en arrière.
 *
 * D'où ce module : on TAMPONNE le chemin de chaque nœud (`data-cdp="3.1.0"`)
 * sur le markup NON conditionné, puis toute résolution lit le tampon d'abord et
 * ne retombe sur la marche positionnelle qu'à défaut. Un nœud survivant garde
 * son chemin d'origine quoi qu'on retire autour de lui, donc :
 *
 *   - la clé d'un override devient indépendante de l'entreprise affichée,
 *     en lecture comme en écriture ;
 *   - le tamponnage n'ajoute que des attributs, ce qui ne change jamais
 *     l'indexation des enfants-éléments : les anciens chemins restent valides.
 *
 * Isomorphe (node-html-parser, pas de `server-only`) : le rendu serveur,
 * l'iframe de l'éditeur et l'hydrateur client doivent tous suivre la même règle,
 * sinon on recrée la divergence qu'on vient de supprimer.
 */
import { parse, type HTMLElement } from "node-html-parser";

/** Attribut portant le chemin statique d'un nœud (`data-cdp="3.1.0"`). */
export const DOM_PATH_ATTR = "data-cdp";

/**
 * React 19 émet des indices de ressources (`<link rel="preload">`) AVANT la
 * sortie du composant. Les chemins d'override sont ancrés sur la racine de
 * section : sans ce filtre, le walker démarrerait sur un `<link>`, n'y
 * trouverait aucun enfant, et tous les overrides seraient silencieusement
 * perdus sur le site déployé.
 */
const HEAD_ONLY_TAGS = new Set(["link", "meta", "script", "style", "noscript", "title", "base"]);

/** Enfants-éléments d'un nœud, dans l'ordre du document. */
export function elementChildren(node: HTMLElement): HTMLElement[] {
  return node.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[];
}

/** Premier élément « réel » d'une liste (saute les balises de head). */
export function findSectionRoot(elements: HTMLElement[]): HTMLElement | null {
  for (const el of elements) {
    if (!HEAD_ONLY_TAGS.has((el.tagName ?? "").toLowerCase())) return el;
  }
  return null;
}

/** Marche positionnelle pure — le repli quand aucun tampon n'est présent. */
export function nodeAtPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let node: HTMLElement | null = root;
  for (const idx of path) {
    if (!node) return null;
    const children = elementChildren(node);
    if (!children[idx]) return null;
    node = children[idx];
  }
  return node;
}

/**
 * Résout un chemin : tampon d'abord, marche positionnelle ensuite.
 * `path` est le chemin déjà découpé, `dotted` sa forme `"3.1.0"`.
 */
export function resolveNodeAtPath(
  root: HTMLElement,
  path: number[],
  dotted: string,
): HTMLElement | null {
  if (dotted) {
    const stamped = root.querySelector(`[${DOM_PATH_ATTR}="${dotted}"]`);
    if (stamped) return stamped as HTMLElement;
  }
  return nodeAtPath(root, path);
}

/** `"3.1.0:image"` → `"3.1.0"`. Une clé sans suffixe est rendue telle quelle. */
export function pathOfOverrideKey(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(0, i);
}

/** `"3.1.0"` → `[3, 1, 0]`. Les segments non numériques sont ignorés. */
export function parseDottedPath(dotted: string): number[] {
  return dotted.split(".").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
}

export interface StampOptions {
  /**
   * Où commencent les indices :
   *  - `"section-root"` : sur les enfants du premier élément réel (rendu d'une
   *    section — le composant a une racine unique, éventuellement précédée des
   *    indices de ressources React) ;
   *  - `"fragment"` : sur les éléments de premier niveau du HTML fourni
   *    (aperçu du builder — le markup brut de la page est injecté tel quel dans
   *    `#cd-root`).
   */
  mode?: "section-root" | "fragment";
  /**
   * Ne tamponner que ces chemins (clés d'override acceptées, le suffixe `:kind`
   * est retiré). Sur le site public on ne tamponne ainsi qu'une trentaine de
   * nœuds au lieu de tout le document. Omettre pour tout tamponner.
   */
  only?: string[];
}

/**
 * Tamponne `data-cdp` sur le HTML **non conditionné**. Pur : renvoie un nouveau
 * HTML, ne touche pas l'entrée. Renvoie le HTML inchangé s'il n'y a rien à
 * tamponner (`only` vide) ou si le parsing échoue.
 */
export function stampDomPaths(html: string, opts: StampOptions = {}): string {
  if (!html) return html;
  const { mode = "fragment", only } = opts;

  let wanted: Set<string> | null = null;
  if (only) {
    wanted = new Set(only.map(pathOfOverrideKey).filter(Boolean));
    if (wanted.size === 0) return html;
  }

  try {
    const doc = parse(html);
    const top = elementChildren(doc as unknown as HTMLElement);
    // En mode section-root, les indices partent des enfants de la racine ; en
    // mode fragment, des éléments de premier niveau eux-mêmes.
    const roots = mode === "section-root" ? (() => {
      const root = findSectionRoot(top);
      return root ? elementChildren(root) : [];
    })() : top;
    if (roots.length === 0) return html;

    const walk = (el: HTMLElement, path: number[]): void => {
      const dotted = path.join(".");
      if (!wanted || wanted.has(dotted)) el.setAttribute(DOM_PATH_ATTR, dotted);
      const kids = elementChildren(el);
      for (let i = 0; i < kids.length; i++) walk(kids[i], [...path, i]);
    };
    for (let i = 0; i < roots.length; i++) walk(roots[i], [i]);

    return doc.toString();
  } catch {
    return html;
  }
}

/** Retire tous les tampons d'un fragment — pour les nœuds DUPLIQUÉS par une
 *  hydratation (cartes d'avis, de chiffres clés) : deux nœuds ne peuvent pas
 *  porter le même chemin, sinon la résolution par tampon devient ambiguë. */
export function stripDomPathStamps(html: string): string {
  if (!html || !html.includes(DOM_PATH_ATTR)) return html;
  try {
    const doc = parse(html);
    for (const el of doc.querySelectorAll(`[${DOM_PATH_ATTR}]`)) el.removeAttribute(DOM_PATH_ATTR);
    return doc.toString();
  } catch {
    return html;
  }
}
