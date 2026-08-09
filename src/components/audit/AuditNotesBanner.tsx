'use client';
import React from 'react';
import { C } from './AuditShared';
import type { AuditLu } from '@/lib/audit-site/lecture';

/**
 * Le bandeau de notes mesurées, en tête de la page « Situation » du deck A4.
 *
 * LE PLUS PETIT CHANGEMENT UTILE au document de vente : les six pages restent
 * du rédactionnel, mais elles s'ouvrent désormais sur des chiffres. Le
 * commercial n'a plus à choisir entre « le beau PDF » et « les vraies mesures ».
 *
 * Il ne modifie PAS `audits.content` : les notes viennent de l'analyse, pas du
 * document. C'est ce qui permet de les rafraîchir sans toucher au rédactionnel,
 * et ce qui garantit que le PDF et le rapport web ne peuvent pas se contredire.
 *
 * Ne rend rien sans mesure — un bandeau de tirets serait pire que son absence.
 */

const NOM_AXE: Record<string, string> = {
  vitesse: 'Vitesse',
  seo: 'Référencement',
  mobile: 'Mobile',
  conversion: 'Contact',
};

function ton(note: number): string {
  return note >= 70 ? '#1F8A5B' : note >= 45 ? '#C8881F' : '#B5322F';
}

export function AuditNotesBanner({ audit }: { audit?: AuditLu | null }) {
  if (!audit || audit.note_globale == null || audit.axes.length === 0) return null;

  const note = audit.note_globale;
  // Une seule ligne peut porter la mention : la règle de cohabitation est
  // appliquée en amont (`lecture.ts`), on ne fait que la refléter.
  const parGoogle = audit.axes.some((a) => a.mesureGoogle);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        padding: '20px 24px',
        borderRadius: 6,
        background: C.nuit,
        color: C.blanc,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 92 }}>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontSize: 44,
            lineHeight: 1,
            color: ton(note),
          }}
        >
          {note}
        </div>
        <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(181,208,240,0.5)', marginTop: 4 }}>
          sur 100
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(181,208,240,0.5)', fontWeight: 500 }}>
          Analyse de votre site actuel
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 10 }}>
          {audit.axes.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(181,208,240,0.7)' }}>{NOM_AXE[a.id] ?? a.id}</span>
              <span
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 19,
                  fontWeight: 300,
                  color: ton(a.note),
                }}
              >
                {a.note}
              </span>
            </div>
          ))}
        </div>
        {/* Les axes écartés sont NOMMÉS, pas passés sous silence : un lecteur qui
            compte quatre axes attendus et n'en voit que deux doit savoir
            pourquoi, sinon le document a l'air incomplet plutôt que prudent. */}
        {audit.axes_masques.length > 0 && (
          <div style={{ fontSize: 9, color: 'rgba(181,208,240,0.42)', marginTop: 8, lineHeight: 1.6 }}>
            Non concluant sur ce site : {audit.axes_masques.map((a) => NOM_AXE[a] ?? a).join(', ')}.
          </div>
        )}
      </div>

      {audit.note_globale_demo != null && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 108, borderLeft: '1px solid rgba(181,208,240,0.18)', paddingLeft: 22 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(181,208,240,0.5)' }}>
            Votre nouveau site
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 300,
              fontSize: 34,
              lineHeight: 1,
              color: ton(audit.note_globale_demo),
              marginTop: 6,
            }}
          >
            {audit.note_globale_demo}
          </div>
        </div>
      )}

      {parGoogle && (
        <div style={{ fontSize: 8.5, color: 'rgba(181,208,240,0.4)', writingMode: 'vertical-rl', letterSpacing: '0.1em' }}>
          mesuré par Google
        </div>
      )}
    </div>
  );
}
