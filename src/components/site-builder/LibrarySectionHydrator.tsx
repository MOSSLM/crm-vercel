"use client";

/**
 * Client Component: picks up the JSON hydration payloads emitted by
 * LibrarySectionInline and mounts interactive React trees on each section div.
 *
 * After hydration, applies any content.__overrides (DOM-path edits) with
 * variable interpolation so the published site reflects user edits typed
 * into elements that aren't bound to a data.xxx key in the section code.
 *
 * No @babel/standalone needed client-side — the JS is already compiled.
 */
import React, { useEffect } from "react";
import { hydrateRoot, createRoot, type Root } from "react-dom/client";
import { interpolateData } from "@/lib/library-section/interpolate";
import { sanitizeRichText } from "@/lib/site-builder/sanitize-html";
import { FormBlockSection } from "./FormBlockSection";

interface OverrideEntry {
  kind:
    | "text"
    | "rich_text"
    | "image"
    | "image_mobile"
    | "bg_image"
    | "link_href"
    | "button_href"
    | "attr"
    | "style";
  value: string;
  meta?: { attrName?: string; style?: Record<string, string> };
}

interface SectionPayload {
  instanceId: string;
  js: string;
  renderName: string | null;
  data: Record<string, unknown>;
  variables: Record<string, string>;
  tokens: Record<string, unknown>;
}

function interpolateVariables(text: string, variables: Record<string, string>): string {
  if (typeof text !== "string" || !text) return text;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = variables[key];
    return v != null ? v : "";
  });
}

