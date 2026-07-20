/**
 * STAMP_PATHS — a tiny inline script the editor preview runs on the static DOM,
 * BEFORE the design's own JS, to stamp every element under `#cd-root` with its
 * STATIC positional path (`data-cdp="3.1.0"`, element-child indices from the
 * root — the exact shape override keys use).
 *
 * Why: a Claude Design's own JS may inject siblings or MOVE nodes. The service
 * "solution stepper" does both — it inserts glow/ring/spine elements before the
 * image track (shifting every following index) AND relocates each `<img>`
 * between the desktop visual and the mobile card. The editor computes an edit's
 * path when the operator clicks (on the already-mutated DOM) but applies + saves
 * it against the static path (OVERRIDES_APPLY, and the server-side applier). Those
 * two paths disagree once the DOM moved, so an image edit lands on the wrong node
 * — or nowhere. Reading this stable stamp at click time keeps them in sync no
 * matter how the design JS rearranges the DOM.
 *
 * Adding attributes never changes element-child indexing, and the stamps live
 * only in the editor iframe (never saved, never shipped), so this is inert on the
 * deployed site. Kept as a string constant (like CLAUDE_DESIGN_RUNTIME) so it can
 * be injected into the preview iframe and unit-tested in isolation.
 */
export const STAMP_PATHS = `
(function(){
  var root = document.getElementById('cd-root');
  if(!root) return;
  function walk(el, path){
    el.setAttribute('data-cdp', path.join('.'));
    var kids = Array.prototype.filter.call(el.childNodes, function(c){ return c.nodeType===1; });
    for(var i=0;i<kids.length;i++) walk(kids[i], path.concat(i));
  }
  var top = Array.prototype.filter.call(root.childNodes, function(c){ return c.nodeType===1; });
  for(var i=0;i<top.length;i++) walk(top[i], [i]);
})();
`;
