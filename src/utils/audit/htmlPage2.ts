import type { AuditContent } from '@/types';
import type { AuditLu } from '@/lib/audit-site/lecture';
import { esc, innerHeader, innerFooter } from './htmlShared';
import {
  autresAmeliorations,
  phraseAutresAmeliorations,
  titreDetailAmeliorations,
  ligneAmelioration,
  type AuditVariante,
} from '@/lib/audit/autres-ameliorations';

const alertIconSvg = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
  <circle cx="7" cy="7" r="5.5" stroke="#2F7AE0" stroke-width="1"/>
  <line x1="7" y1="4.5" x2="7" y2="7.5" stroke="#2F7AE0" stroke-width="1.1" stroke-linecap="round"/>
  <circle cx="7" cy="9.5" r="0.5" fill="#2F7AE0"/>
</svg>`;

export function page2Html(content: AuditContent, audit?: AuditLu | null, variante: AuditVariante = 'court') {
  const p = content.page2;
  // Miroir de `AuditPage2.tsx` : on argumente sur trois cartes et on prouve la
  // profondeur par un décompte de preuves en échec, jamais par une estimation.
  // La version complète déplie ce décompte au lieu de le résumer.
  const restantes = autresAmeliorations(
    audit,
    p.problems.map(x => x.key).filter((k): k is string => !!k),
  );
  return `
<div class="page">
<div class="inner-page">
  ${innerHeader(p.header_section || 'Votre situation')}
  <div class="inner-body">
    <div>
      <div class="section-eyebrow">${esc(p.section_label || '01 · Contexte')}</div>
      <div class="section-title">${esc(p.section_title || 'Ce que nous avons')} <em>${esc(p.section_title_em || 'observé')}</em></div>
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
    ${restantes.nombre === 0 ? '' : variante === 'court'
      ? `<div class="problem-autres">${esc(phraseAutresAmeliorations(restantes) ?? '')}</div>`
      : `<div class="problem-detail">
      <div class="problem-detail-titre">${esc(titreDetailAmeliorations(restantes))}</div>
      <div class="problem-detail-grid">${restantes.entrees
        .map(e => `<div>· ${esc(ligneAmelioration(e))}</div>`)
        .join('')}</div>
    </div>`}
    <div style="padding:24px 28px;border-left:2px solid #2F7AE0;background:rgba(47, 122, 224,.04);border-radius:0 4px 4px 0">
      <p style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:#0A1B33;font-style:italic;line-height:1.5;margin-bottom:10px">"${esc(p.quote)}"</p>
      <p style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(10, 27, 51,.4);font-weight:500">${esc(p.quote_source)}</p>
    </div>
  </div>
  ${innerFooter('02')}
</div>
</div>`;
}
