import type { AuditContent } from '@/types';
import { esc, innerHeader, innerFooter, getServices, calcTotal, fmtEur, GRAIN_SVG } from './htmlShared';

export function page5Html(content: AuditContent) {
  const p = content.page5;
  const services = getServices(p);
  const { total, hasMrr } = calcTotal(services);
  const showGrain = p.show_grain !== false;
  const flattenForPdf = p.flatten_grain_for_pdf === true;
  const useGrain = showGrain && !flattenForPdf;

  return `
<div class="page">
<div class="inner-page">
  ${innerHeader('Planning &amp; Investissement')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">04 · Calendrier</div>
      <div class="section-title">Mise en ligne <em>sous 7 jours</em></div>
    </div>
    <div class="planning-timeline">
      ${p.planning_steps.map(step => `
      <div class="planning-step">
        <div class="planning-week"><div class="planning-week-label">${esc(step.week)}</div></div>
        <div class="planning-dot-col"><div class="planning-dot"></div></div>
        <div><div class="planning-step-title">${esc(step.title)}</div><div class="planning-step-desc">${esc(step.desc)}</div></div>
      </div>`).join('')}
    </div>
    <div>
      <div class="invest-eyebrow">05 · Investissement</div>
      ${p.pricing_subtitle ? `<div class="invest-subtitle">${esc(p.pricing_subtitle)}</div>` : ''}
      <div class="invest-block">
        <div class="invest-gradient"></div>
        ${useGrain ? `<div style="position:absolute;inset:0;opacity:.045;pointer-events:none;z-index:3;background-image:${GRAIN_SVG};background-repeat:repeat;background-size:200px 200px"></div>` : ''}
        <div class="invest-inner">
          ${services.filter(s => s.enabled).map(svc => `
          <div class="invest-row">
            <div>
              <div class="invest-label">${esc(svc.label)}</div>
              ${svc.sub_label ? `<div class="invest-sublabel">${esc(svc.sub_label)}</div>` : ''}
            </div>
            <div class="invest-amount">${fmtEur(svc.amount)}${svc.is_mrr ? '/mois' : ''}</div>
          </div>`).join('')}
          <div class="invest-row-total">
            <div class="invest-total-label">${hasMrr ? 'Investissement total (an 1)' : 'Investissement total'}</div>
            <div class="invest-total-amount">${fmtEur(total)}</div>
          </div>
          <div class="invest-note">${esc(p.price_note)}</div>
        </div>
      </div>
    </div>
  </div>
  ${innerFooter('05')}
</div>
</div>`;
}
