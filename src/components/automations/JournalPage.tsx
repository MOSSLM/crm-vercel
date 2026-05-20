'use client'
// JournalPage — journal d'exécution des automatisations (automation_runs).
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { XI } from './icons'
import type { AutomationRun, TraceEntry } from './types'

interface RunRow extends AutomationRun {
  automations: { name: string; kind: string } | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: 'En cours', cls: 'paused' },
  success: { label: 'Succès', cls: 'on' },
  error: { label: 'Erreur', cls: 'error' },
  skipped: { label: 'Ignoré', cls: 'draft' },
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

export function JournalPage() {
  const [rows, setRows] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('automation_runs')
      .select('*, automations(name,kind)')
      .order('started_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) toast.error("Chargement du journal impossible")
        else setRows((data ?? []) as unknown as RunRow[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="alist-page">
      <div className="alist-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Journal d&apos;exécution</h1>
          <div className="desc">Les 100 dernières exécutions de vos workflows et séquences.</div>
        </div>
        <Link href="/automations" className="btn outline sm">
          <XI name="chevleft" className="ico-sm" />
          Retour
        </Link>
      </div>

      <div className="alist-table">
        {loading && <div className="empty-row" style={{ padding: 32 }}>Chargement…</div>}
        {!loading &&
          rows.map((run) => {
            const st = STATUS[run.status] ?? STATUS.skipped
            const open = expanded === run.id
            const trace = Array.isArray(run.trace) ? run.trace : []
            return (
              <div key={run.id}>
                <div
                  className="alist-row"
                  style={{ gridTemplateColumns: '28px 1fr 160px 110px 90px 36px' }}
                  onClick={() => setExpanded(open ? null : run.id)}
                >
                  <div
                    className="kind-ic"
                    style={{
                      background: run.automations?.kind === 'sequence' ? 'var(--accent-tint)' : 'var(--trigger-tint)',
                      color: run.automations?.kind === 'sequence' ? 'var(--accent)' : 'var(--trigger)',
                    }}
                  >
                    <XI name={run.automations?.kind === 'sequence' ? 'flame' : 'bolt'} className="ico" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">
                      {run.automations?.name ?? 'Automatisation supprimée'}
                      {run.is_test && <span className="pill" style={{ marginLeft: 8 }}>Test</span>}
                    </div>
                    <div className="sub">{run.trigger_type ?? 'déclencheur inconnu'}</div>
                  </div>
                  <div className="col-meta">{rel(run.started_at)}</div>
                  <div className="col-status">
                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11.5, color: 'var(--text-2)' }}>
                      <span className={`status-dot ${st.cls}`} />
                      {st.label}
                    </span>
                  </div>
                  <div className="col-meta">
                    {trace.length} étape{trace.length > 1 ? 's' : ''}
                  </div>
                  <div>
                    <XI name={open ? 'chevdown' : 'chevright'} className="ico-sm" style={{ color: 'var(--text-4)' }} />
                  </div>
                </div>
                {open && (
                  <div style={{ padding: '4px 14px 14px 56px', background: 'var(--surface-2)' }}>
                    {run.error && (
                      <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{run.error}</div>
                    )}
                    {trace.length === 0 && <div className="empty-row">Aucune étape tracée.</div>}
                    {trace.map((t: TraceEntry, i) => (
                      <div
                        key={i}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}
                      >
                        <span
                          className={`status-dot ${t.status === 'ok' ? 'on' : t.status === 'error' ? 'error' : 'draft'}`}
                        />
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)', minWidth: 130 }}>
                          {t.type}
                        </span>
                        <span style={{ color: 'var(--text-2)' }}>{t.message ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        {!loading && rows.length === 0 && (
          <div className="empty-row" style={{ padding: 32 }}>
            Aucune exécution pour le moment. Activez un workflow ou lancez une exécution test.
          </div>
        )}
      </div>
    </div>
  )
}
