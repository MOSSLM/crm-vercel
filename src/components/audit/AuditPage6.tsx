'use client';
import React from 'react';
import type { AuditContent } from '@/types';
import { C, Zone, SamaLogo, InnerHeader, InnerFooter } from './AuditShared';

interface Props {
  content: AuditContent;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

export function AuditPage6({ content, activeField, onFieldClick }: Props) {
  const p = content.page6;
  return (
    <div id="audit-p6" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader
        section={p.header_section || 'Prochaines étapes'}
        sectionField="page6.header_section"
        activeField={activeField}
        onFieldClick={onFieldClick}
      />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div>
          <Zone field="page6.section_label" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>
              {p.section_label || '05 · Pour démarrer'}
            </div>
          </Zone>
          <Zone field="page6.section_heading" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>
              {p.section_title || 'Simple, rapide,'}<br />
              {p.section_title_line2 || "et c'est"}{' '}
              <em style={{ fontStyle: 'italic', color: C.azur }}>{p.section_title_em || 'lancé'}</em>
            </div>
          </Zone>
          <Zone field="page6.section_subtitle" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(11,29,58,0.65)', maxWidth: 560, marginTop: 16, fontWeight: 300 }}>
              {p.section_subtitle || "Pas de processus compliqué. On travaille vite et bien — vous avez une entreprise à faire tourner."}
            </div>
          </Zone>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {p.next_steps.map((step, i) => (
            <Zone key={i} field={`page6.next_steps.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ padding: 22, border: `1px solid rgba(11,29,58,0.08)`, borderRadius: 4 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 40, fontWeight: 300, color: 'rgba(58,123,213,0.15)', lineHeight: 1, marginBottom: 10 }}>{i + 1}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.nuit, marginBottom: 6 }}>{step.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(11,29,58,0.5)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            </Zone>
          ))}
        </div>

        <Zone field="page6.cta" activeField={activeField} onFieldClick={onFieldClick}>
          <div style={{ background: 'rgba(58,123,213,0.05)', border: `1px solid rgba(58,123,213,0.15)`, borderRadius: 4, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: C.nuit, marginBottom: 4 }}>{p.cta_title}</div>
              <div style={{ fontSize: 11, color: 'rgba(11,29,58,0.5)' }}>{p.cta_sub}</div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {p.contact_phone && <div style={{ fontSize: 12, fontWeight: 500, color: C.azur }}>{p.contact_phone}</div>}
              {p.contact_email && <div style={{ fontSize: 12, fontWeight: 500, color: C.azur }}>{p.contact_email}</div>}
              {p.contact_website && <div style={{ fontSize: 10, color: 'rgba(11,29,58,0.4)', marginTop: 4, letterSpacing: '0.08em' }}>{p.contact_website}</div>}
            </div>
          </div>
        </Zone>

        <div style={{ marginTop: 'auto', paddingTop: 32, borderTop: `1px solid rgba(11,29,58,0.07)`, display: 'flex', alignItems: 'center', gap: 16 }}>
          <SamaLogo size={20} color={C.azur} />
          <div style={{ fontSize: 10, color: 'rgba(11,29,58,0.35)', lineHeight: 1.7, letterSpacing: '0.04em' }}>
            SAMA · Agence digitale indépendante<br />
            Document confidentiel préparé exclusivement pour {content.page1.client_name || 'Entreprise Cliente'}
          </div>
        </div>
      </div>
      <InnerFooter page="06" />
    </div>
  );
}
