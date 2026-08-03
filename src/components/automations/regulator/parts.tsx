'use client'
// parts.tsx — briques partagées entre la page Régulateur, l'éditeur de séquence
// et le tiroir « file d'envoi » du pipeline commercial.
import React from 'react'
import { XI } from '../icons'
import {
  DAY_MINUTES,
  formatHM,
  gapForItem,
  localClock,
  overlappingWindows,
  parseHM,
  windowMinutes,
  type SendWindow,
} from '@/lib/automations/regulator'

/* ── Temps ─────────────────────────────────────────────────────────────── */

/** Minutes depuis minuit, dans le fuseau du régulateur. */
export const minutesOfDay = (iso: string | number, tz: string): number =>
  localClock(typeof iso === 'number' ? iso : Date.parse(iso), tz).minutes

/** Heure locale « 14:05 ». */
export const hm = (iso: string | number | null | undefined, tz: string): string => {
  if (iso == null) return '—:—'
  const ms = typeof iso === 'number' ? iso : Date.parse(iso)
  if (!Number.isFinite(ms)) return '—:—'
  return formatHM(localClock(ms, tz).minutes)
}

/** Nombre de jours d'écart entre deux instants, en jours locaux. */
export const dayOffset = (iso: string | number, now: number, tz: string): number => {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso)
  const a = localClock(ms, tz)
  const b = localClock(now, tz)
  if (a.dayKey === b.dayKey) return 0
  return Math.max(1, Math.round((ms - now) / 86_400_000) || 1)
}

/** « demain 08:30 », « +2 j 09:00 » ou simplement « 10:14 ». */
export const hmd = (iso: string | null | undefined, now: number, tz: string): string => {
  if (!iso) return '—:—'
  const d = dayOffset(iso, now, tz)
  const prefix = d === 0 ? '' : d === 1 ? 'demain ' : `+${d} j `
  return prefix + hm(iso, tz)
}

