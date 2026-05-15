"use client";

import React from "react";
import type { StyleGuide } from "@/types";
import { generateColorShades } from "@/lib/color-utils";
import { buildCtaCSSVars, CTA_CSS_RULES } from "@/lib/button-style";

export type IframeElementKind = "text" | "image" | "button" | "link" | "input" | "form";

export interface IframeElementAttrs {
  src?: string;
  alt?: string;
  href?: string;
  target?: string;
  className?: string;
  inputType?: string;
  placeholder?: string;
  name?: string;
  value?: string;
  required?: boolean;
  action?: string;
  method?: string;
  /** True when the "image" kind was inferred from a CSS background-image
   *  rather than an `<img src>` attribute. */
  isBackground?: boolean;
}

export interface IframeElementClickInfo {
  kind: IframeElementKind;
  tag: string;
  text: string;
  path: number[];
  attrs: IframeElementAttrs;
  fieldId: string | null;
}

export interface IframeDomTreeNode {
  tag: string;
  kind: IframeElementKind;
  text: string;
  attrs: IframeElementAttrs;
  path: number[];
  children: IframeDomTreeNode[];
}

interface LibrarySectionIframeProps {
  code: string;
  content?: Record<string, unknown>;
  /** Per-instance DOM-path overrides (content.__overrides). Pulled out of
   *  `content` so the section component doesn't see them as `data` keys
   *  while the iframe applicator still picks them up post-render. */
  overrides?: Record<string, unknown>;
  styleGuide?: StyleGuide;
  variables?: Record<string, string>;
  className?: string;
  minHeight?: number;
  /** Render in plain wireframe (B&W) mode — neutralises colors and fonts. */
  wireframe?: boolean;
  /** When true, click events inside the iframe forward an `element-click`
   *  message via postMessage so the parent can implement element selection. */
  selectionEnabled?: boolean;
  onElementClick?: (info: IframeElementClickInfo) => void;
  /** Receives the current DOM tree of the rendered section (editor only,
   *  requires selectionEnabled). Updated whenever the tree mutates. */
  onDomTree?: (tree: IframeDomTreeNode) => void;
  /** Public site mode: start at 1px and grow up (no 720px initial flash). */
  publicMode?: boolean;
}

/**
 * Renders a library section (theme_sections.code) inside a sandboxed iframe
 * using Babel + React, injecting the style guide as CSS custom properties
 * and the section content as data/variables.
 */
