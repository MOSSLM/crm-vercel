import type { AuditContent } from '@/types';

const LOGO_PATH = "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z M50,36 A14,14 0 1 0 50,64 A14,14 0 1 0 50,36 Z";

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function logoSvg(size = 26, color = '#B5D0F0') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none"><path fill="${color}" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;
}

function innerHeader(section: string) {
  return `
  <div class="inner-header">
    <div class="inner-header-logo">${logoSvg(18, '#B5D0F0')}<span>SAMA</span></div>
    <span class="inner-header-section">${esc(section)}</span>
  </div>`;
}

function innerFooter(page: string) {
  return `
  <div class="inner-footer">
    <span class="footer-text">sama.fr · Confidentiel</span>
    <span class="footer-page">${page}</span>
  </div>`;
}

export function generateAuditHtml(content: AuditContent, opts: { logoUrl?: string } = {}): string {
  const p1 = content.page1;
  const p2 = content.page2;
  const p3 = content.page3;
  const p4 = content.page4;
  const p5 = content.page5;
  const p6 = content.page6;

  const coverLogo = opts.logoUrl
    ? `<img src="${esc(opts.logoUrl)}" alt="Logo" style="width:32px;height:32px;object-fit:contain;border-radius:4px;">`
    : logoSvg(26, '#B5D0F0');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Audit — ${esc(p1.client_name || 'Client')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{--nuit:#0B1D3A;--azur:#3A7BD5;--brume:#B5D0F0;--creme:#F4F1EB;--blanc:#E8F3FF;--page-w:794px}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a1a1e;font-family:'DM Sans',sans-serif;color:var(--nuit)}
.page{width:var(--page-w);margin:0 auto;background:var(--creme);position:relative;overflow:hidden}
.page+.page{margin-top:24px}.page:first-child{margin-top:32px}.page:last-child{margin-bottom:32px}
.cover{height:1123px;background:var(--nuit);display:flex;flex-direction:column;position:relative;overflow:hidden}
.cover-sky{position:absolute;inset:0;background:radial-gradient(ellipse 500px 400px at 80% 20%,rgba(58,123,213,.35) 0%,transparent 65%),radial-gradient(ellipse 600px 500px at 15% 70%,rgba(58,123,213,.18) 0%,transparent 60%)}
.cover-content{position:relative;z-index:2;display:flex;flex-direction:column;height:100%;padding:64px 72px}
.cover-top{display:flex;align-items:center;justify-content:space-between}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-wm{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:20px;letter-spacing:.45em;color:var(--blanc);text-transform:uppercase;padding-left:.45em}
.cover-date{font-size:10px;letter-spacing:.18em;color:rgba(181,208,240,.45);font-weight:500;text-transform:uppercase}
.cover-main{flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:60px}
.cover-eyebrow{font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:var(--azur);font-weight:500;margin-bottom:20px}
.cover-title{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:56px;line-height:1.1;color:var(--blanc);letter-spacing:-.01em;margin-bottom:24px}
.cover-title em{font-style:italic;color:var(--brume)}
.cover-subtitle{font-size:14px;line-height:1.7;color:rgba(181,208,240,.65);max-width:440px;font-weight:300}
.cover-client-block{margin-top:64px;padding:24px 28px;border:1px solid rgba(181,208,240,.15);border-radius:4px;background:rgba(58,123,213,.06);display:inline-block;max-width:340px}
.cover-client-label{font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:rgba(181,208,240,.45);font-weight:500;margin-bottom:8px}
.cover-client-name{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:var(--blanc);letter-spacing:.03em}
.cover-client-meta{font-size:11px;color:rgba(181,208,240,.5);margin-top:4px}
.cover-demo-url{font-size:10px;color:var(--azur);margin-top:8px;letter-spacing:.05em}
.cover-bottom{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:8px}
.cover-bottom-left{font-size:10px;letter-spacing:.1em;color:rgba(181,208,240,.3);line-height:1.8}
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
.problem-card{padding:20px;border:1px solid rgba(11,29,58,.08);border-radius:4px;background:rgba(11,29,58,.02);display:flex;flex-direction:column;gap:8px}
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
.livrable-card{padding:22px;border-radius:4px;background:white;border:1px solid rgba(11,29,58,.06);display:flex;flex-direction:column;gap:10px}
.livrable-header{display:flex;align-items:center;justify-content:space-between}
.livrable-title{font-size:13px;font-weight:500;color:var(--nuit)}
.livrable-item{font-size:11px;color:rgba(11,29,58,.55);line-height:1.5;padding-left:10px;position:relative}
.livrable-item::before{content:'—';position:absolute;left:0;color:rgba(58,123,213,.4);font-size:9px;top:2px}
.planning-timeline{display:flex;flex-direction:column;position:relative}
.planning-timeline::before{content:'';position:absolute;left:52px;top:16px;bottom:16px;width:1px;background:linear-gradient(180deg,var(--azur),rgba(58,123,213,.1))}
.planning-step{display:grid;grid-template-columns:104px 1fr;gap:24px;align-items:start;padding:12px 0}
.planning-week{display:flex;flex-direction:column;align-items:center;gap:4px}
.planning-dot{width:10px;height:10px;border-radius:50%;background:var(--azur);border:2px solid var(--creme);box-shadow:0 0 0 1px var(--azur);position:relative;z-index:1}
.planning-week-label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:rgba(11,29,58,.35);font-weight:500;text-align:center}
.planning-step-title{font-size:13px;font-weight:500;color:var(--nuit);margin-bottom:3px}
.planning-step-desc{font-size:11px;line-height:1.6;color:rgba(11,29,58,.5)}
.invest-block{background:var(--nuit);border-radius:6px;padding:36px 40px;position:relative;overflow:hidden}
.invest-row{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:24px;padding:14px 0;border-bottom:1px solid rgba(181,208,240,.1)}
.invest-row:last-of-type{border-bottom:none}
.invest-row-total{border-top:1px solid rgba(181,208,240,.2);border-bottom:none;margin-top:8px;padding-top:20px}
.invest-label{font-size:12px;color:rgba(181,208,240,.7)}
.invest-sublabel{font-size:10px;color:rgba(181,208,240,.35);margin-top:2px}
.invest-amount{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:22px;color:var(--blanc);white-space:nowrap}
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
@media print{body{background:white}.page{margin:0}.page+.page{page-break-before:always;margin-top:0}@page{margin:0;size:A4}}
</style>
</head>
<body>

<!-- PAGE 1 -->
<div class="page">
<div class="cover">
  <div class="cover-sky"></div>
  <div class="cover-content">
    <div class="cover-top">
      <div class="logo-block">${coverLogo}<span class="logo-wm">SAMA</span></div>
      <span class="cover-date">${esc(p1.date || 'Audit · 2025')}</span>
    </div>
    <div class="cover-main">
      <div class="cover-eyebrow">${esc(p1.eyebrow)}</div>
      <div class="cover-title">${esc(p1.title_line1)}<br>${esc(p1.title_line2)}<br><em>${esc(p1.title_line3)}</em></div>
      <div class="cover-subtitle">${esc(p1.subtitle)}</div>
      <div class="cover-client-block">
        <div class="cover-client-label">Préparé pour</div>
        <div class="cover-client-name">${esc(p1.client_name || 'Entreprise Cliente')}</div>
        <div class="cover-client-meta">${esc(p1.client_meta || 'Secteur · Ville, France')}</div>
        ${p1.demo_url ? `<div class="cover-demo-url">${esc(p1.demo_url)}</div>` : ''}
      </div>
    </div>
    <div class="cover-bottom">
      <div class="cover-bottom-left">sama.fr · contact@sama.fr<br>Agence digitale indépendante · Paris</div>
      <div class="cover-page-num">01</div>
    </div>
  </div>
</div>
</div>

<!-- PAGE 2 -->
<div class="page">
<div class="inner-page">
  ${innerHeader('Votre situation')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">01 · Contexte</div>
      <div class="section-title">Ce que nous<br>avons <em>observé</em></div>
      <div class="section-intro">${esc(p2.section_intro)}</div>
    </div>
    <div class="problem-grid">
      ${p2.problems.map(prob => `
      <div class="problem-card">
        <div class="problem-title">${esc(prob.title)}</div>
        <div class="problem-desc">${esc(prob.desc)}</div>
      </div>`).join('')}
    </div>
    <div style="padding:24px 28px;border-left:2px solid var(--azur);background:rgba(58,123,213,.04);border-radius:0 4px 4px 0">
      <p style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:var(--nuit);font-style:italic;line-height:1.5;margin-bottom:10px">"${esc(p2.quote)}"</p>
      <p style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(11,29,58,.4);font-weight:500">${esc(p2.quote_source)}</p>
    </div>
  </div>
  ${innerFooter('02')}
</div>
</div>

<!-- PAGE 3 -->
<div class="page">
<div class="inner-page">
  ${innerHeader('Notre solution')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">02 · Ce que l'on fait</div>
      <div class="section-title">Un site conçu<br>pour <em>convertir</em></div>
      <div class="section-intro">${esc(p3.section_intro)}</div>
    </div>
    <div class="solution-list">
      ${p3.solutions.map(sol => `
      <div class="solution-item">
        <div class="solution-num">${esc(sol.num)}</div>
        <div><div class="solution-name">${esc(sol.name)}</div><div class="solution-desc">${esc(sol.desc)}</div></div>
        <div class="solution-tag">${esc(sol.tag)}</div>
      </div>`).join('')}
    </div>
  </div>
  ${innerFooter('03')}
</div>
</div>

<!-- PAGE 4 -->
<div class="page">
<div class="inner-page">
  ${innerHeader('Livrables inclus')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">03 · Ce que vous recevez</div>
      <div class="section-title">Tout est <em>inclus</em></div>
      <div class="section-intro">Aucune mauvaise surprise. Voici exactement ce que comprend la prestation.</div>
    </div>
    <div class="livrables-grid">
      ${p4.livrables.map(liv => `
      <div class="livrable-card">
        <div class="livrable-header"><div class="livrable-title">${esc(liv.title)}</div></div>
        <div>${liv.items.map(item => `<div class="livrable-item">${esc(item)}</div>`).join('')}</div>
      </div>`).join('')}
    </div>
  </div>
  ${innerFooter('04')}
</div>
</div>

<!-- PAGE 5 -->
<div class="page">
<div class="inner-page">
  ${innerHeader('Planning & Investissement')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">04 · Calendrier</div>
      <div class="section-title">En ligne en <em>3 semaines</em></div>
    </div>
    <div class="planning-timeline">
      ${p5.planning_steps.map(step => `
      <div class="planning-step">
        <div class="planning-week"><div class="planning-dot"></div><div class="planning-week-label">${esc(step.week)}</div></div>
        <div><div class="planning-step-title">${esc(step.title)}</div><div class="planning-step-desc">${esc(step.desc)}</div></div>
      </div>`).join('')}
    </div>
    <div>
      <div class="section-eyebrow">05 · Investissement</div>
      <div class="invest-block">
        <div>
          <div class="invest-row">
            <div><div class="invest-label">${esc(p5.price_setup_label)}</div><div class="invest-sublabel">${esc(p5.price_setup_desc)}</div></div>
            <div class="invest-amount">${esc(p5.price_setup)}</div>
          </div>
          <div class="invest-row">
            <div><div class="invest-label">${esc(p5.price_monthly_label)}</div><div class="invest-sublabel">${esc(p5.price_monthly_desc)}</div></div>
            <div class="invest-amount">${esc(p5.price_monthly)}</div>
          </div>
          <div class="invest-row invest-row-total">
            <div class="invest-total-label">${esc(p5.price_total_label)}</div>
            <div class="invest-total-amount">${esc(p5.price_total)}</div>
          </div>
          <div class="invest-note">${esc(p5.price_note)}</div>
        </div>
      </div>
    </div>
  </div>
  ${innerFooter('05')}
</div>
</div>

<!-- PAGE 6 -->
<div class="page">
<div class="inner-page">
  ${innerHeader('Prochaines étapes')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">06 · Pour démarrer</div>
      <div class="section-title">Trois étapes,<br>puis c'est <em>lancé</em></div>
      <div class="section-intro">Pas de processus compliqué. On garde ça simple et rapide — vous avez une entreprise à faire tourner.</div>
    </div>
    <div class="nextsteps-grid">
      ${p6.next_steps.map((step, i) => `
      <div class="nextstep-card">
        <div class="nextstep-num">${i + 1}</div>
        <div class="nextstep-title">${esc(step.title)}</div>
        <div class="nextstep-desc">${esc(step.desc)}</div>
      </div>`).join('')}
    </div>
    <div class="cta-block">
      <div><div class="cta-title">${esc(p6.cta_title)}</div><div class="cta-sub">${esc(p6.cta_sub)}</div></div>
      <div class="cta-contact">
        <div class="cta-contact-item">${esc(p6.contact_phone)}</div>
        <div class="cta-contact-item">${esc(p6.contact_email)}</div>
        <div style="font-size:10px;color:rgba(11,29,58,.4);margin-top:4px">${esc(p6.contact_website)}</div>
      </div>
    </div>
    <div style="margin-top:auto;padding-top:32px;border-top:1px solid rgba(11,29,58,.07);display:flex;align-items:center;gap:16px">
      ${logoSvg(20, '#3A7BD5')}
      <div style="font-size:10px;color:rgba(11,29,58,.35);line-height:1.7">
        SAMA · Agence digitale indépendante · Paris, France<br>
        Document confidentiel préparé exclusivement pour ${esc(p1.client_name || 'Entreprise Cliente')}
      </div>
    </div>
  </div>
  ${innerFooter('06')}
</div>
</div>

</body>
</html>`;
}
