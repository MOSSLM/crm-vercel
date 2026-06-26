"use client";

import React from "react";
import {
  tweaksToCssVars,
  tweaksDataAttrs,
  tweaksFontLinkHref,
  tweaksExtrasScript,
  type Tweaks,
} from "@/lib/site-builder/claude-design/apply-tweaks";
import { CLAUDE_DESIGN_RUNTIME } from "@/lib/site-builder/claude-design/runtime";
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
}

function resolveSampleVars(html: string): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => SAMPLE_VARIABLES[k] ?? "");
}

const EDIT_SCRIPT = `
(function(){
  var root = document.getElementById('cd-root');
  if(!root) return;
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
export function InlinePreview({ html, sharedCss, fontLinks, tweaks, overrides, onEdit }: Props) {
  const onEditRef = React.useRef(onEdit);
  onEditRef.current = onEdit;

  React.useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "cd" || !Array.isArray(d.path)) return;
      const key = `${d.path.join(".")}:${d.kind}`;
      onEditRef.current(key, { kind: d.kind === "image" ? "image" : "text", value: String(d.value ?? "") });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const srcDoc = React.useMemo(() => {
    const rootVars = `:root{${Object.entries(tweaksToCssVars(tweaks)).map(([k, v]) => `${k}:${v}`).join(";")}}`;
    const dataAttrs = tweaksDataAttrs(tweaks);
    const attrStr = Object.entries(dataAttrs).map(([k, v]) => `${k}="${v}"`).join(" ");
    const fonts = [tweaksFontLinkHref(tweaks), ...fontLinks].map((h) => `<link rel="stylesheet" href="${h}">`).join("");
    const body = resolveSampleVars(html);
    const overridesJson = JSON.stringify(overrides).replace(/</g, "\\u003c");
    const extras = tweaksExtrasScript(tweaks);
    return `<!doctype html><html ${attrStr}><head><meta charset="utf-8">${fonts}<style>${rootVars}\n${sharedCss}\nbody{margin:0}[contenteditable]{cursor:text}</style></head><body><div id="cd-root">${body}</div><script>window.__cdOverrides=${overridesJson};</script><script>${CLAUDE_DESIGN_RUNTIME}</script>${extras ? `<script>${extras}</script>` : ""}<script>${EDIT_SCRIPT}</script></body></html>`;
  }, [html, sharedCss, fontLinks, tweaks, overrides]);

  return (
    <iframe
      title="Aperçu"
      className="h-full w-full rounded-lg border bg-white"
      sandbox="allow-scripts allow-same-origin allow-modals"
      srcDoc={srcDoc}
    />
  );
}

export default InlinePreview;
