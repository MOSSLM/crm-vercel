'use client'
// AutomationsShell — chrome de l'espace Automatisations (TopBar + body + StatusBar).
// Porté depuis claude design/automations-app.jsx.
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { authedFetch } from '@/utils/authedFetch'
import { XI } from './icons'
import { RefDataProvider } from './ref-data'
import { createAutomation } from './automations-db'
import { emptyWorkflow } from './workflow-graph'

type TopTab = 'automations' | 'sequences' | 'prospection' | 'connections'
type View = 'list' | 'builder' | 'prospection' | 'connections'

interface ShellCounts {
  workflows?: number
  sequences?: number
  prospection?: number
  activeWorkflows?: number
  runs7d?: number
  manualTasks?: number
}

function resolveRoute(pathname: string): { tab: TopTab; view: View; inBuilder: boolean; automationId: string | null } {
  const rest = pathname.replace(/^\/automations/, '').replace(/^\//, '')
  const segs = rest.split('/').filter(Boolean)
  if (segs.length === 0) return { tab: 'automations', view: 'list', inBuilder: false, automationId: null }
  if (segs[0] === 'sequences')
    return segs.length > 1
      ? { tab: 'sequences', view: 'builder', inBuilder: true, automationId: segs[1] }
      : { tab: 'sequences', view: 'list', inBuilder: false, automationId: null }
  if (segs[0] === 'prospection') return { tab: 'prospection', view: 'prospection', inBuilder: false, automationId: null }
  if (segs[0] === 'connections') return { tab: 'connections', view: 'connections', inBuilder: false, automationId: null }
  if (segs[0] === 'journal') return { tab: 'automations', view: 'list', inBuilder: false, automationId: null }
  return { tab: 'automations', view: 'builder', inBuilder: true, automationId: segs[0] }
}

const TAB_HREF: Record<TopTab, string> = {
  automations: '/automations',
  sequences: '/automations/sequences',
  prospection: '/automations/prospection',
  connections: '/automations/connections',
}

export function AutomationsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/automations'
  const router = useRouter()
  const { tab, view, inBuilder, automationId } = resolveRoute(pathname)
  const [counts, setCounts] = useState<ShellCounts>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const since = new Date(Date.now() - 7 * 86400000).toISOString()
        const [wf, seq, tasks, activeWf, runs] = await Promise.all([
          supabase.from('automations').select('id', { count: 'exact', head: true }).eq('kind', 'workflow'),
          supabase.from('automations').select('id', { count: 'exact', head: true }).eq('kind', 'sequence'),
          supabase.from('prospection_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase
            .from('automations')
            .select('id', { count: 'exact', head: true })
            .eq('kind', 'workflow')
            .eq('status', 'on'),
          supabase.from('automation_runs').select('id', { count: 'exact', head: true }).gte('started_at', since),
        ])
        if (cancelled) return
        setCounts({
          workflows: wf.count ?? 0,
          sequences: seq.count ?? 0,
          prospection: tasks.count ?? 0,
          manualTasks: tasks.count ?? 0,
          activeWorkflows: activeWf.count ?? 0,
          runs7d: runs.count ?? 0,
        })
      } catch {
        /* compteurs best-effort */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pathname])

  async function handleNew() {
    setBusy(true)
    try {
      if (tab === 'sequences') {
        const a = await createAutomation({
          kind: 'sequence',
          name: 'Nouvelle séquence',
          definition: { steps: [] },
          settings: { cadence: 'bizday', timezone: 'Europe/Paris', exitOnReply: true, oncePerDay: true },
        })
        router.push(`/automations/sequences/${a.id}`)
      } else {
        const a = await createAutomation({ kind: 'workflow', name: 'Nouvelle automatisation', definition: emptyWorkflow() })
        router.push(`/automations/${a.id}`)
      }
    } catch {
      toast.error('Création impossible')
      setBusy(false)
    }
  }

  async function handleTestRun() {
    if (!automationId) return
    setBusy(true)
    try {
      const res = await authedFetch('/api/automations/test-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ automation_id: automationId }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) toast.success(body.message || 'Exécution test lancée')
      else toast.error(body.error || 'Échec du test')
    } catch {
      toast.error('Échec du test')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="au-skin" data-view={view} data-density="regular">
      <div className="au-app">
        <TopBar
          tab={tab}
          inBuilder={inBuilder}
          counts={counts}
          busy={busy}
          onNew={handleNew}
          onTestRun={handleTestRun}
        />
        <div className="au-body">
          <RefDataProvider>{children}</RefDataProvider>
        </div>
        <StatusBar counts={counts} />
      </div>
    </div>
  )
}

function TopBar({
  tab,
  inBuilder,
  counts,
  busy,
  onNew,
  onTestRun,
}: {
  tab: TopTab
  inBuilder: boolean
  counts: ShellCounts
  busy: boolean
  onNew: () => void
  onTestRun: () => void
}) {
  return (
    <div className="topbar">
      <div className="left-group">
        <Link href="/dashboard" className="brand" title="Retour au CRM">
          <span className="brand-mark" aria-hidden />
          <span style={{ fontWeight: 500, fontSize: 13, letterSpacing: '-.005em', whiteSpace: 'nowrap' }}>Sama CRM</span>
        </Link>

        <div className="crumbs">
          <span>Automatisations</span>
          {inBuilder && (
            <>
              <span className="sep">/</span>
              <span className="cur">Éditeur</span>
            </>
          )}
        </div>

        <span className="saved">
          <i />
          enregistré
        </span>

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

        <span className="topchip" style={{ cursor: 'default' }}>
          <XI name="database" className="ico-sm" style={{ color: 'var(--supa-dark)' }} />
          <span className="truncate">Supabase · prod</span>
        </span>
      </div>

      <div className="tabs" role="tablist">
        <TabLink tab="automations" current={tab} icon="bolt" label="Workflows" count={counts.workflows} />
        <TabLink tab="sequences" current={tab} icon="flame" label="Séquences" count={counts.sequences} />
        <TabLink tab="prospection" current={tab} icon="inbox" label="Démarchage" count={counts.prospection} accentCount />
        <TabLink tab="connections" current={tab} icon="webhook" label="Connexions" />
      </div>

      <div className="right">
        <Link href="/automations/journal" className="btn ghost sm icon" title="Journal d'exécution">
          <XI name="history" className="ico-sm" />
        </Link>
        <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        {inBuilder && (
          <button className="btn outline sm" type="button" onClick={onTestRun} disabled={busy}>
            <XI name="play" className="ico-sm" />
            Exécution test
          </button>
        )}
        {!inBuilder && (tab === 'automations' || tab === 'sequences') && (
          <button className="btn accent" type="button" onClick={onNew} disabled={busy}>
            <XI name="plus" className="ico-sm" />
            Nouveau
          </button>
        )}
      </div>
    </div>
  )
}

function TabLink({
  tab,
  current,
  icon,
  label,
  count,
  accentCount,
}: {
  tab: TopTab
  current: TopTab
  icon: string
  label: string
  count?: number
  accentCount?: boolean
}) {
  const selected = current === tab
  return (
    <Link href={TAB_HREF[tab]} className="tab" role="tab" aria-selected={selected}>
      <XI name={icon} className="ico-sm" />
      {label}
      {count != null && count > 0 && (
        <span
          className="count"
          style={accentCount && !selected ? { background: 'var(--accent-tint)', color: 'var(--accent-2)', fontWeight: 600 } : undefined}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

function StatusBar({ counts }: { counts: ShellCounts }) {
  return (
    <div className="statusbar">
      <span>
        <span className="dot" />
        Connecté · Supabase prod
      </span>
      <span className="sep" />
      <span>{counts.activeWorkflows ?? 0} workflows actifs</span>
      <span className="sep" />
      <span>{counts.runs7d ?? 0} exécutions / 7j</span>
      <span className="sep" />
      <span>{counts.manualTasks ?? 0} tâches manuelles dans la file</span>
      <span className="spacer" />
      <span>Sama CRM · Automatisations v2</span>
    </div>
  )
}