export function LibrarySectionIframe({
  code,
  content = {},
  overrides,
  styleGuide,
  variables = {},
  className,
  minHeight = 1,
  wireframe = false,
  selectionEnabled = false,
  onElementClick,
  onDomTree,
  publicMode = false,
}: LibrarySectionIframeProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  // In editor mode: start at a real viewport height so min-h-screen sections
  // have a meaningful reference before we measure and resize.
  // In public mode: start at 1px and grow — no collapsing flash on the live site.
  const [height, setHeight] = React.useState(publicMode ? Math.max(minHeight, 1) : Math.max(minHeight, 720));

  const allVariables = React.useMemo(() => ({
    ...DEFAULT_VARIABLES,
    ...variables,
  }), [variables]);

  // srcDoc only depends on the iframe shell (code, theme, mode). Runtime
  // data (content, variables, overrides) is pushed via postMessage so the
  // iframe never reloads + Babel never recompiles during user edits.
  const srcDoc = React.useMemo(
    () => buildHTML(code, content, allVariables, styleGuide, { wireframe, selectionEnabled, overrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code, styleGuide, wireframe, selectionEnabled],
  );

  const isReadyRef = React.useRef(false);

  // Push data updates to the iframe whenever content / variables / overrides
  // change. The first push happens on the iframe-ready message (handled
  // below) so the initial state is consistent with subsequent updates.
  React.useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (typeof console !== "undefined") {
      console.debug("[SB:post] update-data", {
        ready: isReadyRef.current,
        hasWindow: !!win,
        contentKeys: Object.keys(content).length,
        overrideCount: Object.keys(overrides ?? {}).length,
      });
    }
    if (!isReadyRef.current) return;
    if (!win) return;
    win.postMessage(
      { __siteBuilder: "update-data", data: content, variables: allVariables, overrides: overrides ?? {} },
      "*",
    );
  }, [content, allVariables, overrides]);

  // Whenever the source changes, give the iframe a real viewport again so
  // sections that rely on 100vh / min-h-screen render at the correct size
  // before we measure them and shrink to fit. Also reset ready flag — the
  // new srcDoc is a fresh iframe and we need to wait for its iframe-ready
  // message before pushing data again.
  React.useEffect(() => {
    isReadyRef.current = false;
    setHeight(publicMode ? Math.max(minHeight, 1) : Math.max(minHeight, 720));
  }, [srcDoc, minHeight, publicMode]);

  // Listen for messages from inside the iframe:
  // - "element-click" for element selection (when selectionEnabled)
  // - "iframe-height" for auto-resize (always active)
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        __siteBuilder?: string;
        kind?: IframeElementKind;
        tag?: string;
        text?: string;
        path?: number[];
        attrs?: IframeElementAttrs;
        fieldId?: string | null;
        height?: number;
        tree?: IframeDomTreeNode;
      };
      if (selectionEnabled && data?.__siteBuilder === "dom-tree" && data.tree) {
        onDomTree?.(data.tree);
      }
      if (selectionEnabled && data?.__siteBuilder === "element-click" && data.tag && data.path) {
        onElementClick?.({
          kind: data.kind ?? "text",
          tag: data.tag,
          text: data.text ?? "",
          path: data.path,
          attrs: data.attrs ?? {},
          fieldId: data.fieldId ?? null,
        });
      }
      if (data?.__siteBuilder === "iframe-height" && typeof data.height === "number" && data.height > 0) {
        setHeight(Math.ceil(data.height) + 2);
      }
      if (data?.__siteBuilder === "iframe-ready") {
        isReadyRef.current = true;
        if (typeof console !== "undefined") {
          console.debug("[SB:post] iframe-ready → initial push", {
            contentKeys: Object.keys(content).length,
            overrideCount: Object.keys(overrides ?? {}).length,
          });
        }
        // Push the current runtime state now that the iframe is alive.
        iframeRef.current?.contentWindow?.postMessage(
          { __siteBuilder: "update-data", data: content, variables: allVariables, overrides: overrides ?? {} },
          "*",
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [selectionEnabled, onElementClick, onDomTree, minHeight, content, allVariables, overrides]);

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const handleLoad = React.useCallback(() => {
    // Height measurement is done via postMessage from the height reporter
    // script injected inside the iframe HTML (see buildHTML). No external
    // scrollHeight polling needed — it would be incorrect for sections that
    // use min-h-screen (those report the viewport height, not content height).
  }, []);

  if (!code?.trim()) return null;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      scrolling="no"
      className={className}
      style={{ width: "100%", border: "none", height, display: "block", overflow: "hidden" }}
      title="Section preview"
      onLoad={handleLoad}
    />
  );
}

// ─── Default company variables for preview ──────────────────────────────────

const DEFAULT_VARIABLES: Record<string, string> = {
  "entreprise.nom": "Votre Entreprise",
  "entreprise.telephone": "01 23 45 67 89",
  "entreprise.email": "contact@entreprise.fr",
  "entreprise.adresse": "12 rue de la Paix",
  "entreprise.ville": "Paris",
  "entreprise.code_postal": "75001",
  "entreprise.pays": "France",
  "entreprise.description": "Une entreprise de qualité à votre service.",
  "entreprise.annee_creation": "2015",
  "entreprise.note_moyenne": "4.8",
  "entreprise.nombre_avis": "127",
  "entreprise.logo_url": "",
  "entreprise.slogan": "L'excellence à votre service",
  "entreprise.horaires": "Lun-Ven 9h-18h",
};

// ─── StyleGuide → CSS custom properties ─────────────────────────────────────

const IFRAME_SHADOW_MAP: Record<string, string> = {
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,0.05)",
  md: "0 4px 6px -1px rgba(0,0,0,0.10)",
  lg: "0 10px 15px -3px rgba(0,0,0,0.10)",
};

