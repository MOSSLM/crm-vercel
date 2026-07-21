'use client';
import React from 'react';
import type { AuditContent } from '@/types';
import { C, Zone, GrainOverlay, InnerHeader, InnerFooter, getServices, calcTotal, fmtEur } from './AuditShared';

interface Props {
  content: AuditContent;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

export function AuditPage5({ content, activeField, onFieldClick }: Props) {
  const p = content.page5;
  const services = getServices(p);
  const showGrain = p.show_grain !== false;
  const { total, hasMrr } = calcTotal(services);
  const enabledServices = services.filter(s => s.enabled);

  return (
    <div id="audit-p5" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader
        section={p.header_section || 'Tarifs'}
        sectionField="page5.header_section"
        activeField={activeField}
        onFieldClick={onFieldClick}
      />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* Investment section */}
        <div>
          <Zone field="page5.section_label" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 6 }}>
              {p.section_label || '04 · Investissement'}
            </div>
          </Zone>
          {p.pricing_subtitle && (
            <Zone field="page5.pricing_subtitle" activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: C.nuit, marginBottom: 12, fontStyle: 'italic' }}>{p.pricing_subtitle}</div>
            </Zone>
          )}

          {/* Main pricing card */}
          <Zone field="page5.pricing" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ background: C.nuit, borderRadius: 6, padding: '36px 40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 300px 200px at 90% 0%, rgba(58,123,213,0.3) 0%, transparent 65%), radial-gradient(ellipse 200px 200px at 0% 100%, rgba(58,123,213,0.15) 0%, transparent 60%)', opacity: 0.6 }} />
              {showGrain && <GrainOverlay globalStyle={content.global_style} />}
              <div style={{ position: 'relative', zIndex: 4 }}>
                {enabledServices.map((svc, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 24, padding: '14px 0', borderBottom: i < enabledServices.length - 1 ? `1px solid rgba(181,208,240,0.1)` : 'none' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'rgba(181,208,240,0.7)' }}>{svc.label}</div>
                      {svc.sub_label && <div style={{ fontSize: 10, color: 'rgba(181,208,240,0.35)', marginTop: 2 }}>{svc.sub_label}</div>}
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: C.blanc, whiteSpace: 'nowrap' }}>
                      {svc.from ? 'À partir de ' : ''}{fmtEur(svc.amount)}{svc.is_mrr ? '/mois' : ''}
                    </div>
                  </div>
                ))}
                {!p.hide_total && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 24, borderTop: `1px solid rgba(181,208,240,0.2)`, marginTop: 8, paddingTop: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: C.blanc }}>{hasMrr ? 'Investissement total (an 1)' : 'Investissement total'}</div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 40, color: C.blanc }}>{fmtEur(total)}</div>
                  </div>
                )}
                <Zone field="page5.price_note" activeField={activeField} onFieldClick={onFieldClick}>
                  <div style={{ marginTop: 20, fontSize: 10, color: 'rgba(181,208,240,0.4)', lineHeight: 1.7, borderTop: `1px solid rgba(181,208,240,0.08)`, paddingTop: 16 }}>{p.price_note}</div>
                </Zone>
              </div>
            </div>
          </Zone>

          {/* Secondary card — alternative offer (e.g. fully-custom site) */}
          {p.secondary_card && (
            <Zone field="page5.secondary_card" activeField={activeField} onFieldClick={onFieldClick} style={{ marginTop: 16 }}>
              <div style={{ background: 'white', border: `1px solid rgba(58,123,213,0.18)`, borderRadius: 6, padding: '22px 28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
                <div>
                  {p.secondary_card.subtitle && (
                    <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 6 }}>{p.secondary_card.subtitle}</div>
                  )}
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: C.nuit, fontStyle: 'italic' }}>{p.secondary_card.title}</div>
                  {p.secondary_card.description && (
                    <div style={{ fontSize: 11, color: 'rgba(11,29,58,0.55)', marginTop: 6, lineHeight: 1.6, maxWidth: 380 }}>{p.secondary_card.description}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {p.secondary_card.from && (
                    <div style={{ fontSize: 10, color: 'rgba(11,29,58,0.5)' }}>À partir de</div>
                  )}
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 30, color: C.nuit }}>{fmtEur(p.secondary_card.amount)}</div>
                </div>
              </div>
            </Zone>
          )}
        </div>

        {/* Additional optional services */}
        {p.additional_services && p.additional_services.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <Zone field="page5.addl_section_title" activeField={activeField} onFieldClick={onFieldClick}>
                <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500 }}>
                  {p.addl_section_title || 'Services additionnels'}
                </div>
              </Zone>
              <span style={{ fontSize: 9, color: 'rgba(11,29,58,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>· Optionnel</span>
            </div>
            {p.addl_section_subtitle && (
              <Zone field="page5.addl_section_subtitle" activeField={activeField} onFieldClick={onFieldClick}>
                <div style={{ fontSize: 11, color: 'rgba(11,29,58,0.5)', marginBottom: 16, lineHeight: 1.6 }}>{p.addl_section_subtitle}</div>
              </Zone>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: p.addl_section_subtitle ? 0 : 14 }}>
              {p.additional_services.map((svc, i) => (
                <Zone key={i} field={`page5.additional_services.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
                  <div style={{ padding: '18px 20px', background: 'white', border: `1px solid rgba(58,123,213,0.12)`, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {svc.badge && (
                      <div style={{ fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.azur, background: 'rgba(58,123,213,0.08)', padding: '3px 7px', borderRadius: 2, alignSelf: 'flex-start', fontWeight: 500 }}>
                        {svc.badge}
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.nuit, marginTop: svc.badge ? 4 : 0 }}>{svc.label}</div>
                    {svc.description && (
                      <div style={{ fontSize: 11, color: 'rgba(11,29,58,0.5)', lineHeight: 1.6 }}>{svc.description}</div>
                    )}
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: C.nuit, marginTop: 6 }}>
                      {fmtEur(svc.amount)}{svc.is_mrr ? <span style={{ fontSize: 13, color: 'rgba(11,29,58,0.5)' }}>/mois</span> : ''}
                    </div>
                  </div>
                </Zone>
              ))}
            </div>
          </div>
        )}
      </div>
      <InnerFooter page="05" />
    </div>
  );
}
