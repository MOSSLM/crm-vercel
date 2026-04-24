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
  const { oneTime, mrr, total, hasMrr } = calcTotal(services);

  return (
    <div id="audit-p5" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader section="Planning & Investissement" />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>

        {/* Planning */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>04 · Calendrier</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>Mise en ligne <em style={{ fontStyle: 'italic', color: C.azur }}>sous 7 jours</em></div>
        </div>

        {/* Timeline — fixed layout: label | dot | content */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 72, top: 16, bottom: 16, width: 1, background: `linear-gradient(180deg, ${C.azur}, rgba(58,123,213,0.1))` }} />
          {p.planning_steps.map((step, i) => (
            <Zone key={i} field={`page5.planning_steps.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ display: 'grid', gridTemplateColumns: '56px 16px 1fr', gap: '0 16px', alignItems: 'start', padding: '12px 0' }}>
                {/* Week label — right-aligned, clearly left of the line */}
                <div style={{ textAlign: 'right', paddingTop: 1 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,29,58,0.4)', fontWeight: 500, lineHeight: 1.3 }}>{step.week}</div>
                </div>
                {/* Dot — centered in its 16px column, sitting on the line at left:72px */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 3, position: 'relative', zIndex: 1 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.azur, border: `2px solid ${C.creme}`, boxShadow: `0 0 0 1px ${C.azur}` }} />
                </div>
                {/* Content */}
                <div style={{ paddingTop: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.nuit, marginBottom: 3 }}>{step.title}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(11,29,58,0.5)' }}>{step.desc}</div>
                </div>
              </div>
            </Zone>
          ))}
        </div>

        {/* Investment card */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 6 }}>05 · Investissement</div>
          {p.pricing_subtitle && (
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: C.nuit, marginBottom: 12, fontStyle: 'italic' }}>{p.pricing_subtitle}</div>
          )}
          <Zone field="page5.pricing" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ background: C.nuit, borderRadius: 6, padding: '36px 40px', position: 'relative', overflow: 'hidden' }}>
              {/* Gradient */}
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 300px 200px at 90% 0%, rgba(58,123,213,0.3) 0%, transparent 65%), radial-gradient(ellipse 200px 200px at 0% 100%, rgba(58,123,213,0.15) 0%, transparent 60%)', opacity: 0.6 }} />
              {/* Grain */}
              {showGrain && <GrainOverlay />}
              <div style={{ position: 'relative', zIndex: 4 }}>
                {services.filter(s => s.enabled).map((svc, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 24, padding: '14px 0', borderBottom: `1px solid rgba(181,208,240,0.1)` }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'rgba(181,208,240,0.7)' }}>{svc.label}</div>
                      {svc.sub_label && <div style={{ fontSize: 10, color: 'rgba(181,208,240,0.35)', marginTop: 2 }}>{svc.sub_label}</div>}
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: C.blanc, whiteSpace: 'nowrap' }}>
                      {fmtEur(svc.amount)}{svc.is_mrr ? '/mois' : ''}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 24, borderTop: `1px solid rgba(181,208,240,0.2)`, marginTop: 8, paddingTop: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.blanc }}>{hasMrr ? 'Investissement total (an 1)' : 'Investissement total'}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 40, color: C.blanc }}>{fmtEur(total)}</div>
                </div>
                <div style={{ marginTop: 20, fontSize: 10, color: 'rgba(181,208,240,0.4)', lineHeight: 1.7, borderTop: `1px solid rgba(181,208,240,0.08)`, paddingTop: 16 }}>{p.price_note}</div>
              </div>
            </div>
          </Zone>
        </div>
      </div>
      <InnerFooter page="05" />
    </div>
  );
}
