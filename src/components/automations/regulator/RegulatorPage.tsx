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
  JitterPreview,
  MiniWindows,
  RangeSlider,
  Segmented,
  SetBlock,
  WindowEditor,
  axisPct,
  colorForId,
  eta,
  hm,
  hmd,
  minutesOfDay,
} from './parts'
import type { RegulatorQueueRow, RegulatorVerification, RegulatorView } from './types'
import '../regulator.css'

const AXIS_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22]

/** Couleur stable par séquence — la même dans la file, la frise et la liste. */
const seqColor = (id: string) => colorForId(id)

/**
 * Traduit un échec d'enregistrement en phrase actionnable. Le message du
 * serveur fait foi quand il y en a un ; sinon le statut HTTP dit déjà beaucoup,
 * et vaut mieux qu'un « Enregistrement impossible » identique pour tout.
 */
export function failureMessage(status: number, payload: { message?: string; error?: string } | null): string {
  if (payload?.message) return payload.message
  if (status === 401) return 'Session expirée — reconnectez-vous, puis réessayez.'
  if (status === 403) return 'Réglage réservé aux administrateurs.'
  if (status === 400 && payload?.error === 'invalid_body') return 'Valeur refusée — vérifiez le champ modifié.'
  if (status >= 500) return `Le serveur a refusé l’enregistrement (${payload?.error ?? status}).`
  return `Enregistrement impossible (${payload?.error ?? status}).`
}

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

  const save = React.useCallback(async (url: string, body: Record<string, unknown>, message?: string) => {
    setSaving(true)
    try {
      const res = await authedFetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        // « Enregistrement impossible » tout court ne laissait aucune prise :
        // on dit ce qui a échoué, et on affiche la vue à jour quand le serveur
        // en renvoie une (une migration manquante en fait partie).
        toast.error(failureMessage(res.status, payload), {
          description: payload?.sql_file ? `Fichier à jouer : ${payload.sql_file}` : undefined,
          duration: payload?.sql_file ? 12_000 : undefined,
        })
        return false
      }
      setView(payload as RegulatorView)
      if (message) toast.success(message)
      return true
    } catch {
      toast.error('Réseau indisponible — le réglage n’a pas été enregistré.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const patch = React.useCallback(
    (body: Record<string, unknown>, message?: string) => save('/api/automations/regulator', body, message),
    [save],
  )

  const patchSequence = React.useCallback(
    async (body: Record<string, unknown>, message?: string) => {
      await save('/api/automations/regulator/sequence', body, message)
    },
    [save],
  )

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
        {/* Phase de test : impossible de la rater. Un envoi retenu n'est pas
            une panne, et l'ignorer ferait croire à une séquence cassée. */}
        {s.testMode && (
          <div className="rg-testbar">
            <XI name="warning" className="ico-sm" />
            <span className="t">Phase de test active</span>
            <span className="d">
              {view.testAddresses.length > 0
                ? `Seules ${view.testAddresses.length} adresses reçoivent. Les autres prospects sont gelés : rien ne part, et leur séquence n’avance pas.`
                : 'Aucune adresse autorisée : plus aucun email ne part, toutes les séquences sont gelées.'}
            </span>
            {(view.testHeld?.length ?? 0) > 0 && (
              <span className="pill warn">{view.testHeld?.length} prospects gelés</span>
            )}
            <button
              type="button"
              className="btn sm"
              disabled={saving}
              onClick={() => void patch({ test_mode: false }, 'Phase de test coupée — les envois repartent')}
            >
              Couper la phase de test
            </button>
          </div>
        )}

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

            {/* Gelés par la phase de test. Sans cette liste, ces prospects
                disparaîtraient de la file sans explication — et on croirait la
                séquence cassée plutôt que volontairement retenue. */}
            {(view.testHeld?.length ?? 0) > 0 && (
              <div className="rg-card">
                <CardHead
                  icon="warning"
                  title="Gelés par la phase de test"
                  sub="Aucun email n’est parti pour eux et leur séquence n’a pas avancé : ils repartiront exactement là où ils en sont dès que vous couperez la phase de test."
                  right={<span className="pill warn">{view.testHeld?.length}</span>}
                />
                <div className="rg-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {view.testHeld?.slice(0, 40).map((row) => (
                    <div key={row.enrollmentId} className="rg-load">
                      <span className="who" style={{ fontWeight: 600 }}>
                        {row.companyName}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 0, flex: 1 }}>
                        {row.contactName} · {row.sequenceName} · étape {row.step}
                      </span>
                      {row.entrepriseId != null && (
                        <Link className="btn ghost xs" href={`/companies/${row.entrepriseId}`}>
                          Fiche
                        </Link>
                      )}
                    </div>
                  ))}
                  {(view.testHeld?.length ?? 0) > 40 && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      … et {(view.testHeld?.length ?? 0) - 40} autre{(view.testHeld?.length ?? 0) - 40 > 1 ? 's' : ''}.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hors file, mais bien réels : les prospects qu'aucune adresse ne
                permet d'atteindre. Sans cette liste, la séquence semblerait
                simplement « ne rien faire » pour eux. */}
            {view.missingEmail.length > 0 && (
              <div className="rg-card">
                <CardHead
                  icon="mail"
                  title="Sans email — hors file"
                  sub="Aucun envoi n’est préparé pour ces entreprises. Saisissez l’adresse sur leur fiche, ou sautez l’étape email depuis le pipeline commercial."
                  right={<span className="pill warn">{view.missingEmail.length}</span>}
                />
                <div className="rg-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {view.missingEmail.slice(0, 40).map((row) => (
                    <div key={row.enrollmentId} className="rg-load">
                      <span className="who" style={{ fontWeight: 600 }}>
                        {row.companyName}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 0, flex: 1 }}>
                        {row.contactName} · {row.sequenceName} · étape {row.step}
                      </span>
                      {row.entrepriseId != null && (
                        <Link className="btn ghost xs" href={`/companies/${row.entrepriseId}`}>
                          Fiche
                        </Link>
                      )}
                    </div>
                  ))}
                  {view.missingEmail.length > 40 && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      … et {view.missingEmail.length - 40} autre{view.missingEmail.length - 40 > 1 ? 's' : ''}.
                    </div>
                  )}
                  <Link className="btn sm" href="/pipeline-commercial" style={{ alignSelf: 'flex-start' }}>
                    Traiter dans le pipeline commercial
                  </Link>
                </div>
              </div>
            )}

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
            <SettingsCard
              settings={s}
              sentToday={view.sentToday}
              testAddresses={view.testAddresses}
              blockedToday={view.blockedToday}
              testGuardReady={view.testGuardReady !== false}
              testGuardMigration={view.testGuardMigration ?? 'sql/20260802_test_phase_guard.sql'}
              verification={view.verification}
              saving={saving}
              onPatch={patch}
            />

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
                    {/* Ce que cette séquence pèse dans le tuyau commun : sans
                        ça, « 12 en file » ne dit pas si c'est beaucoup. */}
                    {view.queue.length > 0 && (
                      <>
                        <div className="rg-rnglb" style={{ marginTop: 7 }}>
                          <span>part de la file</span>
                          <span>{Math.round((seq.queued / view.queue.length) * 100)}%</span>
                        </div>
                        <div className="rg-bar" style={{ marginTop: 3 }}>
                          <i
                            style={{
                              width: `${Math.min(100, (seq.queued / view.queue.length) * 100)}%`,
                              background: seqColor(seq.id),
                            }}
                          />
                        </div>
                      </>
                    )}
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
                            <span>Qui passe devant quand deux séquences veulent envoyer au même moment. 1 passe devant 5.</span>
                          </div>
                          <Segmented
                            value={Math.min(5, Math.max(1, seq.priority))}
                            disabled={saving}
                            ariaLabel={`Priorité de ${seq.name} dans la file`}
                            options={[1, 2, 3, 4, 5].map((n) => ({
                              value: n,
                              label: String(n),
                              title: n === 1 ? 'passe devant tout le reste' : n === 5 ? 'passe en dernier' : undefined,
                            }))}
                            onChange={(v) => void patchSequence({ automation_id: seq.id, queue_priority: v })}
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
  testAddresses,
  blockedToday,
  testGuardReady,
  testGuardMigration,
  verification,
  saving,
  onPatch,
}: {
  settings: RegulatorSettings
  sentToday: number
  testAddresses: { id: string; label: string; email: string }[]
  blockedToday: number
  testGuardReady: boolean
  testGuardMigration: string
  verification?: RegulatorVerification
  saving: boolean
  onPatch: (body: Record<string, unknown>, message?: string) => Promise<boolean>
}) {
  const [windows, setWindows] = React.useState<SendWindow[]>(s.defaultWindows)
  React.useEffect(() => setWindows(s.defaultWindows), [s.defaultWindows])

  // Fourchette affichée pendant qu'on glisse un curseur : le serveur ne la
  // connaît qu'au relâchement, mais l'aperçu de l'aléatoire doit suivre le doigt.
  const [gap, setGap] = React.useState<[number, number]>([s.gapMinMinutes, s.gapMaxMinutes])
  React.useEffect(() => setGap([s.gapMinMinutes, s.gapMaxMinutes]), [s.gapMinMinutes, s.gapMaxMinutes])
  const [seed, setSeed] = React.useState('apercu')
  const [cap, setCap] = React.useState(s.dailyCap)
  React.useEffect(() => setCap(s.dailyCap), [s.dailyCap])

  // Migration non jouée : on n'affiche pas des réglages qui échoueraient à
  // l'enregistrement, on dit quoi faire. Même parti pris que la phase de test.
  const verifyReady = verification?.ready !== false

  const [lo, hi] = gap
  const avg = (lo + hi) / 2
  const preset = GAP_PRESETS.find((p) => p.min === s.gapMinMinutes && p.max === s.gapMaxMinutes)
  const windowsInvalid = overlappingWindows(windows).size > 0

  /** Un curseur ne peut pas croiser l'autre : la borne poussée entraîne sa voisine. */
  const clampGap = (side: 0 | 1, v: number): [number, number] =>
    side === 0 ? [v, Math.max(v, gap[1])] : [Math.min(v, gap[0]), v]
  const commitGap = (next: [number, number]) => {
    if (next[0] === s.gapMinMinutes && next[1] === s.gapMaxMinutes) return
    void onPatch({ gap_min_minutes: next[0], gap_max_minutes: next[1] })
  }

  return (
    <div className="rg-card">
      <CardHead
        icon="settings"
        title="Régulateur"
        sub="Une seule cadence pour tous les emails"
        right={<span className={'pill ' + (s.paused ? 'warn' : 'ok')}>{s.paused ? 'en pause' : 'actif'}</span>}
      />

      <SetBlock
        icon="warning"
        title="Phase de test"
        extra={!testGuardReady ? 'migration à jouer' : s.testMode ? `${testAddresses.length} adresses` : 'inactive'}
      >
        <ToggleRow
          label="Ne servir que les adresses de test"
          desc="Tout autre prospect est gelé à son étape : aucun email ne part, la séquence n’avance pas et sa carte ne bouge pas dans le pipeline commercial. Vos opportunités de test, elles, se déroulent normalement."
          checked={s.testMode}
          disabled={!testGuardReady || saving}
          onChange={(v) =>
            void onPatch(
              { test_mode: v },
              v ? 'Phase de test activée — plus rien ne part vers un prospect' : 'Phase de test coupée',
            )
          }
          accent
        />
        {/* Le cas qui produisait « Enregistrement impossible » sans rien
            expliquer : l'interrupteur existe dans le code, pas encore en base. */}
        {!testGuardReady && (
          <div className="rg-sqlgap">
            <span className="t">
              <XI name="warning" className="ico-xs" /> Interrupteur absent de la base
            </span>
            <span className="d">
              La phase de test a besoin de la colonne <b>regulator_settings.test_mode</b> et du journal{' '}
              <b>email_logs.blocked_reason</b>. Jouez ce fichier dans l’éditeur SQL de Supabase, puis rafraîchissez :
            </span>
            <code>{testGuardMigration}</code>
          </div>
        )}
        {testGuardReady && s.testMode && (
          <div style={{ marginTop: 8 }}>
            {testAddresses.length === 0 ? (
              <p className="rg-hint" style={{ color: 'var(--danger)' }}>
                Aucune adresse enregistrée : <b>plus aucun email ne part</b>. Ajoutez-en depuis Opportunités › Mode
                test.
              </p>
            ) : (
              <div className="rg-testlist">
                {testAddresses.map((a) => (
                  <span key={a.id} className="rg-testmail" title={a.label}>
                    <XI name="check" className="ico-xs" />
                    {a.email}
                  </span>
                ))}
              </div>
            )}
            <p className="rg-hint">
              {blockedToday > 0
                ? `${blockedToday} envoi${blockedToday > 1 ? 's' : ''} retenu${blockedToday > 1 ? 's' : ''} aujourd’hui.`
                : 'Aucun envoi retenu aujourd’hui.'}{' '}
              La liste se gère depuis <b>Opportunités › Mode test</b>.
            </p>
          </div>
        )}
      </SetBlock>

      <SetBlock icon="clock" title="Écart entre deux emails" extra="toutes séquences">
        <div className="rg-dual">
          <span className="rg-lb">toutes les</span>
          <NumberField
            value={lo}
            min={1}
            max={600}
            onCommit={(v) => {
              const next = clampGap(0, v)
              setGap(next)
              commitGap(next)
            }}
          />
          <span className="rg-lb">→</span>
          <NumberField
            value={hi}
            min={1}
            max={600}
            onCommit={(v) => {
              const next = clampGap(1, v)
              setGap(next)
              commitGap(next)
            }}
          />
          <span className="rg-lb">minutes</span>
        </div>

        {/* Les deux curseurs de la maquette : on glisse, l'aperçu suit, et
            l'écriture n'a lieu qu'au relâchement. */}
        <RangeSlider
          value={lo}
          min={1}
          max={60}
          disabled={saving}
          ariaLabel="Écart minimum entre deux emails, en minutes"
          onPreview={(v) => setGap(clampGap(0, v))}
          onCommit={(v) => commitGap(clampGap(0, v))}
        />
        <RangeSlider
          value={hi}
          min={2}
          max={90}
          tone="hi"
          disabled={saving}
          ariaLabel="Écart maximum entre deux emails, en minutes"
          onPreview={(v) => setGap(clampGap(1, v))}
          onCommit={(v) => commitGap(clampGap(1, v))}
        />

        <JitterPreview min={lo} max={hi} seed={seed} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            className="btn ghost xs"
            onClick={() => setSeed(`t${Date.now()}`)}
            title="Retirer une autre série d’écarts dans la même fourchette"
          >
            <XI name="refresh" className="ico-xs" />
            Re-tirer l’aléatoire
          </button>
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

      <SetBlock icon="flag" title="Plafond quotidien" extra={`${sentToday} / ${cap}`}>
        <div className="rg-dual">
          <NumberField
            value={cap}
            min={0}
            max={10000}
            onCommit={(v) => {
              setCap(v)
              if (v !== s.dailyCap) void onPatch({ daily_cap: v })
            }}
          />
          <span className="rg-lb">emails / jour, tous confondus</span>
        </div>
        <RangeSlider
          value={Math.min(cap, 500)}
          min={0}
          max={500}
          step={5}
          disabled={saving}
          ariaLabel="Plafond d’emails par jour"
          onPreview={setCap}
          onCommit={(v) => {
            setCap(v)
            if (v !== s.dailyCap) void onPatch({ daily_cap: v })
          }}
        />
        <div className="rg-rnglb">
          <span>0</span>
          <span>{cap === 0 ? 'aucun envoi' : `≈ ${Math.round(cap / Math.max(1, 60 / avg))} h de file`}</span>
          <span>500</span>
        </div>
        <div className="rg-bar">
          <i style={{ width: `${Math.min(100, cap ? (sentToday / cap) * 100 : 0)}%` }} />
        </div>
        <ToggleRow
          label="Envoyer uniquement du lundi au vendredi"
          checked={s.businessDaysOnly}
          onChange={(v) => void onPatch({ business_days_only: v })}
        />
        <ToggleRow
          label={`Pause automatique si les rebonds dépassent ${s.bounceGuardThreshold} %`}
          desc="Le régulateur se coupe seul et prévient l’admin. C’est la seule protection qui ne repose sur aucune prédiction : si la réalité dérape, tout s’arrête."
          checked={s.bounceGuard}
          disabled={!verifyReady || saving}
          onChange={(v) => void onPatch({ bounce_guard: v })}
        />
      </SetBlock>

      <VerificationBlock
        s={s}
        verification={verification}
        ready={verifyReady}
        saving={saving}
        onPatch={onPatch}
      />
    </div>
  )
}