function resolveIframeCardShadow(cards: StyleGuide["cards"]): string {
  if (cards.shadowCustom) {
    const s = cards.shadowCustom;
    return `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
  }
  return IFRAME_SHADOW_MAP[cards.shadow] ?? IFRAME_SHADOW_MAP.md;
}

function styleGuideToCSSVars(sg: StyleGuide): string {
  // Generate shade vars for primary, secondary, accent
  const shadeEntries: string[] = [];
  const shadeTargets = { primary: sg.colors.primary, secondary: sg.colors.secondary, accent: sg.colors.accent };
  for (const [name, hex] of Object.entries(shadeTargets)) {
    const shades = generateColorShades(hex);
    for (const [stop, value] of Object.entries(shades)) {
      shadeEntries.push(`--color-${name}-${stop}: ${value};`);
    }
  }

  // CTA tokens (primary + secondary + legacy --btn-* aliases)
  const ctaVars = buildCtaCSSVars(sg);
  const ctaEntries = Object.entries(ctaVars).map(([k, v]) => `${k}: ${v};`);

  return [
    `--color-primary: ${sg.colors.primary};`,
    `--color-secondary: ${sg.colors.secondary};`,
    `--color-accent: ${sg.colors.accent};`,
    `--color-background: ${sg.colors.background};`,
    `--color-bg-alt: ${sg.colors.backgroundAlt};`,
    `--color-text: ${sg.colors.text};`,
    `--color-text-muted: ${sg.colors.textMuted};`,
    `--font-heading: ${sg.fonts.heading}, Inter, sans-serif;`,
    `--font-body: ${sg.fonts.body}, Inter, sans-serif;`,
    `--font-base-size: ${sg.fonts.baseSize};`,
    ...ctaEntries,
    `--card-radius: ${sg.cards.borderRadius};`,
    `--card-shadow: ${resolveIframeCardShadow(sg.cards)};`,
    `--card-padding: ${sg.cards.padding};`,
    `--card-border-width: ${sg.cards.borderWidth ?? "0px"};`,
    `--card-border-color: ${sg.cards.borderColor ?? "transparent"};`,
    `--card-image-radius: ${sg.cards.imageRadius ?? sg.cards.borderRadius};`,
    `--section-padding: ${sg.spacing.sectionPadding};`,
    `--element-gap: ${sg.spacing.elementGap};`,
    `--max-content-width: ${sg.spacing.maxContentWidth};`,
    // Tailwind-friendly colour aliases (used in section code)
    `--tw-primary: ${sg.colors.primary};`,
    `--tw-secondary: ${sg.colors.secondary};`,
    `--tw-accent: ${sg.colors.accent};`,
    // Shade scales
    ...shadeEntries,
  ].join("\n    ");
}

// ─── Google Fonts injection ───────────────────────────────────────────────────

const SYSTEM_FONTS = new Set([
  "inter", "arial", "helvetica", "helvetica neue", "georgia", "times", "times new roman",
  "courier", "courier new", "verdana", "trebuchet ms", "tahoma", "impact", "comic sans ms",
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "-apple-system",
  "blinkmacsystemfont", "segoe ui", "roboto", "oxygen", "ubuntu", "cantarell", "open sans",
  "fira sans", "droid sans", "inherit", "initial", "unset",
]);

function buildGoogleFontsLinks(styleGuide?: StyleGuide): string {
  if (!styleGuide) return "";
  const families = [...new Set([styleGuide.fonts.heading, styleGuide.fonts.body])]
    .map((f) => f?.trim())
    .filter((f): f is string => !!f && !SYSTEM_FONTS.has(f.toLowerCase()));
  if (families.length === 0) return "";
  const query = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400`)
    .join("&");
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${query}&display=swap" rel="stylesheet">`;
}

// ─── Build the full iframe HTML ───────────────────────────────────────────────

interface BuildOptions {
  wireframe?: boolean;
  selectionEnabled?: boolean;
  overrides?: Record<string, unknown>;
}

