'use client';
import React from 'react';
import type { AuditContent } from '@/types';
import { C, LOGO_PATH, GrainOverlay, Zone } from './AuditShared';

interface Props {
  content: AuditContent;
  logoUrl?: string;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

export function AuditPage1({ content, logoUrl, activeField, onFieldClick }: Props) {
  const p = content.page1;
  const gs = content.global_style;
  const domain = p.demo_url ? getDomain(p.demo_url) : '';
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
  const screenshotUrl = p.demo_url ? `https://image.thum.io/get/width/800/crop/400/${p.demo_url}` : '';

  return (
    <div id="audit-p1" style={{ width: 794, height: 1123, background: C.nuit, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {/* Sky gradients */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 500px 400px at 80% 20%, rgba(58,123,213,0.35) 0%, transparent 65%), radial-gradient(ellipse 600px 500px at 15% 70%, rgba(58,123,213,0.18) 0%, transparent 60%)` }} />
      <GrainOverlay globalStyle={gs} />
      {/* Content */}
      <div style={{ position: 'relative', zIndex: 4, display: 'flex', flexDirection: 'column', height: '100%', padding: '64px 72px' }}>
        {/* Top bar — always SAMA logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
              <path fill={C.brume} fillRule="evenodd" d={LOGO_PATH} />
            </svg>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 20, letterSpacing: '0.45em', color: C.blanc, textTransform: 'uppercase', paddingLeft: '0.45em' }}>SAMA</span>
          </div>
          <Zone field="page1.date" activeField={activeField} onFieldClick={onFieldClick}>
            <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(181,208,240,0.45)', fontWeight: 500, textTransform: 'uppercase' }}>{p.date || 'Audit · 2025'}</span>
          </Zone>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 60 }}>
          <Zone field="page1.eyebrow" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 20 }}>{p.eyebrow}</div>
          </Zone>
          <Zone field="page1.title" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: gs?.font_cover_title ?? 56, lineHeight: 1.1, color: C.blanc, letterSpacing: '-0.01em', marginBottom: 24 }}>
              {p.title_line1}<br />{p.title_line2}<br />
              <em style={{ fontStyle: 'italic', color: C.brume }}>{p.title_line3}</em>
            </div>
          </Zone>
          <Zone field="page1.subtitle" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(181,208,240,0.65)', maxWidth: 440, fontWeight: 300 }}>{p.subtitle}</div>
          </Zone>

          {/* Client block + demo mockup on the same row */}
          <div style={{ marginTop: 64, display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            <Zone field="page1.client" activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ padding: '24px 28px', border: `1px solid rgba(181,208,240,0.15)`, borderRadius: 4, background: 'rgba(58,123,213,0.06)', minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(181,208,240,0.45)', fontWeight: 500 }}>Préparé pour</div>
                  {logoUrl && (
                    <Zone field="page1.logo" activeField={activeField} onFieldClick={onFieldClick}>
                      <img src={logoUrl} alt="Logo client" style={{ height: 28, maxWidth: 80, objectFit: 'contain', borderRadius: 2 }} />
                    </Zone>
                  )}
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: C.blanc, letterSpacing: '0.03em' }}>{p.client_name || 'Entreprise Cliente'}</div>
                <div style={{ fontSize: 11, color: 'rgba(181,208,240,0.5)', marginTop: 4 }}>{p.client_meta || 'Adresse'}</div>
              </div>
            </Zone>

            {/* Demo site — browser mockup with screenshot */}
            {p.demo_url && (
              <Zone field="page1.demo" activeField={activeField} onFieldClick={onFieldClick} style={{ flex: 1, minWidth: 200, maxWidth: 300 }}>
                <a href={p.demo_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ padding: '12px 14px', border: `1px solid rgba(58,123,213,0.35)`, borderRadius: 6, background: 'rgba(58,123,213,0.1)', cursor: 'pointer' }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 8 }}>Site démo disponible</div>
                    {/* Browser mockup */}
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', border: `1px solid rgba(181,208,240,0.1)` }}>
                      {/* Address bar */}
                      <div style={{ background: 'rgba(255,255,255,0.07)', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {(['rgba(255,100,100,0.5)', 'rgba(255,200,0,0.5)', 'rgba(100,200,100,0.5)'] as const).map((c, i) => (
                            <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: c }} />
                          ))}
                        </div>
                        <div style={{ flex: 1, height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 2, display: 'flex', alignItems: 'center', paddingLeft: 4, gap: 3 }}>
                          {faviconUrl && (
                            <img src={faviconUrl} alt="" style={{ width: 8, height: 8, objectFit: 'contain', flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 6, color: 'rgba(181,208,240,0.45)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '85%' }}>{p.demo_url}</span>
                        </div>
                      </div>
                      {/* Screenshot — contained within frame */}
                      <div style={{ position: 'relative', height: 110, background: 'rgba(11,29,58,0.6)', overflow: 'hidden' }}>
                        {/* Skeleton fallback */}
                        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4, position: 'absolute', inset: 0 }}>
                          <div style={{ height: 14, background: 'rgba(58,123,213,0.18)', borderRadius: 2, width: '70%' }} />
                          <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 2, width: '90%' }} />
                          <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 2, width: '65%' }} />
                          <div style={{ height: 18, background: 'rgba(58,123,213,0.3)', borderRadius: 3, width: 52, marginTop: 3 }} />
                        </div>
                        {screenshotUrl && (
                          <img
                            src={screenshotUrl}
                            alt="Aperçu du site"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'top center', display: 'block' }}
                            onError={e => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: C.azur, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                      Découvrir votre site démo <span>→</span>
                    </div>
                  </div>
                </a>
              </Zone>
            )}
          </div>
        </div>

        {/* Bottom */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 64, fontWeight: 300, color: 'rgba(58,123,213,0.12)', lineHeight: 1 }}>01</div>
        </div>
      </div>
    </div>
  );
}
