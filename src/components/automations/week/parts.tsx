'use client'
// parts.tsx — les pièces de la vue semaine : bulle de survol, panneau de détail,
// résumé de la semaine. Séparées de la grille pour que chacune tienne à l'œil.
import React from 'react'
import Link from 'next/link'
import { XI } from '../icons'
import { authedFetch } from '@/utils/authedFetch'
import type { SeqStepKind } from '../types'
import { weekDuration, weekHM, type WeekPlan, type WeekWave } from '@/lib/automations/week'
import { VARIANT_LABELS, type MessageVariant } from '@/lib/automations/variables'
import type { WeekContactRow, WeekView } from './types'

/* ── Jetons visuels par canal ────────────────────────────────────────────── */

export const KIND_META: Record<string, { icon: string; label: string; color: string; tint: string; manual: boolean }> = {
  email: { icon: 'mail', label: 'Email', color: 'var(--accent)', tint: 'var(--accent-tint)', manual: false },
  whatsapp: { icon: 'whatsapp', label: 'WhatsApp', color: 'var(--ok)', tint: 'var(--ok-tint)', manual: true },
  call: { icon: 'phone', label: 'Appel', color: 'var(--info)', tint: 'var(--info-tint)', manual: true },
  linkedin: { icon: 'linkedin', label: 'LinkedIn', color: 'var(--warn)', tint: 'var(--warn-tint)', manual: true },
  task: { icon: 'task', label: 'Tâche', color: 'var(--magic)', tint: 'var(--magic-tint)', manual: true },
  wait: { icon: 'clock', label: 'Attente', color: 'var(--text-3)', tint: 'var(--bg-2)', manual: true },
}

export const kindMeta = (kind: SeqStepKind | string) => KIND_META[kind] ?? KIND_META.task

/**
 * Ce que cette vague enverra vraiment, rendu sur un contact réel.
 *
 * La prévision disait « étape 2 · template a3f9-… » : un identifiant, à qui il
 * faut faire confiance. On peut désormais LIRE le message avant qu'il parte à
 * quarante entreprises — c'est le dernier moment où une coquille se rattrape.
 *
 * Charge à la demande : seule la vague ouverte est rendue, et l'appel passe par
 * `renderStepMessage`, le même code que l'envoi.
 */
type PreviewMessage = { subject: string | null; body: string; source: string | null; variant?: MessageVariant }

function WaveMessage({ wave, contact }: { wave: WeekWave; contact: WeekContactRow | undefined }) {
  const [message, setMessage] = React.useState<PreviewMessage | null>(null)
  const [state, setState] = React.useState<'loading' | 'done' | 'error'>('loading')

  React.useEffect(() => {
    let vivant = true
    setState('loading')
    const params = new URLSearchParams({
      automation_id: wave.automationId,
      step_index: String(wave.stepIndex),
    })
    if (contact?.entrepriseId != null) params.set('entreprise_id', String(contact.entrepriseId))

    authedFetch(`/api/automations/preview?${params}`)
      .then((r) => r.json())
      .then((payload: { message?: PreviewMessage | null }) => {
        if (!vivant) return
        setMessage(payload.message ?? null)
        setState('done')
      })
      .catch(() => vivant && setState('error'))
    return () => {
      vivant = false
    }
  }, [wave.automationId, wave.stepIndex, contact?.entrepriseId])

  if (state === 'error') return null
  if (state === 'loading') return <div className="wk-msg loading">Chargement du message…</div>
  if (!message || (!message.body && !message.subject)) {
    return (
      <div className="wk-msg vide">
        Aucun message préparé pour cette étape — elle partira vide si rien n’est écrit.
      </div>
    )
  }

  return (
    <div className="wk-msg">
      {message.source && (
        <div className="src">
          {message.source}
          {/* Le modèle porte deux versions : dire laquelle a été retenue évite
              de croire que les quarante entreprises de la vague liront ce
              texte-là. */}
          {message.variant && ` · ${VARIANT_LABELS[message.variant].short}`}
        </div>
      )}
      {message.subject && <div className="subj">{message.subject}</div>}
      <div className="body">{message.body}</div>
      {contact && (
        <div className="on">
          rendu sur {contact.company || contact.name}
          {/* Les autres contacts de la vague verront leurs propres valeurs. */}
          {wave.count > 1 ? ` · ${wave.count - 1} autre${wave.count > 2 ? 's' : ''} suivra${wave.count > 2 ? 'ont' : ''}` : ''}
        </div>
      )}
    </div>
  )
}

