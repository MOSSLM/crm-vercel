'use client';
import React from 'react';
import type { AuditContent } from '@/types';
import { C, Zone, InnerHeader, InnerFooter } from './AuditShared';

interface Props {
  content: AuditContent;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

function AlertIcon() {
  return (
    <div style={{ width: 28, height: 28, background: 'rgba(58,123,213,0.1)', border: `1px solid rgba(58,123,213,0.2)`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke={C.azur} strokeWidth="1" />
        <line x1="7" y1="4.5" x2="7" y2="7.5" stroke={C.azur} strokeWidth="1.1" strokeLinecap="round" />
        <circle cx="7" cy="9.5" r="0.5" fill={C.azur} />
      </svg>
    </div>
  );
}

export function AuditPage2({ content, activeField, onFieldClick }: Props) {
  const p = content.page2;
  return (
    <div id="audit-p2" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader
        section={p.header_section || 'Votre situation'}
        sectionField="page2.header_section"
        activeField={activeField}
        onFieldClick={onFieldClick}
      />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div>
          <Zone field="page2.section_label" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>
              {p.section_label || '01 · Contexte'}
            </div>
          </Zone>
          <Zone field="page2.section_heading" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>
              {p.section_title || 'Ce que nous avons'}{' '}
              <em style={{ fontStyle: 'italic', color: C.azur }}>{p.section_title_em || 'observé'}</em>
            </div>
          </Zone>
          <Zone field="page2.section_intro" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(11,29,58,0.65)', maxWidth: 560, marginTop: 16, fontWeight: 300 }}>{p.section_intro}</div>
          </Zone>
        </div>

        {/* Problem cards — jusqu'à 6 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {p.problems.map((prob, i) => (
            <Zone key={i} field={`page2.problems.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ padding: 20, border: `1px solid rgba(58,123,213,0.15)`, borderRadius: 4, background: 'rgba(11,29,58,0.02)', display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                <AlertIcon />
                <div style={{ fontSize: 12, fontWeight: 500, color: C.nuit, letterSpacing: '0.02em' }}>{prob.title}</div>
                <div style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(11,29,58,0.55)' }}>{prob.desc}</div>
              </div>
            </Zone>
          ))}
        </div>

        {/* Quote */}
        <Zone field="page2.quote" activeField={activeField} onFieldClick={onFieldClick}>
          <div style={{ padding: '24px 28px', borderLeft: `2px solid ${C.azur}`, background: 'rgba(58,123,213,0.04)', borderRadius: '0 4px 4px 0' }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: C.nuit, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 10 }}>"{p.quote}"</p>
            <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(11,29,58,0.4)', fontWeight: 500 }}>{p.quote_source}</p>
          </div>
        </Zone>
      </div>
      <InnerFooter page="02" />
    </div>
  );
}
