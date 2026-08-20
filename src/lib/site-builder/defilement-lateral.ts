/**
 * La garde qui empêche une démo de se laisser tirer sur le côté.
 *
 * Toutes les conceptions importées débordent un peu à droite, et par
 * construction : une bulle décorative en `right: -8%`, une lueur en
 * `width: 60vw` posée hors cadre, une piste de marquee en `width: max-content`,
 * une photo qui mord sur la marge en `right: -7%`. Rien de tout cela n'est une
 * erreur — c'est ce qui donne la profondeur — mais la page finit plus large que
 * le viewport, et le prospect qui tire son écran vers la gauche découvre une
 * bande vide à droite. Sur le gabarit CVC mesuré à 390 px de large, la page
 * fait 1112 px : 722 px de dérive.
 *
 * ── Pourquoi le `body { overflow-x: hidden }` du gabarit ne suffit pas ──
 *
 * Les 321 sites du parc portent cette règle, et AUCUN ne pose l'équivalent sur
 * `html`. Or elle ne clippe rien : tant que `html` reste en `overflow: visible`
 * — le défaut — le navigateur PROPAGE la valeur du `body` au viewport et donne
 * à `body` lui-même un `visible` d'usage. Le viewport est alors « hidden » :
 * plus de barre de défilement, mais il reste défilable, et le doigt le tire.
 *
 * ── Les deux règles sont indissociables ──
 *
 * - `html` porte la valeur, donc c'est ELLE qui part au viewport ;
 * - `body`, n'étant plus propagé, clippe enfin pour de bon.
 *
 * L'une sans l'autre ne marche pas, et c'est vérifié plutôt que supposé :
 * `body` seul laisse les 722 px de dérive intacts ; `html` seul les supprime
 * mais rend au `body` son `overflow-x: hidden` d'origine, qui en fait un
 * conteneur de défilement — et tous les en-têtes `position: sticky` du parc
 * cessent de coller.
 *
 * ── `clip` et non `hidden` ──
 *
 * `clip` ne crée pas de conteneur de défilement : les `position: sticky`
 * continuent de coller, et les `position: fixed` (menu mobile, barre de démo)
 * ne sont pas rognés. Un navigateur trop vieux pour `clip` (Safari < 16) jette
 * la déclaration et retrouve exactement le comportement d'aujourd'hui — la
 * garde est donc sans risque de régression, jamais un demi-état.
 *
 * ── `html body` et non `body` ──
 *
 * La feuille de la conception est injectée PLUS BAS dans le document que cette
 * garde. À spécificité égale, son `body { overflow-x: hidden }` gagnerait ;
 * (0,0,2) contre (0,0,1) tranche sans avoir à sortir un `!important`.
 *
 * ── Pourquoi ici et pas dans la feuille du site ──
 *
 * `shared_assets.css` est régénéré depuis le gabarit à chaque republication :
 * un correctif écrit là s'efface tout seul (cf. CLAUDE.md). Posée dans le code
 * de l'app, la garde couvre d'un coup le site publié, l'aperçu brouillon et
 * l'aperçu de l'éditeur — sans dépendre d'un rattrapage en base.
 */
export const CSS_SANS_DEFILEMENT_LATERAL = `html{overflow-x:clip}html body{overflow-x:clip}`;
