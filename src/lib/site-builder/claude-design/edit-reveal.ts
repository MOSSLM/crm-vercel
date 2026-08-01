/**
 * MODE ÉDITION : tout afficher, tout de suite.
 *
 * Les designs Claude font apparaître leurs blocs au scroll — `.reveal` passe à
 * `is-visible`, une lib pose `aos-animate`, ou le `site.js` du template teste
 * `getBoundingClientRect().top < window.innerHeight` à chaque scroll.
 *
 * Dans l'éditeur, l'iframe ne défile JAMAIS : le canevas la dimensionne à la
 * hauteur totale du document et c'est lui qui scrolle. Aucun évènement `scroll`
 * n'atteint donc la page, et `window.innerHeight` est en plus figé sur la
 * hauteur d'appareil simulée (voir preview-viewport). Résultat : seuls les
 * premiers ~900 px se révèlent, tout le reste reste à `opacity: 0` — textes et
 * images compris. L'aperçu, lui, défile pour de vrai et s'affiche correctement,
 * ce qui rend le symptôme déroutant.
 *
 * On ne cherche pas à rejouer les animations : en édition on veut l'état FINAL.
 * Deux couches complémentaires :
 *
 *  1. CSS — neutralise l'état initial des accroches connues (`.reveal`,
 *     `[data-aos]`, …) et supprime les délais, avant même que le JS ne tourne.
 *  2. JS — repasse après le `site.js` du design : ajoute les classes « révélé »
 *     sur ces accroches, puis balaye le DOM pour forcer tout élément qui est
 *     invisible ET porteur d'une transition/animation. Ce second critère est ce
 *     qui distingue « en attente d'apparition » de « masqué volontairement »
 *     (menu mobile, bandeau cookies), et il ne dépend d'aucun nom de classe :
 *     un design qui invente sa propre convention est couvert quand même.
 *
 * Réservé à l'éditeur. Le site publié et l'aperçu gardent leurs animations.
 */

/** Accroches d'apparition reconnues, tous designs confondus. */
export const REVEAL_HOOK_SELECTOR = [
  ".reveal",
  ".reveal-up",
  ".reveal-left",
  ".reveal-right",
  ".scroll-reveal",
  ".animate-on-scroll",
  ".fade-in",
  ".fade-up",
  ".fade-in-up",
  ".slide-up",
  ".will-reveal",
  ".appear",
  "[data-reveal]",
  "[data-animate]",
  "[data-aos]",
  "[data-scroll]",
  "[data-sr]",
].join(",");

/**
 * Classes « c'est apparu » posées sur les accroches. Volontairement limitée aux
 * noms propres à l'apparition : `active`, `open` ou `show` déclencheraient des
 * styles sans rapport (onglet actif, menu ouvert).
 */
export const REVEAL_VISIBLE_CLASSES = [
  "is-visible",
  "visible",
  "in-view",
  "inview",
  "is-inview",
  "revealed",
  "is-revealed",
  "aos-animate",
  "animated",
];

/** Feuille de style d'édition : état final imposé aux accroches connues. */
export const EDIT_REVEAL_CSS = `
${REVEAL_HOOK_SELECTOR.split(",").map((s) => `#cd-root ${s}`).join(",")} {
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
  filter: none !important;
  clip-path: none !important;
}
/* Rien ne doit rester en attente de son tour. */
#cd-root *, #cd-root *::before, #cd-root *::after {
  animation-delay: 0s !important;
  transition-delay: 0s !important;
}
`;

/**
 * Script d'édition, à injecter APRÈS le JS du design (il doit repasser derrière
 * lui). Balaye plusieurs fois : une lib d'apparition peut ré-masquer au
 * chargement des polices ou des images.
 */
export const EDIT_REVEAL_SCRIPT = `
(function(){
  var root = document.getElementById('cd-root');
  if(!root) return;
  var HOOKS = ${JSON.stringify(REVEAL_HOOK_SELECTOR)};
  var VISIBLE = ${JSON.stringify(REVEAL_VISIBLE_CLASSES)};

  function forceVisible(el){
    el.style.setProperty('opacity','1','important');
    el.style.setProperty('visibility','visible','important');
    el.style.setProperty('transform','none','important');
    el.style.setProperty('filter','none','important');
    el.style.setProperty('clip-path','none','important');
    el.setAttribute('data-cd-revealed','1');
  }

  // 1) Les accroches nommées : on pose l'état « révélé » que le design attend.
  function markHooks(){
    var nodes;
    try { nodes = root.querySelectorAll(HOOKS); } catch(e){ return; }
    for(var i=0;i<nodes.length;i++){
      var el = nodes[i];
      for(var j=0;j<VISIBLE.length;j++){ try{ el.classList.add(VISIBLE[j]); }catch(e){} }
      forceVisible(el);
    }
  }

  // 2) Balayage générique : invisible + animable = en attente d'apparition.
  //    On ne touche jamais au display (un élément retiré par l'opérateur, un
  //    onglet fermé), ni au position:fixed (menus, modales, bandeaux).
  function sweep(){
    var all = root.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var el = all[i];
      if(el.getAttribute('data-cd-revealed')) continue;
      var cs;
      try { cs = window.getComputedStyle(el); } catch(e){ continue; }
      if(!cs || cs.display === 'none' || cs.position === 'fixed') continue;
      var op = parseFloat(cs.opacity);
      var hidden = (isFinite(op) && op < 0.05) || cs.visibility === 'hidden';
      if(!hidden) continue;
      var hasAnim = (cs.animationName && cs.animationName !== 'none');
      var dur = cs.transitionDuration || '';
      var hasTrans = dur !== '' && !/^0s(,\\s*0s)*$/.test(dur);
      if(!hasAnim && !hasTrans) continue; // masqué volontairement : on respecte
      forceVisible(el);
    }
  }

  // Les images sous la ligne de flottaison sont marquées lazy à l'import ; dans
  // un cadre qui ne défile pas, certaines ne se déclenchent jamais.
  function eagerImages(){
    var imgs = root.querySelectorAll('img[loading="lazy"]');
    for(var i=0;i<imgs.length;i++) imgs[i].setAttribute('loading','eager');
  }

  function pass(){ markHooks(); sweep(); eagerImages(); }

  pass();
  [80, 300, 800, 1600, 3000].forEach(function(d){ setTimeout(pass, d); });
  window.addEventListener('load', pass);
})();
`;
