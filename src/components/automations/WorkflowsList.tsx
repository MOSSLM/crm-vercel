'use client'
// WorkflowsList — onglet Workflows : liste de toutes les automatisations.
// Porté depuis claude design/automations-workflows.jsx (AutomationsList).
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { XI } from './icons'
import { SearchInput, StatusBadge, Av, Spark } from './atoms'
import { useRefData } from './ref-data'
import { listAutomations, createAutomation } from './automations-db'
import { emptyWorkflow } from './workflow-graph'
import type { Automation } from './types'

function sparkFor(id: string): number[] {
  // série pseudo-aléatoire stable dérivée de l'id
  let seed = 0
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < 10; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    out.push(1 + (seed % 9))
  }
  return out
}

export function WorkflowsList() {
  const router = useRouter()
  const ref = useRefData()
  const [rows, setRows] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'on' | 'paused' | 'draft' | 'archived'>('all')
  const [filterKind, setFilterKind] = useState<'all' | 'workflow' | 'sequence'>('all')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    listAutomations()
      .then(setRows)
      .catch(() => toast.error('Impossible de charger les automatisations'))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(
    () => ({
      on: rows.filter((a) => a.status === 'on').length,
      paused: rows.filter((a) => a.status === 'paused').length,
      draft: rows.filter((a) => a.status === 'draft').length,
      archived: rows.filter((a) => a.status === 'archived').length,
      // « Toutes » veut dire « tout le plan de travail », archives exclues :
      // sinon ranger une automatisation ne la rangerait de nulle part.
      live: rows.filter((a) => a.status !== 'archived').length,
    }),
    [rows],
  )

  // L'onglet « Archivées » n'apparaît que s'il y a quelque chose dedans : un
  // onglet vide en permanence occupe la place sans rien dire.
  type StatusTab = { v: typeof filterStatus; l: string }
  const statusTabs: StatusTab[] = [
    { v: 'all', l: `Toutes (${counts.live})` },
    { v: 'on', l: `Actives (${counts.on})` },
    { v: 'paused', l: `En pause (${counts.paused})` },
    { v: 'draft', l: `Brouillons (${counts.draft})` },
    ...(counts.archived > 0 ? [{ v: 'archived' as const, l: `Archivées (${counts.archived})` }] : []),
  ]

  const filtered = rows.filter((a) => {
    if (filterStatus === 'all' ? a.status === 'archived' : a.status !== filterStatus) return false
    if (filterKind !== 'all' && a.kind !== filterKind) return false
    if (q && !a.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  async function handleCreate() {
    setCreating(true)
    try {
      const auto = await createAutomation({
        kind: 'workflow',
        name: 'Nouvelle automatisation',
        definition: emptyWorkflow(),
      })
      router.push(`/automations/${auto.id}`)
    } catch {
      toast.error('Création impossible')
      setCreating(false)
    }
  }

  return (
    <div className="alist-page">
      <div className="alist-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Automatisations</h1>
          <div className="desc">
            {counts.live} automatisations · {counts.on} actives · {counts.paused} en pause · {counts.draft} brouillon
            {counts.archived > 0 && ` · ${counts.archived} archivée${counts.archived > 1 ? 's' : ''}`}
          </div>
        </div>
        <Link href="/automations/connections" className="btn outline sm">
          <XI name="externalLink" className="ico-sm" />
          Connexions
        </Link>
        <Link href="/automations/journal" className="btn outline sm">
          <XI name="history" className="ico-sm" />
          Journal d&apos;exécution
        </Link>
        <button className="btn accent" type="button" onClick={handleCreate} disabled={creating}>
          <XI name="plus" className="ico-sm" />
          Nouvelle automatisation
        </button>
      </div>

      <div className="alist-filters">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher une automatisation…" style={{ flex: 1, maxWidth: 320 }} />
        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
        <div className="seg">
          {statusTabs.map((o) => (
            <button key={o.v} type="button" aria-pressed={filterStatus === o.v} onClick={() => setFilterStatus(o.v)}>
              {o.l}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="seg">
          {([
            { v: 'all', l: 'Tous types' },
            { v: 'workflow', l: 'Workflows' },
            { v: 'sequence', l: 'Séquences' },
          ] as const).map((o) => (
            <button key={o.v} type="button" aria-pressed={filterKind === o.v} onClick={() => setFilterKind(o.v)}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="alist-table">
        {loading && <div className="empty-row" style={{ padding: 32 }}>Chargement…</div>}
        {!loading &&
          filtered.map((a) => {
            const pipeline = a.trigger_pipeline_id ? ref.pipelines.find((p) => p.id === a.trigger_pipeline_id) : null
            const stage = a.trigger_stage_id != null ? ref.stages.find((s) => s.id === a.trigger_stage_id) : null
            const owner = a.owner_id ? ref.users.find((u) => u.id === a.owner_id) : null
            const isSeq = a.kind === 'sequence'
            return (
              <div
                key={a.id}
                className="alist-row"
                onClick={() => router.push(isSeq ? `/automations/sequences/${a.id}` : `/automations/${a.id}`)}
              >
                <div
                  className="kind-ic"
                  style={{
                    background: isSeq ? 'var(--accent-tint)' : 'var(--trigger-tint)',
                    color: isSeq ? 'var(--accent)' : 'var(--trigger)',
                  }}
                >
                  <XI name={isSeq ? 'flame' : 'bolt'} className="ico" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="name">
                    {a.name}
                    {isSeq && <span className="pill accent" style={{ marginLeft: 8 }}>Séquence</span>}
                  </div>
                  <div className="sub">{a.description || 'Aucune description'}</div>
                </div>
                <div className="col-trigger">
                  <span className="ic">
                    <XI name="pipeline" className="ico-sm" />
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {pipeline ? (
                      <>
                        <span style={{ color: 'var(--text)' }}>{pipeline.name}</span>
                        {stage && <span style={{ color: 'var(--text-3)' }}> · {stage.name}</span>}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-3)' }}>
                        {a.trigger_type ? a.trigger_type.replace(/^trg\./, '') : 'Pas de déclencheur'}
                      </span>
                    )}
                  </span>
                </div>
                <div className="col-meta">
                  <span className="big">{a.runs_7d}</span>
                  exéc. · 7j
                  {a.success_7d != null && (
                    <span style={{ marginLeft: 6, color: a.success_7d > 0.5 ? 'var(--ok)' : 'var(--warn)' }}>
                      · {Math.round(a.success_7d * 100)}%
                    </span>
                  )}
                </div>
                <div>
                  <Spark
                    data={sparkFor(a.id)}
                    color={a.status === 'on' ? 'var(--ok)' : 'var(--text-4)'}
                    width={72}
                  />
                </div>
                <div className="col-status">
                  <StatusBadge status={a.status} />
                </div>
                <div>{owner && <Av user={owner} size={22} />}</div>
              </div>
            )
          })}
        {!loading && filtered.length === 0 && (
          <div className="empty-row" style={{ padding: 32 }}>
            Aucune automatisation. Cliquez sur « Nouvelle automatisation » pour commencer.
          </div>
        )}
      </div>
    </div>
  )
}
