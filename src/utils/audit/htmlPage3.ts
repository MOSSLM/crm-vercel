import type { AuditContent } from '@/types';
import { esc, innerHeader, innerFooter } from './htmlShared';

export function page3Html(content: AuditContent) {
  const p = content.page3;
  return `
<div class="page">
<div class="inner-page">
  ${innerHeader('Notre solution')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">02 · Ce que l'on fait</div>
      <div class="section-title">Un site conçu<br>pour <em>convertir</em></div>
      <div class="section-intro">${esc(p.section_intro)}</div>
    </div>
    <div class="solution-list">
      ${p.solutions.map(sol => `
      <div class="solution-item">
        <div class="solution-num">${esc(sol.num)}</div>
        <div><div class="solution-name">${esc(sol.name)}</div><div class="solution-desc">${esc(sol.desc)}</div></div>
        <div class="solution-tag">${esc(sol.tag)}</div>
      </div>`).join('')}
    </div>
  </div>
  ${innerFooter('03')}
</div>
</div>`;
}
