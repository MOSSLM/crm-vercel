'use client'
// RegulatorPage — « un seul tuyau pour toutes les séquences ».
//
// Les séquences décident QUOI envoyer ; cette page montre et règle QUAND. Elle
// affiche la file réelle telle que le ticker la calculera : mêmes heures, mêmes
// motifs de report. Rien n'est simulé côté navigateur — l'horloge sert seulement
// à faire descendre le compte à rebours entre deux rafraîchissements.
import React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { authedFetch } from '@/utils/authedFetch'
import { XI } from '../icons'
import { ToggleRow } from '../atoms'
import {
  GAP_PRESETS,
  formatHM,
  holdReasonLabel,
  localClock,
  normalizeWindows,
  overlappingWindows,
  windowsUnion,
  type RegulatorSettings,
  type SendWindow,
} from '@/lib/automations/regulator'
import { ROUTING_MODE_HINT, ROUTING_MODE_LABEL } from '@/lib/automations/task-routing'
import {
  AXIS_START,
  Avatar,
  CardHead,
  MiniWindows,
  SetBlock,
  WindowEditor,
  axisPct,
  colorForId,
  eta,
  hm,
  hmd,
  minutesOfDay,
} from './parts'
import type { RegulatorQueueRow, RegulatorView } from './types'
import '../regulator.css'

const AXIS_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22]

/** Couleur stable par séquence — la même dans la file, la frise et la liste. */
const seqColor = (id: string) => colorForId(id)

