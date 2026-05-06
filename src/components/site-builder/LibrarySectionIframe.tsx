"use client";

import React from "react";
import type { StyleGuide } from "@/types";

interface LibrarySectionIframeProps {
  code: string;
  content?: Record<string, unknown>;
  styleGuide?: StyleGuide;
  variables?: Record<string, string>;
  className?: string;
  minHeight?: number;
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
  minHeight = 200,
}: LibrarySectionIframeProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  // Start tall so sections using 100vh / min-h-screen get correct initial viewport
  const [height, setHeight] = React.useState(Math.max(minHeight, 1200));

  const allVariables = React.useMemo(() => ({
    ...DEFAULT_VARIABLES,
    ...variables,
  }), [variables]);

  const srcDoc = React.useMemo(
    () => buildHTML(code, content, allVariables, styleGuide),
    [code, content, allVariables, styleGuide]
  );

  const handleLoad = React.useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const resize = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        if (h && h > 0) setHeight(h);
      } catch {
        // cross-origin — ignore
      }
    };
    // ResizeObserver on the root element for reliable auto-sizing
    try {
      const win = iframe.contentWindow as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
      const RO = win?.ResizeObserver;
      if (RO && iframe.contentDocument?.body) {
        const ro = new RO(resize);
        ro.observe(iframe.contentDocument.body);
      }
    } catch { /* ignore */ }
    iframe.contentWindow?.addEventListener("resize", resize);
    resize();
    // also re-check after a short delay for async renders
    setTimeout(resize, 400);
  }, [minHeight]);

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
  ].join("\n    ");
}

// ─── Build the full iframe HTML ───────────────────────────────────────────────

function buildHTML(
  code: string,
  data: Record<string, unknown>,
  variables: Record<string, string>,
  styleGuide?: StyleGuide
): string {
  const cssVars = styleGuide ? styleGuideToCSSVars(styleGuide) : "";

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
        text: styleGuide.colors.text,
        fontHeading: styleGuide.fonts.heading,
        fontBody: styleGuide.fonts.body,
      }
    : {};

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
    html, body { margin: 0; font-family: var(--font-body, Inter, sans-serif); background: var(--color-background, #fff); color: var(--color-text, #111); }
    body { overflow-x: hidden; }
    * { box-sizing: border-box; }
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
<\/body>
<\/html>`;
}
