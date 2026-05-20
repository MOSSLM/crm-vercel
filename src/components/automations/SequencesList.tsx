'use client'
// SequencesList — onglet Séquences : cartes résumé + tableau des séquences.
// Porté depuis claude design/automations-sequences.jsx.
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { XI } from './icons'
import { StatusBadge } from './atoms'
import { useRefData } from './ref-data'
import { listAutomations, createAutomation } from './automations-db'
import type { Automation, SequenceDefinition } from './types'

interface EnrollAgg {
  active: number
  paused: number
  finished: number
}

export function SequencesList() {
  const router = useRouter()
  const ref = useRefData()
  const [rows, setRows] = useState<Automation[]>([])
  const [agg, setAgg] = useState<Record<string, EnrollAgg>>({})
  const [pendingTasks, setPendingTasks] = useState(0)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const [seqs, enr, tasks] = await Promise.all([
          listAutomations('sequence'),
          supabase.from('sequence_enrollments').select('automation_id,status'),
          supabase.from('prospection_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
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
        setPendingTasks(tasks.count ?? 0)
      } catch {
        toast.error('Chargement des séquences impossible')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const totalActive = useMemo(
    () => Object.values(agg).reduce((s, a) => s + a.active, 0),
    [agg],
  )

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
          <div>Pipeline · Stage</div>
          <div>Progression</div>
          <div>Étapes</div>
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
            return (
              <div key={seq.id} className="seq-list-row" onClick={() => router.push(`/automations/sequences/${seq.id}`)}>
                <div className="kind-ic" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>
                  <XI name="flame" className="ico" />
                </div>
                <div>
                  <div className="name" style={{ fontSize: 13, fontWeight: 500 }}>
                    {seq.name}
                  </div>
                  <div className="sub" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {seq.description || `${steps} étape${steps > 1 ? 's' : ''} · multi-canal`}
                  </div>
                </div>
                <div className="col-trigger">
                  <span className="ic" style={{ background: 'var(--accent-tint)', color: 'var(--accent-2)' }}>
                    <XI name="pipeline" className="ico-sm" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pipeline?.name ?? 'Non configuré'}
                    </div>
                    {stage && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        stage = {stage.name}
                      </div>
                    )}
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
                  <span className="big">{steps}</span>
                  étapes
                </div>
                <div className="col-status">
                  <StatusBadge status={seq.status} />
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
