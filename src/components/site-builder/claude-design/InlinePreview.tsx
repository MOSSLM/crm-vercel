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
import { conditionServiceMarkup } from "@/lib/site-builder/claude-design/condition-service-markup";
import { hydrateReviews } from "@/lib/site-builder/claude-design/hydrate-reviews";
import { buildVhRewriteRuntime, buildViewportLockScript, convertVhToPx } from "@/lib/site-builder/preview-viewport";
import { SAMPLE_VARIABLES } from "./VariablesPanel";
import { ImagePickerField } from "@/components/site-builder/editors/ImagePickerField";
import { parseImageSet, serializeImageSet, type ImageSetCandidate } from "@/lib/site-builder/claude-design/image-set";
import type { MediaLibraryItemRanked } from "@/types";
import { X as XIcon, ArrowUp, ArrowDown, Sparkles } from "lucide-react";

export interface OverrideEntry {
  kind: "text" | "image" | "bg_image" | "image_set" | "remove";
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
  /** slug → service_tag for the site's service pages. When a company is being
   *  tested, links to a service the company lacks (nav / footer / expertise
   *  cards) are removed — mirroring how tagged pages are hidden. */
  serviceTagBySlug?: Record<string, string>;
  overrides: Record<string, OverrideEntry>;
  /** Called when the user edits text/image inline. key is "path:kind".
   *  Passing `null` as the entry deletes that override key. */
  onEdit: (key: string, entry: OverrideEntry | null) => void;
  /** Atomic multi-key override update (avoids React stale-closure when several
   *  keys change together, e.g. saving an image set clears the single-image
   *  keys on the same slot). `null` deletes a key. */
  onEditBatch?: (updates: Record<string, OverrideEntry | null>) => void;
  /** True on the site's home page — enables the multi-image "set" builder
   *  (fallbacks by service) in the image picker. Service pages don't need it
   *  (they are already hidden when the company lacks the service). */
  isHome?: boolean;
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
  // Normalise a tag the same way formatServiceTag does (strip accents, lower).
  function fmt(t){ return String(t||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim(); }
  // Pick the candidate best matching window.__enterpriseTags (mirrors pickCandidate):
  // most shared service tags win; else a universal ('all'/untagged) one; else the first.
  window.__cdPickCandidate = function(cands){
    if(!cands || !cands.length) return null;
    var tags = Array.isArray(window.__enterpriseTags) ? window.__enterpriseTags.map(fmt) : [];
    var comp = {}; tags.forEach(function(t){ if(t) comp[t]=1; });
    var best=null, bestScore=0;
    for(var i=0;i<cands.length;i++){
      var ct=(cands[i].tags||[]).map(fmt);
      var score=0; for(var j=0;j<ct.length;j++){ if(ct[j]!=='all' && comp[ct[j]]) score++; }
      if(score>bestScore){ bestScore=score; best=cands[i]; }
    }
    if(best && bestScore>0) return best;
    for(var k=0;k<cands.length;k++){ var t2=(cands[k].tags||[]).map(fmt); if(t2.length===0 || t2.indexOf('all')!==-1) return cands[k]; }
    return cands[0];
  };
  window.__cdApplyImageSet = function(el, value){
    if(!el) return;
    var cands=[]; try{ var p=JSON.parse(value); if(p && Array.isArray(p.candidates)) cands=p.candidates; }catch(e){}
    var chosen=window.__cdPickCandidate(cands);
    if(chosen && chosen.url) window.__cdApplyImg(el, chosen.url);
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
  // Apply image_set overrides LAST so a resolved set wins over any stale
  // single-image override left on the same slot.
  var keys = Object.keys(OV).sort(function(a,b){ var ai=OV[a].kind==='image_set'?1:0, bi=OV[b].kind==='image_set'?1:0; return ai-bi; });
  keys.forEach(function(key){ var e=OV[key]; var p=key.split(':')[0].split('.').map(Number); var el=nodeAt(p); if(!el) return; if(e.kind==='text') el.textContent=e.value; else if(e.kind==='image') window.__cdApplyImg(el, e.value); else if(e.kind==='bg_image') window.__cdApplyBg(el, e.value); else if(e.kind==='image_set') window.__cdApplyImageSet(el, e.value); else if(e.kind==='remove') el.style.setProperty('display','none','important'); });
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
  // A scrolling logo strip (marque-partenaire marquee) ships each logo TWICE:
  // the CSS loop translates the track by -50%, so a duplicate set is needed for a
  // seamless scroll. That means ONE visible logo maps to 2+ img slots, and the
  // operator otherwise has to upload the same file for each copy. linkedSlots
  // returns the sibling slots that mirror el so a single edit updates them all.
  // A twin is a sibling sharing el's exact class list -- but only when that class
  // carries a PER-ITEM token (e.g. b1) that is NOT on every sibling, so a plain
  // grid of identically-classed img is never synced by accident. Falls back to
  // positional halves inside a container that reads as a marquee track. Mirrors
  // findLinkedSlots in link-image-slots.ts (tested) -- keep the two in sync.
  function linkedSlots(el){
    var out=[];
    var par = el && el.parentElement; if(!par) return out;
    var kids = Array.prototype.filter.call(par.children, function(c){ return c.nodeType===1; });
    if(kids.length < 4) return out;
    var myTokens = (el.getAttribute('class')||'').split(/\\s+/).filter(Boolean);
    if(myTokens.length){
      var counts = {};
      kids.forEach(function(k){
        var seen = {};
        (k.getAttribute('class')||'').split(/\\s+/).forEach(function(tok){ if(tok && !seen[tok]){ seen[tok]=1; counts[tok]=(counts[tok]||0)+1; } });
      });
      var distinguishing = myTokens.some(function(tok){ return counts[tok] && counts[tok] < kids.length; });
      if(distinguishing){
        var myKey = myTokens.slice().sort().join(' ');
        kids.forEach(function(k){
          if(k===el) return;
          var kk = (k.getAttribute('class')||'').split(/\\s+/).filter(Boolean).sort().join(' ');
          if(kk===myKey) out.push(k);
        });
        if(out.length) return out;
      }
    }
    // Fallback: an even, doubled track (index i mirrors i + half) when the track
    // or its wrapper is clearly a marquee. Keeps us from touching normal grids.
    var ctx = (par.getAttribute('class')||'') + ' ' + ((par.parentElement && par.parentElement.getAttribute('class')) || '');
    if(/marquee|ticker|defil|scroll|track/i.test(ctx) && kids.length%2===0){
      var idx = Array.prototype.indexOf.call(kids, el);
      if(idx>=0){ var tw = kids[(idx + kids.length/2) % kids.length]; if(tw && tw!==el && tw.tagName===el.tagName) out.push(tw); }
    }
    return out;
  }
  root.addEventListener('click', function(ev){
    var t = ev.target;
    if(!t || t===root) return;
    // Image / placeholder zone → hand off to the parent's shared ImagePickerField
    // (URL / upload / library) instead of a bare prompt.
    var zone = imageZone(t);
    if(zone){ ev.preventDefault(); ev.stopPropagation(); var linkPaths = linkedSlots(zone.el).map(pathOf); parent.postMessage({source:'cd',kind:'image-request',path:pathOf(zone.el),imgKind:zone.kind,current:zone.current,linkPaths:linkPaths},'*'); return; }
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
    if(d.kind==='set-image-set' && Array.isArray(d.path)){ var el2=nodeAt(d.path); if(el2){ window.__cdApplyImageSet(el2, d.value); } }
  });

  // ---- Delete affordance for REPEATED items (cards, list entries, steps) ----
  // Hovering an element that is one of several same-tag siblings (a card in a
  // grid, an <li>, a solution step) shows a red × handle; clicking it hides the
  // element (persisted as a 'remove' override). We pick the innermost repeated
  // block big enough to be a real item, so inline repeats (icons, tags) and the
  // section itself are never offered.
  var delStyle = document.createElement('style');
  delStyle.textContent = '.cd-del-outline{outline:2px dashed rgba(220,45,45,.95)!important;outline-offset:-2px;}';
  document.head.appendChild(delStyle);
  var delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.setAttribute('aria-label', 'Supprimer cet élément');
  delBtn.title = 'Supprimer cet élément';
  delBtn.textContent = '×';
  delBtn.style.cssText = 'position:fixed;z-index:2147483647;display:none;width:22px;height:22px;line-height:20px;padding:0;margin:0;border:none;border-radius:50%;background:#dc2d2d;color:#fff;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);';
  document.body.appendChild(delBtn);
  var delTarget = null, lastNode = null;
  function boundary(tag){ return tag==='SECTION'||tag==='HEADER'||tag==='FOOTER'||tag==='NAV'||tag==='MAIN'||tag==='HTML'||tag==='BODY'||tag==='FORM'; }
  function deletableItem(node){
    var el = node;
    while(el && el!==root){
      var tag = el.tagName; if(boundary(tag)) break;
      var par = el.parentElement;
      if(par && el.offsetHeight>=48 && el.offsetWidth>=64){
        var same=0, ch=par.children;
        for(var i=0;i<ch.length;i++){ if(ch[i].tagName===tag){ same++; if(same>=2) break; } }
        if(same>=2) return el;
      }
      el = el.parentElement;
    }
    return null;
  }
  function clearTarget(){ if(delTarget){ delTarget.classList.remove('cd-del-outline'); delTarget=null; } delBtn.style.display='none'; lastNode=null; }
  function setTarget(el){
    if(el===delTarget) return;
    if(delTarget) delTarget.classList.remove('cd-del-outline');
    delTarget = el;
    if(!el){ delBtn.style.display='none'; return; }
    el.classList.add('cd-del-outline');
    var r = el.getBoundingClientRect();
    delBtn.style.left = Math.max(2, r.right-24) + 'px';
    delBtn.style.top = Math.max(2, r.top+4) + 'px';
    delBtn.style.display = 'block';
  }
  document.addEventListener('mousemove', function(ev){
    if(ev.target===delBtn) return;
    if(ev.target===lastNode) return; lastNode=ev.target;
    if(ev.target && ev.target.getAttribute && ev.target.getAttribute('contenteditable')==='true'){ clearTarget(); return; }
    setTarget(deletableItem(ev.target));
  }, true);
  document.addEventListener('scroll', clearTarget, true);
  if(document.documentElement) document.documentElement.addEventListener('mouseleave', clearTarget);
  delBtn.addEventListener('click', function(ev){
    ev.preventDefault(); ev.stopPropagation();
    var el = delTarget; if(!el) return;
    if(!window.confirm('Supprimer cet élément ? (réversible en rechargeant depuis Claude, sinon il reste masqué)')) return;
    var p = pathOf(el);
    lastNode = null;
    clearTarget();
    el.style.setProperty('display','none','important');
    parent.postMessage({source:'cd',kind:'remove',path:p},'*');
  });
})();
`;

/** Faithful per-page preview with inline text/image editing. */
export function InlinePreview({ html, sharedCss, fontLinks, tweaks, js, pageJs, scriptLinks, siteId, serviceTagBySlug, overrides, onEdit, onEditBatch, isHome, variables, onNavigate, onHeight, className, simViewportHeight }: Props) {
  const onEditRef = React.useRef(onEdit);
  onEditRef.current = onEdit;
  const onEditBatchRef = React.useRef(onEditBatch);
  onEditBatchRef.current = onEditBatch;
  const overridesRef = React.useRef(overrides);
  overridesRef.current = overrides;
  const isHomeRef = React.useRef(isHome);
  isHomeRef.current = isHome;
  // Apply a set of override changes atomically (falls back to per-key onEdit).
  const applyUpdates = React.useCallback((updates: Record<string, OverrideEntry | null>) => {
    if (onEditBatchRef.current) { onEditBatchRef.current(updates); return; }
    for (const [k, v] of Object.entries(updates)) onEditRef.current(k, v);
  }, []);
  const onNavRef = React.useRef(onNavigate);
  onNavRef.current = onNavigate;
  const onHeightRef = React.useRef(onHeight);
  onHeightRef.current = onHeight;
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  // Open when an image/placeholder zone in the preview is clicked → the shared
  // ImagePickerField. `kind` is "image" for <img>, "bg_image" for placeholders.
  // On the home page the picker can switch to "set" mode to build a list of
  // fallback candidates tagged by service.
  const [picker, setPicker] = React.useState<{
    path: number[];
    /** Sibling slots that mirror `path` — the duplicate copies a scrolling logo
     *  strip needs. An edit is written to `path` and every one of these so the
     *  operator uploads a logo once, not once per copy. */
    linkPaths: number[][];
    current: string;
    kind: "image" | "bg_image";
    mode: "single" | "set";
    candidates: ImageSetCandidate[];
  } | null>(null);

  React.useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "cd") return;
      if (d.kind === "nav") { if (typeof d.slug === "string") onNavRef.current?.(d.slug); return; }
      if (d.kind === "height") { if (typeof d.value === "number") onHeightRef.current?.(d.value); return; }
      if (d.kind === "image-request") {
        if (!Array.isArray(d.path)) return;
        const pathKey = d.path.join(".");
        const existingSet = overridesRef.current[`${pathKey}:image_set`];
        const candidates = existingSet?.value ? parseImageSet(existingSet.value).candidates : [];
        // Open in set mode when the slot already holds a set (any page), or on
        // the home page as soon as the operator wants multiple fallbacks.
        const mode: "single" | "set" = candidates.length > 0 ? "set" : "single";
        const linkPaths: number[][] = Array.isArray(d.linkPaths)
          ? d.linkPaths.filter((p: unknown): p is number[] => Array.isArray(p) && p.every((n) => typeof n === "number"))
          : [];
        setPicker({
          path: d.path,
          linkPaths,
          current: String(d.current ?? ""),
          kind: d.imgKind === "bg_image" ? "bg_image" : "image",
          mode,
          candidates,
        });
        return;
      }
      if (d.kind === "remove") { if (Array.isArray(d.path)) onEditRef.current(`${d.path.join(".")}:remove`, { kind: "remove", value: "" }); return; }
      if (!Array.isArray(d.path)) return;
      const key = `${d.path.join(".")}:${d.kind}`;
      onEditRef.current(key, { kind: d.kind === "image" ? "image" : "text", value: String(d.value ?? "") });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Single image: set the slot's :image/:bg_image override and clear any set.
  // The edit is mirrored to every linked (duplicate) slot so a logo picked once
  // in a scrolling strip fills all of its copies.
  const handlePick = (url: string) => {
    if (!picker) return;
    const paths = [picker.path, ...picker.linkPaths];
    const updates: Record<string, OverrideEntry | null> = {};
    for (const p of paths) {
      const pathKey = p.join(".");
      updates[`${pathKey}:${picker.kind}`] = { kind: picker.kind, value: url };
      updates[`${pathKey}:image_set`] = null;
    }
    applyUpdates(updates);
    // Live-update the node(s) in the iframe without re-rendering the whole srcDoc.
    for (const p of paths) {
      iframeRef.current?.contentWindow?.postMessage({ source: "cd-parent", kind: "set-image", path: p, imgKind: picker.kind, value: url }, "*");
    }
    setPicker(null);
  };

  // Add a picked library image (with its service tags) to the current set.
  const addCandidate = (item: MediaLibraryItemRanked) => {
    setPicker((p) => {
      if (!p) return p;
      if (p.candidates.some((c) => c.url === item.public_url)) return p; // no dupes
      const cand: ImageSetCandidate = {
        url: item.public_url,
        tags: Array.isArray(item.service_tags) ? item.service_tags : [],
        alt: item.alt_text ?? undefined,
      };
      return { ...p, candidates: [...p.candidates, cand] };
    });
  };

  const removeCandidate = (i: number) =>
    setPicker((p) => (p ? { ...p, candidates: p.candidates.filter((_, idx) => idx !== i) } : p));

  const moveCandidate = (i: number, dir: -1 | 1) =>
    setPicker((p) => {
      if (!p) return p;
      const j = i + dir;
      if (j < 0 || j >= p.candidates.length) return p;
      const next = [...p.candidates];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...p, candidates: next };
    });

  // Save the set: write the :image_set override, clear the single-image keys.
  // Mirrored to every linked (duplicate) slot, exactly like a single image.
  const saveSet = () => {
    if (!picker) return;
    const paths = [picker.path, ...picker.linkPaths];
    const updates: Record<string, OverrideEntry | null> = {};
    if (picker.candidates.length === 0) {
      // Empty set → drop it entirely (revert to placeholder).
      for (const p of paths) updates[`${p.join(".")}:image_set`] = null;
      applyUpdates(updates);
    } else {
      const value = serializeImageSet(picker.candidates);
      for (const p of paths) {
        const pathKey = p.join(".");
        updates[`${pathKey}:image_set`] = { kind: "image_set", value };
        updates[`${pathKey}:image`] = null;
        updates[`${pathKey}:bg_image`] = null;
      }
      applyUpdates(updates);
      for (const p of paths) {
        iframeRef.current?.contentWindow?.postMessage({ source: "cd-parent", kind: "set-image-set", path: p, value }, "*");
      }
    }
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
    if (variables) {
      body = conditionServiceMarkup(body, serviceTagBySlug, enterpriseTagsOf(variables));
      body = hydrateReviews(body, variables["__reviews"]);
    }
    const overridesJson = JSON.stringify(overrides).replace(/</g, "\\u003c");
    // Enterprise tags drive image-set resolution in the iframe. Empty when
    // previewing with sample data → a set falls back to its first candidate.
    const enterpriseTagsJson = JSON.stringify(variables ? enterpriseTagsOf(variables) : []).replace(/</g, "\\u003c");
    const extras = tweaksExtrasScript(tweaks);
    // Preview-only vh→px rewriter: a `100vh`/`100dvh`/`min-h-screen` hero
    // otherwise resolves against the (growing) iframe height the canvas reports
    // back, looping to infinity (runaway scroll + visible shake). We do it in
    // THREE layers: (1) statically rewrite the injected stylesheet here so no `vh`
    // literal ever reaches the iframe, (2) the runtime below catches inline
    // styles + dynamically-added rules, and (3) the viewport-lock script pins the
    // iframe's JS-visible height (window.innerHeight/visualViewport) so the
    // design's OWN JS (the `--vh` fix, GSAP, …) can't re-inflate a full-height
    // hero from the growing frame height. Layers 1-2 are CSS-only and can't see a
    // height JS computes at runtime; layer 3 covers exactly that. Editor-only.
    const vhBlock = typeof simViewportHeight === "number" ? buildVhRewriteRuntime(simViewportHeight) : "";
    const viewportLock = typeof simViewportHeight === "number" ? buildViewportLockScript(simViewportHeight) : "";
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
    return `<!doctype html><html ${attrStr} style='${htmlStyle}'><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${viewportLock}${fonts}<style>${cssForIframe}\n${rootVars}\nbody{margin:0}[contenteditable]{cursor:text}</style>${vhBlock}</head><body><div id="cd-root">${body}</div><script>window.__cdOverrides=${overridesJson};window.__enterpriseTags=${enterpriseTagsJson};</script><script>${CD_HELPERS}</script><script>${OVERRIDES_APPLY}</script>${libTags}${bootTag}${extras ? `<script>${extras}</script>` : ""}<script>${EDIT_SCRIPT}</script></body></html>`;
  }, [html, sharedCss, fontLinks, tweaks, js, pageJs, scriptLinks, serviceTagBySlug, overrides, variables, simViewportHeight]);

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
          <div
            className={`w-full ${picker.mode === "set" ? "max-w-lg" : "max-w-md"} rounded-xl bg-white p-4 shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-900">
                {picker.mode === "set" ? "Set d’images (fallback par service)" : "Changer l’image"}
              </div>
              {isHome && (
                <div className="flex rounded-md border border-gray-200 p-0.5 text-[11px]">
                  <button
                    className={`rounded px-2 py-0.5 ${picker.mode === "single" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"}`}
                    onClick={() => setPicker((p) => (p ? { ...p, mode: "single" } : p))}
                  >
                    Une image
                  </button>
                  <button
                    className={`rounded px-2 py-0.5 ${picker.mode === "set" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"}`}
                    onClick={() => setPicker((p) => (p ? { ...p, mode: "set" } : p))}
                  >
                    Plusieurs
                  </button>
                </div>
              )}
            </div>

