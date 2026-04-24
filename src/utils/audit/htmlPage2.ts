import type { AuditContent } from '@/types';
import { esc, innerHeader, innerFooter } from './htmlShared';

const alertIconSvg = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
  <circle cx="7" cy="7" r="5.5" stroke="#3A7BD5" stroke-width="1"/>
  <line x1="7" y1="4.5" x2="7" y2="7.5" stroke="#3A7BD5" stroke-width="1.1" stroke-linecap="round"/>
  <circle cx="7" cy="9.5" r="0.5" fill="#3A7BD5"/>
</svg>`;

export function page2Html(content: AuditContent) {
  const p = content.page2;
  return `
<div class="page">
<div class="inner-page">
  ${innerHeader('Votre situation')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">01 · Contexte</div>
      <div class="section-title">Ce que nous<br>avons <em>observé</em></div>
      <div class="section-intro">${esc(p.section_intro)}</div>
    </div>
    <div class="problem-grid">
      ${p.problems.map(prob => `
      <div class="problem-card">
        <div class="alert-icon">${alertIconSvg}</div>
        <div class="problem-title">${esc(prob.title)}</div>
        <div class="problem-desc">${esc(prob.desc)}</div>
      </div>`).join('')}
    </div>
    <div style="padding:24px 28px;border-left:2px solid #3A7BD5;background:rgba(58,123,213,.04);border-radius:0 4px 4px 0">
      <p style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:#0B1D3A;font-style:italic;line-height:1.5;margin-bottom:10px">"${esc(p.quote)}"</p>
      <p style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(11,29,58,.4);font-weight:500">${esc(p.quote_source)}</p>
    </div>
  </div>
  ${innerFooter('02')}
</div>
</div>`;
}
