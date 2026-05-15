import React from "react";

export type NavbarPosition = "static" | "sticky" | "fixed";

export interface NavbarLayoutMeta {
  position: NavbarPosition;
  topOffset: number;
  headroom: boolean;
}

export const DEFAULT_NAVBAR_LAYOUT: NavbarLayoutMeta = {
  position: "sticky",
  topOffset: 0,
  headroom: true,
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
  };
}

/**
 * Returns React.CSSProperties for the wrapper that positions a navbar
 * section. The wrapper must be a direct child of the page so position:fixed
 * resolves against the viewport.
 */
export function buildNavbarWrapperStyle(meta: NavbarLayoutMeta): React.CSSProperties {
  if (meta.position === "static") {
    return { position: "static" };
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
