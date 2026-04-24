'use client';
import React from 'react';
import type { AuditContent } from '@/types';
import { C, Zone, InnerHeader, InnerFooter } from './AuditShared';

interface Props {
  content: AuditContent;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

function CheckBadge() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(58,123,213,0.12)', border: `1px solid rgba(58,123,213,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5L4.5 7.5L8 3" stroke={C.azur} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function AuditPage4({ content, activeField, onFieldClick }: Props) {
  const p = content.page4;
  return (
    <div id="audit-p4" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader section="Livrables inclus" />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>03 · Ce que vous recevez</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>Tout est <em style={{ fontStyle: 'italic', color: C.azur }}>inclus</em></div>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(11,29,58,0.65)', maxWidth: 560, marginTop: 16, fontWeight: 300 }}>Aucune mauvaise surprise. Voici exactement ce que comprend la prestation.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {p.livrables.map((liv, i) => (
            <Zone key={i} field={`page4.livrables.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ padding: 22, borderRadius: 4, background: 'white', border: `1px solid rgba(58,123,213,0.12)`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.nuit }}>{liv.title}</div>
                  <CheckBadge />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {liv.items.map((item, j) => (
                    <div key={j} style={{ fontSize: 11, color: 'rgba(11,29,58,0.55)', lineHeight: 1.5, paddingLeft: 10, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: 'rgba(58,123,213,0.4)', fontSize: 9, top: 2 }}>—</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </Zone>
          ))}
        </div>
      </div>
      <InnerFooter page="04" />
    </div>
  );
}