/** Teinte d'une couleur hex — les vagues sont des aplats très clairs de la couleur de leur séquence. */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((v) => !Number.isFinite(v))) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Ce que raconte un motif de blocage du régulateur, en clair. */
export const HOLD_LABEL: Record<string, string> = {
  no_email: 'aucune adresse connue',
  email_invalid: 'adresse qui ne recevra pas',
  email_pending: 'vérification de l’adresse en cours',
  test_hold: 'phase de test — destinataire hors liste',
  sequence_paused: 'séquence en pause',
  global_pause: 'régulateur en pause',
}

export const STATUS_META: Record<string, { label: string; tone: string }> = {
  sent: { label: 'parti', tone: 'ok' },
  running: { label: 'en cours', tone: 'accent' },
  planned: { label: 'planifié', tone: '' },
  late: { label: 'en retard', tone: 'warn' },
  cancelled: { label: 'annulé', tone: 'danger' },
  paused: { label: 'séquence en pause', tone: 'warn' },
  weekend: { label: 'reporté à lundi', tone: 'warn' },
  spilled: { label: 'reporté au lendemain', tone: 'warn' },
}

export function Tone({ tone, children }: { tone: string; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === 'ok'
      ? { background: 'var(--ok-tint)', color: 'var(--ok)' }
      : tone === 'accent'
        ? { background: 'var(--accent-tint)', color: 'var(--accent-2)' }
        : tone === 'warn'
          ? { background: 'var(--warn-tint)', color: 'var(--warn)' }
          : tone === 'danger'
            ? { background: 'var(--danger-tint)', color: 'var(--danger)' }
            : { background: 'var(--bg-2)', color: 'var(--text-3)' }
  return (
    <span
      style={{
        ...style,
        marginLeft: 'auto',
        borderRadius: 6,
        padding: '1px 6px',
        fontSize: 9.5,
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
        letterSpacing: '.02em',
      }}
    >
      {children}
    </span>
  )
}

/** « mercredi 6 » — ou « semaine passée / prochaine » quand la vague sort du cadre. */
export function dayName(plan: WeekPlan, day: number): string {
  if (day < 0) return 'semaine passée'
  if (day > 6) return 'semaine prochaine'
  const d = plan.days[day]
  return d ? `${d.name} ${d.num}` : ''
}

/* ── Bulle de survol ─────────────────────────────────────────────────────── */

export function WavePopover({
  wave,
  plan,
  color,
  x,
  y,
}: {
  wave: WeekWave
  plan: WeekPlan
  color: string
  x: number
  y: number
}) {
  const meta = STATUS_META[wave.status] ?? STATUS_META.planned
  return (
    <div className="wk-pop" style={{ left: x, top: y }} role="tooltip">
      <div className="h">
        <i style={{ background: color }} />
        <b>{wave.sequenceName}</b>
        <Tone tone={meta.tone}>{meta.label}</Tone>
      </div>
      <div className="sj">{wave.label}</div>
      {wave.template && <div className="tp">Template · {wave.template}</div>}
      <dl>
        <dt>{wave.first ? 'départ de séquence' : `relance · étape ${wave.step}`}</dt>
        <dd>{wave.count} contact{wave.count > 1 ? 's' : ''}</dd>
        {wave.startMin != null && wave.endMin != null && (
          <>
            <dt>fenêtre</dt>
            <dd>
              {weekHM(wave.startMin)} → {weekHM(wave.endMin)}
            </dd>
            <dt>durée d’envoi</dt>
            <dd>{weekDuration(wave.durationMin)}</dd>
          </>
        )}
        <dt>cadence</dt>
        <dd>1 / {Math.round(plan.averageGap)} min</dd>
        {wave.overflow > 0 && (
          <>
            <dt>reporté</dt>
            <dd style={{ color: 'var(--warn)' }}>{wave.overflow} au lendemain</dd>
          </>
        )}
        {wave.held > 0 && (
          <>
            <dt>retenus</dt>
            <dd style={{ color: 'var(--danger)' }}>
              {wave.held} · {HOLD_LABEL[wave.holdReason ?? ''] ?? wave.holdReason}
            </dd>
          </>
        )}
        {wave.shifted !== 0 && (
          <>
            <dt>décalé</dt>
            <dd style={{ color: 'var(--accent)' }}>
              {wave.shifted > 0 ? '+' : ''}
              {wave.shifted} j
            </dd>
          </>
        )}
      </dl>
      <div className="ft">clic → détail, décaler, annuler</div>
    </div>
  )
}

/* ── Panneau : une vague ─────────────────────────────────────────────────── */

export function WaveDetail({
  wave,
  view,
  color,
  busy,
  onClose,
  onAction,
  onToggleSequence,
}: {
  wave: WeekWave
  view: WeekView
  color: string
  busy: boolean
  onClose: () => void
  onAction: (action: 'cancel' | 'restore' | 'shift', days?: number) => void
  onToggleSequence: (automationId: string, next: 'on' | 'paused') => void
}) {
  const plan = view
  const day = plan.days[wave.day]
  const meta = STATUS_META[wave.status] ?? STATUS_META.planned
  const sequence = plan.sequences.find((s) => s.id === wave.automationId)
  const contacts: WeekContactRow[] = view.contacts[wave.id] ?? []
  const chain = plan.waves.filter((w) => w.automationId === wave.automationId && w.step !== wave.step)
  const locked = !wave.actionable
  const kind = kindMeta(wave.kind)

  return (
    <aside className="wk-side">
      <div className="hd">
        <button type="button" className="bk" onClick={onClose}>
          <XI name="chevleft" className="ico-xs" />
          retour à la semaine
        </button>
        <h3>
          {wave.first ? 'Départ de séquence' : `Relance · étape ${wave.step}/${wave.steps}`}
        </h3>
        <div className="sub">
          {day ? `${day.name} ${day.num} ${day.month}` : ''}
          {wave.startMin != null && wave.endMin != null
            ? ` · ${weekHM(wave.startMin)} → ${weekHM(wave.endMin)}`
            : ' · non planifié'}
        </div>
      </div>

      <div className="wk-sec">
        {wave.status === 'cancelled' && (
          <div className="wk-ban cx">
            <XI name="x" className="ico-sm" />
            Envoi annulé — ces {wave.count} contacts sautent l’étape et poursuivent la séquence.
          </div>
        )}
        {wave.status === 'paused' && (
          <div className="wk-ban pz">
            <XI name="pause" className="ico-sm" />
            Séquence en pause — l’envoi attend sa réactivation.
          </div>
        )}
        {wave.status === 'weekend' && (
          <div className="wk-ban pz">
            <XI name="cal" className="ico-sm" />
            Week-end coupé — reporté au lundi suivant.
          </div>
        )}
        {wave.held > 0 && (
          <div className="wk-ban cx">
            <XI name="lock" className="ico-sm" />
            {wave.held} contact{wave.held > 1 ? 's' : ''} retenu{wave.held > 1 ? 's' : ''} par le régulateur —{' '}
            {HOLD_LABEL[wave.holdReason ?? ''] ?? wave.holdReason}.
          </div>
        )}
        {wave.status === 'spilled' && (
          <div className="wk-ban pz">
            <XI name="warning" className="ico-sm" />
            Plus de place dans les plages du jour — poussé au lendemain.
          </div>
        )}
        <div className="wk-srow" style={{ paddingTop: 0 }}>
          <i style={{ background: color }} />
          <span className="n" style={{ fontWeight: 500, cursor: 'default' }}>
            {wave.sequenceName}
          </span>
          <Tone tone={meta.tone}>{meta.label}</Tone>
        </div>
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>{wave.label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
          {kind.label}
        </div>
        <WaveMessage wave={wave} contact={contacts[0]} />
      </div>

      <div className="wk-sec">
        <div className="k">l’envoi</div>
        <dl className="wk-kv">
          <dt>contacts</dt>
          <dd>{wave.count}</dd>
          <dt>cadence</dt>
          <dd>1 email / {Math.round(plan.averageGap)} min</dd>
          {wave.startMin != null && (
            <>
              <dt>durée d’envoi</dt>
              <dd>{weekDuration(wave.durationMin)}</dd>
            </>
          )}
          {sequence && (
            <>
              <dt>plages de la séquence</dt>
              <dd>{sequence.windows.map((w) => `${weekHM(w[0])}–${weekHM(w[1])}`).join(' · ') || '—'}</dd>
            </>
          )}
          {day && (
            <>
              <dt>ce jour-là</dt>
              <dd>
                {day.count} / {plan.dailyCap} emails
              </dd>
            </>
          )}
          {wave.overflow > 0 && (
            <>
              <dt>reporté</dt>
              <dd style={{ color: 'var(--warn)' }}>{wave.overflow} au lendemain</dd>
            </>
          )}
          {day && day.carriedIn > 0 && (
            <>
              <dt>repris de la veille</dt>
              <dd>{day.carriedIn} contacts</dd>
            </>
          )}
        </dl>
        {wave.segments.length > 1 && (
          <p className="wk-note" style={{ marginTop: 9 }}>
            La vague est coupée par la fermeture de midi : elle reprend à {weekHM(wave.segments[1][0])}.
          </p>
        )}
      </div>

      {chain.length > 0 && (
        <div className="wk-sec">
          <div className="k">le reste de la séquence cette semaine</div>
          <div className="wk-chain">
            {chain.map((w, i) => {
              const m = kindMeta(w.kind)
              return (
                <React.Fragment key={w.id}>
                  {i > 0 && <div className="ln" />}
                  <div className="st">
                    <span className="ic" style={{ background: m.tint, color: m.color }}>
                      <XI name={m.icon} className="ico-sm" />
                    </span>
                    <span className="tx">
                      <b>{w.label}</b>
                      <span>
                        {dayName(plan, w.day)}
                        {w.manual ? ' · à la main' : ''}
                      </span>
                    </span>
                    <span className="q">{w.count}</span>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="wk-sec">
          <div className="k">quelques contacts</div>
          <div className="wk-cts">
            {contacts.map((c) => (
              <div key={c.enrollmentId} className="wk-ct">
                <XI name="contacts" className="ico-xs" style={{ color: 'var(--text-4)' }} />
                {c.name}
                {c.company && <span className="co">{c.company}</span>}
              </div>
            ))}
            {wave.count > contacts.length && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>
                + {wave.count - contacts.length} autres contacts
              </div>
            )}
          </div>
        </div>
      )}

      <div className="wk-sec">
        <div className="k">actions</div>
        <div className="wk-acts">
          {wave.status === 'cancelled' ? (
            <button type="button" className="btn accent sm" disabled={busy} onClick={() => onAction('restore')}>
              <XI name="refresh" className="ico-sm" />
              Rétablir cet envoi
            </button>
          ) : (
            <button
              type="button"
              className="btn outline sm"
              disabled={busy || locked}
              onClick={() => onAction('cancel')}
              style={{ color: locked ? undefined : 'var(--danger)' }}
            >
              <XI name="x" className="ico-sm" />
              Annuler cet envoi
            </button>
          )}
          <button
            type="button"
            className="btn outline sm"
            disabled={busy || locked}
            onClick={() => onAction('shift', 1)}
          >
            <XI name="chevright" className="ico-sm" />
            Décaler à {plan.days[wave.day + 1]?.name ?? 'la semaine suivante'}
          </button>
          <button
            type="button"
            className="btn outline sm"
            disabled={busy || locked || wave.day === 0}
            onClick={() => onAction('shift', -1)}
          >
            <XI name="chevleft" className="ico-sm" />
            Avancer à {plan.days[wave.day - 1]?.name ?? 'la semaine passée'}
          </button>
          {sequence && (
            <button
              type="button"
              className="btn outline sm"
              disabled={busy}
              onClick={() => onToggleSequence(sequence.id, sequence.status === 'on' ? 'paused' : 'on')}
            >
              <XI name={sequence.status === 'on' ? 'pause' : 'play'} className="ico-sm" />
              {sequence.status === 'on' ? 'Mettre la séquence en pause' : 'Réactiver la séquence'}
            </button>
          )}
          <Link href={`/automations/sequences/${wave.automationId}`} className="btn ghost sm">
            <XI name="list" className="ico-sm" />
            Ouvrir la séquence
          </Link>
          {day?.today && (
            <Link href="/automations/regulateur" className="btn ghost sm">
              <XI name="randomize" className="ico-sm" />
              Voir la file du jour
            </Link>
          )}
        </div>
        {locked && wave.status !== 'cancelled' && (
          <p className="wk-note" style={{ marginTop: 9 }}>
            Cet envoi est déjà parti : il ne peut plus être décalé ni annulé. Les étapes suivantes, elles, restent
            modifiables.
          </p>
        )}
      </div>
    </aside>
  )
}

/* ── Panneau : la semaine ────────────────────────────────────────────────── */

export function WeekSummary({
  plan,
  colorOf,
  busy,
  onOpenSequence,
  onToggleSequence,
  onSelect,
  onRestore,
}: {
  plan: WeekPlan
  colorOf: (id: string) => string
  busy: boolean
  onOpenSequence: (id: string) => void
  onToggleSequence: (automationId: string, next: 'on' | 'paused') => void
  onSelect: (waveId: string) => void
  onRestore: (wave: WeekWave) => void
}) {
  const load = plan.totals.openMinutes
    ? Math.round((plan.totals.busyMinutes / plan.totals.openMinutes) * 100)
    : 0
  const cancelled = plan.waves.filter((w) => w.status === 'cancelled')
  const openDays = plan.days.filter((d) => !d.closed).length

  return (
    <aside className="wk-side">
      <div className="hd">
        <h3>Semaine du {plan.label}</h3>
        <div className="sub">
          {openDays} jours d’envoi · plafond {plan.dailyCap}/j
        </div>
      </div>

      <div className="wk-sec">
        <div className="wk-big">
          <b>{plan.totals.emails}</b>
          <span>
            emails planifiés
            <br />
            sur la semaine
          </span>
        </div>
        <div className="wk-split">
          <div>
            <span className="l">
              <i style={{ background: 'var(--accent)' }} />
              départs
            </span>
            <div className="v">{plan.totals.starts}</div>
          </div>
          <div>
            <span className="l">
              <i style={{ background: 'var(--accent-tint-2)' }} />
              relances
            </span>
            <div className="v">{plan.totals.followUps}</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-3)',
              marginBottom: 5,
            }}
          >
            <span>charge du tuyau</span>
            <span>
              {weekDuration(plan.totals.busyMinutes)} / {weekDuration(plan.totals.openMinutes)}
            </span>
          </div>
          <span className="wk-bar">
            <i
              style={{
                width: `${Math.min(100, load)}%`,
                background: load > 92 ? 'var(--warn)' : 'var(--accent)',
              }}
            />
          </span>
          <p className="wk-note" style={{ marginTop: 8 }}>
            À {Math.round(plan.averageGap)} min d’écart moyen, la semaine occupe <b>{load} %</b> des plages ouvertes.
            Au-delà de 100 %, les dernières vagues glissent au lendemain.
          </p>
        </div>
      </div>

      <div className="wk-sec">
        <div className="k">par séquence</div>
        {plan.sequences.length === 0 && <p className="wk-note">Aucune séquence pour l’instant.</p>}
        {plan.sequences.map((s) => (
          <div key={s.id} className="wk-srow">
            <i style={{ background: s.status === 'on' ? colorOf(s.id) : 'var(--text-4)' }} />
            <button type="button" className="n" onClick={() => onOpenSequence(s.id)}>
              {s.name}
            </button>
            <span className="q">{s.status === 'on' ? `${s.waves} vagues · ${s.volume}` : 'en pause'}</span>
            <button
              type="button"
              className="btn ghost sm icon"
              disabled={busy}
              title={s.status === 'on' ? 'Mettre en pause' : 'Réactiver'}
              onClick={() => onToggleSequence(s.id, s.status === 'on' ? 'paused' : 'on')}
            >
              <XI name={s.status === 'on' ? 'pause' : 'play'} className="ico-sm" />
            </button>
          </div>
        ))}
      </div>

      <div className="wk-sec">
        <div className="k">à la main cette semaine</div>
        <div className="wk-srow" style={{ paddingTop: 0 }}>
          <span
            className="ic"
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--ok-tint)',
              color: 'var(--ok)',
            }}
          >
            <XI name="whatsapp" className="ico-sm" />
          </span>
          <span className="n" style={{ cursor: 'default' }}>
            WhatsApp, LinkedIn, appels
          </span>
          <span className="q">{plan.totals.manual}</span>
        </div>
        <Link
          href="/automations/prospection"
          className="btn outline sm"
          style={{ marginTop: 9, width: '100%', justifyContent: 'center' }}
        >
          <XI name="inbox" className="ico-sm" />
          Ouvrir les tâches à la main
        </Link>
      </div>

      {cancelled.length > 0 && (
        <div className="wk-sec">
          <div className="k">annulés</div>
          {cancelled.map((w) => (
            <div key={w.id} className="wk-srow">
              <i style={{ background: colorOf(w.automationId) }} />
              <button
                type="button"
                className="n"
                style={{ textDecoration: 'line-through', color: 'var(--text-3)' }}
                onClick={() => onSelect(w.id)}
              >
                {plan.days[w.day]?.name} · {w.sequenceName}
              </button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => onRestore(w)}>
                Rétablir
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="wk-sec">
        <p className="wk-note">
          Le régulateur reste maître de l’heure exacte : la semaine dit <b>quel jour</b> et <b>dans quel ordre</b>, lui
          décide de la minute et garde l’écart aléatoire entre deux emails.
        </p>
      </div>
    </aside>
  )
}