export function RegulatorPage() {
  const [view, setView] = React.useState<RegulatorView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [now, setNow] = React.useState(() => Date.now())
  const [openSequence, setOpenSequence] = React.useState<string | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await authedFetch('/api/automations/regulator')
      if (!res.ok) throw new Error()
      setView((await res.json()) as RegulatorView)
    } catch {
      if (!silent) toast.error('Chargement du régulateur impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // L'horloge locale fait descendre le compte à rebours ; le serveur reste la
  // source de vérité et se resynchronise toutes les 30 s.
  React.useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    const refresh = setInterval(() => void load(true), 30_000)
    return () => {
      clearInterval(clock)
      clearInterval(refresh)
    }
  }, [load])

  const patch = React.useCallback(
    async (body: Record<string, unknown>, message?: string) => {
      setSaving(true)
      try {
        const res = await authedFetch('/api/automations/regulator', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload?.message || 'Enregistrement impossible')
          return false
        }
        setView(payload as RegulatorView)
        if (message) toast.success(message)
        return true
      } catch {
        toast.error('Enregistrement impossible')
        return false
      } finally {
        setSaving(false)
      }
    },
    [],
  )

  const patchSequence = React.useCallback(async (body: Record<string, unknown>, message?: string) => {
    setSaving(true)
    try {
      const res = await authedFetch('/api/automations/regulator/sequence', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.message || 'Enregistrement impossible')
        return
      }
      setView(payload as RegulatorView)
      if (message) toast.success(message)
    } catch {
      toast.error('Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }, [])

  if (loading && !view) {
    return (
      <div className="rg-page">
        <div className="rg-wrap">
          <div className="rg-empty">Chargement du régulateur…</div>
        </div>
      </div>
    )
  }
  if (!view) {
    return (
      <div className="rg-page">
        <div className="rg-wrap">
          <div className="rg-empty">
            Régulateur indisponible.
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn sm" onClick={() => void load()}>
                Réessayer
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const s = view.settings
  const tz = s.timezone
  const planned = view.queue.filter((q) => q.sendAt != null)
  const blocked = view.queue.filter((q) => q.sendAt == null)
  const next = planned[0] ?? null
  const nextIn = next?.sendAt ? Date.parse(next.sendAt) - now : null
  const avgGap = (s.gapMinMinutes + s.gapMaxMinutes) / 2
  const perHour = avgGap > 0 ? 60 / avgGap : 0
  const openNow = view.sequences.filter(
    (seq) => seq.status === 'on' && seq.windows.some(([a, b]) => minutesOfDay(now, tz) >= a && minutesOfDay(now, tz) < b),
  )
  const nowPct = axisPct(minutesOfDay(now, tz))

  return (
    <div className="rg-page">
      <div className="rg-wrap">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="rg-hero">
          <div className="rg-hero-top">
            <div style={{ minWidth: 0 }}>
              <div className="rg-kick">
                <span className="rule" />
                régulateur d’envoi · {tz.toLowerCase()} · {hm(now, tz)}
              </div>
              <h1 className="rg-title">
                {s.paused ? (
                  <>
                    Régulateur <em>en pause</em> — rien ne part.
                  </>
                ) : openNow.length === 0 ? (
                  <>
                    Hors plage — <em>la file patiente</em>.
                  </>
                ) : (
                  <>
                    Un seul tuyau pour <em>toutes</em> les séquences.
                  </>
                )}
              </h1>
            </div>
            <div className="rg-hero-acts">
              <button type="button" className="btn sm" onClick={() => void load()} disabled={saving}>
                <XI name="refresh" className="ico-sm" />
                Rafraîchir
              </button>
              <button
                type="button"
                className={'btn sm ' + (s.paused ? 'accent' : 'outline')}
                disabled={saving}
                onClick={() =>
                  void patch(
                    { paused: !s.paused },
                    s.paused ? 'Envois repris' : 'Envois en pause — la file est gelée',
                  )
                }
              >
                <XI name={s.paused ? 'playFill' : 'pause'} className="ico-sm" />
                {s.paused ? 'Reprendre les envois' : 'Tout mettre en pause'}
              </button>
            </div>
          </div>

          <div className="rg-metrics">
            <div className="rg-metric big">
              <div className="l">prochain envoi</div>
              <div className="v">{s.paused || nextIn == null ? '—:—' : eta(nextIn)}</div>
              <div className="d">
                {s.paused
                  ? 'en pause — la file est gelée'
                  : next
                    ? `${hmd(next.sendAt, now, tz)} · ${next.contactName} · ${next.companyName}`
                    : 'aucun email en attente'}
              </div>
            </div>
            <div className="rg-metric">
              <div className="l">écart aléatoire</div>
              <div className="v">
                {s.gapMinMinutes} <small>→</small> {s.gapMaxMinutes} <small>min</small>
              </div>
              <div className="d">≈ {perHour.toFixed(1)} emails/h au rythme actuel</div>
            </div>
            <div className="rg-metric">
              <div className="l">envoyés aujourd’hui</div>
              <div className="v">
                {view.sentToday} <small>/ {s.dailyCap}</small>
              </div>
              <div className="rg-mini">
                <i style={{ width: `${Math.min(100, s.dailyCap ? (view.sentToday / s.dailyCap) * 100 : 0)}%` }} />
              </div>
              <div className="d">plafond global, toutes séquences</div>
            </div>
            <div className="rg-metric">
              <div className="l">en attente</div>
              <div className="v">
                {planned.length} <small>emails</small>
              </div>
              <div className="d">
                {view.pendingTasks} tâches à la main · {blocked.length} bloqués
              </div>
            </div>
          </div>
        </div>

        <div className="rg-cols">
          {/* ── Colonne gauche ─────────────────────────────────────────── */}
          <div className="rg-stack">
            <div className="rg-card">
              <CardHead
                icon="cal"
                title="La journée"
                sub={
                  openNow.length > 0
                    ? `Plages ouvertes maintenant : ${openNow.map((x) => x.name).join(', ')}`
                    : 'Aucune plage ouverte en ce moment'
                }
                right={<span className="pill">{hm(now, tz)}</span>}
              />
              <div className="rg-strip">
                <div className="rg-strip-ax">
                  {AXIS_HOURS.map((h) => (
                    <span key={h}>{String(h).padStart(2, '0')}h</span>
                  ))}
                </div>
                <div className="rg-strip-grid">
                  <div className="rg-now" style={{ ['--x' as string]: nowPct / 100 }} />
                  <StripRow
                    label="File globale"
                    color="#14120E"
                    windows={windowsUnion(view.sequences.filter((x) => x.status === 'on').map((x) => x.windows))}
                    points={planned.map((p) => ({ id: p.id, at: p.sendAt!, title: `${hm(p.sendAt, tz)} · ${p.contactName}` }))}
                    done={view.sent.map((e) => ({ id: e.id, at: e.at, title: `${hm(e.at, tz)} · ${e.toName ?? ''}` }))}
                    tz={tz}
                    now={now}
                    bold
                  />
                  {view.sequences.map((seq) => (
                    <StripRow
                      key={seq.id}
                      label={seq.name}
                      color={seqColor(seq.id)}
                      windows={seq.windows}
                      off={seq.status !== 'on'}
                      points={planned
                        .filter((p) => p.automationId === seq.id)
                        .map((p) => ({ id: p.id, at: p.sendAt!, title: `${hm(p.sendAt, tz)} · ${p.contactName}` }))}
                      done={view.sent
                        .filter((e) => e.automationId === seq.id)
                        .map((e) => ({ id: e.id, at: e.at, title: `${hm(e.at, tz)} · ${e.toName ?? ''}` }))}
                      tz={tz}
                      now={now}
                    />
                  ))}
                </div>
                <div className="rg-legend">
                  <span>
                    <i style={{ background: 'var(--accent)' }} />
                    email planifié
                  </span>
                  <span>
                    <i style={{ background: 'var(--ok)' }} />
                    email parti
                  </span>
                  <span>
                    <i style={{ background: 'var(--accent-tint-2)', borderRadius: 2 }} />
                    plage d’envoi
                  </span>
                  <span style={{ marginLeft: 'auto' }}>trait bleu = maintenant</span>
                </div>
              </div>
            </div>

            <div className="rg-card">
              <CardHead
                icon="list"
                title="File d’attente"
                sub="Toutes séquences, toutes entreprises confondues — l’ordre et l’heure sont décidés ici."
                right={
                  <>
                    <span className="pill">{planned.length} planifiés</span>
                    {blocked.length > 0 && <span className="pill warn">{blocked.length} en attente</span>}
                  </>
                }
              />
              <div className="rg-qhead">
                <span>heure</span>
                <span />
                <span>contact</span>
                <span>séquence · étape</span>
                <span>écart</span>
                <span />
              </div>
              <QueueRows rows={view.queue} now={now} tz={tz} paused={s.paused} />
            </div>

            <div className="rg-card">
              <CardHead
                icon="users"
                title="Tâches à la main"
                sub="WhatsApp, LinkedIn et appels ne partent jamais seuls : ils sont posés dans la file de la bonne personne."
                right={
                  <span className="pill accent">
                    {ROUTING_MODE_LABEL[s.taskRoutingMode].toLowerCase()}
                  </span>
                }
              />
              <div className="rg-card-body">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)',
                    gap: 20,
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <div className="rg-radio">
                      {(['pref', 'strict', 'admin'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={'rg-ropt' + (s.taskRoutingMode === mode ? ' on' : '')}
                          onClick={() =>
                            void patch({ task_routing_mode: mode }, `Attribution : ${ROUTING_MODE_LABEL[mode].toLowerCase()}`)
                          }
                        >
                          <span className="rad">{s.taskRoutingMode === mode && <i />}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="t">{ROUTING_MODE_LABEL[mode]}</span>
                            <span className="d">{ROUTING_MODE_HINT[mode]}</span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {s.taskRoutingMode === 'pref' && (
                      <div className="rg-trow" style={{ marginTop: 8 }}>
                        <div className="tx">
                          <b>Charge maximale par agent</b>
                          <span>Au-delà, le surplus bascule chez l’admin.</span>
                        </div>
                        <NumberField
                          value={s.taskMaxPerAgent}
                          min={1}
                          max={200}
                          suffix="tâches"
                          onCommit={(v) => void patch({ task_max_per_agent: v })}
                        />
                      </div>
                    )}

                    <div className="rg-flow">
                      <span className="n">
                        <XI name="whatsapp" className="ico-xs" />
                        étape à la main
                      </span>
                      <span>→</span>
                      <span className="n acc">
                        <XI name="user" className="ico-xs" />
                        propriétaire du contact
                      </span>
                      <span>→</span>
                      <span className="n adm">
                        <XI name="lock" className="ico-xs" />
                        admin par défaut
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="rg-lb" style={{ marginBottom: 8 }}>
                      Répartition actuelle · {view.pendingTasks} en attente
                      {view.unassignedTasks > 0 && ` · ${view.unassignedTasks} sans destinataire`}
                    </div>
                    {view.agents.map((agent) => {
                      const max = Math.max(1, ...view.agents.map((x) => x.pendingTasks))
                      return (
                        <div key={agent.id} className="rg-load">
                          <Avatar id={agent.id} name={agent.name} />
                          <span className="who">
                            {agent.name.split(' ')[0]}
                            {agent.isAdmin && <small> · admin</small>}
                          </span>
                          <span className="track">
                            <i
                              style={{
                                width: `${(agent.pendingTasks / max) * 100}%`,
                                background: colorForId(agent.id),
                              }}
                            />
                          </span>
                          <span className="n">{agent.pendingTasks}</span>
                          {agent.unavailable && <span className="pill warn">absent</span>}
                        </div>
                      )
                    })}
                    {view.agents.length === 0 && (
                      <div className="rg-hint">Aucun agent enregistré — tout revient à l’admin.</div>
                    )}
                    <p className="rg-hint">
                      Un message WhatsApp n’est jamais envoyé par le CRM : il est préparé, puis posé dans la file de la
                      personne qui suit le contact. Si personne ne le suit, c’est l’admin qui l’a.
                    </p>
                    <Link href="/automations/prospection" className="btn sm" style={{ marginTop: 6 }}>
                      <XI name="inbox" className="ico-sm" />
                      Ouvrir la file de démarchage
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Colonne droite ─────────────────────────────────────────── */}
          <div className="rg-stack">
            <SettingsCard settings={s} sentToday={view.sentToday} saving={saving} onPatch={patch} />

            <div className="rg-card">
              <CardHead
                icon="pipeline"
                title="Séquences dans la file"
                sub="Chaque séquence a ses propres plages, sa priorité et son plafond."
                right={<span className="pill">{view.sequences.length}</span>}
              />
              {view.sequences.map((seq) => {
                const open = openSequence === seq.id
                return (
                  <div key={seq.id} className="rg-seq">
                    <div className="rg-seq-h">
                      <i style={{ background: seqColor(seq.id) }} />
                      <button
                        type="button"
                        className="t"
                        onClick={() => setOpenSequence(open ? null : seq.id)}
                        title="Régler les plages de cette séquence"
                      >
                        {seq.name}
                      </button>
                      <button
                        type="button"
                        className="btn xs"
                        disabled={saving}
                        onClick={() =>
                          void patchSequence(
                            { automation_id: seq.id, status: seq.status === 'on' ? 'paused' : 'on' },
                            seq.status === 'on' ? 'Séquence mise en pause' : 'Séquence réactivée',
                          )
                        }
                      >
                        <XI name={seq.status === 'on' ? 'pause' : 'playFill'} className="ico-xs" />
                        {seq.status === 'on' ? 'Pause' : 'Activer'}
                      </button>
                    </div>
                    <MiniWindows windows={seq.windows} off={seq.status !== 'on'} />
                    <div className="rg-seq-meta">
                      <span>{seq.queued} en file</span>
                      <span>·</span>
                      <span>{seq.activeEnrollments} actifs</span>
                      <span>·</span>
                      <span>
                        {seq.sentToday} envoyés{seq.dailyCap != null ? ` / ${seq.dailyCap}` : ''}
                      </span>
                      <span className={seq.status === 'on' ? 'ok' : 'warn'}>
                        {seq.status === 'on' ? 'active' : 'en pause'}
                      </span>
                    </div>

                    {open && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                        <WindowEditor
                          windows={seq.windows}
                          disabled={saving}
                          onChange={(w) => {
                            if (overlappingWindows(w).size > 0) {
                              // On laisse l'utilisateur corriger : l'éditeur passe
                              // les plages fautives en rouge, rien n'est enregistré.
                              setView((v) =>
                                v
                                  ? {
                                      ...v,
                                      sequences: v.sequences.map((x) => (x.id === seq.id ? { ...x, windows: w } : x)),
                                    }
                                  : v,
                              )
                              return
                            }
                            void patchSequence({ automation_id: seq.id, send_windows: w })
                          }}
                        />
                        <div className="rg-trow" style={{ marginTop: 8 }}>
                          <div className="tx">
                            <b>Priorité dans la file</b>
                            <span>Qui passe devant quand deux séquences veulent envoyer au même moment.</span>
                          </div>
                          <NumberField
                            value={seq.priority}
                            min={1}
                            max={9}
                            onCommit={(v) => void patchSequence({ automation_id: seq.id, queue_priority: v })}
                          />
                        </div>
                        <div className="rg-trow">
                          <div className="tx">
                            <b>Plafond de cette séquence</b>
                            <span>Emails maximum par jour pour elle seule. 0 = pas de limite dédiée.</span>
                          </div>
                          <NumberField
                            value={seq.dailyCap ?? 0}
                            min={0}
                            max={10000}
                            suffix="/ j"
                            onCommit={(v) => void patchSequence({ automation_id: seq.id, daily_cap: v > 0 ? v : null })}
                          />
                        </div>
                        <Link href={`/automations/sequences/${seq.id}`} className="btn sm" style={{ marginTop: 4 }}>
                          <XI name="edit" className="ico-sm" />
                          Modifier les étapes
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
              {view.sequences.length === 0 && <div className="rg-empty">Aucune séquence pour l’instant.</div>}
            </div>

            <div className="rg-card">
              <CardHead icon="check" title="Derniers envois" sub="Écart réellement appliqué entre deux emails" />
              {view.sent.length === 0 && <div className="rg-empty">Rien n’est encore parti aujourd’hui.</div>}
              {view.sent.map((e) => (
                <div key={e.id} className="rg-sent">
                  <span className="h">{hm(e.at, tz)}</span>
                  <i
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 2,
                      background: e.automationId ? seqColor(e.automationId) : 'var(--text-4)',
                      flexShrink: 0,
                    }}
                  />
                  <span className="b">
                    <span className="n">{e.toName || e.subject}</span>
                    <span className="s">{e.subject}</span>
                  </span>
                  {e.gapMinutes != null && <span className="rg-gap">+{e.gapMinutes} min</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Frise ─────────────────────────────────────────────────────────────── */

function StripRow({
  label,
  color,
  windows,
  points = [],
  done = [],
  off,
  bold,
  tz,
  now,
}: {
  label: string
  color: string
  windows: SendWindow[]
  points?: { id: string; at: string; title: string }[]
  done?: { id: string; at: string; title: string }[]
  off?: boolean
  bold?: boolean
  tz: string
  now: number
}) {
  // La frise ne montre que la journée en cours : un départ prévu demain n'a pas
  // de place dessus, il reste dans la file.
  const today = localClock(now, tz).dayKey
  const onToday = (iso: string) => localClock(Date.parse(iso), tz).dayKey === today

  return (
    <div className={'rg-row' + (off ? ' off' : '')}>
      <span className="nm">
        <i style={{ background: color }} />
        <span style={{ fontWeight: bold ? 600 : 400 }}>{label}</span>
      </span>
      <div className="rg-track">
        {windows.map((w, i) => (
          <div
            key={i}
            className="rg-band"
            style={{ left: `${axisPct(w[0])}%`, width: `${Math.max(1, axisPct(w[1]) - axisPct(w[0]))}%` }}
          />
        ))}
        {done.filter((d) => onToday(d.at)).map((d) => (
          <span
            key={`d-${d.id}`}
            className="rg-pt done"
            style={{ left: `${axisPct(minutesOfDay(d.at, tz))}%` }}
            title={d.title}
          />
        ))}
        {points.filter((p) => onToday(p.at)).map((p) => (
          <span
            key={`p-${p.id}`}
            className="rg-pt"
            style={{ left: `${axisPct(minutesOfDay(p.at, tz))}%` }}
            title={p.title}
          />
        ))}
      </div>
    </div>
  )
}

/* ── File ──────────────────────────────────────────────────────────────── */

export function QueueRows({
  rows,
  now,
  tz,
  paused,
  compact,
}: {
  rows: RegulatorQueueRow[]
  now: number
  tz: string
  paused: boolean
  compact?: boolean
}) {
  const planned = rows.filter((r) => r.sendAt != null)
  const blocked = rows.filter((r) => r.sendAt == null)

  if (rows.length === 0) {
    return <div className="rg-empty">Aucun email en file — mettez des prospects en séquence.</div>
  }

  const out: React.ReactNode[] = []
  out.push(
    <div className="rg-sep" key="now">
      <XI name="clock" className="ico-xs" />
      maintenant · {hm(now, tz)}
      {paused && ' · file gelée'}
      <span className="rule" />
    </div>,
  )

  planned.forEach((row, index) => {
    // Un décalage de plage mérite une ligne à lui : c'est le moment où la file
    // « saute » dans le temps, et sans repère on croit à un bug.
    if (row.reason === 'out_of_window' || row.reason === 'next_day') {
      out.push(
        <div className="rg-sep warn" key={`s-${row.id}`}>
          <XI name="pause" className="ico-xs" />
          {holdReasonLabel(row.reason, row.sendAt ? Date.parse(row.sendAt) : null, tz)}
          <span className="rule" />
          {row.sequenceName}
        </div>,
      )
    }
    out.push(
      <div className={'rg-qrow' + (index === 0 ? ' next' : '')} key={row.id}>
        <span className="at">
          {hm(row.sendAt, tz)}
          <small>
            {row.sendAt && Date.parse(row.sendAt) - now > 86_400_000
              ? 'plus tard'
              : index === 0
                ? 'prochain'
                : hmd(row.sendAt, now, tz).startsWith('demain')
                  ? 'demain'
                  : "aujourd'hui"}
          </small>
        </span>
        <XI name="mail" className="ico-sm" style={{ color: 'var(--info)' }} />
        <span style={{ minWidth: 0 }}>
          <span className="n">{row.contactName}</span>
          <span className="s">
            {row.companyName}
            {row.lastEmailAt ? ` · dernier email ${hm(row.lastEmailAt, tz)}` : ' · jamais contacté'}
          </span>
          {row.reason === 'company_gap' && (
            <span className="rg-why">
              <XI name="company" className="ico-xs" />
              {holdReasonLabel(row.reason)}
            </span>
          )}
        </span>
        <span className="rg-seqn">
          <i style={{ background: seqColor(row.automationId) }} />
          <span>
            {row.sequenceName} <span style={{ color: 'var(--text-4)' }}>· ét. {row.step}</span>
          </span>
        </span>
        <span>
          {index === 0 ? (
            <span className="rg-gap hot">en tête</span>
          ) : (
            <span className="rg-gap">+{row.gapMinutes} min</span>
          )}
        </span>
        <span>{!compact && <Avatar id={row.ownerId} name={row.ownerId ?? undefined} />}</span>
      </div>,
    )
  })

  if (blocked.length > 0) {
    out.push(
      <div className="rg-sep" key="blk">
        <XI name="lock" className="ico-xs" />
        en attente d’une reprise
        <span className="rule" />
        {blocked.length} contacts
      </div>,
    )
    blocked.forEach((row) => {
      out.push(
        <div className="rg-qrow blk" key={row.id}>
          <span className="at" style={{ color: 'var(--text-4)' }}>
            —:—<small>en attente</small>
          </span>
          <XI name="mail" className="ico-sm" style={{ color: 'var(--text-4)' }} />
          <span style={{ minWidth: 0 }}>
            <span className="n">{row.contactName}</span>
            <span className="s">{row.companyName}</span>
            <span className="rg-why">
              <XI name="warning" className="ico-xs" />
              {holdReasonLabel(row.reason)}
            </span>
          </span>
          <span className="rg-seqn">
            <i style={{ background: seqColor(row.automationId) }} />
            <span>{row.sequenceName}</span>
          </span>
          <span>
            <span className="rg-gap">—</span>
          </span>
          <span>{!compact && <Avatar id={row.ownerId} name={row.ownerId ?? undefined} />}</span>
        </div>,
      )
    })
  }

  return <>{out}</>
}

/* ── Réglages ──────────────────────────────────────────────────────────── */

function SettingsCard({
  settings: s,
  sentToday,
  saving,
  onPatch,
}: {
  settings: RegulatorSettings
  sentToday: number
  saving: boolean
  onPatch: (body: Record<string, unknown>, message?: string) => Promise<boolean>
}) {
  const [windows, setWindows] = React.useState<SendWindow[]>(s.defaultWindows)
  React.useEffect(() => setWindows(s.defaultWindows), [s.defaultWindows])

  const avg = (s.gapMinMinutes + s.gapMaxMinutes) / 2
  const preset = GAP_PRESETS.find((p) => p.min === s.gapMinMinutes && p.max === s.gapMaxMinutes)
  const windowsInvalid = overlappingWindows(windows).size > 0

  return (
    <div className="rg-card">
      <CardHead
        icon="settings"
        title="Régulateur"
        sub="Une seule cadence pour tous les emails"
        right={<span className={'pill ' + (s.paused ? 'warn' : 'ok')}>{s.paused ? 'en pause' : 'actif'}</span>}
      />

      <SetBlock icon="clock" title="Écart entre deux emails" extra="toutes séquences">
        <div className="rg-dual">
          <span className="rg-lb">toutes les</span>
          <NumberField
            value={s.gapMinMinutes}
            min={1}
            max={600}
            onCommit={(v) => void onPatch({ gap_min_minutes: v, gap_max_minutes: Math.max(v, s.gapMaxMinutes) })}
          />
          <span className="rg-lb">→</span>
          <NumberField
            value={s.gapMaxMinutes}
            min={1}
            max={600}
            onCommit={(v) => void onPatch({ gap_max_minutes: v, gap_min_minutes: Math.min(v, s.gapMinMinutes) })}
          />
          <span className="rg-lb">minutes</span>
        </div>
        <div className="rg-presets">
          {GAP_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className={preset?.name === p.name ? 'on' : ''}
              title={p.hint}
              disabled={saving}
              onClick={() => void onPatch({ gap_min_minutes: p.min, gap_max_minutes: p.max }, `Cadence « ${p.name} »`)}
            >
              <b>{p.name}</b>
              <span>
                {p.min}–{p.max} min
              </span>
            </button>
          ))}
        </div>
        <p className="rg-hint">
          Chaque envoi tire un écart au hasard dans cette fourchette : ≈ <b>{(60 / avg).toFixed(1)} emails/h</b>. Deux
          emails ne partent jamais à la même minute, quelle que soit la séquence.
        </p>
      </SetBlock>

      <SetBlock icon="clock" title="Plages d’envoi par défaut" extra={`${windows.length} plage${windows.length > 1 ? 's' : ''}`}>
        <WindowEditor windows={windows} onChange={setWindows} disabled={saving} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn sm accent"
            disabled={saving || windowsInvalid}
            onClick={() => void onPatch({ default_windows: normalizeWindows(windows) }, 'Plages enregistrées')}
          >
            <XI name="check" className="ico-sm" />
            Enregistrer les plages
          </button>
          <button type="button" className="btn sm ghost" onClick={() => setWindows(s.defaultWindows)} disabled={saving}>
            Annuler
          </button>
        </div>
        <p className="rg-hint">
          Ces créneaux s’appliquent aux séquences qui n’ont pas les leurs. Hors plage, la séquence se met en pause
          d’elle-même : rien n’est perdu, tout reprend à l’ouverture suivante.
        </p>
      </SetBlock>

      <SetBlock icon="lock" title="Mémoire des envois" extra="anti-doublon">
        <ToggleRow
          label="Compter tous les emails déjà envoyés"
          desc="La file regarde l’historique de tout le CRM, pas seulement celui de la séquence en cours."
          checked={s.countAllSequences}
          onChange={(v) => void onPatch({ count_all_sequences: v })}
        />
        <ToggleRow
          label="1 email maximum par jour et par contact"
          desc="Un contact inscrit dans deux séquences n’en reçoit qu’un."
          checked={s.onePerDayPerContact}
          onChange={(v) => void onPatch({ one_per_day_per_contact: v })}
        />
        <div className="rg-trow">
          <div className="tx">
            <b>Espacer deux emails d’une même entreprise</b>
            <span>Évite que trois personnes du même garage reçoivent tout en même temps.</span>
          </div>
          <NumberField
            value={s.companyGapMinutes}
            min={0}
            max={1440}
            suffix="min"
            onCommit={(v) => void onPatch({ company_gap_minutes: v })}
          />
        </div>
        <ToggleRow
          label="Sortie immédiate si réponse"
          desc="Le contact quitte ses séquences dès qu’il répond."
          checked={s.exitOnReply}
          onChange={(v) => void onPatch({ exit_on_reply: v })}
        />
      </SetBlock>

      <SetBlock icon="flag" title="Plafond quotidien" extra={`${sentToday} / ${s.dailyCap}`}>
        <div className="rg-dual">
          <NumberField value={s.dailyCap} min={0} max={10000} onCommit={(v) => void onPatch({ daily_cap: v })} />
          <span className="rg-lb">emails / jour, tous confondus</span>
        </div>
        <div className="rg-bar">
          <i style={{ width: `${Math.min(100, s.dailyCap ? (sentToday / s.dailyCap) * 100 : 0)}%` }} />
        </div>
        <ToggleRow
          label="Envoyer uniquement du lundi au vendredi"
          checked={s.businessDaysOnly}
          onChange={(v) => void onPatch({ business_days_only: v })}
        />
      </SetBlock>
    </div>
  )
}

/**
 * Champ numérique qui n'enregistre qu'à la sortie du champ (ou sur Entrée) :
 * un PATCH par frappe ferait un aller-retour serveur à chaque chiffre.
 */
function NumberField({
  value,
  min,
  max,
  suffix,
  onCommit,
}: {
  value: number
  min: number
  max: number
  suffix?: string
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = React.useState(String(value))
  React.useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : value
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <input
        className="rg-num"
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {suffix && <span className="rg-lb">{suffix}</span>}
    </span>
  )
}

/** Réexporté pour le tiroir « file d'envoi » du pipeline commercial. */
export { formatHM, AXIS_START }
