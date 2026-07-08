/**
 * Preview viewport simulation for the site builder.
 *
 * In the builder iframe, native `100vh` resolves to the iframe's own
 * viewport height — which is dynamic (height-reporter auto-resize) and
 * leads to broken layouts. To let designers (and the AI) use `vh` freely
 * we substitute a realistic, device-specific px value at preview time.
 * The published site keeps native `vh`.
 */

export const SIMULATED_VIEWPORT_HEIGHT = {
  desktop: 900,
  tablet: 1024,
  mobile: 812,
} as const;

export type DeviceView = keyof typeof SIMULATED_VIEWPORT_HEIGHT;

export function getSimulatedViewportHeight(device: DeviceView): number {
  return SIMULATED_VIEWPORT_HEIGHT[device];
}

/**
 * Replace every viewport-height literal (`Nvh`, and the small/large/dynamic
 * variants `Nsvh`/`Nlvh`/`Ndvh`) in a CSS value with its px equivalent on the
 * supplied viewport. Works inside `calc()` expressions too:
 *   convertVhToPx("calc(100vh - 64px)", 900) === "calc(900px - 64px)"
 *   convertVhToPx("100dvh", 900) === "900px"
 */
export function convertVhToPx(value: string, viewportPx: number): string {
  return value.replace(/(-?\d*\.?\d+)(?:s|l|d)?vh\b/g, (_, n) => {
    const px = (Number(n) / 100) * viewportPx;
    return `${Number.isFinite(px) ? px : 0}px`;
  });
}

/**
 * Build the preview-only `<script>` that *locks the JS-visible viewport height*
 * of the editor iframe to a fixed simulated device height.
 *
 * The CSS `vh` rewriter (below) only handles CSS. But the imported design also
 * runs its OWN JS in the editor iframe, and Claude/Tailwind designs routinely
 * implement the "`--vh` fix": they read `window.innerHeight` and write it into a
 * CSS custom property (`--vh`), or feed it to GSAP/ScrollTrigger, on load and on
 * every `resize`. Inside the editor the iframe's height is driven by the canvas
 * height-reporter, so `window.innerHeight` is the *growing* frame height — the
 * design's JS keeps re-inflating the hero, feeding the loop into infinity. No
 * amount of CSS rewriting can catch a height that JS computes at runtime.
 *
 * This forces `window.innerHeight`, `visualViewport.height` and
 * `document.documentElement.clientHeight` to report the fixed simulated height,
 * so the design's JS sees a stable "screen" and can never drive the loop. Must
 * run BEFORE the design JS. Published/preview pages never include this — they get
 * a real viewport.
 */
export function buildViewportLockScript(simulatedViewportHeight: number): string {
  return `<script>
    (function(){
      var H = ${simulatedViewportHeight};
      function lock(obj, prop, value){
        try {
          Object.defineProperty(obj, prop, { configurable: true, get: function(){ return value; } });
          return;
        } catch(e){}
        // Fallback: innerHeight is a [Replaceable] attribute, so a plain
        // assignment still installs a shadowing own property.
        try { obj[prop] = value; } catch(e){}
      }
      lock(window, 'innerHeight', H);
      try { if (window.visualViewport) lock(window.visualViewport, 'height', H); } catch(e){}
      // Some designs read documentElement.clientHeight for their --vh fallback.
      try { if (document.documentElement) lock(document.documentElement, 'clientHeight', H); } catch(e){}
    })();
  <\/script>`;
}

/**
 * Build the preview-only `<style>` + `<script>` block that exposes `--sim-vh`
 * and installs a runtime rewriter converting every `Nvh` literal into px on the
 * supplied simulated viewport. It patches stylesheets (catching Tailwind's
 * `min-h-screen`/`h-screen` rules, `<style>` blocks and arbitrary `h-[100vh]`
 * utilities) and inline `style=""` attributes, re-running on mutations.
 *
 * Returned as a string so it can be embedded in an iframe `srcDoc` template
 * literal. Both LibrarySectionIframe and the Claude Design InlinePreview use it
 * so an unbounded `100vh` can never feed the iframe height-reporter loop.
 * Published HTML never includes this block.
 */
export function buildVhRewriteRuntime(simulatedViewportHeight: number): string {
  return `<style id="__sim_vh_var__">:root { --sim-vh: ${simulatedViewportHeight / 100}px; }<\/style>
  <script>
    (function(){
      var VH_RE=/(-?\\d*\\.?\\d+)(?:s|l|d)?vh\\b/g;
      var SIM=${simulatedViewportHeight};
      function rewrite(s){
        return s.replace(VH_RE, function(_, n){
          var px = (parseFloat(n) / 100) * SIM;
          return (isFinite(px) ? px : 0) + 'px';
        });
      }
      function patchSheet(sheet){
        try {
          var rules = sheet.cssRules || sheet.rules;
          if(!rules) return;
          for(var i=rules.length-1;i>=0;i--){
            var r = rules[i];
            var t = r.cssText;
            if(t && t.indexOf('vh')!==-1 && VH_RE.test(t)){
              VH_RE.lastIndex = 0;
              var rewritten = rewrite(t);
              if(rewritten !== t){
                try { sheet.deleteRule(i); sheet.insertRule(rewritten, i); } catch(e){}
              }
            }
            VH_RE.lastIndex = 0;
          }
        } catch(e){ /* cross-origin sheet, skip */ }
      }
      function patchAllSheets(){
        var sheets = document.styleSheets;
        for(var i=0;i<sheets.length;i++) patchSheet(sheets[i]);
      }
      function patchInlineStyles(root){
        var nodes = (root||document).querySelectorAll('[style*="vh"]');
        for(var i=0;i<nodes.length;i++){
          var el = nodes[i];
          var s = el.getAttribute('style');
          if(s && s.indexOf('vh')!==-1){
            VH_RE.lastIndex = 0;
            var rewritten = rewrite(s);
            if(rewritten !== s) el.setAttribute('style', rewritten);
          }
        }
      }
      var pending = false;
      function schedule(){
        if(pending) return;
        pending = true;
        requestAnimationFrame(function(){
          pending = false;
          patchAllSheets();
          patchInlineStyles();
        });
      }
      function init(){
        patchAllSheets();
        patchInlineStyles();
        // Watch for new <style> tags (Tailwind JIT) and inline-style mutations.
        var mo = new MutationObserver(function(muts){
          var dirty = false;
          for(var i=0;i<muts.length;i++){
            var m = muts[i];
            if(m.type === 'attributes' && m.attributeName === 'style'){ dirty = true; break; }
            if(m.addedNodes && m.addedNodes.length){ dirty = true; break; }
            if(m.type === 'childList'){ dirty = true; break; }
          }
          if(dirty) schedule();
        });
        mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
        // Re-run a few times to catch Babel/async render passes.
        [50,200,500,1200].forEach(function(d){ setTimeout(schedule, d); });
      }
      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
      else init();
    })();
  <\/script>`;
}
