/**
 * LA RECHERCHE QU'UN HUMAIN FAIT — nom + ville, rien de plus malin.
 *
 * POURQUOI UN MODULE POUR DEUX LIGNES
 * Cette requête existe à deux endroits qui doivent dire la même chose : la
 * ligne « Site » de l'en-tête (`DemSiteWeb`), où l'on va CHERCHER pour poser un
 * constat, et le cockpit de la carte d'appel (`DemActionCard`), où l'on va
 * REGARDER pendant que ça sonne. Deux copies auraient divergé au premier
 * « ajoute le code postal » — et le jour où l'une des deux rend un autre
 * résultat, l'agent constate « pas de site » sur une recherche, et le lit
 * « il en a un » sur l'autre.
 *
 * ET SURTOUT : ON NE CHERCHE PAS À LA PLACE DE L'HUMAIN. Le CRM sait chercher
 * tout seul (`scripts/prospection/`) et bute sur le CAPTCHA de Google, qui ne
 * se résout jamais face à un navigateur piloté — c'est écrit dans CLAUDE.md.
 * Un onglet ouvert par un clic humain est la seule méthode qui marche, et ce
 * module ne fait rien d'autre que fabriquer son adresse.
 *
 * Module PUR : ni base, ni React, ni `window`. L'appelant décide de l'onglet.
 */

/**
 * Ce qu'on tape dans la barre : le nom, puis la ville.
 *
 * La ville est ce qui départage deux « Clim Service » à 600 km l'un de l'autre,
 * et c'est aussi ce qui fait remonter la fiche Google Business locale plutôt
 * qu'un annuaire national. Elle peut manquer (une fiche mal enrichie) : on
 * cherche alors le nom seul plutôt que de ne rien proposer.
 */
export function requeteGoogle(
  nom: string | null | undefined,
  ville: string | null | undefined,
): string {
  return [nom, ville]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * L'URL de recherche, ou `null` quand il n'y a rien à chercher.
 *
 * `null` plutôt qu'une recherche vide : un bouton qui ouvre la page d'accueil
 * de Google se clique une fois, puis plus jamais — et il occupe la place d'un
 * bouton utile. L'appelant n'affiche rien.
 */
export function urlRechercheGoogle(
  nom: string | null | undefined,
  ville: string | null | undefined,
): string | null {
  const q = requeteGoogle(nom, ville);
  return q ? `https://www.google.com/search?q=${encodeURIComponent(q)}` : null;
}
