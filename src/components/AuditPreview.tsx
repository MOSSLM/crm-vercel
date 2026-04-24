'use client';

import React from 'react';
import type { AuditContent } from '@/types';

const C = {
  nuit: '#0B1D3A',
  azur: '#3A7BD5',
  brume: '#B5D0F0',
  creme: '#F4F1EB',
  blanc: '#E8F3FF',
};

const LOGO_PATH = "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z M50,36 A14,14 0 1 0 50,64 A14,14 0 1 0 50,36 Z";

interface Props {
  content: AuditContent;
  logoUrl?: string;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

function Zone({ field, activeField, onFieldClick, children, style }: {
  field: string;
  activeField?: string | null;
  onFieldClick?: (f: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const isActive = activeField === field;
  return (
    <div
      onClick={() => onFieldClick?.(field)}
      style={{
        cursor: onFieldClick ? 'pointer' : 'default',
        outline: isActive ? `2px solid ${C.azur}` : 'none',
        outlineOffset: 2,
        borderRadius: 3,
        transition: 'outline 0.15s',
        ...style,
      }}
      title={onFieldClick ? 'Cliquer pour modifier' : undefined}
      className={onFieldClick ? 'hover:outline hover:outline-2 hover:outline-blue-400/50' : ''}
    >
      {children}
    </div>
  );
}

function InnerHeader({ section }: { section: string }) {
  return (
    <div style={{ background: C.nuit, padding: '22px 72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="18" height="18" viewBox="0 0 100 100" fill="none" style={{ color: C.brume }}>
          <path fill="currentColor" fillRule="evenodd" d={LOGO_PATH} />
        </svg>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 13, letterSpacing: '0.4em', color: C.blanc, textTransform: 'uppercase', paddingLeft: '0.4em' }}>SAMA</span>
      </div>
      <span style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(181,208,240,0.45)', fontWeight: 500 }}>{section}</span>
    </div>
  );
}

function InnerFooter({ page }: { page: string }) {
  return (
    <div style={{ padding: '16px 72px', borderTop: `1px solid rgba(11,29,58,0.08)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(11,29,58,0.3)', textTransform: 'uppercase' }}>sama.fr · Confidentiel</span>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: 'rgba(11,29,58,0.2)' }}>{page}</span>
    </div>
  );
}

function Page1({ content, logoUrl, activeField, onFieldClick }: Props) {
  const p = content.page1;
  return (
    <div id="audit-p1" style={{ width: 794, minHeight: 1123, background: C.nuit, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {/* Sky gradients */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 500px 400px at 80% 20%, rgba(58,123,213,0.35) 0%, transparent 65%), radial-gradient(ellipse 600px 500px at 15% 70%, rgba(58,123,213,0.18) 0%, transparent 60%)` }} />
      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: 1123, padding: '64px 72px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoUrl ? (
              <Zone field="page1.logo" activeField={activeField} onFieldClick={onFieldClick}>
                <img src={logoUrl} alt="Logo" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4 }} />
              </Zone>
            ) : (
              <svg width="26" height="26" viewBox="0 0 100 100" fill="none" style={{ color: C.brume }}>
                <path fill="currentColor" fillRule="evenodd" d={LOGO_PATH} />
              </svg>
            )}
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 20, letterSpacing: '0.45em', color: C.blanc, textTransform: 'uppercase', paddingLeft: '0.45em' }}>SAMA</span>
          </div>
          <Zone field="page1.date" activeField={activeField} onFieldClick={onFieldClick}>
            <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(181,208,240,0.45)', fontWeight: 500, textTransform: 'uppercase' }}>{p.date || 'Audit · Avril 2025'}</span>
          </Zone>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 60 }}>
          <Zone field="page1.eyebrow" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 20 }}>{p.eyebrow}</div>
          </Zone>
          <Zone field="page1.title" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 56, lineHeight: 1.1, color: C.blanc, letterSpacing: '-0.01em', marginBottom: 24 }}>
              {p.title_line1}<br />{p.title_line2}<br />
              <em style={{ fontStyle: 'italic', color: C.brume }}>{p.title_line3}</em>
            </div>
          </Zone>
          <Zone field="page1.subtitle" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(181,208,240,0.65)', maxWidth: 440, fontWeight: 300 }}>{p.subtitle}</div>
          </Zone>

          {/* Client block */}
          <Zone field="page1.client" activeField={activeField} onFieldClick={onFieldClick} style={{ marginTop: 64 }}>
            <div style={{ padding: '24px 28px', border: `1px solid rgba(181,208,240,0.15)`, borderRadius: 4, background: 'rgba(58,123,213,0.06)', display: 'inline-block', maxWidth: 340 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(181,208,240,0.45)', fontWeight: 500, marginBottom: 8 }}>Préparé pour</div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: C.blanc, letterSpacing: '0.03em' }}>{p.client_name || 'Entreprise Cliente'}</div>
              <div style={{ fontSize: 11, color: 'rgba(181,208,240,0.5)', marginTop: 4 }}>{p.client_meta || 'Secteur · Ville, France'}</div>
              {p.demo_url && (
                <div style={{ fontSize: 10, color: C.azur, marginTop: 8, letterSpacing: '0.05em' }}>{p.demo_url}</div>
              )}
            </div>
          </Zone>
        </div>

        {/* Bottom */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(181,208,240,0.3)', lineHeight: 1.8 }}>sama.fr · contact@sama.fr<br />Agence digitale indépendante · Paris</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 64, fontWeight: 300, color: 'rgba(58,123,213,0.12)', lineHeight: 1 }}>01</div>
        </div>
      </div>
    </div>
  );
}

function Page2({ content, activeField, onFieldClick }: Props) {
  const p = content.page2;
  return (
    <div id="audit-p2" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader section="Votre situation" />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>01 · Contexte</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>Ce que nous<br />avons <em style={{ fontStyle: 'italic', color: C.azur }}>observé</em></div>
          <Zone field="page2.section_intro" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(11,29,58,0.65)', maxWidth: 560, marginTop: 16, fontWeight: 300 }}>{p.section_intro}</div>
          </Zone>
        </div>

        {/* Problem cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {p.problems.map((prob, i) => (
            <Zone key={i} field={`page2.problems.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ padding: 20, border: `1px solid rgba(11,29,58,0.08)`, borderRadius: 4, background: 'rgba(11,29,58,0.02)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ width: 28, height: 28, background: 'rgba(58,123,213,0.08)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: C.azur }}>
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1" />
                    <line x1="7" y1="4.5" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    <circle cx="7" cy="9.5" r="0.5" fill="currentColor" />
                  </svg>
                </div>
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

function Page3({ content, activeField, onFieldClick }: Props) {
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

function Page4({ content, activeField, onFieldClick }: Props) {
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
              <div style={{ padding: 22, borderRadius: 4, background: 'white', border: `1px solid rgba(11,29,58,0.06)`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.nuit }}>{liv.title}</div>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(58,123,213,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: C.azur }}>
                      <path d="M2 5L4.5 7.5L8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
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

function Page5({ content, activeField, onFieldClick }: Props) {
  const p = content.page5;
  return (
    <div id="audit-p5" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader section="Planning & Investissement" />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>04 · Calendrier</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>En ligne en <em style={{ fontStyle: 'italic', color: C.azur }}>3 semaines</em></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 52, top: 16, bottom: 16, width: 1, background: `linear-gradient(180deg, ${C.azur}, rgba(58,123,213,0.1))` }} />
          {p.planning_steps.map((step, i) => (
            <Zone key={i} field={`page5.planning_steps.${i}`} activeField={activeField} onFieldClick={onFieldClick}>
              <div style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: 24, alignItems: 'start', padding: '12px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.azur, border: `2px solid ${C.creme}`, boxShadow: `0 0 0 1px ${C.azur}`, position: 'relative', zIndex: 1 }} />
                  <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(11,29,58,0.35)', fontWeight: 500, textAlign: 'center', marginTop: 2 }}>{step.week}</div>
                </div>
                <div style={{ paddingTop: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.nuit, marginBottom: 3 }}>{step.title}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(11,29,58,0.5)' }}>{step.desc}</div>
                </div>
              </div>
            </Zone>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>05 · Investissement</div>
          <Zone field="page5.pricing" activeField={activeField} onFieldClick={onFieldClick}>
            <div style={{ background: C.nuit, borderRadius: 6, padding: '36px 40px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 300px 200px at 90% 0%, rgba(58,123,213,0.3) 0%, transparent 65%), radial-gradient(ellipse 200px 200px at 0% 100%, rgba(58,123,213,0.15) 0%, transparent 60%)', opacity: 0.6 }} />
              <div style={{ position: 'relative', zIndex: 2 }}>
                {[
                  { label: p.price_setup_label, sub: p.price_setup_desc, amount: p.price_setup },
                  { label: p.price_monthly_label, sub: p.price_monthly_desc, amount: p.price_monthly },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 24, padding: '14px 0', borderBottom: `1px solid rgba(181,208,240,0.1)` }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'rgba(181,208,240,0.7)' }}>{row.label}</div>
                      <div style={{ fontSize: 10, color: 'rgba(181,208,240,0.35)', marginTop: 2 }}>{row.sub}</div>
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: C.blanc, whiteSpace: 'nowrap' }}>{row.amount}</div>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'baseline', gap: 24, borderTop: `1px solid rgba(181,208,240,0.2)`, marginTop: 8, paddingTop: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.blanc }}>{p.price_total_label}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 40, color: C.blanc }}>{p.price_total}</div>
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

function Page6({ content, activeField, onFieldClick }: Props) {
  const p = content.page6;
  return (
    <div id="audit-p6" style={{ width: 794, minHeight: 1123, background: C.creme, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <InnerHeader section="Prochaines étapes" />
      <div style={{ flex: 1, padding: '56px 72px 48px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.azur, fontWeight: 500, marginBottom: 10 }}>06 · Pour démarrer</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: C.nuit }}>Trois étapes,<br />puis c'est <em style={{ fontStyle: 'italic', color: C.azur }}>lancé</em></div>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(11,29,58,0.65)', maxWidth: 560, marginTop: 16, fontWeight: 300 }}>Pas de processus compliqué. On garde ça simple et rapide — vous avez une entreprise à faire tourner.</div>
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
              <div style={{ fontSize: 12, fontWeight: 500, color: C.azur }}>{p.contact_phone}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.azur }}>{p.contact_email}</div>
              <div style={{ fontSize: 10, color: 'rgba(11,29,58,0.4)', marginTop: 4, letterSpacing: '0.08em' }}>{p.contact_website}</div>
            </div>
          </div>
        </Zone>

        <div style={{ marginTop: 'auto', paddingTop: 32, borderTop: `1px solid rgba(11,29,58,0.07)`, display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="20" height="20" viewBox="0 0 100 100" fill="none" style={{ color: C.azur, opacity: 0.4 }}>
            <path fill="currentColor" fillRule="evenodd" d={LOGO_PATH} />
          </svg>
          <div style={{ fontSize: 10, color: 'rgba(11,29,58,0.35)', lineHeight: 1.7, letterSpacing: '0.04em' }}>
            SAMA · Agence digitale indépendante · Paris, France<br />
            Document confidentiel préparé exclusivement pour {content.page1.client_name || 'Entreprise Cliente'}
          </div>
        </div>
      </div>
      <InnerFooter page="06" />
    </div>
  );
}

export function AuditPreview({ content, logoUrl, activeField, onFieldClick }: Props) {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.nuit }}>
      <Page1 content={content} logoUrl={logoUrl} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <Page2 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <Page3 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <Page4 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <Page5 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <Page6 content={content} activeField={activeField} onFieldClick={onFieldClick} />
    </div>
  );
}
