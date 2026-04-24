import type { AuditPricingService, AuditPage5 } from '@/types';

export const LOGO_PATH = "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z M50,36 A14,14 0 1 0 50,64 A14,14 0 1 0 50,36 Z";

export const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function logoSvg(size = 26, color = '#B5D0F0') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none"><path fill="${color}" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;
}

export function innerHeader(section: string) {
  return `<div class="inner-header">
    <div class="inner-header-logo">${logoSvg(18, '#B5D0F0')}<span>SAMA</span></div>
    <span class="inner-header-section">${esc(section)}</span>
  </div>`;
}

export function innerFooter(page: string) {
  return `<div class="inner-footer">
    <span class="footer-text">Confidentiel</span>
    <span class="footer-page">${page}</span>
  </div>`;
}

export function getServices(p: AuditPage5): AuditPricingService[] {
  if (p.services && p.services.length > 0) return p.services;
  const parseAmt = (s?: string) => parseFloat((s || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  const svcs: AuditPricingService[] = [];
  if (p.price_setup_label) svcs.push({ label: p.price_setup_label, sub_label: p.price_setup_desc, amount: parseAmt(p.price_setup), is_mrr: false, enabled: true });
  if (p.price_monthly_label) svcs.push({ label: p.price_monthly_label, sub_label: p.price_monthly_desc, amount: parseAmt(p.price_monthly), is_mrr: true, enabled: true });
  return svcs;
}

export function calcTotal(services: AuditPricingService[]) {
  const en = services.filter(s => s.enabled);
  const oneTime = en.filter(s => !s.is_mrr).reduce((a, s) => a + s.amount, 0);
  const mrr = en.filter(s => s.is_mrr).reduce((a, s) => a + s.amount, 0);
  return { total: oneTime + mrr * 12, hasMrr: mrr > 0 };
}

export function fmtEur(n: number) {
  return n.toLocaleString('fr-FR') + ' €';
}

export const CSS = `
:root{--nuit:#0B1D3A;--azur:#3A7BD5;--brume:#B5D0F0;--creme:#F4F1EB;--blanc:#E8F3FF;--page-w:794px}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#1a1a1e;font-family:'DM Sans',sans-serif;color:var(--nuit)}
.page{width:var(--page-w);margin:0 auto;background:var(--creme);position:relative;overflow:hidden}
.page+.page{margin-top:24px}.page:first-child{margin-top:32px}.page:last-child{margin-bottom:32px}
.cover{height:1123px;background:var(--nuit);display:flex;flex-direction:column;position:relative;overflow:hidden}
.cover-sky{position:absolute;inset:0;background:radial-gradient(ellipse 500px 400px at 80% 20%,rgba(58,123,213,.35) 0%,transparent 65%),radial-gradient(ellipse 600px 500px at 15% 70%,rgba(58,123,213,.18) 0%,transparent 60%)}
.grain{position:absolute;inset:0;opacity:.045;pointer-events:none;z-index:3;background-image:${GRAIN_SVG};background-repeat:repeat;background-size:200px 200px}
.cover-content{position:relative;z-index:4;display:flex;flex-direction:column;height:100%;padding:64px 72px}
.cover-top{display:flex;align-items:center;justify-content:space-between}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-wm{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:20px;letter-spacing:.45em;color:var(--blanc);text-transform:uppercase;padding-left:.45em}
.cover-date{font-size:10px;letter-spacing:.18em;color:rgba(181,208,240,.45);font-weight:500;text-transform:uppercase}
.cover-main{flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:60px}
.cover-eyebrow{font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:20px}
.cover-title{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:56px;line-height:1.1;color:var(--blanc);letter-spacing:-.01em;margin-bottom:24px}
.cover-title em{font-style:italic;color:var(--brume)}
.cover-subtitle{font-size:14px;line-height:1.7;color:rgba(181,208,240,.65);max-width:440px;font-weight:300}
.cover-client-block{margin-top:64px;padding:24px 28px;border:1px solid rgba(181,208,240,.15);border-radius:4px;background:rgba(58,123,213,.06);display:inline-block;max-width:360px}
.cover-client-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.cover-client-label{font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:rgba(181,208,240,.45);font-weight:500}
.cover-client-logo{height:28px;max-width:80px;object-fit:contain;border-radius:2px}
.cover-client-name{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:var(--blanc);letter-spacing:.03em}
.cover-client-meta{font-size:11px;color:rgba(181,208,240,.5);margin-top:4px}
.demo-cta{margin-top:24px;display:inline-block;max-width:360px;text-decoration:none}
.demo-cta-inner{padding:16px 20px;border:1px solid rgba(58,123,213,.35);border-radius:6px;background:rgba(58,123,213,.1)}
.demo-cta-label{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:10px}
.mockup{background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden;border:1px solid rgba(181,208,240,.1)}
.mockup-chrome{background:rgba(255,255,255,.07);padding:5px 10px;display:flex;align-items:center;gap:6px}
.mockup-dots{display:flex;gap:3px}
.mockup-dot{width:5px;height:5px;border-radius:50%}
.mockup-url{flex:1;height:12px;background:rgba(255,255,255,.06);border-radius:2px;display:flex;align-items:center;padding-left:6px;font-size:7px;color:rgba(181,208,240,.45);overflow:hidden;white-space:nowrap}
.mockup-body{padding:10px 12px;display:flex;flex-direction:column;gap:5px}
.mockup-hero{height:16px;background:rgba(58,123,213,.18);border-radius:2px;width:70%}
.mockup-line{height:6px;background:rgba(255,255,255,.05);border-radius:2px}
.mockup-btn{height:22px;background:rgba(58,123,213,.3);border-radius:3px;width:64px;margin-top:3px}
.demo-cta-link{margin-top:10px;font-size:11px;color:var(--azur);font-weight:500}
.cover-bottom{display:flex;align-items:flex-end;justify-content:flex-end;padding-bottom:8px}
.cover-page-num{font-family:'Cormorant Garamond',serif;font-size:64px;font-weight:300;color:rgba(58,123,213,.12);line-height:1}
.inner-page{min-height:1123px;display:flex;flex-direction:column;background:var(--creme)}
.inner-header{background:var(--nuit);padding:22px 72px;display:flex;align-items:center;justify-content:space-between}
.inner-header-logo{display:flex;align-items:center;gap:8px}
.inner-header-logo span{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:13px;letter-spacing:.4em;color:var(--blanc);text-transform:uppercase;padding-left:.4em}
.inner-header-section{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(181,208,240,.45);font-weight:500}
.inner-body{flex:1;padding:56px 72px 48px;display:flex;flex-direction:column;gap:40px}
.inner-footer{padding:16px 72px;border-top:1px solid rgba(11,29,58,.08);display:flex;align-items:center;justify-content:space-between}
.footer-text{font-size:9px;letter-spacing:.12em;color:rgba(11,29,58,.3);text-transform:uppercase}
.footer-page{font-family:'Cormorant Garamond',serif;font-size:13px;color:rgba(11,29,58,.2)}
.section-eyebrow{font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:10px}
.section-title{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:38px;line-height:1.1;color:var(--nuit)}
.section-title em{font-style:italic;color:var(--azur)}
.section-intro{font-size:14px;line-height:1.8;color:rgba(11,29,58,.65);max-width:560px;margin-top:16px;font-weight:300}
.problem-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.problem-card{padding:20px;border:1px solid rgba(58,123,213,.15);border-radius:4px;background:rgba(11,29,58,.02);display:flex;flex-direction:column;gap:8px}
.alert-icon{width:28px;height:28px;background:rgba(58,123,213,.1);border:1px solid rgba(58,123,213,.2);border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.problem-title{font-size:12px;font-weight:500;color:var(--nuit)}
.problem-desc{font-size:11px;line-height:1.6;color:rgba(11,29,58,.55)}
.solution-list{display:flex;flex-direction:column}
.solution-item{display:grid;grid-template-columns:32px 1fr auto;align-items:start;gap:16px;padding:18px 0;border-bottom:1px solid rgba(11,29,58,.07)}
.solution-item:last-child{border-bottom:none}
.solution-num{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:300;color:rgba(58,123,213,.25);line-height:1}
.solution-name{font-size:13px;font-weight:500;color:var(--nuit);margin-bottom:4px}
.solution-desc{font-size:11px;line-height:1.6;color:rgba(11,29,58,.55)}
.solution-tag{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--azur);background:rgba(58,123,213,.08);padding:4px 8px;border-radius:2px;white-space:nowrap;font-weight:500}
.livrables-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.livrable-card{padding:22px;border-radius:4px;background:white;border:1px solid rgba(58,123,213,.12);display:flex;flex-direction:column;gap:10px}
.livrable-header{display:flex;align-items:center;justify-content:space-between}
.livrable-title{font-size:13px;font-weight:500;color:var(--nuit)}
.check-badge{width:18px;height:18px;border-radius:50%;background:rgba(58,123,213,.12);border:1px solid rgba(58,123,213,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.livrable-item{font-size:11px;color:rgba(11,29,58,.55);line-height:1.5;padding-left:10px;position:relative}
.livrable-item::before{content:'—';position:absolute;left:0;color:rgba(58,123,213,.4);font-size:9px;top:2px}
.planning-timeline{display:flex;flex-direction:column;position:relative}
.planning-timeline::before{content:'';position:absolute;left:72px;top:16px;bottom:16px;width:1px;background:linear-gradient(180deg,var(--azur),rgba(58,123,213,.1))}
.planning-step{display:grid;grid-template-columns:56px 16px 1fr;column-gap:16px;align-items:start;padding:12px 0}
.planning-week{text-align:right;padding-top:1px}
.planning-week-label{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:rgba(11,29,58,.4);font-weight:500;line-height:1.3}
.planning-dot-col{display:flex;justify-content:center;padding-top:3px;position:relative;z-index:1}
.planning-dot{width:10px;height:10px;border-radius:50%;background:var(--azur);border:2px solid var(--creme);box-shadow:0 0 0 1px var(--azur)}
.planning-step-title{font-size:13px;font-weight:500;color:var(--nuit);margin-bottom:3px}
.planning-step-desc{font-size:11px;line-height:1.6;color:rgba(11,29,58,.5)}
.invest-eyebrow{font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:6px}
.invest-subtitle{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:var(--nuit);margin-bottom:12px;font-style:italic}
.invest-block{background:var(--nuit);border-radius:6px;padding:36px 40px;position:relative;overflow:hidden}
.invest-gradient{position:absolute;inset:0;background:radial-gradient(ellipse 300px 200px at 90% 0%,rgba(58,123,213,.3) 0%,transparent 65%),radial-gradient(ellipse 200px 200px at 0% 100%,rgba(58,123,213,.15) 0%,transparent 60%);opacity:.6}
.invest-inner{position:relative;z-index:4}
.invest-row{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:24px;padding:14px 0;border-bottom:1px solid rgba(181,208,240,.1)}
.invest-label{font-size:12px;color:rgba(181,208,240,.7)}
.invest-sublabel{font-size:10px;color:rgba(181,208,240,.35);margin-top:2px}
.invest-amount{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:22px;color:var(--blanc);white-space:nowrap}
.invest-row-total{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:24px;border-top:1px solid rgba(181,208,240,.2);margin-top:8px;padding-top:20px}
.invest-total-label{font-size:14px;font-weight:500;color:var(--blanc)}
.invest-total-amount{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:40px;color:var(--blanc)}
.invest-note{margin-top:20px;font-size:10px;color:rgba(181,208,240,.4);line-height:1.7;border-top:1px solid rgba(181,208,240,.08);padding-top:16px}
.nextsteps-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.nextstep-card{padding:22px;border:1px solid rgba(11,29,58,.08);border-radius:4px}
.nextstep-num{font-family:'Cormorant Garamond',serif;font-size:40px;font-weight:300;color:rgba(58,123,213,.15);line-height:1;margin-bottom:10px}
.nextstep-title{font-size:12px;font-weight:500;color:var(--nuit);margin-bottom:6px}
.nextstep-desc{font-size:11px;color:rgba(11,29,58,.5);line-height:1.6}
.cta-block{background:rgba(58,123,213,.05);border:1px solid rgba(58,123,213,.15);border-radius:4px;padding:24px 28px;display:flex;align-items:center;justify-content:space-between}
.cta-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:var(--nuit);margin-bottom:4px}
.cta-sub{font-size:11px;color:rgba(11,29,58,.5)}
.cta-contact{text-align:right;display:flex;flex-direction:column;gap:3px}
.cta-contact-item{font-size:12px;font-weight:500;color:var(--azur)}
@media print{
  html,body{margin:0!important;padding:0!important;background:white}
  .page{margin:0!important}
  .page+.page{page-break-before:always;margin-top:0!important}
  .page:first-child{margin-top:0!important}
  .page:last-child{margin-bottom:0!important}
  @page{margin:0;size:A4}
}`;