/**
 * Qualité des adresses.
 *
 * Le bloc dit deux choses, dans cet ordre : ce que vaut la base (répartition
 * des adresses) et ce que dit la réalité (taux de rebond mesuré). La seconde
 * prime toujours sur la première — c'est elle qui décide.
 */
function VerificationBlock({
  s,
  verification,
  ready,
  saving,
  onPatch,
}: {
  s: RegulatorSettings
  verification?: RegulatorVerification
  ready: boolean
  saving: boolean
  onPatch: (body: Record<string, unknown>, message?: string) => Promise<boolean>
}) {
  const counts = verification?.counts
  const known = counts ? counts.valid + counts.risky + counts.invalid + counts.unknown + counts.pending : 0
  const bounce = verification?.bounce24h

  return (
    <SetBlock
      icon="shield"
      title="Qualité des adresses"
      extra={!ready ? 'migration à jouer' : s.verifyBeforeSend ? `${known} adresses` : 'garde coupé'}
    >
      {!ready ? (
        <div className="rg-sqlgap">
          <span className="t">
            <XI name="warning" className="ico-xs" /> Vérificateur absent de la base
          </span>
          <span className="d">
            La vérification des adresses a besoin des tables <b>email_verifications</b>,{' '}
            <b>email_domain_cache</b>, <b>email_suppressions</b> et <b>email_events</b>. Jouez ce fichier dans
            l’éditeur SQL de Supabase, puis rafraîchissez :
          </span>
          <code>{verification?.migration ?? 'sql/20260803_email_verification.sql'}</code>
        </div>
      ) : (
        <>
          <ToggleRow
            label="Ne rien envoyer vers une adresse non vérifiée"
            desc="Une adresse jamais contrôlée gèle son étape le temps du contrôle — quelques minutes — au lieu de partir à l’aveugle."
            checked={s.verifyBeforeSend}
            disabled={saving}
            onChange={(v) =>
              void onPatch(
                { verify_before_send: v },
                v ? 'Vérification exigée avant tout envoi' : 'Vérification désactivée',
              )
            }
            accent
          />

          {counts && known > 0 && (
            <div className="rg-vgrid">
              <VerdictTile tone="ok" n={counts.valid} label="Vérifiées" hint="rien à signaler" />
              <VerdictTile tone="warn" n={counts.risky} label="Douteuses" hint="au compte-gouttes" />
              <VerdictTile tone="bad" n={counts.invalid} label="Invalides" hint="aucun envoi" />
              <VerdictTile
                tone="mute"
                n={counts.pending + counts.unknown}
                label="À vérifier"
                hint="file de fond"
              />
            </div>
          )}

          {/* Le taux de rebond réel : la seule mesure qui ne suppose rien. */}
          {bounce && (
            <div className={'rg-bounce' + (verification?.overThreshold ? ' over' : '')}>
              <div className="v">
                {bounce.sent === 0 ? '—' : `${bounce.rate.toFixed(1)} %`}
                <small>de rebonds sur 24 h</small>
              </div>
              <p className="rg-hint">
                {bounce.sent === 0
                  ? 'Aucun envoi sur les dernières 24 heures.'
                  : `${bounce.hardBounces} rebond${bounce.hardBounces > 1 ? 's' : ''} dur${
                      bounce.hardBounces > 1 ? 's' : ''
                    } sur ${bounce.sent} envoi${bounce.sent > 1 ? 's' : ''}.`}
                {verification?.bounce7d && verification.bounce7d.sent > 0 && (
                  <> Sur 7 jours : {verification.bounce7d.rate.toFixed(1)} %.</>
                )}
              </p>
            </div>
          )}

          {(verification?.invalidHeld.length ?? 0) > 0 && (
            <p className="rg-hint">
              <b>{verification?.invalidHeld.length}</b> prospect
              {(verification?.invalidHeld.length ?? 0) > 1 ? 's' : ''} gelé
              {(verification?.invalidHeld.length ?? 0) > 1 ? 's' : ''} sur une adresse qui ne recevra pas. Corrigez
              l’adresse depuis le pipeline commercial : la séquence repart toute seule.
            </p>
          )}

          <div className="rg-dual" style={{ marginTop: 10 }}>
            <span className="rg-lb">revérifier après</span>
            <NumberField
              value={s.verifyTtlDays}
              min={1}
              max={3650}
              onCommit={(v) => {
                if (v !== s.verifyTtlDays) void onPatch({ verify_ttl_days: v })
              }}
            />
            <span className="rg-lb">jours</span>
          </div>
          <p className="rg-hint">
            Une adresse qui reçoit repart pour {s.verifyTtlDays} jours à chaque livraison, sans être retestée.
          </p>

          <div className="rg-dual" style={{ marginTop: 10 }}>
            <span className="rg-lb">adresses douteuses, au plus</span>
            <NumberField
              value={s.riskyDailyShare}
              min={0}
              max={100}
              onCommit={(v) => {
                if (v !== s.riskyDailyShare) void onPatch({ risky_daily_share: v })
              }}
            />
            <span className="rg-lb">% du plafond du jour</span>
          </div>
          <p className="rg-hint">
            Est « douteuse » une adresse qui porte un signal négatif concret — un rebond sur le même domaine
            d’entreprise, un domaine sans serveur mail, des rebonds répétés. Pas simplement « pas encore
            prouvée » : au démarrage, aucune adresse ne l’est.
          </p>

          <ToggleRow
            label="Éprouver un domaine avant d’y envoyer en nombre"
            desc="Sur un domaine d’entreprise vers lequel rien n’est jamais parti, un seul email s’en va ; les autres attendent son verdict. S’il rebondit, ils sont gelés avant d’être envoyés."
            checked={s.domainFirstTouch}
            disabled={saving}
            onChange={(v) => void onPatch({ domain_first_touch: v })}
          />
        </>
      )}
    </SetBlock>
  )
}

function VerdictTile({
  tone,
  n,
  label,
  hint,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'mute'
  n: number
  label: string
  hint: string
}) {
  return (
    <div className={`rg-vtile ${tone}`}>
      <b>{n}</b>
      <span>{label}</span>
      <small>{hint}</small>
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
