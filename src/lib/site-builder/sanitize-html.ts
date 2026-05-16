/**
 * Minimal HTML sanitizer for the rich-text editor used in the site builder
 * element panel. We deliberately keep the allowed surface small to avoid
 * pulling in a heavy dependency:
 *
 *   <strong>, <b>, <em>, <i>, <u>, <br>, <span style="…">
 *
 * Only the `style` attribute is allowed on `<span>`, and the declarations
 * are filtered to:
 *
 *   color, font-weight, font-style, text-decoration
 *
 * Anything else is stripped. The sanitizer is environment-agnostic: it
 * uses DOMParser when available (client) and falls back to a regex-based
 * tag/attribute filter on the server.
 *
 * Notes:
 * - The output preserves `{{ variable }}` tokens as text so the existing
 *   variable interpolation continues to work downstream.
 * - The function is idempotent; running it twice yields the same result.
 */

const ALLOWED_TAGS = new Set(["strong", "b", "em", "i", "u", "br", "span"]);
const ALLOWED_STYLES = new Set(["color", "font-weight", "font-style", "text-decoration"]);

/** Whitelist of CSS values to keep. Drops anything containing url(), expression, etc. */
function filterStyleDeclaration(value: string): string {
  const v = value.trim();
  // Disallow anything that looks like a URL, JS expression, or unbalanced parens.
  if (/url\s*\(|expression\s*\(|javascript:|<|>/i.test(v)) return "";
  // Limit to 80 chars to avoid pathological values.
  return v.slice(0, 80);
}

function sanitizeStyleAttr(raw: string): string {
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const [propRaw, ...valParts] = decl.split(":");
    const prop = (propRaw ?? "").trim().toLowerCase();
    if (!prop || !ALLOWED_STYLES.has(prop)) continue;
    const val = filterStyleDeclaration(valParts.join(":"));
    if (!val) continue;
    out.push(`${prop}: ${val}`);
  }
  return out.join("; ");
}

/** Client path: parse via DOMParser and walk the tree. */
function sanitizeWithDOM(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  walk(root);
  return root.innerHTML;
}

function walk(el: Element): void {
  // Use a static snapshot so we can mutate during iteration.
  const children = Array.from(el.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.parentNode?.removeChild(child);
      continue;
    }
    const c = child as Element;
    const tag = c.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep children, drop the element itself.
      const parent = c.parentNode;
      if (!parent) continue;
      while (c.firstChild) parent.insertBefore(c.firstChild, c);
      parent.removeChild(c);
      continue;
    }
    // Strip every attribute except `style` on `<span>`.
    for (const attr of Array.from(c.attributes)) {
      if (tag === "span" && attr.name === "style") {
        const cleaned = sanitizeStyleAttr(attr.value);
        if (cleaned) c.setAttribute("style", cleaned);
        else c.removeAttribute("style");
      } else {
        c.removeAttribute(attr.name);
      }
    }
    walk(c);
  }
}

/**
 * Regex fallback used on the server. It is intentionally aggressive: any
 * tag not in the allow-list is replaced by its inner content; any
 * attribute other than a sanitized `style` on `<span>` is removed.
 */
function sanitizeWithRegex(html: string): string {
  let out = html;

  // 1. Drop comments.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  // 2. Drop scripts/styles outright.
  out = out.replace(/<(script|style)[\s\S]*?>[\s\S]*?<\/\1>/gi, "");

  // 3. Normalise every tag, keeping only the allow-listed ones.
  out = out.replace(/<\/?([a-zA-Z][\w-]*)\b([^>]*)>/g, (_match, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const isClosing = _match.startsWith("</");
    if (isClosing) return `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag === "span") {
      const styleMatch = /\bstyle\s*=\s*"([^"]*)"/i.exec(attrs);
      const cleaned = styleMatch ? sanitizeStyleAttr(styleMatch[1]) : "";
      return cleaned ? `<span style="${cleaned}">` : `<span>`;
    }
    return `<${tag}>`;
  });

  return out;
}

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      return sanitizeWithDOM(html);
    } catch {
      return sanitizeWithRegex(html);
    }
  }
  return sanitizeWithRegex(html);
}

/** True when the string looks like it contains markup we should render as HTML. */
export function looksLikeRichText(value: unknown): value is string {
  return typeof value === "string" && /<\/?(?:strong|b|em|i|u|br|span)\b/i.test(value);
}
