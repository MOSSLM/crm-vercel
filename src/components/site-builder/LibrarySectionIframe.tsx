"use client";

import React from "react";
import type { StyleGuide } from "@/types";
import { generateColorShades, getContrastColor } from "@/lib/color-utils";

interface LibrarySectionIframeProps {
  code: string;
  content?: Record<string, unknown>;
  styleGuide?: StyleGuide;
  variables?: Record<string, string>;
  className?: string;
  minHeight?: number;
  /** Render in plain wireframe (B&W) mode — neutralises colors and fonts. */
  wireframe?: boolean;
  /** When true, click events inside the iframe forward an `element-click`
   *  message via postMessage so the parent can implement element selection. */
  selectionEnabled?: boolean;
  onElementClick?: (info: { tag: string; text: string; path: number[] }) => void;
}

/**
 * Renders a library section (theme_sections.code) inside a sandboxed iframe
 * using Babel + React, injecting the style guide as CSS custom properties
 * and the section content as data/variables.
 */
export function LibrarySectionIframe({
  code,
  content = {},
  styleGuide,
  variables = {},
  className,
  minHeight = 1,
  wireframe = false,
  selectionEnabled = false,
  onElementClick,
}: LibrarySectionIframeProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  // Start the iframe at a real viewport height so that `100vh` /
  // `min-h-screen` rules inside the rendered section have a meaningful
  // reference. Once the content has actually rendered, we shrink (or
  // grow) the iframe to fit the measured scrollHeight exactly.
  const [height, setHeight] = React.useState(Math.max(minHeight, 720));

  const allVariables = React.useMemo(() => ({
    ...DEFAULT_VARIABLES,
    ...variables,
  }), [variables]);

  const srcDoc = React.useMemo(
    () => buildHTML(code, content, allVariables, styleGuide, { wireframe, selectionEnabled }),
    [code, content, allVariables, styleGuide, wireframe, selectionEnabled]
  );

  // Whenever the source changes, give the iframe a real viewport again so
  // sections that rely on 100vh / min-h-screen render at the correct size
  // before we measure them and shrink to fit.
  React.useEffect(() => {
    setHeight(Math.max(minHeight, 720));
  }, [srcDoc, minHeight]);

  // Listen for messages from inside the iframe:
  // - "element-click" for element selection (when selectionEnabled)
  // - "iframe-height" for auto-resize (always active)
  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { __siteBuilder?: string; tag?: string; text?: string; path?: number[]; height?: number };
      if (selectionEnabled && data?.__siteBuilder === "element-click" && data.tag && data.path) {
        onElementClick?.({ tag: data.tag, text: data.text ?? "", path: data.path });
      }
      if (data?.__siteBuilder === "iframe-height" && typeof data.height === "number" && data.height > 0) {
        setHeight(Math.ceil(data.height) + 2);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [selectionEnabled, onElementClick, minHeight]);

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

function styleGuideToCSSVars(sg: StyleGuide): string {
  const shadowMap: Record<string, string> = {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px -1px rgba(0,0,0,0.10)",
    lg: "0 10px 15px -3px rgba(0,0,0,0.10)",
  };

  // Generate shade vars for primary, secondary, accent
  const shadeEntries: string[] = [];
  const shadeTargets = { primary: sg.colors.primary, secondary: sg.colors.secondary, accent: sg.colors.accent };
  for (const [name, hex] of Object.entries(shadeTargets)) {
    const shades = generateColorShades(hex);
    for (const [stop, value] of Object.entries(shades)) {
      shadeEntries.push(`--color-${name}-${stop}: ${value};`);
    }
  }

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
    `--btn-radius: ${sg.buttons.borderRadius};`,
    `--btn-padding: ${sg.buttons.padding};`,
    `--btn-bg: ${sg.buttons.style === "outline" ? "transparent" : sg.buttons.style === "soft" ? sg.colors.primary + "22" : sg.colors.primary};`,
    `--btn-text: ${sg.buttons.style === "filled" ? getContrastColor(sg.colors.primary) : sg.colors.primary};`,
    `--btn-border-color: ${sg.buttons.style === "soft" ? "transparent" : sg.colors.primary};`,
    `--card-radius: ${sg.cards.borderRadius};`,
    `--card-shadow: ${shadowMap[sg.cards.shadow] ?? shadowMap.md};`,
    `--card-padding: ${sg.cards.padding};`,
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

// ─── Build the full iframe HTML ───────────────────────────────────────────────

interface BuildOptions {
  wireframe?: boolean;
  selectionEnabled?: boolean;
}

function buildHTML(
  code: string,
  data: Record<string, unknown>,
  variables: Record<string, string>,
  styleGuide?: StyleGuide,
  options: BuildOptions = {},
): string {
  const cssVars = styleGuide ? styleGuideToCSSVars(styleGuide) : "";
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
        ReactDOM.createRoot(document.getElementById('root')).render(
          React.createElement(${renderName}, {
            tokens: window.__tokens,
            data: window.__data,
            variables: window.__variables
          })
        );
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
  // iframe is initialised at a real viewport height (~720px) so those rules
  // resolve to a sensible value. Each section is then measured via
  // scrollHeight and the iframe shrinks/grows to fit its content exactly.
  // We still override Tailwind utility classes so the Style Guide tokens
  // (border-radius, shadow, fonts) apply even on legacy sections that never
  // referenced the CSS variables themselves.
  const resetCss = `
    html, body { height: auto; min-height: 0; }
    /* Map common Tailwind radii to the active Style Guide token. */
    .rounded, .rounded-md, .rounded-lg, .rounded-xl, .rounded-2xl,
    .rounded-3xl, .rounded-sm, .rounded-full {
      border-radius: var(--btn-radius) !important;
    }
    /* Force button style (filled/outline/soft) from Style Guide tokens.
       Matches <button>, classed buttons, and anchors styled like buttons
       (Relume sections use <a> with inline backgroundColor/borderRadius —
        plain text links have neither so they're left alone). */
    button, .btn, [role="button"], a.button,
    a[style*="background"], a[style*="border-radius"] {
      border-radius: var(--btn-radius) !important;
      background-color: var(--btn-bg) !important;
      color: var(--btn-text) !important;
      border: 2px solid var(--btn-border-color) !important;
      padding: var(--btn-padding) !important;
    }
    /* Cards: any element styled like a card uses --card-radius. */
    .card, [class*="shadow-"], .rounded-card { border-radius: var(--card-radius) !important; }
    img, picture, video { border-radius: var(--card-radius); }
    /* Apply font tokens globally so heading vs body fonts respect Style Guide. */
    h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading, Inter, sans-serif) !important; }
    body, p, span, a, button, input, textarea, select, li {
      font-family: var(--font-body, Inter, sans-serif);
    }
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
    window.__src = ${src};
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
      var SELECTABLE = 'h1,h2,h3,h4,h5,h6,p,span,a,button,img,svg,picture,li,blockquote';
      var lastSelected = null;
      function pathOf(el) {
        var path = [];
        var node = el;
        while (node && node.parentElement && node !== document.body) {
          var parent = node.parentElement;
          var idx = Array.prototype.indexOf.call(parent.children, node);
          path.unshift(idx);
          node = parent;
        }
        return path;
      }
      document.addEventListener('mouseover', function (e) {
        var t = e.target;
        if (!(t instanceof Element)) return;
        if (!t.matches(SELECTABLE)) return;
        t.setAttribute('data-sb-hover', '1');
      }, true);
      document.addEventListener('mouseout', function (e) {
        var t = e.target;
        if (!(t instanceof Element)) return;
        t.removeAttribute('data-sb-hover');
      }, true);
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!(t instanceof Element)) return;
        var el = t.closest(SELECTABLE);
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        if (lastSelected) lastSelected.removeAttribute('data-sb-selected');
        el.setAttribute('data-sb-selected', '1');
        lastSelected = el;
        parent.postMessage({
          __siteBuilder: 'element-click',
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').slice(0, 80),
          path: pathOf(el)
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
