'use client'
// WeekPage — « La semaine » : tous les départs de séquence et toutes les
// relances de la semaine, posés à l'heure sur une grille lundi → dimanche.
//
// Un bloc = une VAGUE : les contacts d'une même séquence qui reçoivent la même
// étape le même jour. Sa hauteur, c'est le temps que le régulateur mettra à tout
// écouler à l'écart configuré. Rien n'est simulé : les jours viennent de la
// règle du moteur (`entered_at + step.day`) et les heures des plages d'envoi
// réelles de chaque séquence.
import React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { authedFetch } from '@/utils/authedFetch'
import { XI } from '../icons'
import { colorForId } from '../regulator/parts'
import { weekHM, type WeekWave } from '@/lib/automations/week'
import { WaveDetail, WavePopover, WeekSummary, kindMeta, tint } from './parts'
import type { WeekView } from './types'
import '../week.css'

/** Hauteur d'une heure de frise, en pixels. */
const PX_PER_HOUR = 46
const PX_PER_MIN = PX_PER_HOUR / 60

type Hover = { wave: WeekWave; color: string; x: number; y: number }

export function WeekPage() {
  const router = useRouter()
  const [offset, setOffset] = React.useState(0)
  const [view, setView] = React.useState<WeekView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [hidden, setHidden] = React.useState<Record<string, boolean>>({})
  const [showManual, setShowManual] = React.useState(true)
  const [hover, setHover] = React.useState<Hover | null>(null)

  const load = React.useCallback(async (weekOffset: number, silent = false): Promise<WeekView | null> => {
    if (!silent) setLoading(true)
    try {
      const res = await authedFetch(`/api/automations/week?offset=${weekOffset}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.message || 'La semaine n’a pas pu être chargée.')
        return null
      }
      setView(body as WeekView)
      return body as WeekView
    } catch {
      toast.error('La semaine n’a pas pu être chargée.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load(offset)
  }, [offset, load])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setHover(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const colorOf = React.useCallback((id: string) => colorForId(id), [])

  const waveById = React.useMemo(() => new Map((view?.waves ?? []).map((w) => [w.id, w])), [view])
  const current = selected ? (waveById.get(selected) ?? null) : null

  /* ── Actions ───────────────────────────────────────────────────────────── */

  async function runAction(wave: WeekWave, action: 'cancel' | 'restore' | 'shift', days?: number) {
    if (!wave.enrollmentIds.length) {
      toast.error('Cette vague n’a plus d’inscription modifiable.')
      return
    }
    setBusy(true)
    try {
      const res = await authedFetch('/api/automations/week', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          automation_id: wave.automationId,
          step_index: wave.stepIndex,
          action,
          days,
          enrollment_ids: wave.enrollmentIds.slice(0, 1000),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(body?.message || 'Action refusée.')
        return
      }
      toast.success(
        action === 'cancel'
          ? `Envoi annulé pour ${body.updated} contact${body.updated > 1 ? 's' : ''}.`
          : action === 'restore'
            ? 'Envoi rétabli.'
            : `Envoi décalé de ${days! > 0 ? '+' : ''}${days} jour${Math.abs(days!) > 1 ? 's' : ''}.`,
      )
      // L'identifiant d'une vague porte son jour : après un décalage il change.
      // On rattrape la sélection sur la séquence + l'étape, pour que le panneau
      // suive l'envoi au lieu de se refermer.
      const next = await load(offset, true)
      const moved = next?.waves.find((w) => w.automationId === wave.automationId && w.stepIndex === wave.stepIndex)
      setSelected(moved?.id ?? null)
    } catch {
      toast.error('Action refusée.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleSequence(automationId: string, next: 'on' | 'paused') {
    setBusy(true)
    try {
      const res = await authedFetch('/api/automations/regulator/sequence', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ automation_id: automationId, status: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.message || 'Changement refusé.')
        return
      }
      toast.success(next === 'on' ? 'Séquence réactivée.' : 'Séquence mise en pause.')
      await load(offset, true)
    } catch {
      toast.error('Changement refusé.')
    } finally {
      setBusy(false)
    }
  }

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  if (loading && !view) {
    return (
      <div className="wkv">
        <div className="wk-empty">
          <div>
            <h3>La semaine se prépare…</h3>
            <p>On projette chaque inscription active sur les sept prochains jours.</p>
          </div>
        </div>
      </div>
    )
  }
  if (!view) {
    return (
      <div className="wkv">
        <div className="wk-empty">
          <div>
            <h3>La semaine n’a pas pu être chargée</h3>
            <p>Vérifiez la connexion à Supabase, puis rechargez la page.</p>
          </div>
        </div>
      </div>
    )
  }

  const plan = view
  const from = plan.timelineFrom
  const to = plan.timelineTo
  const height = Math.max(240, (to - from) * PX_PER_MIN)
  const y = (minutes: number) => (Math.max(from, Math.min(to, minutes)) - from) * PX_PER_MIN
  const hours: number[] = []
  for (let h = Math.ceil(from / 60); h <= Math.floor(to / 60); h++) hours.push(h)

  const visible = (w: WeekWave) => !hidden[w.automationId]

  const popover = (wave: WeekWave, event: React.MouseEvent, color: string) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const width = 282
    const x = rect.right + 10 + width > window.innerWidth ? rect.left - width - 10 : rect.right + 10
    setHover({
      wave,
      color,
      x: Math.max(8, x),
      y: Math.max(8, Math.min(rect.top, window.innerHeight - 280)),
    })
  }

  return (
    <div className="wkv">
      <header className="wk-top">
        <div>
          <h1>
            La semaine, <em>départs et relances</em>.
          </h1>
          <p>
            Un bloc = une vague : les contacts d’une même séquence qui reçoivent la même étape le même jour. Sa hauteur,
            c’est le temps que le régulateur met à tout envoyer à {plan.averageGap % 1 === 0 ? plan.averageGap : plan.averageGap.toFixed(1)} min d’écart moyen. Survolez
            pour le détail, cliquez pour décaler ou annuler.
          </p>
        </div>
        <div className="wk-nav">
          {offset !== 0 && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setOffset(0)
                setSelected(null)
              }}
            >
              Cette semaine
            </button>
          )}
          <button
            type="button"
            className="arw"
            title="Semaine précédente"
            onClick={() => {
              setOffset((o) => o - 1)
              setSelected(null)
            }}
          >
            <XI name="chevleft" className="ico-sm" />
          </button>
          <span className="wk-range">
            <b>
              {offset === 0
                ? 'semaine en cours'
                : offset === -1
                  ? 'semaine passée'
                  : offset === 1
                    ? 'semaine prochaine'
                    : `${offset > 0 ? '+' : ''}${offset} semaines`}
            </b>
            {plan.label}
          </span>
          <button
            type="button"
            className="arw"
            title="Semaine suivante"
            onClick={() => {
              setOffset((o) => o + 1)
              setSelected(null)
            }}
          >
            <XI name="chevright" className="ico-sm" />
          </button>
        </div>
      </header>

      <div className="wk-legend">
        {plan.sequences.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`wk-fchip${hidden[s.id] ? ' off' : ''}`}
            title={hidden[s.id] ? 'Afficher cette séquence' : 'Masquer cette séquence'}
            onClick={() => setHidden((h) => ({ ...h, [s.id]: !h[s.id] }))}
          >
            <i style={{ background: colorOf(s.id) }} />
            {s.name}
            <span className="c">{s.status === 'on' ? `${s.waves} vagues · ${s.volume}` : 'en pause'}</span>
          </button>
        ))}
        <button
          type="button"
          className={`wk-fchip${showManual ? '' : ' off'}`}
          title="Afficher les étapes à faire à la main"
          onClick={() => setShowManual((v) => !v)}
        >
          <i style={{ background: 'var(--ok)' }} />à la main
          <span className="c">{plan.totals.manual}</span>
        </button>
        {plan.paused && (
          <span className="wk-warn">
            <XI name="pause" className="ico-sm" />
            Régulateur en pause — la semaine est planifiée mais rien ne part tant qu’il n’est pas relancé.
          </span>
        )}
        {plan.testMode && (
          <span className="wk-warn">
            <XI name="shield" className="ico-sm" />
            Phase de test — seules les adresses de test reçoivent ; les autres vagues sont retenues.
          </span>
        )}
      </div>

      <div className="wk-main">
        <div className="wk-cal">
          <div
            className="wk-grid"
            style={{ ['--h' as string]: `${height}px`, ['--ph' as string]: `${PX_PER_HOUR}px` }}
          >
            <div className="wk-hd cor" />
            {plan.days.map((d) => {
              const pct = plan.dailyCap ? Math.min(100, (d.count / plan.dailyCap) * 100) : 0
              return (
                <div key={d.key} className={`wk-hd${d.today ? ' today' : ''}${d.weekend ? ' we' : ''}`}>
                  <div className="dn">
                    <b>{d.name}</b>
                    <span>
                      {d.num} {d.month}
                    </span>
                  </div>
                  {d.closed ? (
                    <div className="mt">week-end · coupé</div>
                  ) : (
                    <div className="mt">
                      <span>{d.count} emails</span>
                      {d.carriedIn > 0 && (
                        <span title="Débordement de la veille, repris ce jour-là">↩ {d.carriedIn}</span>
                      )}
                      {d.overflow > 0 && <span className="ov">+{d.overflow} reportés</span>}
                      {d.today && <span className="now">{weekHM(plan.nowMinutes)}</span>}
                    </div>
                  )}
                  <span className="wk-bar">
                    <i
                      style={{
                        width: `${pct}%`,
                        background: d.overflow > 0 ? 'var(--warn)' : d.today ? 'var(--accent)' : 'var(--text-4)',
                      }}
                    />
                  </span>
                </div>
              )
            })}

            <div className="wk-man lbl">à la main</div>
            {plan.days.map((d) => {
              const chips = showManual
                ? plan.waves.filter((w) => w.day === d.index && w.manual && visible(w) && w.status !== 'cancelled')
                : []
              const grouped = new Map<string, { wave: WeekWave; total: number }>()
              for (const w of chips) {
                const key = `${w.automationId}|${w.kind}`
                const entry = grouped.get(key)
                if (entry) entry.total += w.count
                else grouped.set(key, { wave: w, total: w.count })
              }
              return (
                <div key={d.key} className={`wk-man${d.weekend ? ' we' : ''}`}>
                  {[...grouped.values()].map(({ wave, total }) => {
                    const meta = kindMeta(wave.kind)
                    return (
                      <button
                        key={`${wave.automationId}-${wave.kind}`}
                        type="button"
                        className="wk-mchip"
                        title={`${meta.label} · ${total} contact${total > 1 ? 's' : ''} · ${wave.label} — à traiter dans Démarchage`}
                        onClick={() => setSelected(wave.id)}
                      >
                        <i style={{ background: colorOf(wave.automationId) }} />
                        <XI name={meta.icon} className="ico-xs" />
                        {total}
                      </button>
                    )
                  })}
                </div>
              )
            })}

            <div className="wk-hours">
              {hours.map((h) => (
                <span key={h} style={{ top: y(h * 60) + 3 }}>
                  {String(h).padStart(2, '0')}h
                </span>
              ))}
            </div>
            {plan.days.map((d) => (
              <div key={d.key} className={`wk-col${d.weekend ? ' we' : ''}`}>
                {!d.closed &&
                  d.windows.map((w, i) => (
                    <div key={i} className="wk-band" style={{ top: y(w[0]), height: y(w[1]) - y(w[0]) }} />
                  ))}
                <div className="wk-lines" />
                {d.closed && <div className="wk-closed">week-end</div>}
                {d.today && offset === 0 && <div className="wk-nowl" style={{ top: y(plan.nowMinutes) }} />}
                {!d.closed &&
                  plan.waves
                    .filter((w) => w.day === d.index && !w.manual && w.segments.length > 0 && visible(w))
                    .map((w) => (
                      <WaveBlock
                        key={w.id}
                        wave={w}
                        color={colorOf(w.automationId)}
                        selected={selected === w.id}
                        frozen={plan.paused}
                        nowMinutes={d.today && offset === 0 ? plan.nowMinutes : null}
                        y={y}
                        onHover={popover}
                        onLeave={() => setHover(null)}
                        onSelect={() => setSelected((id) => (id === w.id ? null : w.id))}
                        onCancel={() => void runAction(w, 'cancel')}
                      />
                    ))}
              </div>
            ))}

            <div className="wk-foot lbl">hors planning</div>
            {plan.days.map((d) => (
              <div key={d.key} className={`wk-foot${d.weekend ? ' we' : ''}`}>
                {plan.waves
                  .filter((w) => w.day === d.index && !w.manual && w.segments.length === 0 && visible(w))
                  .map((w) => {
                    const cancelled = w.status === 'cancelled'
                    const paused = w.status === 'paused'
                    return (
                      <button
                        key={w.id}
                        type="button"
                        className="wk-ghost"
                        onClick={() => setSelected(w.id)}
                        title={
                          cancelled
                            ? 'Envoi annulé — cliquez pour le rétablir'
                            : paused
                              ? 'Séquence en pause — cliquez pour la réactiver'
                              : d.closed
                                ? 'Week-end coupé — reporté au lundi suivant'
                                : 'Ne rentre pas dans les plages du jour — poussé au lendemain'
                        }
                        style={cancelled ? { textDecoration: 'line-through' } : undefined}
                      >
                        <i style={{ background: cancelled || paused ? 'var(--text-4)' : colorOf(w.automationId) }} />
                        <XI name={cancelled ? 'x' : paused ? 'pause' : 'chevright'} className="ico-xs" />
                        {w.count}{' '}
                        {cancelled ? 'annulés' : paused ? 'en pause' : d.closed ? '→ lundi' : 'reportés'}
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>

        {current ? (
          <WaveDetail
            wave={current}
            view={plan}
            color={colorOf(current.automationId)}
            busy={busy}
            onClose={() => setSelected(null)}
            onAction={(action, days) => void runAction(current, action, days)}
            onToggleSequence={(id, next) => void toggleSequence(id, next)}
          />
        ) : (
          <WeekSummary
            plan={plan}
            colorOf={colorOf}
            busy={busy}
            onOpenSequence={(id) => router.push(`/automations/sequences/${id}`)}
            onToggleSequence={(id, next) => void toggleSequence(id, next)}
            onSelect={(id) => setSelected(id)}
            onRestore={(w) => void runAction(w, 'restore')}
          />
        )}
      </div>

      {hover && <WavePopover wave={hover.wave} plan={plan} color={hover.color} x={hover.x} y={hover.y} />}
    </div>
  )
}

/* ── Une vague sur la frise ──────────────────────────────────────────────── */

function WaveBlock({
  wave,
  color,
  selected,
  frozen,
  nowMinutes,
  y,
  onHover,
  onLeave,
  onSelect,
  onCancel,
}: {
  wave: WeekWave
  color: string
  selected: boolean
  frozen: boolean
  nowMinutes: number | null
  y: (minutes: number) => number
  onHover: (wave: WeekWave, event: React.MouseEvent, color: string) => void
  onLeave: () => void
  onSelect: () => void
  onCancel: () => void
}) {
  // Les miettes (< 6 min) ne méritent pas un bloc à elles : on garde le gros
  // segment pour porter le titre, les autres deviennent des rappels fins.
  let segments = wave.segments.filter(([a, b]) => b - a >= 6)
  if (!segments.length) segments = wave.segments
  const mainIndex = segments.reduce(
    (best, seg, i) => (seg[1] - seg[0] > segments[best][1] - segments[best][0] ? i : best),
    0,
  )
  const split = segments.length > 1
  const progress =
    wave.status === 'running' && nowMinutes != null && wave.startMin != null && wave.endMin != null
      ? Math.max(0, Math.min(1, (nowMinutes - wave.startMin) / Math.max(1, wave.endMin - wave.startMin)))
      : 0

  const classes = [
    'wk-ev',
    selected && 'on',
    wave.status === 'sent' && 'done',
    wave.status === 'cancelled' && 'cx',
    wave.status === 'paused' && 'pz',
    frozen && (wave.status === 'planned' || wave.status === 'running') && 'frz',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      {segments.map((seg, i) => {
        const top = y(seg[0])
        const h = Math.max(19, y(seg[1]) - y(seg[0]))
        if (i !== mainIndex) {
          return (
            <div
              key={i}
              className={`wk-seg${selected ? ' on' : ''}`}
              style={{
                top,
                height: h,
                borderLeftColor: color,
                background: tint(color, 0.07),
                opacity: wave.status === 'sent' ? 0.6 : 1,
              }}
              onMouseEnter={(e) => onHover(wave, e, color)}
              onMouseLeave={onLeave}
              onClick={onSelect}
            >
              <span style={{ color }}>
                {i < mainIndex ? 'début' : 'suite'} · {weekHM(seg[0])}→{weekHM(seg[1])}
              </span>
              {h >= 44 && <span className="nm">{wave.sequenceName} · étape {wave.step}</span>}
            </div>
          )
        }
        return (
          <div key={i} className="wk-evw" style={{ top, height: h }}>
          <button
            type="button"
            className={`${classes}${h < 46 ? ' sm' : ''}`}
            style={{
              borderColor: tint(color, 0.45),
              background: tint(color, wave.status === 'cancelled' || wave.status === 'paused' ? 0.04 : 0.09),
              borderLeftColor: color,
            }}
            onMouseEnter={(e) => onHover(wave, e, color)}
            onMouseLeave={onLeave}
            onClick={onSelect}
          >
            {wave.status === 'running' && (
              <i className="pg" style={{ height: `${progress * 100}%`, background: tint(color, 0.2) }} />
            )}
            <span className="l1" style={{ color }}>
              {wave.status === 'sent' && <XI name="check" className="ico-xs" />}
              {wave.status === 'running' && <XI name="playFill" className="ico-xs" />}
              {weekHM(seg[0])}
              <span style={{ color: 'var(--text-4)' }}>→</span>
              {weekHM(seg[1])}
              <span className="qt">× {wave.count}</span>
            </span>
            <span className="l2">{wave.sequenceName}</span>
            {h >= 58 && (
              <span className="l3">
                <span
                  className="kind"
                  style={{
                    background: wave.first ? color : tint(color, 0.16),
                    color: wave.first ? '#fff' : color,
                  }}
                >
                  {wave.first ? 'départ' : 'relance'}
                </span>
                étape {wave.step}
                {wave.status === 'running'
                  ? ` · ${Math.round(progress * wave.count)}/${wave.count}`
                  : split && wave.endMin != null
                    ? ` · fin ${weekHM(wave.endMin)}`
                    : ''}
              </span>
            )}
            {wave.overflow > 0 && h >= 76 && (
              <span className="l3" style={{ color: 'var(--warn)' }}>
                <XI name="warning" className="ico-xs" />
                {wave.overflow} au lendemain
              </span>
            )}
            {wave.held > 0 && h >= 92 && (
              <span className="l3" style={{ color: 'var(--danger)' }}>
                <XI name="lock" className="ico-xs" />
                {wave.held} retenus
              </span>
            )}
          </button>
          {wave.actionable && (
            <button
              type="button"
              className="xb"
              title="Annuler cet envoi"
              aria-label={`Annuler l’envoi de ${wave.count} contacts · ${wave.sequenceName}`}
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
            >
              <XI name="x" className="ico-xs" />
            </button>
          )}
          </div>
        )
      })}
    </>
  )
}
