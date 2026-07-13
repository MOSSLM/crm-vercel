// AUTO-PORTED from the SAMA "Builder Designs Claude" mockup. Do not hand-edit the
// rule bodies; tweak via the .cd-scope variables above if you need to retheme.
// Loaded as a <style> tag by <ClaudeDesignTheme/> so the static cd-*/cs-* class
// names survive (CSS Modules would rename them and break the preview iframe).

export const CLAUDE_DESIGN_THEME_CSS = String.raw`
/* ============================================================================
   Claude Design builder — scoped visual theme (ported from the SAMA mockup).
   All builder chrome lives under .cd-scope; variables are local so they never
   leak into the surrounding CRM (shadcn) styles. Geist / Geist Mono /
   Instrument Serif are already loaded globally by app/layout.tsx.
   ========================================================================== */
.cd-scope{
  --bg:#FBFAF7; --bg-2:#F4F2EC; --bg-3:#ECE9E1;
  --surface:#FFFFFF; --surface-2:#F8F6F1;
  --hover:rgba(20,18,14,.04); --hover-2:rgba(20,18,14,.07);
  --cd-border:rgba(20,18,14,.08); --border-2:rgba(20,18,14,.14); --border-strong:rgba(20,18,14,.22);
  --text:#14120E; --text-2:#5C5953; --text-3:#8A877F; --text-4:#B5B2AA;
  --cd-accent:#E2552B; --accent-2:#C73E16; --accent-tint:rgba(226,85,43,.10); --accent-tint-2:rgba(226,85,43,.18);
  --ok:#1F8A5B; --ok-tint:rgba(31,138,91,.10);
  --warn:#C8881F; --warn-tint:rgba(200,136,31,.14);
  --danger:#B5322F;
  --info:#2A6FDB; --info-tint:rgba(42,111,219,.10);
  --magic:#7A5AE0; --magic-tint:rgba(122,90,224,.10);
  --shadow-1:0 1px 0 rgba(20,18,14,.04),0 1px 2px rgba(20,18,14,.04);
  --shadow-2:0 1px 0 rgba(20,18,14,.04),0 4px 12px rgba(20,18,14,.06),0 12px 32px rgba(20,18,14,.05);
  --shadow-pop:0 1px 0 rgba(20,18,14,.04),0 8px 24px rgba(20,18,14,.10),0 24px 64px rgba(20,18,14,.10);
  --font-ui:"Geist",ui-sans-serif,system-ui,-apple-system,sans-serif;
  --font-mono:"Geist Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --font-serif:"Instrument Serif","Times New Roman",serif;
  font-family:var(--font-ui);font-size:13px;line-height:1.45;color:var(--text);
  -webkit-font-smoothing:antialiased;font-feature-settings:"ss01","cv11";
}
.cd-scope *{box-sizing:border-box;}
.cd-scope button{font-family:inherit;cursor:pointer;}
.cd-scope :is(input,textarea,select){font-family:inherit;color:inherit;}
.cd-scope ::selection{background:var(--accent-tint-2);}
.cd-scope code{font-family:var(--font-mono);}
.cd-scope ::-webkit-scrollbar{width:10px;height:10px;}
.cd-scope ::-webkit-scrollbar-thumb{background:rgba(20,18,14,.14);border-radius:8px;border:2px solid transparent;background-clip:content-box;}
.cd-scope .cd-serif{font-family:var(--font-serif);font-weight:400;}
.cd-scope .cd-grow{flex:1;min-width:0;}
.cd-scope .ico{width:14px;height:14px;flex-shrink:0;stroke-width:1.6;}
.cd-scope .ico-xs{width:10px;height:10px;stroke-width:1.7;flex-shrink:0;}
.cd-scope .ico-sm{width:12px;height:12px;stroke-width:1.6;flex-shrink:0;}
.cd-scope .ico-lg{width:16px;height:16px;stroke-width:1.6;flex-shrink:0;}
.cd-scope .ico-xl{width:22px;height:22px;stroke-width:1.5;flex-shrink:0;}

/* buttons */
.cd-btn{appearance:none;border:1px solid transparent;background:transparent;height:30px;padding:0 12px;font:inherit;font-size:12.5px;font-weight:500;color:var(--text);border-radius:7px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;letter-spacing:-.005em;}
.cd-btn:hover{background:var(--hover);}
.cd-btn.ghost{color:var(--text-2);}
.cd-btn.outline{border-color:var(--border-2);background:var(--surface);}
.cd-btn.outline:hover{background:var(--surface-2);}
.cd-btn.accent{background:var(--cd-accent);color:#fff;}
.cd-btn.accent:hover{background:var(--accent-2);}
.cd-btn.disabled{opacity:.5;pointer-events:none;}
.cd-icon-btn{appearance:none;border:0;background:transparent;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text-3);}
.cd-icon-btn:hover{background:var(--hover);color:var(--text);}
.cd-mini-btn{appearance:none;border:1px solid var(--border-2);background:var(--surface);height:24px;padding:0 8px;border-radius:6px;font:inherit;font-size:11px;font-weight:500;color:var(--text-2);display:inline-flex;align-items:center;gap:4px;}
.cd-mini-btn:hover{background:var(--surface-2);color:var(--text);}

/* ── root shell ── */
.cd-root{display:grid;grid-template-columns:54px 1fr;height:100vh;overflow:hidden;}
.cd-main{min-width:0;overflow:hidden;background:var(--bg);display:flex;flex-direction:column;}
.cd-rail{background:#14120E;display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:4px;}
.cd-brand{width:34px;height:34px;background:var(--cd-accent);color:#fff;border:0;border-radius:9px;font-family:var(--font-mono);font-weight:600;font-size:14px;margin-bottom:6px;}
.cd-rail-sep{width:22px;height:1px;background:rgba(255,255,255,.08);margin:4px 0;}
.cd-rail-btn{width:38px;height:38px;border:0;background:transparent;border-radius:9px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.45);position:relative;}
.cd-rail-btn:hover{background:rgba(255,255,255,.06);color:#fff;}
.cd-rail-btn.active{background:rgba(255,255,255,.08);color:#fff;}
.cd-rail-btn.active::before{content:"";position:absolute;left:-10px;top:50%;transform:translateY(-50%);width:3px;height:22px;background:var(--cd-accent);border-radius:0 3px 3px 0;}
.cd-rail .grow{flex:1;}
.cd-rail-av{width:30px;height:30px;border-radius:50%;background:var(--cd-accent);color:#fff;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;}

.cd-crumbs{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-2);min-width:0;}
.cd-crumbs .cur{color:var(--text);font-weight:500;}
.cd-crumbs .sep{color:var(--text-4);}

/* ── HUB ── */
.cd-hub{flex:1;display:flex;flex-direction:column;min-height:0;}
.cd-hub-top{height:52px;flex:0 0 52px;display:flex;align-items:center;gap:10px;padding:0 22px;border-bottom:1px solid var(--cd-border);background:var(--bg);}
.cd-hub-scroll{flex:1;overflow:auto;padding:34px 48px 60px;}
.cd-hub-head{display:flex;align-items:flex-end;justify-content:space-between;gap:32px;margin-bottom:30px;}
.cd-hub-kicker{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-3);margin-bottom:8px;}
.cd-hub-head h1{font-size:42px;margin:0;letter-spacing:-.01em;line-height:1;}
.cd-hub-head h1 em{font-style:italic;color:var(--cd-accent);}
.cd-hub-head p{font-size:13.5px;color:var(--text-3);margin:12px 0 0;max-width:460px;line-height:1.55;}
.cd-hub-head p code{background:var(--bg-2);padding:1px 6px;border-radius:4px;font-size:11.5px;color:var(--text-2);}
.cd-import-tile{flex-shrink:0;width:200px;height:128px;border:1.5px dashed var(--border-strong);background:var(--surface);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--text-2);}
.cd-import-tile:hover{border-color:var(--cd-accent);background:var(--accent-tint);color:var(--accent-2);}
.cd-import-tile-ic{width:42px;height:42px;border-radius:11px;background:var(--cd-accent);color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:8px;}
.cd-import-tile b{font-size:13.5px;font-weight:600;}
.cd-import-tile span{font-size:11px;color:var(--text-3);}
.cd-import-tile:hover span{color:var(--accent-2);}
.cd-hub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;}
.cd-design-card{appearance:none;border:1px solid var(--cd-border);background:var(--surface);border-radius:14px;overflow:hidden;text-align:left;box-shadow:var(--shadow-1);transition:box-shadow .12s,border-color .12s,transform .12s;}
.cd-design-card:hover{box-shadow:var(--shadow-2);border-color:var(--border-2);transform:translateY(-2px);}
.cd-design-thumb{height:150px;position:relative;background:linear-gradient(160deg,var(--surface-2),var(--bg-2));border-bottom:1px solid var(--cd-border);padding:14px 16px;overflow:hidden;}
.cd-thumb-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.cd-thumb-logo{width:18px;height:18px;border-radius:5px;}
.cd-thumb-dots{display:flex;gap:10px;}
.cd-thumb-dots i{width:14px;height:3px;border-radius:2px;background:var(--border-2);}
.cd-thumb-h1{height:13px;width:72%;background:var(--text);opacity:.82;border-radius:3px;margin-bottom:7px;}
.cd-thumb-line{height:5px;background:var(--border-2);border-radius:3px;margin-bottom:5px;}
.cd-thumb-line.s{width:45%;}
.cd-thumb-btn{width:64px;height:18px;border-radius:5px;margin-top:9px;}
.cd-thumb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:14px;}
.cd-thumb-grid i{height:26px;background:var(--surface);border:1px solid var(--cd-border);border-radius:5px;}
.cd-thumb-kind{position:absolute;top:12px;right:14px;font-family:var(--font-mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;background:var(--text);color:var(--bg);padding:2px 7px;border-radius:4px;}
.cd-design-meta{padding:13px 15px 15px;}
.cd-design-name{font-size:14px;font-weight:600;letter-spacing:-.01em;}
.cd-design-file{display:flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:10.5px;color:var(--text-3);margin-top:4px;}
.cd-design-stats{display:flex;align-items:center;gap:7px;margin-top:10px;font-size:11.5px;color:var(--text-3);}
.cd-design-stats b{color:var(--text);font-weight:600;}
.cd-dot-sep{color:var(--text-4);}

/* ── IMPORT MODAL ── */
.cd-modal-backdrop{position:fixed;inset:0;background:rgba(20,18,14,.45);backdrop-filter:blur(3px);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;}
.cd-modal{width:100%;max-width:480px;background:var(--surface);border:1px solid var(--border-2);border-radius:16px;box-shadow:var(--shadow-pop);overflow:hidden;display:flex;flex-direction:column;}
.cd-modal-hd{display:flex;align-items:center;gap:11px;padding:16px 18px;border-bottom:1px solid var(--cd-border);}
.cd-modal-ic{width:32px;height:32px;border-radius:8px;background:var(--accent-tint);color:var(--accent-2);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.cd-modal-title{font-size:14px;font-weight:600;letter-spacing:-.01em;}
.cd-modal-sub{font-size:11.5px;color:var(--text-3);margin-top:1px;}
.cd-modal-body{padding:18px;}
.cd-modal-ft{display:flex;align-items:center;gap:8px;padding:13px 18px;border-top:1px solid var(--cd-border);background:var(--bg);}
.cd-drop{border:1.5px dashed var(--border-strong);border-radius:12px;padding:34px 20px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;background:var(--surface-2);}
.cd-drop:hover{border-color:var(--cd-accent);background:var(--accent-tint);}
.cd-drop-ic{width:54px;height:54px;border-radius:14px;background:var(--surface);border:1px solid var(--cd-border);color:var(--cd-accent);display:flex;align-items:center;justify-content:center;margin-bottom:8px;}
.cd-drop b{font-size:14px;font-weight:600;}
.cd-drop span{font-size:12px;color:var(--text-3);}
.cd-drop-hint{display:inline-flex;align-items:center;gap:5px;margin-top:12px;font-size:11px;color:var(--magic);background:var(--magic-tint);padding:4px 10px;border-radius:6px;}
.cd-loading-file{display:flex;align-items:center;gap:11px;padding:11px 12px;background:var(--surface-2);border:1px solid var(--cd-border);border-radius:9px;margin-bottom:12px;}
.cd-loading-fic{width:34px;height:34px;border-radius:8px;background:var(--info-tint);color:var(--info);display:flex;align-items:center;justify-content:center;}
.cd-loading-file b{font-size:12.5px;display:block;}
.cd-loading-file span{font-size:11px;color:var(--text-3);font-family:var(--font-mono);}
.cd-loading-pct{font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--accent-2);}
.cd-loading-bar{height:5px;background:var(--bg-3);border-radius:99px;overflow:hidden;margin-bottom:16px;}
.cd-loading-bar i{display:block;height:100%;background:var(--cd-accent);border-radius:99px;transition:width .2s;}
.cd-loading-steps{display:flex;flex-direction:column;gap:9px;}
.cd-loading-step{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--text-3);}
.cd-loading-step.done{color:var(--text);}
.cd-step-dot{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--border-2);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;}
.cd-loading-step.done .cd-step-dot{background:var(--ok);border-color:var(--ok);}

/* ── EDITOR ── */
.cd-editor{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
.cd-topbar{height:50px;flex:0 0 50px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--cd-border);background:var(--bg);}
.cd-back{appearance:none;border:1px solid var(--border-2);background:var(--surface);height:28px;padding:0 10px 0 7px;border-radius:7px;font:inherit;font-size:12px;font-weight:500;color:var(--text-2);display:inline-flex;align-items:center;gap:4px;}
.cd-back:hover{background:var(--surface-2);color:var(--text);}
.cd-saved{font-family:var(--font-mono);font-size:11px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px;}
.cd-saved i{width:6px;height:6px;border-radius:50%;background:var(--ok);}
.cd-saved.dirty i{background:var(--warn);}
.cd-vp-pick{display:inline-flex;gap:2px;background:var(--bg-2);border:1px solid var(--cd-border);border-radius:7px;padding:2px;}
.cd-vp{width:30px;height:24px;border:0;background:transparent;border-radius:5px;color:var(--text-3);display:flex;align-items:center;justify-content:center;}
.cd-vp.on{background:var(--surface);color:var(--text);box-shadow:var(--shadow-1);}
.cd-save-group{display:flex;gap:6px;}

/* company picker */
.cd-pick-wrap{position:relative;}
.cd-company-btn{appearance:none;border:1px solid var(--border-2);background:var(--surface);height:30px;padding:0 9px;border-radius:8px;font:inherit;font-size:12px;display:inline-flex;align-items:center;gap:7px;color:var(--text-2);}
.cd-company-btn:hover{background:var(--surface-2);}
.cd-company-btn.active{border-color:var(--accent-tint-2);}
.cd-company-lab{color:var(--text-3);}
.cd-company-cur{display:inline-flex;align-items:center;gap:6px;color:var(--text);font-weight:500;}
.cd-company-cur.muted{color:var(--text-3);font-weight:400;}
.cd-company-dot{width:18px;height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:#fff;font-family:var(--font-mono);flex-shrink:0;}
.cd-company-dot.ghost{background:var(--bg-3);border:1px dashed var(--border-strong);}
.cd-pop-backdrop{position:fixed;inset:0;z-index:90;}
.cd-pop{position:absolute;z-index:100;background:var(--surface);border:1px solid var(--border-2);border-radius:11px;box-shadow:var(--shadow-pop);overflow:hidden;}
.cd-company-pop{top:36px;right:0;width:300px;padding:6px;}
.cd-pop-hd{font-size:10px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.07em;padding:7px 8px 6px;}
.cd-company-row{appearance:none;border:0;background:transparent;width:100%;padding:7px 8px;border-radius:7px;display:flex;align-items:center;gap:9px;text-align:left;}
.cd-company-row:hover{background:var(--hover);}
.cd-company-row.sel{background:var(--accent-tint);}
.cd-company-row b{font-size:12.5px;font-weight:500;display:block;}
.cd-company-row span{font-size:11px;color:var(--text-3);}
.cd-company-row .cd-company-dot{width:26px;height:26px;border-radius:7px;font-size:10px;}

/* template bar */
.cd-tpl-bar{height:38px;flex:0 0 38px;display:flex;align-items:center;gap:6px;padding:0 14px;border-bottom:1px solid var(--cd-border);background:var(--surface-2);overflow-x:auto;}
.cd-tpl-lab{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.06em;margin-right:4px;flex-shrink:0;}
.cd-tpl{appearance:none;border:1px solid var(--border-2);background:var(--surface);height:26px;padding:0 10px;border-radius:7px;font:inherit;font-size:12px;font-weight:500;color:var(--text-2);display:inline-flex;align-items:center;gap:7px;white-space:nowrap;flex-shrink:0;}
.cd-tpl:hover{background:var(--surface-2);color:var(--text);}
.cd-tpl.on{background:var(--text);color:var(--bg);border-color:var(--text);}
.cd-tpl-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.cd-tpl-meta{font-family:var(--font-mono);font-size:9.5px;opacity:.6;}
.cd-tpl-add{appearance:none;border:1px dashed var(--border-strong);background:transparent;height:26px;padding:0 10px;border-radius:7px;font:inherit;font-size:11.5px;font-weight:500;color:var(--text-3);display:inline-flex;align-items:center;gap:5px;flex-shrink:0;}
.cd-tpl-add:hover{color:var(--accent-2);border-color:var(--cd-accent);}
.cd-tpl-hint{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-4);flex-shrink:0;white-space:nowrap;}

/* body grid */
.cd-body{flex:1;min-height:0;display:grid;grid-template-columns:248px 1fr 300px;overflow:hidden;}
.cd-editor.dens-compact .cd-body{grid-template-columns:220px 1fr 280px;}
.cd-editor.dens-comfy .cd-body{grid-template-columns:280px 1fr 330px;}
.cd-pane{background:var(--surface);display:flex;flex-direction:column;min-height:0;overflow:hidden;}
.cd-left{border-right:1px solid var(--cd-border);}
.cd-inspector{border-left:1px solid var(--cd-border);}
.cd-editor.insp-left .cd-inspector{border-left:0;border-right:1px solid var(--cd-border);}
.cd-editor.insp-left .cd-left{border-right:0;border-left:1px solid var(--cd-border);}

/* left tabs */
.cd-left-tabs{display:flex;border-bottom:1px solid var(--cd-border);flex-shrink:0;}
.cd-left-tab{flex:1;appearance:none;border:0;background:transparent;height:40px;font:inherit;font-size:12px;font-weight:500;color:var(--text-3);display:inline-flex;align-items:center;justify-content:center;gap:6px;border-bottom:2px solid transparent;margin-bottom:-1px;}
.cd-left-tab:hover{color:var(--text-2);}
.cd-left-tab.on{color:var(--text);border-bottom-color:var(--cd-accent);}
.cd-left-body{flex:1;overflow:auto;min-height:0;}

/* layers */
.cd-layers{padding:6px 8px 16px;}
.cd-layer-sec{margin-bottom:2px;}
.cd-layer-sec-hd{appearance:none;border:0;background:transparent;width:100%;height:30px;padding:0 6px;border-radius:6px;display:flex;align-items:center;gap:6px;text-align:left;}
.cd-layer-sec-hd:hover{background:var(--hover);}
.cd-layer-sec-hd .chev{color:var(--text-4);transition:transform .15s;}
.cd-layer-sec-hd[aria-expanded="false"] .chev{transform:rotate(-90deg);}
.cd-layer-type{font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-4);background:var(--bg-2);padding:1px 5px;border-radius:3px;}
.cd-layer-name{font-size:12px;font-weight:600;color:var(--text);flex:1;}
.cd-layer-rep{color:var(--info);display:inline-flex;}
.cd-layer-zones{margin-left:11px;border-left:1px solid var(--cd-border);padding-left:4px;}
.cd-layer-z{appearance:none;border:0;background:transparent;width:100%;height:26px;padding:0 6px;border-radius:5px;display:flex;align-items:center;gap:7px;text-align:left;color:var(--text-2);position:relative;}
.cd-layer-z:hover{background:var(--hover);color:var(--text);}
.cd-layer-z.sel{background:var(--accent-tint);color:var(--accent-2);}
.cd-layer-z.hid{opacity:.45;}
.cd-layer-z .zk{color:var(--text-4);}
.cd-layer-z.sel .zk{color:var(--accent-2);}
.cd-layer-z-lab{flex:1;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cd-layer-bound{color:var(--magic);display:inline-flex;}
.cd-layer-cond{color:var(--info);display:inline-flex;}
.cd-layer-eye{width:18px;height:18px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:var(--text-4);opacity:0;}
.cd-layer-z:hover .cd-layer-eye{opacity:1;}
.cd-layer-eye:hover{background:var(--hover-2);color:var(--text);}

/* design tweaks */
.cd-dtweaks{padding:12px 14px 18px;}
.cd-dtweaks-note{display:flex;gap:7px;align-items:flex-start;font-size:11px;line-height:1.45;color:var(--magic);background:var(--magic-tint);border:1px solid rgba(122,90,224,.2);border-radius:8px;padding:9px 11px;margin-bottom:14px;}
.cd-dtweaks-note svg{flex-shrink:0;margin-top:1px;}
.cd-dtweak{margin-bottom:14px;}
.cd-dtweak-lab{font-size:11.5px;font-weight:500;color:var(--text-2);margin-bottom:7px;}
.cd-swatches{display:flex;gap:7px;}
.cd-swatch{width:26px;height:26px;border-radius:7px;border:1.5px solid var(--cd-border);position:relative;}
.cd-swatch.sel{box-shadow:0 0 0 1.5px var(--bg),0 0 0 3px var(--text);}
.cd-seg{display:flex;background:var(--bg-2);border:1px solid var(--cd-border);border-radius:7px;padding:2px;gap:2px;}
.cd-seg-b{flex:1;appearance:none;border:0;background:transparent;height:24px;font:inherit;font-size:11.5px;font-weight:500;color:var(--text-3);border-radius:5px;}
.cd-seg-b.on{background:var(--surface);color:var(--text);box-shadow:var(--shadow-1);}
.cd-range{display:flex;align-items:center;gap:10px;}
.cd-range input[type=range]{flex:1;accent-color:var(--cd-accent);}
.cd-range-v{font-family:var(--font-mono);font-size:11px;color:var(--text-3);min-width:34px;text-align:right;}
.cd-switch{appearance:none;border:0;width:34px;height:20px;border-radius:99px;background:var(--border-strong);position:relative;flex-shrink:0;transition:background .12s;}
.cd-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .14s;}
.cd-switch.on{background:var(--cd-accent);}
.cd-switch.on::after{left:16px;}

/* ── inspector ── */
.cd-insp{display:flex;flex-direction:column;min-height:0;height:100%;}
.cd-insp-hd{display:flex;align-items:center;gap:9px;padding:12px 14px;border-bottom:1px solid var(--cd-border);flex-shrink:0;}
.cd-insp-back{appearance:none;border:1px solid var(--border-2);background:var(--surface);width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text-2);flex-shrink:0;}
.cd-insp-back:hover{background:var(--surface-2);color:var(--text);}
.cd-insp-title{font-size:13px;font-weight:600;letter-spacing:-.005em;}
.cd-insp-path{font-family:var(--font-mono);font-size:10px;color:var(--text-4);text-transform:uppercase;letter-spacing:.04em;margin-top:1px;}
.cd-kind-pill{font-family:var(--font-mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:4px;background:var(--bg-2);color:var(--text-3);}
.cd-kind-pill.image{background:var(--info-tint);color:var(--info);}
.cd-kind-pill.button{background:var(--accent-tint);color:var(--accent-2);}
.cd-kind-pill.repeater{background:rgba(31,138,91,.12);color:var(--ok);}
.cd-kind-pill.rich{background:var(--magic-tint);color:var(--magic);}
.cd-insp-body{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:16px;}
.cd-insp-block-hd{font-size:10px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.cd-textarea{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:7px;padding:8px 9px;font:inherit;font-size:12.5px;color:var(--text);resize:vertical;line-height:1.45;outline:0;}
.cd-textarea:focus{border-color:var(--text);background:var(--surface);}
.cd-img-slot{display:flex;align-items:center;gap:9px;border:1px dashed var(--border-2);background:var(--surface-2);padding:8px;border-radius:8px;}
.cd-img-thumb{width:36px;height:36px;border-radius:6px;background:var(--bg-3);background-image:repeating-linear-gradient(135deg,rgba(20,18,14,.06) 0 6px,transparent 6px 12px);display:flex;align-items:center;justify-content:center;color:var(--text-4);flex-shrink:0;}
.cd-img-name{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cd-img-sub{font-size:10.5px;color:var(--text-4);font-family:var(--font-mono);}
.cd-rep-note{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ok);background:var(--ok-tint);border:1px solid rgba(31,138,91,.2);border-radius:8px;padding:9px 11px;line-height:1.4;}
.cd-bind-btn{appearance:none;width:100%;border:1px solid var(--border-2);background:var(--surface);height:34px;padding:0 10px;border-radius:8px;display:flex;align-items:center;gap:8px;font:inherit;font-size:12px;color:var(--text);}
.cd-bind-btn:hover{background:var(--surface-2);}
.cd-bind-btn.set{border-color:rgba(122,90,224,.3);background:var(--magic-tint);}
.cd-bind-btn .cd-bind-lab{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;}
.cd-bind-btn .cd-bind-lab.muted{color:var(--text-3);font-weight:400;}
.cd-var-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
.cd-bind-preview{margin-top:8px;background:var(--surface-2);border:1px solid var(--cd-border);border-radius:7px;padding:8px 10px;}
.cd-bind-preview-lab{font-family:var(--font-mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-4);display:block;margin-bottom:3px;}
.cd-bind-preview-val{font-size:12.5px;font-weight:500;color:var(--accent-2);}
.cd-bind-preview-val em{color:var(--text-3);font-weight:400;font-size:11.5px;}
.cd-cond-row{display:flex;align-items:center;gap:8px;}
.cd-cond-lab{font-size:11.5px;color:var(--text-2);white-space:nowrap;}
.cd-select{flex:1;appearance:none;background:var(--surface-2);border:1px solid var(--border-2);border-radius:7px;height:30px;padding:0 8px;font:inherit;font-size:12px;color:var(--text);outline:0;}
.cd-select:focus{border-color:var(--text);}
.cd-cond-state{margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;padding:7px 9px;border-radius:7px;}
.cd-cond-state.on{background:var(--ok-tint);color:var(--ok);}
.cd-cond-state.off{background:var(--warn-tint);color:var(--warn);}
.cd-vis-row{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--surface-2);border:1px solid var(--cd-border);border-radius:8px;padding:9px 11px;}
.cd-vis-row b{font-size:12px;font-weight:500;display:block;}
.cd-vis-row span{font-size:10.5px;color:var(--text-3);}

/* var picker popover */
.cd-var-pop{top:40px;left:0;width:280px;}
.cd-var-search{display:flex;align-items:center;gap:7px;padding:9px 11px;border-bottom:1px solid var(--cd-border);color:var(--text-3);}
.cd-var-search input{flex:1;border:0;background:transparent;font:inherit;font-size:12.5px;outline:0;color:var(--text);}
.cd-var-scroll{max-height:300px;overflow:auto;padding:5px;}
.cd-var-group-hd{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;padding:8px 7px 5px;}
.cd-var-group-hd code{font-size:9px;color:var(--text-4);text-transform:none;letter-spacing:0;margin-left:auto;}
.cd-var-item{appearance:none;border:0;background:transparent;width:100%;padding:6px 7px;border-radius:6px;display:flex;align-items:center;gap:8px;text-align:left;}
.cd-var-item:hover{background:var(--hover);}
.cd-var-item.sel{background:var(--magic-tint);}
.cd-var-item.static.sel{background:var(--hover-2);}
.cd-var-item b{font-size:12px;font-weight:500;display:block;}
.cd-var-item span{font-size:10.5px;color:var(--text-4);font-family:var(--font-mono);}

/* var browser (default right pane) */
.cd-varbrowser{flex:1;overflow:auto;min-height:0;padding:14px;}
.cd-vb-empty{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:18px 14px 22px;border-bottom:1px solid var(--cd-border);margin-bottom:14px;}
.cd-vb-ic{width:44px;height:44px;border-radius:11px;background:var(--bg-2);color:var(--text-4);display:flex;align-items:center;justify-content:center;}
.cd-vb-empty p{margin:0;font-size:12px;color:var(--text-3);line-height:1.5;max-width:210px;}
.cd-vb-hd{font-size:10px;font-weight:600;color:var(--text-4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;}
.cd-vb-group{margin-bottom:14px;}
.cd-vb-group-hd{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--text);margin-bottom:6px;}
.cd-vb-group-hd code{font-size:9.5px;color:var(--text-4);font-weight:400;}
.cd-vb-count{margin-left:auto;font-family:var(--font-mono);font-size:10px;color:var(--text-4);background:var(--bg-2);padding:1px 6px;border-radius:4px;}
.cd-vb-vars{display:flex;flex-direction:column;gap:1px;}
.cd-vb-var{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:6px;}
.cd-vb-var:hover{background:var(--hover);}
.cd-vb-var-lab{flex:1;font-size:12px;color:var(--text-2);}
.cd-vb-var-kind{font-family:var(--font-mono);font-size:9.5px;color:var(--text-4);background:var(--bg-2);padding:1px 5px;border-radius:3px;}

/* ── canvas ── */
.cd-canvas-host{position:relative;min-width:0;overflow:hidden;background:var(--bg-3);display:flex;flex-direction:column;}
.cd-canvas-area{flex:1;overflow:auto;display:flex;justify-content:center;padding:36px;}
.cd-canvas-area.grid-dots{background-image:radial-gradient(circle,rgba(20,18,14,.07) 1px,transparent 1.4px);background-size:20px 20px;}
.cd-frame-sizer{flex-shrink:0;position:relative;}
.cd-frame{transform-origin:top left;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(20,18,14,.05),0 16px 40px rgba(20,18,14,.12),0 40px 100px rgba(20,18,14,.1);}
.cd-frame.mobile{border-radius:26px;border:8px solid #14120E;}
.cd-canvas-tools{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:4px;box-shadow:var(--shadow-2);}
.cd-canvas-tools button{appearance:none;border:0;background:transparent;height:26px;padding:0 8px;border-radius:6px;font:inherit;font-size:12px;font-weight:500;color:var(--text-2);display:inline-flex;align-items:center;gap:5px;}
.cd-canvas-tools button:hover{background:var(--hover);color:var(--text);}
.cd-zoom-val{font-family:var(--font-mono);font-size:11px;min-width:40px;text-align:center;color:var(--text-2);}
.cd-tools-sep{width:1px;height:18px;background:var(--cd-border);margin:0 2px;}
.cd-testing-badge{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--border-2);border-radius:99px;padding:5px 12px 5px 6px;box-shadow:var(--shadow-1);font-size:11.5px;color:var(--text-2);}
.cd-testing-badge b{color:var(--text);font-weight:600;}
.cd-testing-badge.muted{color:var(--text-3);padding-left:12px;}
.cd-testing-badge.muted svg{color:var(--warn);}

/* zone selection chrome */
.cd-zone{position:relative;cursor:default;transition:outline-color .1s,box-shadow .1s;outline:1.5px solid transparent;outline-offset:1px;}
.cd-zone:hover{outline-color:rgba(226,85,43,.45);}
.cd-zone.is-bound:hover{outline-color:rgba(122,90,224,.5);}
.cd-zone.is-selected{outline:2px solid var(--cd-accent);outline-offset:1px;}
.cd-zone.is-bound.is-selected{outline-color:var(--magic);}
.cd-zone-tag{position:absolute;top:-19px;left:-1px;display:none;align-items:center;gap:3px;background:var(--cd-accent);color:#fff;font-family:var(--font-mono);font-size:9px;padding:1px 6px;border-radius:4px 4px 0 0;white-space:nowrap;z-index:50;line-height:1.5;}
.cd-zone.is-bound .cd-zone-tag{background:var(--magic);}
.cd-zone.is-selected>.cd-zone-tag{display:inline-flex;}
.cd-zone-cond{position:absolute;top:-19px;right:-1px;display:none;align-items:center;gap:3px;background:var(--info);color:#fff;font-family:var(--font-mono);font-size:9px;padding:1px 6px;border-radius:4px 4px 0 0;white-space:nowrap;z-index:50;}
.cd-zone.is-selected>.cd-zone-cond{display:inline-flex;}
.cd-zone.is-cond-off{opacity:.4;}
.cd-zone.is-cond-off::before{content:"masqué";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(135deg,rgba(200,136,31,.08) 0 8px,transparent 8px 16px);font-family:var(--font-mono);font-size:11px;color:var(--warn);pointer-events:none;z-index:2;}

/* toast */
.cd-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:300;display:inline-flex;align-items:center;gap:8px;background:var(--text);color:var(--bg);padding:10px 16px;border-radius:9px;font-size:12.5px;font-weight:500;box-shadow:var(--shadow-pop);}
.cd-toast svg{color:#7BE0AE;}

/* ── CRM additions (real-data wiring, not in the static mockup) ── */
.cd-frame-iframe{width:100%;height:100%;border:0;display:block;background:#fff;}
.cd-vb-actions{margin-bottom:14px;}
.cd-vb-actions .cd-btn{width:100%;justify-content:center;}
.cd-company-card{border:1px solid var(--cd-border);background:var(--surface-2);border-radius:10px;padding:11px 12px;margin-bottom:14px;}
.cd-company-card-hd{display:flex;align-items:center;gap:9px;}
.cd-company-card-hd b{font-size:12.5px;font-weight:600;display:block;}
.cd-company-card-hd span{font-size:11px;color:var(--text-3);}
.cd-company-card-hd .cd-company-dot{width:28px;height:28px;border-radius:7px;font-size:11px;}
.cd-company-card-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px;}
.cd-tag-chip{font-size:10.5px;color:var(--text-2);background:var(--bg-2);border:1px solid var(--cd-border);padding:2px 8px;border-radius:99px;}
.cd-design-thumb-link{display:block;}
.cd-design-actions{display:flex;gap:6px;margin-top:12px;}
.cd-design-actions>*{flex:1;}
.cd-design-actions .cd-btn{width:100%;justify-content:center;height:28px;font-size:11.5px;}

/* missing-images export (top of right inspector) */
.cd-missimg{flex-shrink:0;padding:14px;border-bottom:1px solid var(--cd-border);}
.cd-missimg-hd{display:flex;align-items:center;gap:9px;margin-bottom:11px;}
.cd-missimg-ic{width:30px;height:30px;flex-shrink:0;border-radius:8px;background:var(--bg-2);color:var(--cd-accent);display:flex;align-items:center;justify-content:center;}
.cd-missimg-hd b{font-size:12.5px;font-weight:600;display:block;line-height:1.3;}
.cd-missimg-hd>.cd-grow>span{font-size:11px;color:var(--text-3);}
.cd-missimg-count{flex-shrink:0;font-family:var(--font-mono);font-size:11px;font-weight:600;color:#fff;background:var(--cd-accent);padding:1px 8px;border-radius:99px;}
.cd-missimg-pick{position:relative;}
.cd-missimg-pick>.cd-btn{width:100%;justify-content:flex-start;}
.cd-missimg-pop{top:36px;left:0;right:0;padding:6px;}
.cd-missimg-hint{margin:10px 0 0;font-size:11px;line-height:1.5;color:var(--text-3);}

`;