            {picker.mode === "single" ? (
              <ImagePickerField
                setting={{ type: "image_picker", id: "cd-img", label: "" }}
                value={picker.current}
                onChange={handlePick}
                siteId={siteId}
                light
              />
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] leading-snug text-gray-500">
                  Ajoute plusieurs images. Au déploiement, seule celle qui correspond aux
                  services de l’entreprise s’affiche (à défaut : une image universelle, sinon la première).
                </p>

                {picker.candidates.length > 0 && (
                  <div className="space-y-1.5">
                    {picker.candidates.map((c, i) => (
                      <div key={`${c.url}-${i}`} className="flex items-center gap-2 rounded-lg border border-gray-200 p-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.url} alt="" className="h-10 w-14 flex-none rounded object-cover" />
                        <div className="min-w-0 flex-1">
                          {c.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {c.tags.map((t) => (
                                <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                                  {t === "all" && <Sparkles size={8} className="text-amber-500" />}
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] italic text-gray-400">Sans tag (universelle)</span>
                          )}
                        </div>
                        <div className="flex flex-none items-center gap-0.5 text-gray-400">
                          <button title="Monter" className="rounded p-1 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" disabled={i === 0} onClick={() => moveCandidate(i, -1)}>
                            <ArrowUp size={12} />
                          </button>
                          <button title="Descendre" className="rounded p-1 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30" disabled={i === picker.candidates.length - 1} onClick={() => moveCandidate(i, 1)}>
                            <ArrowDown size={12} />
                          </button>
                          <button title="Retirer" className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeCandidate(i)}>
                            <XIcon size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <div className="mb-1 text-[11px] font-medium text-gray-600">Ajouter une image</div>
                  <ImagePickerField
                    setting={{ type: "image_picker", id: "cd-img-set", label: "" }}
                    value=""
                    onChange={() => {}}
                    onPickItem={addCandidate}
                    siteId={siteId}
                    light
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setPicker(null)}>Annuler</button>
                  <button
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                    onClick={saveSet}
                  >
                    {picker.candidates.length === 0 ? "Retirer le set" : `Enregistrer le set (${picker.candidates.length})`}
                  </button>
                </div>
              </div>
            )}

            {picker.mode === "single" && (
              <div className="mt-3 text-right">
                <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setPicker(null)}>Fermer</button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default InlinePreview;
