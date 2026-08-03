'use client'
// SequencesList — onglet Séquences : cartes résumé + tableau des séquences.
// Porté depuis claude design/automations-sequences.jsx.
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { authedFetch } from '@/utils/authedFetch'
import { XI } from './icons'
import { StatusBadge } from './atoms'
import { useRefData } from './ref-data'
import { listAutomations, createAutomation } from './automations-db'
import { MiniWindows, colorForId, hm } from './regulator/parts'
import { DEFAULT_WINDOWS, formatHM, normalizeWindows } from '@/lib/automations/regulator'
import type { RegulatorView } from './regulator/types'
import type { Automation, SeqStepKind, SequenceDefinition } from './types'
import './regulator.css'

interface EnrollAgg {
  active: number
  paused: number
  finished: number
}

/** Icône par canal — la même que dans l'éditeur, pour lire une séquence d'un coup d'œil. */
const CHANNEL_ICON: Record<SeqStepKind, string> = {
  email: 'mail',
  whatsapp: 'whatsapp',
  linkedin: 'linkedin',
  call: 'phone',
  task: 'task',
  wait: 'clock',
}

export function SequencesList() {
  const router = useRouter()
  const ref = useRefData()
  const [rows, setRows] = useState<Automation[]>([])
  const [agg, setAgg] = useState<Record<string, EnrollAgg>>({})
  const [pendingTasks, setPendingTasks] = useState(0)
  const [tasksBySeq, setTasksBySeq] = useState<Record<string, number>>({})
  const [reg, setReg] = useState<RegulatorView | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [seqs, enr, tasks] = await Promise.all([
          listAutomations('sequence'),
          supabase.from('sequence_enrollments').select('automation_id,status'),
          supabase.from('prospection_tasks').select('automation_id').eq('status', 'pending'),
        ])
        setRows(seqs)
        const map: Record<string, EnrollAgg> = {}
        for (const e of (enr.data ?? []) as { automation_id: string; status: string }[]) {
          const a = (map[e.automation_id] ??= { active: 0, paused: 0, finished: 0 })
          if (e.status === 'active') a.active++
          else if (e.status === 'paused') a.paused++
          else if (e.status === 'finished' || e.status === 'replied') a.finished++
        }
        setAgg(map)
        const taskRows = (tasks.data ?? []) as { automation_id: string | null }[]
        setPendingTasks(taskRows.length)
        const bySeq: Record<string, number> = {}
        for (const t of taskRows) if (t.automation_id) bySeq[t.automation_id] = (bySeq[t.automation_id] ?? 0) + 1
        setTasksBySeq(bySeq)
      } catch {
        toast.error('Chargement des séquences impossible')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // La file et le prochain envoi viennent du régulateur — réservé à l'admin.
  // Un agent voit la même liste, simplement sans les colonnes de file.
  useEffect(() => {
    ;(async () => {
      try {
        const res = await authedFetch('/api/automations/regulator')
        if (res.ok) setReg((await res.json()) as RegulatorView)
      } catch {
        /* file indisponible : la liste reste lisible sans elle */
      }
    })()
  }, [])

  const totalActive = useMemo(
    () => Object.values(agg).reduce((s, a) => s + a.active, 0),
    [agg],
  )
  const tz = reg?.settings.timezone ?? 'Europe/Paris'
  const defaultWindows = reg?.settings.defaultWindows ?? DEFAULT_WINDOWS

  async function handleCreate() {
    setCreating(true)
    try {
      const auto = await createAutomation({
        kind: 'sequence',
        name: 'Nouvelle séquence',
        definition: { steps: [] },
        settings: { cadence: 'bizday', timezone: 'Europe/Paris', exitOnReply: true, oncePerDay: true },
      })
      router.push(`/automations/sequences/${auto.id}`)
    } catch {
      toast.error('Création impossible')
      setCreating(false)
    }
  }

  return (
    <div className="alist-page">
      <div className="alist-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Séquences de prospection</h1>
          <div className="desc">
            Cadences multi-canal alternant emails automatiques et actions manuelles (appels, WhatsApp, LinkedIn).
          </div>
        </div>
        <button className="btn accent" type="button" onClick={handleCreate} disabled={creating}>
          <XI name="plus" className="ico-sm" />
          Nouvelle séquence
        </button>
      </div>

      <div className="summary-grid">
        <SummaryCard icon="flame" color="var(--accent)" bg="var(--accent-tint)" value={totalActive} label="Prospects actifs" desc="dans une séquence" />
        <SummaryCard icon="inbox" color="var(--info)" bg="var(--info-tint)" value={rows.length} label="Séquences" desc="configurées" />
        <SummaryCard icon="phone" color="var(--manual)" bg="var(--manual-tint)" value={pendingTasks} label="Tâches du jour" desc="appels + WhatsApp à traiter" />
        <SummaryCard icon="checkBig" color="var(--ok)" bg="var(--ok-tint)" value={rows.filter((r) => r.status === 'on').length} label="Séquences actives" desc="en cours d'exécution" />
      </div>

      <div className="alist-table">
        <div
          className="seq-list-row"
          style={{
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--border)',
            fontSize: 10.5,
            fontWeight: 600,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            padding: '8px 14px',
          }}
        >
          <div />
          <div>Nom</div>
          <div>Canaux · Plages d’envoi</div>
          <div>Progression</div>
          <div>File / actifs</div>
          <div>Statut</div>
          <div />
        </div>
        {loading && <div className="empty-row" style={{ padding: 32 }}>Chargement…</div>}
        {!loading &&
          rows.map((seq) => {
            const def = (seq.definition as SequenceDefinition) || { steps: [] }
            const steps = Array.isArray(def.steps) ? def.steps.length : 0
            const a = agg[seq.id] ?? { active: 0, paused: 0, finished: 0 }
            const total = a.active + a.paused + a.finished
            const finishedPct = total === 0 ? 0 : Math.round((a.finished / total) * 100)
            const pipeline = seq.settings?.pipeline
              ? ref.pipelines.find((p) => p.id === seq.settings.pipeline)
              : null
            const stage = seq.settings?.stage
              ? ref.stages.find((s) => String(s.id) === String(seq.settings.stage))
              : null
            const kinds = (Array.isArray(def.steps) ? def.steps : []).map((s) => s.kind)
            const windows = normalizeWindows(seq.settings?.sendWindows)
            const shown = windows.length > 0 ? windows : defaultWindows
            const regSeq = reg?.sequences.find((x) => x.id === seq.id)
            const waTasks = tasksBySeq[seq.id] ?? 0
            return (
              <div key={seq.id} className="seq-list-row" onClick={() => router.push(`/automations/sequences/${seq.id}`)}>
                <div className="kind-ic" style={{ background: colorForId(seq.id), color: '#fff' }}>
                  <XI name="flame" className="ico" />
                </div>
                <div>
                  <div className="name" style={{ fontSize: 13, fontWeight: 500 }}>
                    {seq.name}
                  </div>
                  <div className="sub" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {pipeline?.name ?? 'Lancement manuel'}
                    {stage && ` · entrée « ${stage.name} »`}
                    {` · ${steps} étape${steps > 1 ? 's' : ''}`}
                  </div>
                </div>
                {/* Ce que la maquette met en avant : par où ça passe, et quand
                    les créneaux sont ouverts. */}
                <div style={{ minWidth: 0 }}>
                  <div className="seq-channels">
                    {kinds.length === 0 && <span className="seq-none">aucune étape</span>}
                    {kinds.map((k, i) => (
                      <span key={i} className="seq-chan" data-kind={k} title={k}>
                        <XI name={CHANNEL_ICON[k] ?? 'task'} className="ico-xs" />
                      </span>
                    ))}
                  </div>
                  <MiniWindows windows={shown} off={seq.status !== 'on'} />
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {shown.map((w) => `${formatHM(w[0])}–${formatHM(w[1])}`).join('  ·  ')}
                    {windows.length === 0 && ' (par défaut)'}
                  </div>
                </div>
                <div>
                  <div className="progress" title={`${a.finished} terminés / ${a.active} actifs`}>
                    <i style={{ width: `${finishedPct}%` }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {a.active} actifs · {a.finished} terminés
                  </div>
                </div>
                <div className="col-meta">
                  <span className="big">{regSeq ? regSeq.queued : a.active}</span>
                  {regSeq ? 'en file' : 'actifs'}
                  {waTasks > 0 && (
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--warn)', marginTop: 2 }}>
                      {waTasks} tâche{waTasks > 1 ? 's' : ''} à la main
                    </span>
                  )}
                </div>
                <div className="col-status">
                  <StatusBadge status={seq.status} />
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {regSeq?.nextSendAt ? `prochain ${hm(regSeq.nextSendAt, tz)}` : '—'}
                  </div>
                </div>
                <div>
                  <XI name="chevright" className="ico-sm" style={{ color: 'var(--text-4)' }} />
                </div>
              </div>
            )
          })}
        {!loading && rows.length === 0 && (
          <div className="empty-row" style={{ padding: 32 }}>
            Aucune séquence. Cliquez sur « Nouvelle séquence » pour démarrer une cadence de prospection.
          </div>
        )}
      </div>

      {/* Les trois règles du système, là où on prend les décisions. */}
      <div className="seq-explain">
        <ExplainCard
          icon="settings"
          title="Une file, pas quatre"
          desc="Les emails de toutes les séquences passent par le même tuyau : jamais deux envois collés, même si trois séquences tombent à la même minute."
          href="/automations/regulateur"
          cta="Ouvrir le régulateur"
        />
        <ExplainCard
          icon="clock"
          title="Des plages, pas des heures"
          desc="Vous choisissez les créneaux de la journée. Hors créneau, la séquence attend sans rien perdre — elle reprend au créneau suivant."
        />
        <ExplainCard
          icon="user"
          title="Le manuel reste humain"
          desc="WhatsApp, LinkedIn et appels ne partent jamais seuls : ils deviennent une tâche pour la personne qui suit le contact, ou pour l’admin à défaut."
          href="/automations/prospection"
          cta="Voir la file de démarchage"
        />
      </div>
    </div>
  )
}

function ExplainCard({
  icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: string
  title: string
  desc: string
  href?: string
  cta?: string
}) {
  return (
    <div className="seq-explain-card">
      <span className="ic">
        <XI name={icon} className="ico" />
      </span>
      <div className="t">{title}</div>
      <p>{desc}</p>
      {href && cta && (
        <Link href={href} className="btn ghost xs">
          {cta}
          <XI name="chevright" className="ico-xs" />
        </Link>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  color,
  bg,
  value,
  label,
  desc,
}: {
  icon: string
  color: string
  bg: string
  value: React.ReactNode
  label: string
  desc: string
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: bg,
          color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <XI name={icon} className="ico-lg" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1, letterSpacing: '-.01em' }}>{value}</div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  )
}
