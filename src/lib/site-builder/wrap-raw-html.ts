/**
 * Wraps a sanitised whole-page design (HTML fragment) into a single
 * self-contained TSX library section the existing renderers can compile and
 * render — in the editor iframe (Babel) AND on the public site (server
 * `compileSection` + `renderToString`).
 *
 * The component injects the design verbatim via `dangerouslySetInnerHTML`, so
 * nothing about the layout is rewritten (zero design drift). Before injecting,
 * it resolves `{{ entreprise.* }}` tokens against the `variables` prop — which
 * both render paths already pass (`render-server.ts` and the iframe render
 * call). This resolves variables in BOTH text and attributes (e.g. a logo
 * `src="{{ entreprise.logo_url }}"`), per company, with no DOM-path overrides.
 *
 * Author edits (non-variable text/images) stay separate: they are stored as
 * `content.__overrides` and applied post-render by the existing applicator.
 *
 * Stored as `theme_sections.code` with `render_mode: 'raw'`.
 */

/** Marker so the wrapped code is recognisable and re-wrappable. */
export const CLAUDE_DESIGN_COMPONENT = "ClaudeDesign";

export function wrapRawHtml(html: string): string {
  // Embed the HTML as a JS string literal. JSON.stringify handles quotes /
  // newlines; additionally escape `</` → `<\/` so a stray `</script>` inside
  // the markup can't terminate the inline <script> when this code is embedded
  // in the editor iframe srcDoc. `<\/` and `</` are the same string at runtime.
  const literal = JSON.stringify(html).replace(/<\//g, "<\\/");

  return `export default function ${CLAUDE_DESIGN_COMPONENT}({ variables = {} }) {
  var __html = ${literal};
  __html = __html.replace(/\\{\\{\\s*([\\w.]+)\\s*\\}\\}/g, function (_m, key) {
    var v = variables[key];
    return v != null ? String(v) : "";
  });
  return React.createElement("div", {
    "data-claude-design": "",
    style: { width: "100%" },
    dangerouslySetInnerHTML: { __html: __html },
  });
}
`;
}
