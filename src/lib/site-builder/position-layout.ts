import React from "react";

export type NavbarPosition = "static" | "sticky" | "fixed";

export interface NavbarLayoutMeta {
  position: NavbarPosition;
  topOffset: number;
  headroom: boolean;
  /**
   * If true, the navbar floats above the first section instead of reserving
   * its own row in the document flow. Implemented as `position: absolute`
   * initially (no layout slot), promoted to `position: fixed` by the
   * `OVERLAY_STICKY_SCRIPT` as soon as the user scrolls past topOffset.
   * Defaults to false to preserve historical sticky behaviour.
   */
  overlay: boolean;
}

export const DEFAULT_NAVBAR_LAYOUT: NavbarLayoutMeta = {
  position: "sticky",
  topOffset: 0,
  headroom: true,
  overlay: false,
};

/**
 * Reads instance.content.__layout (set by the navbar settings panel) and
 * returns a normalised NavbarLayoutMeta with defaults filled in. Anything
 * unparseable falls back to DEFAULT_NAVBAR_LAYOUT.
 */
export function resolveNavbarLayout(content: Record<string, unknown> | null | undefined): NavbarLayoutMeta {
  const raw = (content as { __layout?: Partial<NavbarLayoutMeta> } | null | undefined)?.__layout;
  if (!raw || typeof raw !== "object") return DEFAULT_NAVBAR_LAYOUT;
  const pos = raw.position;
  const offset = raw.topOffset;
  return {
    position: pos === "static" || pos === "sticky" || pos === "fixed" ? pos : DEFAULT_NAVBAR_LAYOUT.position,
    topOffset: typeof offset === "number" && Number.isFinite(offset) ? offset : DEFAULT_NAVBAR_LAYOUT.topOffset,
    headroom: typeof raw.headroom === "boolean" ? raw.headroom : DEFAULT_NAVBAR_LAYOUT.headroom,
    overlay: typeof raw.overlay === "boolean" ? raw.overlay : DEFAULT_NAVBAR_LAYOUT.overlay,
  };
}

/**
 * Returns React.CSSProperties for the wrapper that positions a navbar
 * section. The wrapper must be a direct child of the page so position:fixed
 * resolves against the viewport.
 *
 * When `overlay: true`, the wrapper renders as `position: absolute` so the
 * next section starts at y = 0 and the navbar floats over it. Once the user
 * scrolls, `OVERLAY_STICKY_SCRIPT` flips the wrapper to `position: fixed` so
 * the navbar stays glued to the viewport top.
 */
export function buildNavbarWrapperStyle(meta: NavbarLayoutMeta): React.CSSProperties {
  if (meta.position === "static") {
    return { position: "static" };
  }
  if (meta.overlay) {
    return {
      position: "absolute",
      top: `${meta.topOffset}px`,
      left: 0,
      right: 0,
      zIndex: 50,
      transition: "transform 0.3s ease",
      willChange: "transform",
    };
  }
  return {
    position: meta.position,
    top: `${meta.topOffset}px`,
    left: 0,
    right: 0,
    zIndex: 50,
    transition: "transform 0.3s ease",
    willChange: "transform",
  };
}

/**
 * Headroom: hide on scroll-down, show on scroll-up. Vanilla JS, no
 * dependencies. The script reads data-headroom="1" on the wrapper and
 * toggles translateY(-100%) on it. Injected once per page when at least
 * one navbar wrapper has headroom enabled.
 */
export const HEADROOM_SCRIPT = `
(function(){
  if (window.__headroomBound) return;
  window.__headroomBound = true;
  var lastY = window.scrollY || 0;
  var ticking = false;
  function onScroll(){
    var y = window.scrollY || 0;
    var goingDown = y > lastY && y > 80;
    var els = document.querySelectorAll('[data-headroom="1"]');
    for (var i = 0; i < els.length; i++) {
      els[i].style.transform = goingDown ? 'translateY(-100%)' : 'translateY(0)';
    }
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', function(){
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
})();
`;

/**
 * Overlay-sticky: navbars marked `data-overlay="1"` start as `position:
 * absolute` (so they float above the first section without reserving a
 * row in the flow). As soon as the user scrolls past the navbar's
 * topOffset (read from `data-top-offset`), we flip them to `position:
 * fixed` so they stay glued to the viewport top. Returning to scroll
 * top reverts them to absolute. The promoted state is also marked with
 * `data-stuck="1"` so themes can hook a different background, etc.
 */
export const OVERLAY_STICKY_SCRIPT = `
(function(){
  if (window.__overlayStickyBound) return;
  window.__overlayStickyBound = true;
  var ticking = false;
  function tick(){
    var y = window.scrollY || 0;
    var els = document.querySelectorAll('[data-overlay="1"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var off = parseInt(el.getAttribute('data-top-offset') || '0', 10) || 0;
      if (y > off) {
        if (el.style.position !== 'fixed') {
          el.style.position = 'fixed';
          el.setAttribute('data-stuck', '1');
        }
      } else if (el.style.position === 'fixed') {
        el.style.position = 'absolute';
        el.removeAttribute('data-stuck');
      }
    }
    ticking = false;
  }
  window.addEventListener('scroll', function(){
    if (!ticking) {
      window.requestAnimationFrame(tick);
      ticking = true;
    }
  }, { passive: true });
})();
`;
