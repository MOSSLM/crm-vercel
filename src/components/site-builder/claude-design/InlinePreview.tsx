"use client";

import React from "react";
import {
  tweaksToCssVars,
  tweaksDataAttrs,
  tweaksFontLinkHref,
  tweaksExtrasScript,
  tweaksInlineStyle,
  type Tweaks,
} from "@/lib/site-builder/claude-design/apply-tweaks";
import { CLAUDE_DESIGN_RUNTIME } from "@/lib/site-builder/claude-design/runtime";
import { stripTaggedRegions } from "@/lib/site-builder/claude-design/strip-tagged-regions";
import { buildVhRewriteRuntime } from "@/lib/site-builder/preview-viewport";
import { SAMPLE_VARIABLES } from "./VariablesPanel";

export interface OverrideEntry {
  kind: "text" | "image" | "bg_image";
  value: string;
}

interface Props {
  html: string;
  sharedCss: string;
  fontLinks: string[];
  tweaks: Tweaks;
  overrides: Record<string, OverrideEntry>;
  /** Called when the user edits text/image inline. key is "path:kind". */
  onEdit: (key: string, entry: OverrideEntry) => void;
  /** Real company variables (Entreprises tab). When set, the preview uses them
   *  instead of sample values and filters service-tag regions accordingly. */
  variables?: Record<string, string> | null;
  /** Internal link clicked in the preview → switch the active page (no navigation). */
  onNavigate?: (slug: string) => void;
  /** Reports the rendered document height so the canvas can size the device
   *  frame and apply zoom without an inner scrollbar. */
  onHeight?: (height: number) => void;
  /** Extra className merged onto the iframe (defaults to a bordered card). */
  className?: string;
  /** Simulated device viewport height (px). When set, every `Nvh` literal in
   *  the page (incl. `min-h-screen`/`h-screen`) is rewritten to px so a full-
   *  height hero can't feed the iframe height-reporter loop into infinity. */
  simViewportHeight?: number;
}

function resolveVars(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
}

function enterpriseTagsOf(vars: Record<string, string>): string[] {
  try {
    const parsed = JSON.parse(vars["__service_tags"] ?? "[]");
    return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
  } catch {
    return [];
  }
}

const EDIT_SCRIPT = `
(function(){
  var root = document.getElementById('cd-root');
  if(!root) return;
  // ISOLATION: the editor preview must never navigate (especially not to the CRM
  // origin via href="/"). Swallow every link/form navigation; for an internal
  // link, tell the parent to switch the active page instead.
  document.addEventListener('click', function(ev){
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if(!a) return;
    ev.preventDefault();
    var href = a.getAttribute('href') || '';
    if(href && href.charAt(0) === '/'){ parent.postMessage({source:'cd',kind:'nav',slug:(href.split('#')[0]||'/')},'*'); }
  }, true);
  document.addEventListener('submit', function(ev){ ev.preventDefault(); }, true);
  // Report the document height so the parent can size the device frame (the
  // canvas scrolls, never the iframe) and apply a precise zoom transform.
  function reportH(){ try{ var h=Math.max(document.documentElement.scrollHeight, document.body.scrollHeight); parent.postMessage({source:'cd',kind:'height',value:h},'*'); }catch(e){} }
  reportH(); setTimeout(reportH, 60); setTimeout(reportH, 350);
  window.addEventListener('load', reportH);
  if(window.ResizeObserver){ try{ new ResizeObserver(reportH).observe(document.body); }catch(e){} }
  var OV = window.__cdOverrides || {};
  function nodeAt(path){ var n=root; for(var i=0;i<path.length;i++){ var ch=Array.prototype.filter.call(n.childNodes,function(c){return c.nodeType===1;}); n=ch[path[i]]; if(!n) return null;} return n; }
  Object.keys(OV).forEach(function(key){ var e=OV[key]; var p=key.split(':')[0].split('.').map(Number); var el=nodeAt(p); if(!el) return; if(e.kind==='text') el.textContent=e.value; else if(e.kind==='image') el.setAttribute('src', e.value); else if(e.kind==='bg_image'){ el.style.backgroundImage='url("'+e.value+'")'; } });
  function pathOf(el){ var p=[]; while(el && el!==root){ var par=el.parentNode; if(!par) break; var ch=Array.prototype.filter.call(par.childNodes,function(c){return c.nodeType===1;}); p.unshift(Array.prototype.indexOf.call(ch, el)); el=par; } return p; }
  root.addEventListener('click', function(ev){
    var t = ev.target;
    if(!t || t===root) return;
    if(t.tagName==='IMG'){ ev.preventDefault(); ev.stopPropagation(); var url=window.prompt('URL de l\\'image', t.getAttribute('src')||''); if(url!=null){ t.setAttribute('src',url); parent.postMessage({source:'cd',kind:'image',path:pathOf(t),value:url},'*'); } return; }
    var hasEl = Array.prototype.some.call(t.childNodes,function(c){return c.nodeType===1;});
    if(!hasEl && (t.textContent||'').trim()){ ev.preventDefault(); ev.stopPropagation(); t.setAttribute('contenteditable','true'); t.style.outline='2px solid #5B9BD5'; t.focus(); }
  }, true);
  root.addEventListener('blur', function(ev){
    var t=ev.target;
    if(t && t.getAttribute && t.getAttribute('contenteditable')==='true'){ t.removeAttribute('contenteditable'); t.style.outline=''; parent.postMessage({source:'cd',kind:'text',path:pathOf(t),value:(t.textContent||'')},'*'); }
  }, true);
})();
`;

