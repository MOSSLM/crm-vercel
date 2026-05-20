'use client'
// AutomationsShell — chrome de l'espace Automatisations (TopBar + body + StatusBar).
// Porté depuis claude design/automations-app.jsx.
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { XI } from './icons'

type TopTab = 'automations' | 'sequences' | 'prospection' | 'connections'
type View = 'list' | 'builder' | 'prospection' | 'connections'

export type ShellCounts = {
  workflows?: number
  sequences?: number
  prospection?: number
  activeWorkflows?: number
  runs7d?: number
  manualTasks?: number
}

function resolveRoute(pathname: string): { tab: TopTab; view: View; inBuilder: boolean } {
  const rest = pathname.replace(/^\/automations/, '').replace(/^\//, '')
  const segs = rest.split('/').filter(Boolean)
  if (segs.length === 0) return { tab: 'automations', view: 'list', inBuilder: false }
  if (segs[0] === 'sequences')
    return segs.length > 1
      ? { tab: 'sequences', view: 'builder', inBuilder: true }
      : { tab: 'sequences', view: 'list', inBuilder: false }
  if (segs[0] === 'prospection') return { tab: 'prospection', view: 'prospection', inBuilder: false }
  if (segs[0] === 'connections') return { tab: 'connections', view: 'connections', inBuilder: false }
  return { tab: 'automations', view: 'builder', inBuilder: true }
}

const TAB_HREF: Record<TopTab, string> = {
  automations: '/automations',
  sequences: '/automations/sequences',
  prospection: '/automations/prospection',
  connections: '/automations/connections',
}

export function AutomationsShell({
  children,
  counts = {},
}: {
  children: React.ReactNode
  counts?: ShellCounts
}) {
  const pathname = usePathname() || '/automations'
  const { tab, view, inBuilder } = resolveRoute(pathname)

  return (
    <div className="au-skin" data-view={view} data-density="regular">
      <div className="au-app">
        <TopBar tab={tab} inBuilder={inBuilder} counts={counts} />
        <div className="au-body">{children}</div>
        <StatusBar counts={counts} />
      </div>
    </div>
  )
}

function TopBar({ tab, inBuilder, counts }: { tab: TopTab; inBuilder: boolean; counts: ShellCounts }) {
  return (
    <div className="topbar">
      <div className="left-group">
        <Link href="/dashboard" className="brand" title="Retour au CRM">
          <span className="brand-mark" aria-hidden />
          <span style={{ fontWeight: 500, fontSize: 13, letterSpacing: '-.005em', whiteSpace: 'nowrap' }}>
            Sama CRM
          </span>
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
        <TabLink
          tab="prospection"
          current={tab}
          icon="inbox"
          label="Démarchage"
          count={counts.prospection}
          accentCount
        />
        <TabLink tab="connections" current={tab} icon="webhook" label="Connexions" />
      </div>

      <div className="right">
        <div className="seg compact">
          <button title="Annuler ⌘Z" type="button">
            <XI name="undo" className="ico-sm" />
          </button>
          <button title="Rétablir ⌘⇧Z" type="button">
            <XI name="redo" className="ico-sm" />
          </button>
        </div>
        <Link href="/automations/journal" className="btn ghost sm icon" title="Journal d'exécution">
          <XI name="history" className="ico-sm" />
        </Link>
        <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button className="btn outline sm" type="button">
          <XI name="play" className="ico-sm" />
          Exécution test
        </button>
        <button className="btn accent" type="button">
          {inBuilder ? (
            <>
              <XI name="checkBig" className="ico-sm" />
              Publier
            </>
          ) : (
            <>
              <XI name="plus" className="ico-sm" />
              Nouveau
            </>
          )}
        </button>
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
          style={
            accentCount && !selected
              ? { background: 'var(--accent-tint)', color: 'var(--accent-2)', fontWeight: 600 }
              : undefined
          }
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
      <span>
        <kbd>?</kbd> Raccourcis
      </span>
      <span className="sep" />
      <span>Sama CRM · v2</span>
    </div>
  )
}
