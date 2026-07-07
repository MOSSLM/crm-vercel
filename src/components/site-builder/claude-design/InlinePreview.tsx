"use client";

import React from "react";
import { createPortal } from "react-dom";
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
import { buildVhRewriteRuntime, convertVhToPx } from "@/lib/site-builder/preview-viewport";
import { SAMPLE_VARIABLES } from "./VariablesPanel";
import { ImagePickerField } from "@/components/site-builder/editors/ImagePickerField";

export interface OverrideEntry {
  kind: "text" | "image" | "bg_image";
  value: string;
}

interface Props {
  html: string;
  sharedCss: string;
  fontLinks: string[];
  tweaks: Tweaks;
  /** The design's shared runtime JS (site.js) — run in the preview iframe so
   *  animations/interactions match the deployed site. */
  js?: string;
  /** This page's own runtime JS (non-shared scripts). */
  pageJs?: string;
  /** Remote runtime `<script src>` libs (leaflet/gsap/…) to load in the iframe. */
  scriptLinks?: string[];
  /** Site id — enables the shared ImagePickerField (upload + library tabs). */
  siteId: string;
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

/** Shared image appliers used by both the overrides replay and live edits.
 *  __cdApplyImg: <img> → src; anything else → background image.
 *  __cdApplyBg: sets a cover/centered background-image, and for Claude's `.ph`
 *  placeholder containers also marks them filled (adds `has-img`, hides the
 *  `.ph-label` text) so an empty slot turns into a clean image. */
const CD_HELPERS = `
(function(){
  window.__cdApplyBg = function(el, url){
    if(!el) return;
    el.style.backgroundImage = url ? 'url("' + String(url).replace(/"/g,'\\\\"') + '")' : 'none';
    if(url){ el.style.backgroundSize='cover'; el.style.backgroundPosition='center'; el.style.backgroundRepeat='no-repeat'; }
    var cls = el.getAttribute('class') || '';
    if(/(^|\\s)ph(\\s|$)/.test(cls) && url){
      if(!/(^|\\s)has-img(\\s|$)/.test(cls)) el.setAttribute('class', (cls + ' has-img').trim());
      var lbl = el.querySelector ? el.querySelector('.ph-label') : null; if(lbl) lbl.style.display='none';
    }
  };
  window.__cdApplyImg = function(el, url){
    if(!el) return;
    if(el.tagName==='IMG') el.setAttribute('src', url); else window.__cdApplyBg(el, url);
  };
})();
`;

/** Applies the saved __cdOverrides onto #cd-root. Runs BEFORE the design's own
 *  JS so positional paths aren't shifted by DOM the design injects (leaflet
 *  clones nodes, menus inject markup). Kept separate from EDIT_SCRIPT for that
 *  ordering. */
const OVERRIDES_APPLY = `
(function(){
  var root = document.getElementById('cd-root');
  if(!root) return;
  var OV = window.__cdOverrides || {};
  function nodeAt(path){ var n=root; for(var i=0;i<path.length;i++){ var ch=Array.prototype.filter.call(n.childNodes,function(c){return c.nodeType===1;}); n=ch[path[i]]; if(!n) return null;} return n; }
  Object.keys(OV).forEach(function(key){ var e=OV[key]; var p=key.split(':')[0].split('.').map(Number); var el=nodeAt(p); if(!el) return; if(e.kind==='text') el.textContent=e.value; else if(e.kind==='image') window.__cdApplyImg(el, e.value); else if(e.kind==='bg_image') window.__cdApplyBg(el, e.value); });
})();
`;

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
  function nodeAt(path){ var n=root; for(var i=0;i<path.length;i++){ var ch=Array.prototype.filter.call(n.childNodes,function(c){return c.nodeType===1;}); n=ch[path[i]]; if(!n) return null;} return n; }
  function pathOf(el){ var p=[]; while(el && el!==root){ var par=el.parentNode; if(!par) break; var ch=Array.prototype.filter.call(par.childNodes,function(c){return c.nodeType===1;}); p.unshift(Array.prototype.indexOf.call(ch, el)); el=par; } return p; }
  // An "image zone" is an img, a Claude .ph placeholder, or an element whose
  // own inline style carries a design image variable (--img / --bg). We match the
  // element's OWN style (not an ancestor's) so clicking text inside a bg section
  // still edits the text.
  function imageZone(t){
    if(!t || t===root) return null;
    if(t.tagName==='IMG') return { el:t, kind:'image', current:(t.getAttribute('src')||'') };
    var ph = t.closest ? t.closest('.ph') : null;
    if(ph && root.contains(ph)) return { el:ph, kind:'bg_image', current:'' };
    var st = t.getAttribute ? (t.getAttribute('style')||'') : '';
    if(st.indexOf('--img')!==-1 || st.indexOf('--bg')!==-1) return { el:t, kind:'bg_image', current:'' };
    return null;
  }
  root.addEventListener('click', function(ev){
    var t = ev.target;
    if(!t || t===root) return;
    // Image / placeholder zone → hand off to the parent's shared ImagePickerField
    // (URL / upload / library) instead of a bare prompt.
    var zone = imageZone(t);
    if(zone){ ev.preventDefault(); ev.stopPropagation(); parent.postMessage({source:'cd',kind:'image-request',path:pathOf(zone.el),imgKind:zone.kind,current:zone.current},'*'); return; }
    var hasEl = Array.prototype.some.call(t.childNodes,function(c){return c.nodeType===1;});
    if(!hasEl && (t.textContent||'').trim()){ ev.preventDefault(); ev.stopPropagation(); t.setAttribute('contenteditable','true'); t.style.outline='2px solid #5B9BD5'; t.focus(); }
  }, true);
  root.addEventListener('blur', function(ev){
    var t=ev.target;
    if(t && t.getAttribute && t.getAttribute('contenteditable')==='true'){ t.removeAttribute('contenteditable'); t.style.outline=''; parent.postMessage({source:'cd',kind:'text',path:pathOf(t),value:(t.textContent||'')},'*'); }
  }, true);
  // Parent → iframe: apply an image the user picked in ImagePickerField.
  window.addEventListener('message', function(ev){
    var d = ev.data; if(!d || d.source!=='cd-parent') return;
    if(d.kind==='set-image' && Array.isArray(d.path)){ var el=nodeAt(d.path); if(el){ if(d.imgKind==='bg_image') window.__cdApplyBg(el, d.value); else window.__cdApplyImg(el, d.value); } }
  });
})();
`;

/** Faithful per-page preview with inline text/image editing. */
export function InlinePreview({ html, sharedCss, fontLinks, tweaks, js, pageJs, scriptLinks, siteId, overrides, onEdit, variables, onNavigate, onHeight, className, simViewportHeight }: Props) {
  const onEditRef = React.useRef(onEdit);
  onEditRef.current = onEdit;
  const onNavRef = React.useRef(onNavigate);
  onNavRef.current = onNavigate;
  const onHeightRef = React.useRef(onHeight);
  onHeightRef.current = onHeight;
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  // Open when an image/placeholder zone in the preview is clicked → the shared
  // ImagePickerField. `kind` is "image" for <img>, "bg_image" for placeholders.
  const [picker, setPicker] = React.useState<{ path: number[]; current: string; kind: "image" | "bg_image" } | null>(null);

  React.useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "cd") return;
      if (d.kind === "nav") { if (typeof d.slug === "string") onNavRef.current?.(d.slug); return; }
      if (d.kind === "height") { if (typeof d.value === "number") onHeightRef.current?.(d.value); return; }
      if (d.kind === "image-request") { if (Array.isArray(d.path)) setPicker({ path: d.path, current: String(d.current ?? ""), kind: d.imgKind === "bg_image" ? "bg_image" : "image" }); return; }
      if (!Array.isArray(d.path)) return;
      const key = `${d.path.join(".")}:${d.kind}`;
      onEditRef.current(key, { kind: d.kind === "image" ? "image" : "text", value: String(d.value ?? "") });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handlePick = (url: string) => {
    if (!picker) return;
    const key = `${picker.path.join(".")}:${picker.kind}`;
    onEditRef.current(key, { kind: picker.kind, value: url });
    // Live-update the node in the iframe without re-rendering the whole srcDoc.
    iframeRef.current?.contentWindow?.postMessage({ source: "cd-parent", kind: "set-image", path: picker.path, imgKind: picker.kind, value: url }, "*");
    setPicker(null);
  };

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
    // Preview-only vh→px rewriter: a `100vh`/`100dvh`/`min-h-screen` hero
    // otherwise resolves against the (growing) iframe height the canvas reports
    // back, looping to infinity (runaway scroll + visible shake). We do it in
    // TWO layers: (1) statically rewrite the injected stylesheet here so no `vh`
    // literal ever reaches the iframe, and (2) the runtime below catches inline
    // styles + dynamically-added rules.
    const vhBlock = typeof simViewportHeight === "number" ? buildVhRewriteRuntime(simViewportHeight) : "";
    const cssForIframe = typeof simViewportHeight === "number" ? convertVhToPx(sharedCss, simViewportHeight) : sharedCss;
    // The design's own runtime JS (site.js + this page's JS). Run it so animations
    // match the deployed site; fall back to the trusted runtime when absent.
    const designJs = [js ?? "", pageJs ?? ""].filter(Boolean).join("\n;\n");
    const libTags = (scriptLinks ?? []).map((s) => `<script src="${s}"></script>`).join("");
    const bootTag = designJs ? `<script>${designJs}</script>` : `<script>${CLAUDE_DESIGN_RUNTIME}</script>`;
    // Order: helpers, then apply overrides FIRST (before the design JS shifts
    // positional paths), then remote libs, then design JS, then per-page tweak
    // extras, then the editor's own interaction script.
    // cssForIframe first (vh already px), then rootVars — so even the stylesheet
    // fallback wins over the design's own :root defaults (inline html wins both).
    return `<!doctype html><html ${attrStr} style='${htmlStyle}'><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${fonts}<style>${cssForIframe}\n${rootVars}\nbody{margin:0}[contenteditable]{cursor:text}</style>${vhBlock}</head><body><div id="cd-root">${body}</div><script>window.__cdOverrides=${overridesJson};</script><script>${CD_HELPERS}</script><script>${OVERRIDES_APPLY}</script>${libTags}${bootTag}${extras ? `<script>${extras}</script>` : ""}<script>${EDIT_SCRIPT}</script></body></html>`;
  }, [html, sharedCss, fontLinks, tweaks, js, pageJs, scriptLinks, overrides, variables, simViewportHeight]);

  return (
    <>
      <iframe
        ref={iframeRef}
        title="Aperçu"
        className={className ?? "h-full w-full rounded-lg border bg-white"}
        sandbox="allow-scripts allow-same-origin allow-modals"
        srcDoc={srcDoc}
      />
      {/* Portalled to <body> so it escapes the canvas's scaled/transformed frame
          (a `fixed` child of a `transform`ed ancestor is scaled + clipped). */}
      {picker && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPicker(null)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-sm font-medium text-gray-900">Changer l’image</div>
            <ImagePickerField
              setting={{ type: "image_picker", id: "cd-img", label: "" }}
              value={picker.current}
              onChange={handlePick}
              siteId={siteId}
              light
            />
            <div className="mt-3 text-right">
              <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setPicker(null)}>Fermer</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default InlinePreview;