/** Faithful per-page preview with inline text/image editing. */
export function InlinePreview({ html, sharedCss, fontLinks, tweaks, overrides, onEdit, variables, onNavigate, onHeight, className, simViewportHeight }: Props) {
  const onEditRef = React.useRef(onEdit);
  onEditRef.current = onEdit;
  const onNavRef = React.useRef(onNavigate);
  onNavRef.current = onNavigate;
  const onHeightRef = React.useRef(onHeight);
  onHeightRef.current = onHeight;

  React.useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "cd") return;
      if (d.kind === "nav") { if (typeof d.slug === "string") onNavRef.current?.(d.slug); return; }
      if (d.kind === "height") { if (typeof d.value === "number") onHeightRef.current?.(d.value); return; }
      if (!Array.isArray(d.path)) return;
      const key = `${d.path.join(".")}:${d.kind}`;
      onEditRef.current(key, { kind: d.kind === "image" ? "image" : "text", value: String(d.value ?? "") });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const srcDoc = React.useMemo(() => {
    const rootVars = `:root{${Object.entries(tweaksToCssVars(tweaks)).map(([k, v]) => `${k}:${v}`).join(";")}}`;
    // Apply the tweak vars as an INLINE style on <html> (like the template's own
    // theme-apply.js). Inline custom-properties beat any `:root{}` the imported
    // design ships in sharedCss, so colours / fonts / corners actually update.
    const htmlStyle = tweaksInlineStyle(tweaks).replace(/'/g, "&#39;");
    const dataAttrs = tweaksDataAttrs(tweaks);
    const attrStr = Object.entries(dataAttrs).map(([k, v]) => `${k}="${v}"`).join(" ");
    const fonts = [tweaksFontLinkHref(tweaks), ...fontLinks].map((h) => `<link rel="stylesheet" href="${h}">`).join("");
    // Entreprises tab: resolve with the company's real variables + filter the
    // service-tag regions it doesn't have. Otherwise use sample values (all shown).
    let body = resolveVars(html, variables ?? SAMPLE_VARIABLES);
    if (variables && body.includes("data-service-tag")) {
      body = stripTaggedRegions(body, enterpriseTagsOf(variables));
    }
    const overridesJson = JSON.stringify(overrides).replace(/</g, "\\u003c");
    const extras = tweaksExtrasScript(tweaks);
    // Preview-only vh→px rewriter: a `100vh`/`min-h-screen` hero otherwise
    // resolves against the (growing) iframe height the canvas reports back,
    // looping to infinity. Converting to a fixed device height breaks the loop.
    const vhBlock = typeof simViewportHeight === "number" ? buildVhRewriteRuntime(simViewportHeight) : "";
    // sharedCss first, then rootVars — so even the stylesheet fallback wins over
    // the design's own :root defaults (the inline html style wins over both).
    return `<!doctype html><html ${attrStr} style='${htmlStyle}'><head><meta charset="utf-8">${fonts}<style>${sharedCss}\n${rootVars}\nbody{margin:0}[contenteditable]{cursor:text}</style>${vhBlock}</head><body><div id="cd-root">${body}</div><script>window.__cdOverrides=${overridesJson};</script><script>${CLAUDE_DESIGN_RUNTIME}</script>${extras ? `<script>${extras}</script>` : ""}<script>${EDIT_SCRIPT}</script></body></html>`;
  }, [html, sharedCss, fontLinks, tweaks, overrides, variables, simViewportHeight]);

  return (
    <iframe
      title="Aperçu"
      className={className ?? "h-full w-full rounded-lg border bg-white"}
      sandbox="allow-scripts allow-same-origin allow-modals"
      srcDoc={srcDoc}
    />
  );
}

export default InlinePreview;
