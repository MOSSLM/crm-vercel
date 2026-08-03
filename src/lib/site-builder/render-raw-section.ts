/**
 * Fast path for whole-page Claude designs, bypassing Babel and renderToString.
 *
 * `wrapRawHtml` turns a page of HTML into a TSX component whose entire body is:
 * take a constant string, substitute `{{ tokens }}`, inject it verbatim through
 * `dangerouslySetInnerHTML`. Compiling that with @babel/standalone, evaluating
 * it with `new Function`, building a React element and asking `renderToString`
 * to serialise it back into the string we started from is a lot of work to get
 * nowhere — and it is paid on every request, on a ~200 KB source, with only a
 * process-local cache that is cold on every new serverless instance.
 *
 * `renderRawSection` produces the same bytes directly. The parity is asserted
 * against the real compile+render pipeline in the test beside this file rather
 * than argued for here: if the two ever diverge, that test fails.
 *
 * `unwrapRawHtml` is the deliberate gate. It only recognises the exact shape
 * `wrapRawHtml` emits and returns `null` for anything else, so an unfamiliar
 * section silently keeps the existing path.
 */
import { CLAUDE_DESIGN_COMPONENT } from "./wrap-raw-html";

/**
 * Matches the wrapper's preamble and captures the HTML string literal.
 * `"(?:[^"\\]|\\.)*"` is a JS/JSON string body: anything but a quote or a
 * backslash, or a backslash followed by any character.
 */
const WRAPPED_RAW_HTML = new RegExp(
  `^export default function ${CLAUDE_DESIGN_COMPONENT}\\(\\{ variables = \\{\\} \\}\\) \\{\\n` +
    `  var __html = ("(?:[^"\\\\]|\\\\.)*");\\n`,
);

/** Same token syntax as the wrapper's own replace call. */
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * The HTML a `wrapRawHtml` component would inject, or `null` if `code` isn't
 * one — in which case the caller must fall back to compiling it.
 */
export function unwrapRawHtml(code: string): string | null {
  const match = WRAPPED_RAW_HTML.exec(code);
  if (!match) return null;
  try {
    // `wrapRawHtml` additionally rewrites `</` to `<\/`; that is a valid JSON
    // escape for `/`, so JSON.parse already undoes it.
    const html = JSON.parse(match[1]);
    return typeof html === "string" ? html : null;
  } catch {
    return null;
  }
}

/**
 * Byte-for-byte what `renderToString(<ClaudeDesign variables />)` emits.
 *
 * The substituted value is NOT escaped, exactly as before: it lands inside a
 * `dangerouslySetInnerHTML` payload, so React doesn't escape it either. Same
 * markup in, same markup out.
 */
export function renderRawSection(html: string, variables: Record<string, string>): string {
  const resolved = html.replace(TOKEN, (_m, key: string) => {
    const value = variables[key];
    return value != null ? String(value) : "";
  });
  return `<div data-claude-design="" style="width:100%">${resolved}</div>`;
}