function nodeAtPath(root: Element, path: number[]): Element | null {
  let node: Element | null = root;
  for (const idx of path) {
    if (!node || !node.children || !node.children[idx]) return null;
    node = node.children[idx];
  }
  return node;
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

function applyOverridesToContainer(
  container: Element,
  overrides: Record<string, OverrideEntry>,
  variables: Record<string, string>,
): void {
  // Section components render a single root element inside the container,
  // matching the DOM path numbering used at edit time.
  const root = container.firstElementChild;
  if (!root) return;
  for (const key of Object.keys(overrides)) {
    const entry = overrides[key];
    if (!entry || typeof entry.value !== "string") continue;
    // Strip optional ":<kind>[:<attrName>]" suffix from the key.
    const colonIdx = key.indexOf(":");
    const pathStr = colonIdx === -1 ? key : key.slice(0, colonIdx);
    const path = pathStr.split(".").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
    const el = nodeAtPath(root, path);
    if (!el) continue;
    const value = interpolateVariables(entry.value, variables);
    try {
      switch (entry.kind) {
        case "text":
          if (el.textContent !== value) el.textContent = value;
          break;
        case "rich_text": {
          const safe = sanitizeRichText(value);
          if (el.innerHTML !== safe) el.innerHTML = safe;
          break;
        }
        case "image":
          if (el.getAttribute("src") !== value) el.setAttribute("src", value);
          break;
        case "image_mobile": {
          if (!(el instanceof HTMLImageElement)) break;
          const parent = el.parentElement;
          const isWrap = parent && parent.tagName.toLowerCase() === "picture" && parent.getAttribute("data-mobile-src-wrap") === "1";
          if (isWrap && parent) {
            const existing = parent.querySelector<HTMLSourceElement>('source[data-mobile-source="1"]');
            if (value) {
              if (existing) {
                if (existing.getAttribute("srcset") !== value) existing.setAttribute("srcset", value);
              } else {
                const s = document.createElement("source");
                s.setAttribute("media", "(max-width: 767px)");
                s.setAttribute("srcset", value);
                s.setAttribute("data-mobile-source", "1");
                parent.insertBefore(s, parent.firstChild);
              }
            } else if (existing) {
              existing.remove();
            }
          } else if (value && el.parentNode) {
            const pic = document.createElement("picture");
            pic.setAttribute("data-mobile-src-wrap", "1");
            const s = document.createElement("source");
            s.setAttribute("media", "(max-width: 767px)");
            s.setAttribute("srcset", value);
            s.setAttribute("data-mobile-source", "1");
            pic.appendChild(s);
            el.parentNode.insertBefore(pic, el);
            pic.appendChild(el);
          }
          break;
        }
        case "bg_image": {
          const bg = value ? `url("${value.replace(/"/g, '\\"')}")` : "none";
          if (el instanceof HTMLElement && el.style.backgroundImage !== bg) {
            el.style.backgroundImage = bg;
          }
          break;
        }
        case "link_href":
        case "button_href":
          if (el.getAttribute("href") !== value) el.setAttribute("href", value);
          break;
        case "attr":
          if (entry.meta?.attrName) el.setAttribute(entry.meta.attrName, value);
          break;
        case "style": {
          const styleMap = entry.meta?.style;
          if (!styleMap || typeof styleMap !== "object") break;
          if (!(el instanceof HTMLElement)) break;
          for (const [k, v] of Object.entries(styleMap)) {
            if (typeof v !== "string" || !v) {
              el.style.removeProperty(camelToKebab(k));
              continue;
            }
            el.style.setProperty(camelToKebab(k), v);
          }
          break;
        }
      }
    } catch {
      // Swallow per-override errors so the page keeps rendering.
    }
  }
}

export function LibrarySectionHydrator() {
  useEffect(() => {
    const scripts = document.querySelectorAll<HTMLScriptElement>(
      "script[type='application/json'][data-lsi-id]"
    );

    // Track observers + React roots so we clean them up on unmount.
    const observers: MutationObserver[] = [];
    const formRoots: Root[] = [];

    scripts.forEach((script) => {
      const instanceId = script.dataset.lsiId;
      if (!instanceId) return;

      let payload: SectionPayload;
      try {
        payload = JSON.parse(script.textContent ?? "");
      } catch {
        return; // malformed JSON, skip
      }

      const { js, renderName, data, variables, tokens } = payload;
      if (!js || !renderName) return;

      const container = document.querySelector<HTMLElement>(`[data-lsi="${instanceId}"]`);
      if (!container) return;

      const overrides = (data?.__overrides as Record<string, OverrideEntry> | undefined) ?? {};
      const hasOverrides = Object.keys(overrides).length > 0;

      try {
        // Re-evaluate the pre-compiled JS in the same scope as the server.
        // React hooks are passed as scope args so they resolve correctly.
        const factory = new Function(
          "React",
          "useState",
          "useEffect",
          "useRef",
          "useMemo",
          "useCallback",
          "useId",
          "useContext",
          "useReducer",
          "useLayoutEffect",
          `"use strict";\n${js}\nreturn ${renderName};`
        );

        const Component = factory(
          React,
          React.useState,
          React.useEffect,
          React.useRef,
          React.useMemo,
          React.useCallback,
          React.useId,
          React.useContext,
          React.useReducer,
          React.useLayoutEffect,
        ) as React.ComponentType<{
          tokens: typeof tokens;
          data: Record<string, unknown>;
          variables: Record<string, string>;
        }>;

        if (typeof Component !== "function") return;

        // Mirror SSR's pre-interpolation so React's hydrated tree matches
        // the HTML the server emitted (no token-revert flash).
        const interpolatedData = interpolateData(data, variables);
        hydrateRoot(
          container,
          React.createElement(Component, { tokens, data: interpolatedData, variables })
        );
      } catch (err) {
        console.warn(
          `[LibrarySectionHydrator] Hydration failed for section ${instanceId}:`,
          err
        );
      }

      // Mount FormBlockSection into any `<div data-form-slot />` markers
      // declared by the section code. The form_id is read from the section
      // instance content (data.form_id). One slot per section is the common
      // case; named slots (data-form-slot="foo") map to data.foo_form_id.
      const formId = (data as Record<string, unknown>)?.form_id;
      if (typeof formId === "string" && formId.length > 0) {
        const d = data as Record<string, unknown>;
        const formHeight = typeof d.__form_height === "number" ? d.__form_height as number : undefined;
        const mountSlots = () => {
          const slots = container.querySelectorAll<HTMLElement>("[data-form-slot]");
          slots.forEach((slot) => {
            if (slot.dataset.formSlotMounted === "1") return;
            slot.dataset.formSlotMounted = "1";
            try {
              const root = createRoot(slot);
              root.render(
                React.createElement(FormBlockSection, {
                  formId,
                  renderMode: (d?.render_mode as "step" | "scroll") ?? "step",
                  variables,
                  height: formHeight,
                }),
              );
              formRoots.push(root);
            } catch (err) {
              console.warn(`[LibrarySectionHydrator] Form slot mount failed:`, err);
            }
          });
        };
        mountSlots();
        // Re-scan if React re-renders the section and replaces the slot node.
        if (typeof MutationObserver !== "undefined") {
          const slotObserver = new MutationObserver(() => mountSlots());
          slotObserver.observe(container, { childList: true, subtree: true });
          observers.push(slotObserver);
        }
      }

      // Apply DOM-path overrides AFTER hydration so React's first render
      // doesn't wipe them out. Then watch the container so any later
      // re-render re-applies them.
      if (hasOverrides) {
        const apply = () => applyOverridesToContainer(container, overrides, variables);
        apply();
        if (typeof console !== "undefined") {
          console.debug("[SB:public]", {
            instanceId,
            overrideCount: Object.keys(overrides).length,
          });
        }
        if (typeof MutationObserver !== "undefined") {
          let scheduled = false;
          const observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            setTimeout(() => { scheduled = false; apply(); }, 16);
          });
          observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true });
          observers.push(observer);
        }
      }
    });

    return () => {
      observers.forEach((o) => o.disconnect());
      formRoots.forEach((r) => {
        try { r.unmount(); } catch { /* root may already be unmounted */ }
      });
    };
  // Run once on mount — SSR payloads are static
  }, []);

  return null;
}
