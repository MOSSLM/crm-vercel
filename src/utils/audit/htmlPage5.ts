import type { AuditContent } from '@/types';
import { esc, innerHeader, innerFooter, getServices, calcTotal, fmtEur, makeGrainSvgUrl } from './htmlShared';

export function page5Html(content: AuditContent, opts?: { forPdf?: boolean }) {
  const p = content.page5;
  const gs = content.global_style;
  const services = getServices(p);
  const { total, hasMrr } = calcTotal(services);
  const enabledServices = services.filter(s => s.enabled);
  const showGrain = p.show_grain !== false;
  const flattenForPdf = p.flatten_grain_for_pdf === true;
  // En mode PDF on force le grain off (bruit SVG = PDF très lourd).
  const useGrain = showGrain && !flattenForPdf && opts?.forPdf !== true;
  const addlServices = p.additional_services || [];
  const grainUrl = makeGrainSvgUrl(gs?.grain_base_frequency ?? 0.75, gs?.grain_color ?? '#ffffff');
  const grainOpacity = gs?.grain_opacity ?? 0.045;

  return `
<div class="page">
<div class="inner-page">
  ${innerHeader(p.header_section || 'Tarifs')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">${esc(p.section_label || '04 · Investissement')}</div>
      ${p.pricing_subtitle ? `<div class="invest-subtitle">${esc(p.pricing_subtitle)}</div>` : ''}
      <div class="invest-block">
        <div class="invest-gradient"></div>
        ${useGrain ? `<div style="position:absolute;inset:0;opacity:${grainOpacity};pointer-events:none;z-index:3;background-image:${grainUrl};background-repeat:repeat;background-size:200px 200px"></div>` : ''}
        <div class="invest-inner">
          ${enabledServices.map((svc, i) => `
          <div class="invest-row" style="${i < enabledServices.length - 1 ? 'border-bottom:1px solid rgba(181,208,240,0.1)' : 'border-bottom:none'}">
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
    ${addlServices.length > 0 ? `
    <div style="margin-top:32px">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px">
        <div class="section-eyebrow" style="margin-bottom:0">${esc(p.addl_section_title || 'Services additionnels')}</div>
        <span style="font-size:9px;color:rgba(11,29,58,0.35);letter-spacing:.1em;text-transform:uppercase">· Optionnel</span>
      </div>
      ${p.addl_section_subtitle ? `<div style="font-size:11px;color:rgba(11,29,58,0.5);margin-bottom:16px;line-height:1.6">${esc(p.addl_section_subtitle)}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:${p.addl_section_subtitle ? '0' : '14px'}">
        ${addlServices.map(svc => `
        <div style="padding:18px 20px;background:white;border:1px solid rgba(58,123,213,0.12);border-radius:4px;display:flex;flex-direction:column;gap:6px">
          ${svc.badge ? `<div style="font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:#3A7BD5;background:rgba(58,123,213,0.08);padding:3px 7px;border-radius:2px;align-self:flex-start;font-weight:500">${esc(svc.badge)}</div>` : ''}
          <div style="font-size:13px;font-weight:500;color:#0B1D3A;margin-top:${svc.badge ? '4px' : '0'}">${esc(svc.label)}</div>
          ${svc.description ? `<div style="font-size:11px;color:rgba(11,29,58,0.5);line-height:1.6">${esc(svc.description)}</div>` : ''}
          <div style="font-family:'Cormorant Garamond',serif;font-weight:300;font-size:22px;color:#0B1D3A;margin-top:6px">${fmtEur(svc.amount)}${svc.is_mrr ? '<span style="font-size:13px;color:rgba(11,29,58,0.5)">/mois</span>' : ''}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}
  </div>
  ${innerFooter('05')}
</div>
</div>`;
}
