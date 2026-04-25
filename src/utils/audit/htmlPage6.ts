import type { AuditContent } from '@/types';
import { esc, logoSvg, innerHeader, innerFooter } from './htmlShared';

export function page6Html(content: AuditContent) {
  const p = content.page6;
  return `
<div class="page">
<div class="inner-page">
  ${innerHeader(p.header_section || 'Prochaines étapes')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">${esc(p.section_label || '05 · Pour démarrer')}</div>
      <div class="section-title">${esc(p.section_title || 'Simple, rapide,')}<br>${esc(p.section_title_line2 || "et c'est")} <em>${esc(p.section_title_em || 'lancé')}</em></div>
      <div class="section-intro">${esc(p.section_subtitle || "Pas de processus compliqué. On travaille vite et bien — vous avez une entreprise à faire tourner.")}</div>
    </div>
    <div class="nextsteps-grid">
      ${p.next_steps.map((step, i) => `
      <div class="nextstep-card">
        <div class="nextstep-num">${i + 1}</div>
        <div class="nextstep-title">${esc(step.title)}</div>
        <div class="nextstep-desc">${esc(step.desc)}</div>
      </div>`).join('')}
    </div>
    <div class="cta-block">
      <div><div class="cta-title">${esc(p.cta_title)}</div><div class="cta-sub">${esc(p.cta_sub)}</div></div>
      <div class="cta-contact">
        ${p.contact_phone ? `<div class="cta-contact-item">${esc(p.contact_phone)}</div>` : ''}
        ${p.contact_email ? `<div class="cta-contact-item">${esc(p.contact_email)}</div>` : ''}
        ${p.contact_website ? `<div style="font-size:10px;color:rgba(11,29,58,.4);margin-top:4px">${esc(p.contact_website)}</div>` : ''}
      </div>
    </div>
    <div style="margin-top:auto;padding-top:32px;border-top:1px solid rgba(11,29,58,.07);display:flex;align-items:center;gap:16px">
      ${logoSvg(20, '#3A7BD5')}
      <div style="font-size:10px;color:rgba(11,29,58,.35);line-height:1.7">
        SAMA · Agence digitale indépendante<br>
        Document confidentiel préparé exclusivement pour ${esc(content.page1.client_name || 'Entreprise Cliente')}
      </div>
    </div>
  </div>
  ${innerFooter('06')}
</div>
</div>`;
}
