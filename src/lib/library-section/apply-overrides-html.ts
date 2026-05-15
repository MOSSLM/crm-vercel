/**
 * Server-only: applies content.__overrides to the SSR HTML produced by
 * renderSectionToHTML BEFORE it is shipped to the browser.
 *
 * The editor saves DOM-path overrides ("0.1.2.0:text", etc.) on each
 * section instance. The client hydrator already re-applies them after
 * hydration as a safety net, but applying them server-side guarantees:
 *
 * - First paint shows the edited content (no flash of default text).
 * - Crawlers and users with JS disabled see the correct content.
 * - Static export and Search Engine indexes capture the edited text.
 *
 * Path semantics mirror the iframe applicator and the client hydrator:
 * start at the section's root element (root.firstElementChild of the
 * container) and walk children by index.
 */
import "server-only";
import { parse, type HTMLElement } from "node-html-parser";

export interface OverrideEntry {
  kind: "text" | "image" | "bg_image" | "link_href" | "button_href" | "attr";
  value: string;
  meta?: { attrName?: string };
}

function interpolate(text: string, variables: Record<string, string>): string {
  if (typeof text !== "string" || !text) return text;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = variables[key];
    return v != null ? v : "";
  });
}

function nodeAtPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let node: HTMLElement | null = root;
  for (const idx of path) {
    if (!node) return null;
    const children = node.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[];
    if (!children[idx]) return null;
    node = children[idx];
  }
  return node;
}

function setBackgroundImage(el: HTMLElement, url: string): void {
  const current = el.getAttribute("style") ?? "";
  const bg = url ? `url("${url.replace(/"/g, '\\"')}")` : "none";
  const declaration = `background-image: ${bg}`;
  if (!current.trim()) {
    el.setAttribute("style", declaration);
    return;
  }
  const parts = current.split(";").map((s) => s.trim()).filter(Boolean);
  const filtered = parts.filter((p) => !/^background-image\s*:/i.test(p));
  filtered.push(declaration);
  el.setAttribute("style", filtered.join("; "));
}

export interface ApplyResult {
  html: string;
  applied: number;
  failed: number;
}

/** Applies overrides to the section HTML and returns the new HTML.
 *  Failures (missing element, malformed entry) are swallowed; the rest
 *  of the overrides still apply. */
export function applyOverridesToHTML(
  html: string,
  overrides: Record<string, OverrideEntry> | undefined,
  variables: Record<string, string>,
): ApplyResult {
  if (!html || !overrides || Object.keys(overrides).length === 0) {
    return { html, applied: 0, failed: 0 };
  }

  let applied = 0;
  let failed = 0;

  try {
    const doc = parse(html);
    // The HTML produced by renderToString for a section has the component's
    // root element as the first child. The client/iframe code walks paths
    // starting at that same root.
    const elementChildren = doc.childNodes.filter((c) => c.nodeType === 1) as HTMLElement[];
    const root = elementChildren[0];
    if (!root) return { html, applied: 0, failed: 0 };

    for (const key of Object.keys(overrides)) {
      const entry = overrides[key];
      if (!entry || typeof entry.value !== "string") {
        failed++;
        continue;
      }
      const colonIdx = key.indexOf(":");
      const pathStr = colonIdx === -1 ? key : key.slice(0, colonIdx);
      const path = pathStr.split(".").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
      const el = nodeAtPath(root, path);
      if (!el) {
        failed++;
        continue;
      }
      const value = interpolate(entry.value, variables);
      try {
        switch (entry.kind) {
          case "text":
            el.set_content(escapeText(value));
            break;
          case "image":
            el.setAttribute("src", value);
            break;
          case "bg_image":
            setBackgroundImage(el, value);
            break;
          case "link_href":
          case "button_href":
            el.setAttribute("href", value);
            break;
          case "attr":
            if (entry.meta?.attrName) {
              el.setAttribute(entry.meta.attrName, value);
            } else {
              failed++;
              continue;
            }
            break;
          default:
            failed++;
            continue;
        }
        applied++;
      } catch {
        failed++;
      }
    }

    return { html: doc.toString(), applied, failed };
  } catch {
    return { html, applied: 0, failed: Object.keys(overrides).length };
  }
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
