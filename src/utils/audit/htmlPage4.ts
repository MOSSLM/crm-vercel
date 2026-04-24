import type { AuditContent } from '@/types';
import { esc, innerHeader, innerFooter } from './htmlShared';

const checkSvg = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
  <path d="M2 5L4.5 7.5L8 3" stroke="#3A7BD5" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const checkBadge = `<div class="check-badge">${checkSvg}</div>`;

export function page4Html(content: AuditContent) {
  const p = content.page4;
  return `
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
      ${p.livrables.map(liv => `
      <div class="livrable-card">
        <div class="livrable-header"><div class="livrable-title">${esc(liv.title)}</div>${checkBadge}</div>
        <div>${liv.items.map(item => `<div class="livrable-item">${esc(item)}</div>`).join('')}</div>
      </div>`).join('')}
    </div>
  </div>
  ${innerFooter('04')}
</div>
</div>`;
}
