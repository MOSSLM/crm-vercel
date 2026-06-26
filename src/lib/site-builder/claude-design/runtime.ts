/**
 * CLAUDE_DESIGN_RUNTIME — a small, TRUSTED, first-party re-implementation of the
 * safe interactions from a Claude Design template's `site.js`. The importer
 * strips all operator scripts (sanitize), so the deployed/preview site would
 * otherwise be inert. This vetted script restores the essentials, matching the
 * exact class hooks the templates use:
 *
 *   - sticky header   : .site-header → toggle `is-stuck` past 8px scroll
 *   - scroll reveal   : .reveal → add `is-visible` when in view (+ failsafe)
 *   - parallax        : [data-parallax] → translate by scroll * speed
 *   - FAQ accordion   : .faq-q click → toggle `.open` on closest .faq-item
 *   - mobile menu     : .burger / .mm-close → toggle `.open` on .mobile-menu
 *
 * It honours prefers-reduced-motion and no-ops when the hooks are absent, so it
 * is safe to inject on every Claude Design page. Anything richer (sliders,
 * steppers, the leaflet map) is intentionally NOT ported — those are handled by
 * static fallbacks or left out.
 */
export const CLAUDE_DESIGN_RUNTIME = `(function(){
  "use strict";
  if (window.__cdRuntime) return; window.__cdRuntime = 1;
  function init(){
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch(e){}

    var header = document.querySelector(".site-header");
    if (header) {
      var onH = function(){ header.classList.toggle("is-stuck", window.scrollY > 8); };
      onH(); window.addEventListener("scroll", onH, { passive: true });
    }

    var reveal = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (reveal.length) {
      if (reduce) { reveal.forEach(function(el){ el.classList.add("is-visible"); }); }
      else {
        var check = function(){
          var vh = window.innerHeight || document.documentElement.clientHeight;
          for (var i = reveal.length - 1; i >= 0; i--) {
            var el = reveal[i]; var r = el.getBoundingClientRect();
            if (r.top < vh * 0.92 && r.bottom > 0) { el.classList.add("is-visible"); reveal.splice(i,1); }
          }
        };
        var raf = false;
        var onS = function(){ if(!raf){ window.requestAnimationFrame(function(){ check(); raf=false; }); raf=true; } };
        window.addEventListener("scroll", onS, { passive: true });
        window.addEventListener("resize", onS, { passive: true });
        check();
        setTimeout(check, 400);
        setTimeout(function(){
          document.querySelectorAll(".reveal").forEach(function(el){
            el.classList.add("is-visible"); el.style.transition="none"; el.style.opacity="1"; el.style.transform="none";
          });
        }, 1600);
      }
    }

    var para = document.querySelectorAll("[data-parallax]");
    if (para.length && !reduce) {
      var tick = false;
      var apply = function(){
        var y = window.scrollY;
        para.forEach(function(el){
          var sp = parseFloat(el.getAttribute("data-parallax")) || 0.1;
          el.style.transform = "translate3d(0," + (y*sp*-1).toFixed(1) + "px,0)";
        });
        tick = false;
      };
      window.addEventListener("scroll", function(){ if(!tick){ window.requestAnimationFrame(apply); tick=true; } }, { passive: true });
      apply();
    }

    document.querySelectorAll(".faq-q").forEach(function(q){
      q.addEventListener("click", function(){
        var item = q.closest(".faq-item"); if(!item) return;
        var ans = item.querySelector(".faq-a");
        var isOpen = item.classList.contains("open");
        (item.parentElement ? item.parentElement.querySelectorAll(".faq-item.open") : []).forEach(function(o){
          if (o !== item) { o.classList.remove("open"); var oa=o.querySelector(".faq-a"); if(oa) oa.style.maxHeight=null; var oq=o.querySelector(".faq-q"); if(oq) oq.setAttribute("aria-expanded","false"); }
        });
        item.classList.toggle("open", !isOpen);
        q.setAttribute("aria-expanded", String(!isOpen));
        if (ans) ans.style.maxHeight = isOpen ? null : ans.scrollHeight + "px";
      });
    });

    var burger = document.querySelector(".burger");
    var menu = document.querySelector(".mobile-menu");
    var close = document.querySelector(".mm-close");
    var toggle = function(open){ if(!menu) return; menu.classList.toggle("open", open); document.body.style.overflow = open ? "hidden" : ""; };
    if (burger) burger.addEventListener("click", function(){ toggle(true); });
    if (close) close.addEventListener("click", function(){ toggle(false); });
    if (menu) menu.querySelectorAll("a").forEach(function(a){ a.addEventListener("click", function(){ toggle(false); }); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();`;
