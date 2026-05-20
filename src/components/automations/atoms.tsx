'use client'
// atoms.tsx — atomes partagés portés depuis claude design/automations-atoms.jsx.
import React, { useState, useEffect, useRef } from 'react'
import { XI } from './icons'

export type Cn = string | false | null | undefined
export const cx = (...xs: Cn[]) => xs.filter(Boolean).join(' ')

// ── Outside-click hook ─────────────────────────────────────────────────────
export function useOutsideClose(
  ref: React.RefObject<HTMLElement | null>,
  onClose?: () => void,
  ignore: React.RefObject<HTMLElement | null>[] = [],
) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return
      if (ref.current.contains(e.target as Node)) return
      for (const r of ignore) {
        if (r?.current?.contains(e.target as Node)) return
      }
      onClose?.()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, onClose])
}

// ── Section accordion ──────────────────────────────────────────────────────
export function Section({
  label,
  count,
  defaultOpen = true,
  children,
  accessory,
}: {
  label: React.ReactNode
  count?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  accessory?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section">
      <button type="button" className="section-hd" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <XI name="chevdown" className="ico-xs chev" />
        <span>{label}</span>
        {count !== undefined && <span className="count">{count}</span>}
        {accessory && <span style={{ marginLeft: 'auto' }}>{accessory}</span>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

// ── Field row ─────────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {required && <span className="req">·</span>}
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Toggle row ────────────────────────────────────────────────────────────
export function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  accent = false,
}: {
  label: React.ReactNode
  desc?: React.ReactNode
  checked?: boolean
  onChange?: (v: boolean) => void
  accent?: boolean
}) {
  return (
    <div className="toggle-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lbl">{label}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <button
        type="button"
        className={cx('toggle', accent && 'accent')}
        aria-checked={!!checked}
        onClick={() => onChange?.(!checked)}
      />
    </div>
  )
}

// ── Segmented (full-width) ────────────────────────────────────────────────
export type SegOption = string | { value: string; label: React.ReactNode }

export function SegFull({
  value,
  onChange,
  options,
}: {
  value: string
  onChange?: (v: string) => void
  options: SegOption[]
}) {
  return (
    <div className="seg" style={{ width: '100%' }}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        return (
          <button
            key={v}
            type="button"
            style={{ flex: 1, justifyContent: 'center' }}
            aria-pressed={value === v}
            onClick={() => onChange?.(v)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────
export type AutomationStatus = 'on' | 'paused' | 'draft' | 'error'

export function StatusBadge({ status }: { status: AutomationStatus }) {
  const map: Record<AutomationStatus, { label: string; cls: string }> = {
    on: { label: 'Active', cls: 'on' },
    paused: { label: 'En pause', cls: 'paused' },
    draft: { label: 'Brouillon', cls: 'draft' },
    error: { label: 'Erreur', cls: 'error' },
  }
  const s = map[status] || map.draft
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11.5, color: 'var(--text-2)' }}>
      <span className={`status-dot ${s.cls}`} />
      {s.label}
    </span>
  )
}

// ── Avatar (initials + color) ─────────────────────────────────────────────
export type AvUser = { name?: string | null; initials?: string | null; color?: string | null }

export function Av({ user, size = 22, ring }: { user?: AvUser | null; size?: number; ring?: boolean }) {
  if (!user) return null
  const initials = user.initials || (user.name || '?').slice(0, 2).toUpperCase()
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: user.color || 'var(--bg-2)',
        color: '#fff',
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        letterSpacing: '-.02em',
        flexShrink: 0,
        boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 3px ${user.color || 'var(--accent)'}` : 'none',
      }}
    >
      {initials}
    </span>
  )
}

// ── Search input ──────────────────────────────────────────────────────────
export function SearchInput({
  value,
  onChange,
  placeholder = 'Rechercher…',
  style,
}: {
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  return (
    <div className="search-wrap" style={{ position: 'relative', ...style }}>
      <XI
        name="search"
        className="ico-sm"
        style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }}
      />
      <input
        className="input"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: 30 }}
      />
    </div>
  )
}

// ── Mini sparkline ────────────────────────────────────────────────────────
export function Spark({
  data,
  color = 'var(--ok)',
  height = 18,
  width = 64,
}: {
  data?: number[]
  color?: string
  height?: number
  width?: number
}) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data, 1)
  const w = width / Math.max(data.length - 1, 1)
  const pts = data.map((v, i) => `${i * w},${height - (v / max) * (height - 2) - 1}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── Operators (conditions) ────────────────────────────────────────────────
export type OpId = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'isset' | 'isnotset'

export const OPS: { id: OpId; label: string; symbol: string }[] = [
  { id: 'eq', label: '=', symbol: '=' },
  { id: 'neq', label: '≠', symbol: '≠' },
  { id: 'gt', label: '>', symbol: '>' },
  { id: 'gte', label: '≥', symbol: '≥' },
  { id: 'lt', label: '<', symbol: '<' },
  { id: 'lte', label: '≤', symbol: '≤' },
  { id: 'contains', label: 'contient', symbol: '∋' },
  { id: 'in', label: 'dans', symbol: '∈' },
  { id: 'isset', label: 'renseigné', symbol: '∃' },
  { id: 'isnotset', label: 'vide', symbol: '∅' },
]

export function OpSelect({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <select
      className="select"
      style={{ width: 90, height: 26, fontFamily: 'var(--font-mono)', fontSize: 12 }}
      value={value || 'eq'}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {OPS.map((o) => (
        <option key={o.id} value={o.id}>
          {o.symbol}  {o.label}
        </option>
      ))}
    </select>
  )
}

// ── Modal shell (portaled, wrapped in .au-skin) ───────────────────────────
export function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return mounted
}

export { useState, useEffect, useRef }
