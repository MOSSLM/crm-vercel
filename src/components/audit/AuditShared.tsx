'use client';
import React from 'react';
import type { AuditPricingService, AuditPage5, AuditGlobalStyle } from '@/types';

export const C = {
  nuit: '#0B1D3A',
  azur: '#3A7BD5',
  brume: '#B5D0F0',
  creme: '#F4F1EB',
  blanc: '#E8F3FF',
};

export const LOGO_PATH = "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z M50,36 A14,14 0 1 0 50,64 A14,14 0 1 0 50,36 Z";

export function makeGrainBg(freq = 0.75, color = '#ffffff'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="4" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="gray"/><feFlood flood-color="${color}" result="c"/><feComposite in="c" in2="gray" operator="in"/></filter></defs><rect width="200" height="200" filter="url(#n)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const GRAIN_BG = makeGrainBg();

export function GrainOverlay({ globalStyle }: { globalStyle?: AuditGlobalStyle }) {
  const opacity = globalStyle?.grain_opacity ?? 0.045;
  const freq = globalStyle?.grain_base_frequency ?? 0.75;
  const color = globalStyle?.grain_color ?? '#ffffff';
  return (
    <div style={{
      position: 'absolute', inset: 0, opacity, pointerEvents: 'none', zIndex: 3,
      backgroundImage: makeGrainBg(freq, color), backgroundRepeat: 'repeat', backgroundSize: '200px 200px',
    }} />
  );
}

export function Zone({ field, activeField, onFieldClick, children, style }: {
  field: string; activeField?: string | null;
  onFieldClick?: (f: string) => void;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div
      onClick={() => onFieldClick?.(field)}
      style={{
        cursor: onFieldClick ? 'pointer' : 'default',
        outline: activeField === field ? `2px solid ${C.azur}` : 'none',
        outlineOffset: 2, borderRadius: 3, transition: 'outline 0.15s', ...style,
      }}
      className={onFieldClick ? 'hover:outline hover:outline-2 hover:outline-blue-400/50' : ''}
    >
      {children}
    </div>
  );
}

export function SamaLogo({ size = 26, color = C.brume }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path fill={color} fillRule="evenodd" d={LOGO_PATH} />
    </svg>
  );
}

export function InnerHeader({ section, sectionField, activeField, onFieldClick }: {
  section: string;
  sectionField?: string;
  activeField?: string | null;
  onFieldClick?: (f: string) => void;
}) {
  const sectionLabel = (
    <span style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(181,208,240,0.45)', fontWeight: 500 }}>{section}</span>
  );
  return (
    <div style={{ background: C.nuit, padding: '22px 72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SamaLogo size={18} color={C.brume} />
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 13, letterSpacing: '0.4em', color: C.blanc, textTransform: 'uppercase', paddingLeft: '0.4em' }}>SAMA</span>
      </div>
      {sectionField ? (
        <Zone field={sectionField} activeField={activeField} onFieldClick={onFieldClick}>{sectionLabel}</Zone>
      ) : sectionLabel}
    </div>
  );
}

export function InnerFooter({ page }: { page: string }) {
  return (
    <div style={{ padding: '16px 72px', borderTop: `1px solid rgba(11,29,58,0.08)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(11,29,58,0.3)', textTransform: 'uppercase' }}>Confidentiel</span>
      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: 'rgba(11,29,58,0.2)' }}>{page}</span>
    </div>
  );
}

export function getServices(p: AuditPage5): AuditPricingService[] {
  if (p.services && p.services.length > 0) return p.services;
  const svcs: AuditPricingService[] = [];
  const parseAmt = (s?: string) => parseFloat((s || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  if (p.price_setup_label) svcs.push({ label: p.price_setup_label, sub_label: p.price_setup_desc, amount: parseAmt(p.price_setup), is_mrr: false, enabled: true });
  if (p.price_monthly_label) svcs.push({ label: p.price_monthly_label, sub_label: p.price_monthly_desc, amount: parseAmt(p.price_monthly), is_mrr: true, enabled: true });
  return svcs;
}

export function calcTotal(services: AuditPricingService[]) {
  const en = services.filter(s => s.enabled);
  const oneTime = en.filter(s => !s.is_mrr).reduce((a, s) => a + s.amount, 0);
  const mrr = en.filter(s => s.is_mrr).reduce((a, s) => a + s.amount, 0);
  return { oneTime, mrr, total: oneTime + mrr * 12, hasMrr: mrr > 0 };
}

export function fmtEur(n: number) {
  return n.toLocaleString('fr-FR') + ' €';
}