/** Durée lisible : « 4 min », « 1 h 12 ». */
export function duration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000))
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`
}

/** Compte à rebours mm:ss, pour les départs imminents. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Formatage d'attente : compte à rebours sous 10 min, durée au-delà. */
export const eta = (ms: number): string => (ms > 600_000 ? duration(ms) : countdown(ms))

/* ── Avatars ───────────────────────────────────────────────────────────── */

const AVATAR_COLORS = ['#E2552B', '#2A6FDB', '#7A5AE0', '#1F8A5B', '#C8881F', '#B5322F', '#2B7FB8']

export function colorForId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export function Avatar({ id, name, size = 22 }: { id: string | null; name?: string; size?: number }) {
  if (!id) {
    return (
      <span className="rg-av none" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
        —
      </span>
    )
  }
  return (
    <span
      className="rg-av"
      title={name}
      style={{ width: size, height: size, background: colorForId(id), fontSize: Math.round(size * 0.4) }}
    >
      {initialsOf(name || '?')}
    </span>
  )
}

/* ── Plages horaires ───────────────────────────────────────────────────── */

/** La frise couvre 06:00 → 22:00 : au-delà, personne n'envoie de prospection. */
export const AXIS_START = 360
export const AXIS_END = 1320
export const axisPct = (minutes: number): number =>
  Math.max(0, Math.min(100, ((minutes - AXIS_START) / (AXIS_END - AXIS_START)) * 100))

/** Ruban compact des plages d'une séquence. */
export function MiniWindows({ windows, off }: { windows: SendWindow[]; off?: boolean }) {
  return (
    <div className={'rg-miniwin' + (off ? ' off' : '')}>
      {windows.map((w, i) => (
        <i
          key={i}
          style={{ left: `${axisPct(w[0])}%`, width: `${Math.max(1, axisPct(w[1]) - axisPct(w[0]))}%` }}
        />
      ))}
    </div>
  )
}

/**
 * Éditeur de plages d'envoi. Les plages ne peuvent pas se chevaucher : celles
 * qui le font passent en rouge et l'enregistrement est bloqué en amont.
 */
export function WindowEditor({
  windows,
  onChange,
  disabled,
}: {
  windows: SendWindow[]
  onChange: (w: SendWindow[]) => void
  disabled?: boolean
}) {
  const bad = overlappingWindows(windows)

  const setBound = (index: number, side: 0 | 1, value: string) => {
    const next = windows.map((w) => [w[0], w[1]] as SendWindow)
    next[index][side] = parseHM(value)
    onChange(next)
  }

  const add = () => {
    const end = windows.length > 0 ? Math.max(...windows.map((w) => w[1])) : 480
    const start = Math.min(end + 30, DAY_MINUTES - 120)
    onChange([...windows, [start, Math.min(start + 120, DAY_MINUTES)] as SendWindow].sort((a, b) => a[0] - b[0]))
  }

  return (
    <div>
      <div className="rg-wbar">
        {windows.map((w, i) => (
          <div
            key={i}
            className={'b' + (bad.has(i) ? ' bad' : '')}
            style={{ left: `${axisPct(w[0])}%`, width: `${Math.max(1, axisPct(w[1]) - axisPct(w[0]))}%` }}
          />
        ))}
        <div className="ax">
          {[6, 9, 12, 15, 18, 21].map((h) => (
            <span key={h}>{String(h).padStart(2, '0')}h</span>
          ))}
        </div>
      </div>

      {windows.map((w, i) => (
        <div className={'rg-wrow' + (bad.has(i) ? ' bad' : '')} key={i}>
          <span className="rg-lb" style={{ width: 14 }}>
            {i + 1}
          </span>
          <input
            type="time"
            value={formatHM(w[0])}
            disabled={disabled}
            onChange={(e) => setBound(i, 0, e.target.value)}
            aria-label={`Début de la plage ${i + 1}`}
          />
          <span className="dash">→</span>
          <input
            type="time"
            value={formatHM(w[1])}
            disabled={disabled}
            onChange={(e) => setBound(i, 1, e.target.value)}
            aria-label={`Fin de la plage ${i + 1}`}
          />
          <span className="rg-lb">{duration(Math.max(0, w[1] - w[0]) * 60_000)}</span>
          <button
            type="button"
            className="del"
            title="Supprimer la plage"
            disabled={disabled}
            onClick={() => onChange(windows.filter((_, k) => k !== i))}
          >
            <XI name="trash" className="ico-sm" />
          </button>
        </div>
      ))}

      {bad.size > 0 && (
        <div className="rg-werr">
          <XI name="warning" className="ico-sm" />
          Deux plages se chevauchent — corrigez les heures en rouge.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <button type="button" className="btn sm" onClick={add} disabled={disabled}>
          <XI name="plus" className="ico-sm" />
          Ajouter une plage
        </button>
        <span className="rg-lb" style={{ marginLeft: 'auto' }}>
          {duration(windowMinutes(windows) * 60_000)} d’ouverture / jour
        </span>
      </div>
    </div>
  )
}

/* ── Curseurs ──────────────────────────────────────────────────────────── */

/**
 * Curseur qu'on fait glisser. La valeur suit le doigt en direct (le reste de la
 * page réagit pendant le glissement), mais l'enregistrement n'a lieu qu'au
 * relâchement : un PATCH par pixel parcouru serait absurde.
 */
export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  disabled,
  tone,
  ariaLabel,
  onPreview,
  onCommit,
}: {
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  /** `hi` colore la poignée en accent secondaire — la borne haute d'une fourchette. */
  tone?: 'hi'
  ariaLabel: string
  onPreview: (v: number) => void
  onCommit: (v: number) => void
}) {
  // Pendant le glissement, la valeur affichée est locale : elle ne doit pas
  // sauter si une réponse serveur arrive entre deux mouvements.
  const [dragging, setDragging] = React.useState<number | null>(null)
  const shown = dragging ?? value

  const commit = () => {
    const v = dragging
    setDragging(null)
    if (v != null && v !== value) onCommit(v)
  }

  return (
    <input
      className={'rg-rng' + (tone === 'hi' ? ' hi' : '')}
      type="range"
      min={min}
      max={max}
      step={step}
      value={shown}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = Number(e.target.value)
        setDragging(v)
        onPreview(v)
      }}
      onPointerUp={commit}
      onPointerCancel={commit}
      onBlur={commit}
      onKeyUp={(e) => {
        // Au clavier, chaque flèche est un réglage fini : on enregistre.
        if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') commit()
      }}
    />
  )
}

/**
 * Aperçu de l'aléatoire : chaque barre est un écart réellement tiré par le
 * régulateur (même fonction que la file), pour la fourchette courante.
 */
export function JitterPreview({ min, max, seed, count = 24 }: { min: number; max: number; seed: string; count?: number }) {
  const values = React.useMemo(
    () => Array.from({ length: count }, (_, i) => gapForItem(`${seed}:${i}`, min, max)),
    [min, max, seed, count],
  )
  const top = Math.max(max, ...values, 1)
  return (
    <>
      <div className="rg-jit" aria-hidden="true">
        {values.map((v, i) => (
          <i key={i} className={v > (min + max) / 2 ? 'hi' : ''} style={{ height: `${Math.max(12, (v / top) * 100)}%` }} title={`${v} min`} />
        ))}
      </div>
      <div className="rg-rnglb">
        <span>{min} min</span>
        <span>écarts tirés</span>
        <span>{max} min</span>
      </div>
    </>
  )
}

/** Segmenté compact — un choix parmi peu de valeurs, sans ouvrir de liste. */
export function Segmented<T extends string | number>({
  value,
  options,
  disabled,
  ariaLabel,
  onChange,
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  disabled?: boolean
  ariaLabel?: string
  onChange: (v: T) => void
}) {
  return (
    <div className="rg-seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={o.value === value ? 'on' : ''}
          disabled={disabled}
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Divers ────────────────────────────────────────────────────────────── */

export function SetBlock({
  icon,
  title,
  extra,
  children,
}: {
  icon: string
  title: string
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rg-set">
      <div className="rg-set-h">
        <XI name={icon} className="ico-sm" />
        {title}
        {extra != null && <span className="x">{extra}</span>}
      </div>
      {children}
    </div>
  )
}

export function CardHead({
  icon,
  title,
  sub,
  right,
}: {
  icon: string
  title: string
  sub?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="rg-card-hd">
      <span className="ic">
        <XI name={icon} className="ico-sm" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      {right && <div className="r">{right}</div>}
    </div>
  )
}
