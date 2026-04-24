'use client';
import React from 'react';
import type { AuditContent } from '@/types';
import { C, Zone, InnerHeader, InnerFooter } from './AuditShared';

interface Props {
  content: AuditContent;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

export function AuditPage3({ content, activeField, onFieldClick }: Props) {
  const p = content.page3;
  return (
    <div id="audit-p3" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader section="Notre solution" />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>02 · Ce que l'on fait</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>Un site conçu<br />pour <em style={{ fontStyle: 'italic', color: C.azur }}>convertir</em></div>
          <Zone field="page3.section_intro" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(11,29,58,0.65)', maxWidth: 560, marginTop: 16, fontWeight: 300 }}>{p.section_intro}</div>
          </Zone>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {p.solutions.map((sol, i) => (
            <Zone key={i} field={`page3.solutions.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'start', gap: 16, padding: '18px 0', borderBottom: i < p.solutions.length - 1 ? `1px solid rgba(11,29,58,0.07)` : 'none' }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, color: 'rgba(58,123,213,0.25)', lineHeight: 1 }}>{sol.num}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.nuit, marginBottom: 4 }}>{sol.name}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(11,29,58,0.55)' }}>{sol.desc}</div>
                </div>
                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.azur, background: 'rgba(58,123,213,0.08)', padding: '4px 8px', borderRadius: 2, whiteSpace: 'nowrap', fontWeight: 500 }}>{sol.tag}</div>
              </div>
            </Zone>
          ))}
        </div>
      </div>
      <InnerFooter page="03" />
    </div>
  );
}