function buildHTML(
  code: string,
  data: Record<string, unknown>,
  variables: Record<string, string>,
  styleGuide?: StyleGuide,
  options: BuildOptions = {},
): string {
  const overridesPayload = options.overrides ?? {};
  const cssVars = styleGuide ? styleGuideToCSSVars(styleGuide) : "";
  const googleFontsLinks = buildGoogleFontsLinks(styleGuide);
  const { wireframe = false, selectionEnabled = false } = options;

  // Extract export default name BEFORE stripping keywords
  const exportDefaultFnMatch = code.match(/export\s+default\s+function\s+([A-Z]\w*)/);
  const exportDefaultName = exportDefaultFnMatch ? exportDefaultFnMatch[1] : null;

  const processedCode = code
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    .replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    .replace(/^['"]use client['"]\s*;?\s*$/gm, "")
    .replace(/^export\s+type\s+\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$/gm, "")
    .replace(/^export\s+\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$/gm, "")
    .replace(/^export\s+type\s+([\w]+)/gm, "type $1")
    .replace(/export\s+default\s+function\s+/g, "function ")
    .replace(/export\s+default\s+class\s+/g, "class ")
    .replace(/\nexport\s+default\s+(\w+)\s*;/g, "\n// exported: $1")
    .replace(/^export\s+(const|let|var|function|class)\s+/gm, "$1 ");

  const fnMatch =
    processedCode.match(/^function\s+([A-Z]\w*)/m) ||
    processedCode.match(/^const\s+([A-Z]\w*)\s*=/m);
  const componentName = fnMatch ? fnMatch[1] : null;
  const exportedMatch = processedCode.match(/\/\/ exported:\s+(\w+)/);
  // Priority: explicit export default fn > export default identifier > first component
  const renderName = exportDefaultName || (exportedMatch ? exportedMatch[1] : componentName);

  const renderCall = renderName
    ? `try {
        var __root = ReactDOM.createRoot(document.getElementById('root'));
        function __render() {
          try {
            var __d = window.__data || {};
            var __keys = Object.keys(__d);
            var __sample = {};
            for (var __i = 0; __i < Math.min(__keys.length, 4); __i++) {
              var __k = __keys[__i];
              var __v = __d[__k];
              __sample[__k] = (typeof __v === 'string') ? __v.slice(0, 40) : (typeof __v);
            }
            console.debug('[SB:render]', { keys: __keys.length, sample: __sample, overrides: Object.keys(window.__overrides || {}).length });
          } catch(_) {}
          __root.render(
            React.createElement(${renderName}, {
              tokens: window.__tokens,
              data: window.__data,
              variables: window.__variables
            })
          );
        }
        window.__rerender = __render;
        __render();
        // Tell parent we're ready to receive runtime data updates.
        try { parent.postMessage({ __siteBuilder: 'iframe-ready' }, '*'); } catch(e) {}
      } catch(err) {
        document.getElementById('root').innerHTML =
          '<pre style="padding:16px;color:#e74c3c;font-size:12px;white-space:pre-wrap">' +
          err.message + '\\n' + (err.stack || '') + '</pre>';
      }`
    : `document.getElementById('root').innerHTML = '<p style="padding:16px;color:#888;">Composant non détecté.</p>';`;

  const src = JSON.stringify(`${processedCode}\n${renderCall}`);

  const tokens = styleGuide
    ? {
        primary: styleGuide.colors.primary,
        secondary: styleGuide.colors.secondary,
        accent: styleGuide.colors.accent,
        background: styleGuide.colors.background,
        backgroundAlt: styleGuide.colors.backgroundAlt,
        text: styleGuide.colors.text,
        textMuted: styleGuide.colors.textMuted,
        fontHeading: styleGuide.fonts.heading,
        fontBody: styleGuide.fonts.body,
        baseSize: styleGuide.fonts.baseSize,
        // Shade scales for section code to use (e.g. tokens.primaryShades[500])
        primaryShades: generateColorShades(styleGuide.colors.primary),
        secondaryShades: generateColorShades(styleGuide.colors.secondary),
        accentShades: generateColorShades(styleGuide.colors.accent),
      }
    : {};

  // Reset CSS — keeps document height flexible (auto) but does NOT force
  // sections to collapse: we leave min-h-screen / 100vh intact, because the
  // We still override Tailwind utility classes so the Style Guide tokens
  // (border-radius, shadow, fonts) apply even on legacy sections that never
  // referenced the CSS variables themselves.
  // IMPORTANT: only `.cta-primary` and `.cta-secondary` get button token
  // overrides — other interactive elements (FAQ toggles, slider arrows, etc.)
  // keep their native styles.
  const resetCss = `
    html, body { height: auto; min-height: 0; }
    /* Apply font tokens globally so heading vs body fonts respect Style Guide. */
    h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading, Inter, sans-serif) !important; }
    body, p, span, a, button, input, textarea, select, li {
      font-family: var(--font-body, Inter, sans-serif);
    }
    /* Cards: any element styled like a card uses --card-radius. */
    .card, [class*="shadow-"], .rounded-card { border-radius: var(--card-radius) !important; }
    img, picture, video { border-radius: var(--card-image-radius); }
    /* CTA-only button style — opt-in via class on the element */
    ${CTA_CSS_RULES}
  `;

  const wireframeCss = wireframe ? `
    /* Wireframe (B&W) overrides — keep layout but neutralise colors. */
    :root {
      --color-primary: #111827 !important;
      --color-secondary: #6b7280 !important;
      --color-accent: #374151 !important;
      --color-background: #ffffff !important;
      --color-bg-alt: #f3f4f6 !important;
      --color-text: #111827 !important;
      --color-text-muted: #6b7280 !important;
    }
    html, body { background: #fff !important; color: #111827 !important; }
    *, *::before, *::after {
      filter: grayscale(100%) !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }
    img, video, svg, picture { filter: grayscale(100%) brightness(0.95) contrast(0.85) !important; }
    a, button, [role="button"] { box-shadow: none !important; }
  ` : "";

  const selectionCss = selectionEnabled ? `
    [data-sb-hover] { outline: 2px dashed rgba(59,130,246,.6) !important; outline-offset: 2px; cursor: pointer !important; }
    [data-sb-selected] { outline: 2px solid #3b82f6 !important; outline-offset: 2px; }
  ` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${googleFontsLinks}
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    :root {
      ${cssVars}
    }
    html, body { margin: 0; font-family: var(--font-body, Inter, sans-serif); background: transparent; color: var(--color-text, #111); }
    body { overflow-x: hidden; }
    * { box-sizing: border-box; }
    ${resetCss}
    ${wireframeCss}
    ${selectionCss}
  <\/style>
<\/head>
<body>
  <div id="root"><\/div>
  <script>
    window.__data = ${JSON.stringify(data)};
    window.__variables = ${JSON.stringify(variables)};
    window.__tokens = ${JSON.stringify(tokens)};
    window.__overrides = ${JSON.stringify(overridesPayload)};
    window.__src = ${src};
  <\/script>
  <script>
    /* Override applicator — applies content.__overrides[pathStr] after each
       React render so elements hardcoded in section code can still be edited.
       Each override entry: { kind: 'text'|'image'|'link_href'|'button_href'|'attr', value: string, meta?: { attrName?: string } }
       The value may contain {{ variable }} tokens that are interpolated from window.__variables. */
    (function () {
      function applyVars(text) {
        if (typeof text !== 'string' || !text) return text;
        var vars = window.__variables || {};
        return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, key) {
          return vars[key] != null ? vars[key] : '';
        });
      }
      function nodeAtPath(path) {
        var node = document.getElementById('root');
        if (!node || !node.firstElementChild) return null;
        node = node.firstElementChild;
        for (var i = 0; i < path.length; i++) {
          if (!node || !node.children || !node.children[path[i]]) return null;
          node = node.children[path[i]];
        }
        return node;
      }
      function applyOne(key, entry) {
        // Keys may carry a kind suffix: "<dotPath>:<kind>" or
        // "<dotPath>:attr:<attrName>". Strip the suffix to recover the path.
        var colonIdx = key.indexOf(':');
        var pathStr = colonIdx === -1 ? key : key.slice(0, colonIdx);
        var path = pathStr.split('.').map(function (s) { return parseInt(s, 10); }).filter(function (n) { return !isNaN(n); });
        var el = nodeAtPath(path);
        if (!el) return;
        var kind = entry && entry.kind;
        var raw = entry && entry.value;
        if (typeof raw !== 'string') return;
        var value = applyVars(raw);
        if (kind === 'text') {
          if (el.textContent !== value) el.textContent = value;
        } else if (kind === 'image') {
          if (el.getAttribute('src') !== value) el.setAttribute('src', value);
        } else if (kind === 'bg_image') {
          var bg = value ? ('url("' + value.replace(/"/g, '\\"') + '")') : 'none';
          if (el.style.backgroundImage !== bg) el.style.backgroundImage = bg;
        } else if (kind === 'link_href' || kind === 'button_href') {
          if (el.getAttribute('href') !== value) el.setAttribute('href', value);
        } else if (kind === 'attr' && entry.meta && entry.meta.attrName) {
          el.setAttribute(entry.meta.attrName, value);
        }
      }
      function applyAll() {
        var overrides = window.__overrides || {};
        for (var key in overrides) {
          if (Object.prototype.hasOwnProperty.call(overrides, key)) {
            try { applyOne(key, overrides[key]); } catch (_) {}
          }
        }
      }
      window.__applyOverrides = applyAll;
      var debounceTimer = null;
      function scheduleApply() {
        if (debounceTimer) return;
        debounceTimer = setTimeout(function () { debounceTimer = null; applyAll(); }, 16);
      }
      function init() {
        applyAll();
        var root = document.getElementById('root');
        if (root && window.MutationObserver) {
          var mo = new MutationObserver(scheduleApply);
          mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }

      // Parent → iframe: refresh runtime data without rebuilding srcDoc.
      // The shell HTML (Babel + section code) is stable; only data,
      // variables and overrides change as the user types.
      window.addEventListener('message', function (e) {
        var msg = e.data;
        if (!msg || msg.__siteBuilder !== 'update-data') return;
        try {
          console.debug('[SB:recv] update-data', {
            dataKeys: msg.data ? Object.keys(msg.data).length : 0,
            overrideCount: msg.overrides ? Object.keys(msg.overrides).length : 0,
            hasRerender: typeof window.__rerender === 'function'
          });
        } catch(_) {}
        if (msg.data) window.__data = msg.data;
        if (msg.variables) window.__variables = msg.variables;
        window.__overrides = msg.overrides || {};
        if (typeof window.__rerender === 'function') window.__rerender();
        applyAll();
      });
    })();
  <\/script>
  <script>
    window.addEventListener('error', function(e) {
      if (!e.message || e.message === 'Script error.') return;
      var root = document.getElementById('root');
      if (root && !root.firstChild) {
        root.innerHTML = '<pre style="padding:16px;color:#e74c3c;font-size:12px;white-space:pre-wrap">' + e.message + '<\/pre>';
      }
    });
    function run() {
      try {
        var result = Babel.transform(window.__src, { presets: ['react', 'typescript'], filename: 'section.tsx' });
        var s = document.createElement('script');
        s.textContent = result.code;
        document.head.appendChild(s);
      } catch(err) {
        document.getElementById('root').innerHTML =
          '<pre style="padding:16px;color:#e74c3c;font-size:12px;white-space:pre-wrap">' + (err.message || String(err)) + '<\/pre>';
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  <\/script>
  ${selectionEnabled ? `<script>
    (function () {
      var SELECTABLE = 'h1,h2,h3,h4,h5,h6,p,span,a,button,img,svg,picture,li,blockquote,label,input,textarea,form';
      var BTN_CLASS_RE = /(^|\\s)(cta-primary|cta-secondary|btn|button)(\\s|$)/i;
      var lastSelected = null;

      function pathOf(el) {
        // Build a path of child-indexes from the section root down to el.
        // The override applicator starts at #root.firstElementChild and walks
        // children by index, so the section root itself must NOT contribute.
        // Returns [] when el === section root; [0] when el is the section
        // root's first child; etc.
        var path = [];
        var rootHost = document.getElementById('root');
        if (!rootHost) return path;
        var node = el;
        while (node && node.parentElement && node.parentElement !== rootHost) {
          var parent = node.parentElement;
          var idx = Array.prototype.indexOf.call(parent.children, node);
          path.unshift(idx);
          node = parent;
        }
        return path;
      }

      function extractBgUrl(el) {
        var bg = window.getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none') return null;
        var m = bg.match(/url\\((['"]?)(.+?)\\1\\)/);
        return m ? m[2] : null;
      }
      function findBgImageAncestor(el) {
        var node = el;
        for (var i = 0; i < 6 && node && node !== document.body; i++) {
          if (extractBgUrl(node)) return node;
          node = node.parentElement;
        }
        return null;
      }

      function classify(el) {
        var tag = el.tagName.toLowerCase();
        if (tag === 'img' || tag === 'picture') return 'image';
        if (tag === 'svg' && el.parentElement && el.parentElement.tagName.toLowerCase() === 'picture') return 'image';
        if (tag === 'button') return 'button';
        if (tag === 'a') {
          var cls = el.getAttribute('class') || '';
          if (BTN_CLASS_RE.test(cls) || el.getAttribute('role') === 'button') return 'button';
          return 'link';
        }
        if (tag === 'input' || tag === 'textarea') return 'input';
        if (tag === 'form') return 'form';
        if (extractBgUrl(el)) return 'image';
        return 'text';
      }

      function attrsFor(kind, el) {
        var a = {};
        if (kind === 'image') {
          var bgUrl = extractBgUrl(el);
          a.src = el.getAttribute('src') || bgUrl || '';
          a.alt = el.getAttribute('alt') || '';
          if (bgUrl) a.isBackground = true;
        } else if (kind === 'button' || kind === 'link') {
          a.href = el.getAttribute('href') || '';
          a.target = el.getAttribute('target') || '_self';
          a.className = el.getAttribute('class') || '';
        } else if (kind === 'input') {
          a.inputType = el.getAttribute('type') || (el.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text');
          a.placeholder = el.getAttribute('placeholder') || '';
          a.name = el.getAttribute('name') || '';
          a.value = el.value || '';
          a.required = el.hasAttribute('required');
        } else if (kind === 'form') {
          a.action = el.getAttribute('action') || '';
          a.method = (el.getAttribute('method') || 'GET').toUpperCase();
        }
        return a;
      }

      function resolveTarget(t) {
        // Prefer an inline SELECTABLE match. Fall back to the nearest ancestor
        // with a background-image so headers / banners are clickable.
        var el = t.closest(SELECTABLE);
        if (el) return el;
        return findBgImageAncestor(t);
      }

      function nodeKind(el) {
        return classify(el);
      }

      function nodeAttrs(kind, el) {
        return attrsFor(kind, el);
      }

      var SKIP_TAGS = { script: 1, style: 1, noscript: 1, template: 1 };

      function shortText(el) {
        // Prefer the first direct text node so we don't capture deep nested text.
        for (var i = 0; i < el.childNodes.length; i++) {
          var c = el.childNodes[i];
          if (c.nodeType === 3 /* TEXT_NODE */) {
            var t = (c.nodeValue || '').trim();
            if (t) return t.length > 60 ? t.slice(0, 60) + '…' : t;
          }
        }
        var fallback = (el.textContent || '').trim();
        if (!fallback) return '';
        return fallback.length > 60 ? fallback.slice(0, 60) + '…' : fallback;
      }

      function buildDomTree(el, path, depth) {
        if (!el || depth > 10) return null;
        var tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (SKIP_TAGS[tag]) return null;
        // Honour display:none — Layers should reflect what the user sees.
        try {
          var cs = window.getComputedStyle(el);
          if (cs && cs.display === 'none') return null;
        } catch (_) {}
        var kind = nodeKind(el);
        var node = {
          tag: tag,
          kind: kind,
          text: shortText(el),
          attrs: nodeAttrs(kind, el),
          path: path,
          children: []
        };
        var kids = el.children || [];
        for (var i = 0; i < kids.length; i++) {
          var child = buildDomTree(kids[i], path.concat([i]), depth + 1);
          if (child) node.children.push(child);
        }
        return node;
      }

      function sendDomTree() {
        var root = document.getElementById('root');
        if (!root || !root.firstElementChild) return;
        try {
          var tree = buildDomTree(root.firstElementChild, [], 0);
          if (!tree) return;
          parent.postMessage({ __siteBuilder: 'dom-tree', tree: tree }, '*');
        } catch (_) {}
      }
      var treeTimer = null;
      function scheduleTree() {
        if (treeTimer) clearTimeout(treeTimer);
        treeTimer = setTimeout(function () { treeTimer = null; sendDomTree(); }, 120);
      }
      // Initial send: poll until #root is populated by React.
      [60, 220, 600, 1300, 2600].forEach(function (d) { setTimeout(sendDomTree, d); });
      // Re-send on mutations (debounced) so layer tree stays in sync with edits.
      (function () {
        var root = document.getElementById('root');
        if (!root || !window.MutationObserver) return;
        var mo = new MutationObserver(scheduleTree);
        mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
      })();

      document.addEventListener('mouseover', function (e) {
        var t = e.target;
        if (!(t instanceof Element)) return;
        var el = resolveTarget(t);
        if (!el) return;
        el.setAttribute('data-sb-hover', '1');
      }, true);
      document.addEventListener('mouseout', function (e) {
        var t = e.target;
        if (!(t instanceof Element)) return;
        t.removeAttribute('data-sb-hover');
        var anc = findBgImageAncestor(t);
        if (anc) anc.removeAttribute('data-sb-hover');
      }, true);
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!(t instanceof Element)) return;
        var el = resolveTarget(t);
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        if (lastSelected) lastSelected.removeAttribute('data-sb-selected');
        el.setAttribute('data-sb-selected', '1');
        lastSelected = el;
        var kind = classify(el);
        parent.postMessage({
          __siteBuilder: 'element-click',
          kind: kind,
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').slice(0, 200),
          path: pathOf(el),
          attrs: attrsFor(kind, el),
          fieldId: el.getAttribute('data-field-id') || null
        }, '*');
      }, true);
    })();
  <\/script>` : ""}
  <script>
    /* Height reporter: measures natural content height (without viewport-fill
       constraints like min-h-screen) and sends it to the parent frame so the
       iframe element can be resized to fit its content exactly. */
    (function(){
      var last=0;
      function nat(){
        var root=document.getElementById('root');
        if(!root)return 0;
        /* Suppress viewport-fill classes to break the circular dependency:
           min-h-screen=100vh=iframe height → measure=iframe height → resize → loop.
           getBoundingClientRect().height gives the real rendered height of the React
           tree, unlike body.scrollHeight which is always >= clientHeight (viewport). */
        var s=document.createElement('style');
        s.textContent='.min-h-screen{min-height:0!important}.h-screen{height:auto!important}';
        document.head.appendChild(s);
        var h=Math.ceil(root.getBoundingClientRect().height);
        document.head.removeChild(s);
        return h;
      }
      function rpt(){
        var h=nat();
        if(h>0&&Math.abs(h-last)>1){
          last=h;
          try{parent.postMessage({__siteBuilder:'iframe-height',height:h},'*')}catch(e){}
        }
      }
      function init(){
        /* Poll at key moments to catch async Babel transform + React render. */
        [50,200,500,1200,2500,4000].forEach(function(d){setTimeout(rpt,d)});
        /* ResizeObserver on #root fires whenever React re-renders content. */
        if(window.ResizeObserver){
          var ro=new ResizeObserver(function(){setTimeout(rpt,16)});
          var r=document.getElementById('root');
          if(r){ro.observe(r)}
          else if(document.body){
            var mo=new MutationObserver(function(){
              var r2=document.getElementById('root');
              if(r2){ro.observe(r2);mo.disconnect()}
            });
            mo.observe(document.body,{childList:true});
          }
        }
      }
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',init);
      }else{init()}
    })();
  <\/script>
<\/body>
<\/html>`;
}
