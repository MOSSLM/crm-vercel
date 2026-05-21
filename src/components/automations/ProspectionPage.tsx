'use client'
// ProspectionPage — onglet Démarchage : file de tâches manuelles 3 colonnes.
// Porté depuis claude design/automations-prospection.jsx.
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { XI } from './icons'
import {
  listProspectionTasks,
  completeProspectionTask,
  snoozeProspectionTask,
  skipProspectionTask,
  type ProspectionTaskFull,
} from './prospection-db'

const TABS: { id: string; label: string; icon: string; match: (t: ProspectionTaskFull) => boolean }[] = [
  { id: 'today', label: "Aujourd'hui", icon: 'cal', match: () => true },
  { id: 'call', label: 'Appels', icon: 'phone', match: (t) => t.kind === 'call' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', match: (t) => t.kind === 'whatsapp' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', match: (t) => t.kind === 'linkedin' },
  { id: 'overdue', label: 'En retard', icon: 'warning', match: (t) => new Date(t.due_at).getTime() < Date.now() },
]

function contactName(t: ProspectionTaskFull): { first: string; last: string; full: string; initials: string } {
  const first = t.contacts?.first_name ?? ''
  const last = t.contacts?.last_name ?? ''
  const full = `${first} ${last}`.trim() || 'Contact'
  const initials = ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || '?'
  return { first, last, full, initials }
}

function kindIcon(kind: string) {
  return kind === 'call' ? 'phone' : kind === 'whatsapp' ? 'whatsapp' : kind === 'linkedin' ? 'linkedin' : 'mail'
}

function kindLabel(kind: string) {
  return kind === 'call'
    ? 'Appel à passer'
    : kind === 'whatsapp'
      ? 'WhatsApp à envoyer'
      : kind === 'linkedin'
        ? 'Connexion LinkedIn'
        : 'Email à valider'
}

export function ProspectionPage() {
  const [tasks, setTasks] = useState<ProspectionTaskFull[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('today')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'action' | 'context' | 'history'>('action')

  function reload() {
    setLoading(true)
    listProspectionTasks()
      .then((rows) => {
        setTasks(rows)
        setSelectedId((cur) => cur ?? rows[0]?.id ?? null)
      })
      .catch(() => toast.error('Chargement de la file impossible'))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const filtered = useMemo(() => {
    const m = TABS.find((t) => t.id === activeTab)?.match ?? (() => true)
    return tasks.filter(m)
  }, [tasks, activeTab])

  const selected = tasks.find((t) => t.id === selectedId) || filtered[0] || null
  const overdueCount = tasks.filter((t) => new Date(t.due_at).getTime() < Date.now()).length

  async function act(fn: () => Promise<void>, msg: string) {
    if (!selected) return
    try {
      await fn()
      toast.success(msg)
      setTasks((prev) => {
        const rest = prev.filter((t) => t.id !== selected.id)
        setSelectedId(rest[0]?.id ?? null)
        return rest
      })
    } catch {
      toast.error('Action impossible')
    }
  }

  return (
    <div className="pros-page">
      {/* LEFT — file */}
      <div className="pros-side">
        <div className="pros-side-hd">
          <h2>Démarchage</h2>
          <div className="subline">
            <b style={{ color: 'var(--text)' }}>{tasks.length}</b> tâche{tasks.length > 1 ? 's' : ''} à traiter
            {overdueCount > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--danger)' }}>{overdueCount} en retard</span>
              </>
            )}
          </div>
        </div>
        <div className="pros-side-tabs">
          {TABS.map((tab) => {
            const count = tasks.filter(tab.match).length
            return (
              <button
                key={tab.id}
                type="button"
                className="pros-side-tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <XI name={tab.icon} className="ico-sm" />
                {tab.label}
                <span className="num">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="pros-list">
          {loading && <div className="empty-row" style={{ padding: 30 }}>Chargement…</div>}
          {!loading &&
            filtered.map((task) => {
              const c = contactName(task)
              const overdue = new Date(task.due_at).getTime() < Date.now()
              return (
                <div
                  key={task.id}
                  className="pros-task-row"
                  data-kind={task.kind}
                  data-overdue={overdue ? 'true' : 'false'}
                  aria-selected={selected?.id === task.id}
                  onClick={() => {
                    setSelectedId(task.id)
                    setDetailTab('action')
                  }}
                >
                  <span className="av">{c.initials}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{c.full}</div>
                    <div className="sub">
                      {task.entreprises?.name ?? '—'}
                      {task.contacts?.role_title ? ` · ${task.contacts.role_title}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="kind-chip">
                      <XI name={kindIcon(task.kind)} className="ico-sm" />
                    </span>
                    <span className="time">
                      {overdue ? '↻ retard' : new Date(task.due_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              )
            })}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
              <XI name="checkBig" className="ico-xl" style={{ color: 'var(--ok)', marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
                Tout est traité
              </div>
              <div style={{ fontSize: 12 }}>Aucune tâche dans cette catégorie.</div>
            </div>
          )}
        </div>
      </div>

      {/* CENTER — détail */}
      <div className="pros-main">
        <div className="pros-main-inner">
          {selected ? (
            <ProsDetail
              task={selected}
              tab={detailTab}
              setTab={setDetailTab}
              onComplete={(result) => act(() => completeProspectionTask(selected.id, result), 'Tâche traitée')}
              onSnooze={() => act(() => snoozeProspectionTask(selected.id, 24), 'Reportée de 24 h')}
              onSkip={() => act(() => skipProspectionTask(selected.id), 'Tâche passée')}
            />
          ) : (
            <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-3)' }}>
              Sélectionnez une tâche dans la file.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — aside */}
      <div className="pros-aside">{selected && <ProsAside task={selected} />}</div>
    </div>
  )
}

function ProsDetail({
  task,
  tab,
  setTab,
  onComplete,
  onSnooze,
  onSkip,
}: {
  task: ProspectionTaskFull
  tab: 'action' | 'context' | 'history'
  setTab: (t: 'action' | 'context' | 'history') => void
  onComplete: (result?: string) => void
  onSnooze: () => void
  onSkip: () => void
}) {
  const c = contactName(task)
  const overdue = new Date(task.due_at).getTime() < Date.now()
  const phone = task.contacts?.tel ?? ''
  const message = task.payload?.message ?? ''

  function openWhatsApp() {
    const digits = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <div className="pros-card">
      <div className="pros-card-hd">
        <span className="av">{c.initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 className="name">{c.full}</h2>
            <span className="pill accent">{kindLabel(task.kind)}</span>
            {overdue && (
              <span className="pill danger">
                <XI name="warning" className="ico-xs" />
                En retard
              </span>
            )}
          </div>
          <div className="role">
            {task.contacts?.role_title ?? '—'} · <b style={{ color: 'var(--text-2)' }}>{task.entreprises?.name ?? '—'}</b>
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost sm icon" type="button" title="Reporter" onClick={onSnooze}>
            <XI name="snooze" className="ico-sm" />
          </button>
          <button className="btn ghost sm icon" type="button" title="Passer" onClick={onSkip}>
            <XI name="skip" className="ico-sm" />
          </button>
        </div>
      </div>

      <div className="pros-tabs">
        <button type="button" aria-selected={tab === 'action'} onClick={() => setTab('action')}>
          <XI name="bolt" className="ico-sm" />
          Action
        </button>
        <button type="button" aria-selected={tab === 'context'} onClick={() => setTab('context')}>
          <XI name="company" className="ico-sm" />
          Contexte
        </button>
        <button type="button" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
          <XI name="history" className="ico-sm" />
          Historique
        </button>
      </div>

      {tab === 'action' && <ProsAction task={task} onOpenWhatsApp={openWhatsApp} />}
      {tab === 'context' && <ProsContext task={task} />}
      {tab === 'history' && (
        <div className="pros-section">
          <h3>
            <XI name="history" className="ico-sm" />
            Historique
          </h3>
          <div className="empty-row">Créée le {new Date(task.created_at).toLocaleString('fr-FR')}.</div>
        </div>
      )}

      <div className="pros-cta-bar">
        <button className="btn outline" type="button" onClick={onSnooze} style={{ flex: '0 0 auto' }}>
          <XI name="snooze" className="ico-sm" />
          Snooze 24 h
        </button>
        <div style={{ flex: 1 }} />
        {task.kind === 'call' && phone && (
          <a className="btn outline" href={`tel:${phone}`}>
            <XI name="phoneOut" className="ico-sm" />
            Composer {phone}
          </a>
        )}
        {task.kind === 'whatsapp' && (
          <>
            {message && (
              <button
                className="btn outline"
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(message)
                  toast.success('Message copié')
                }}
              >
                <XI name="copyClip" className="ico-sm" />
                Copier
              </button>
            )}
            <button className="btn outline" type="button" onClick={openWhatsApp}>
              <XI name="whatsapp" className="ico-sm" />
              Ouvrir WhatsApp
            </button>
          </>
        )}
        {task.kind === 'linkedin' && task.contacts?.linkedin_url && (
          <a className="btn outline" href={task.contacts.linkedin_url} target="_blank" rel="noreferrer">
            <XI name="externalLink" className="ico-sm" />
            Ouvrir le profil
          </a>
        )}
        <button className="btn ok" type="button" onClick={() => onComplete()}>
          <XI name="checkBig" className="ico-sm" />
          Marquer fait
        </button>
      </div>
    </div>
  )
}

function ProsAction({ task, onOpenWhatsApp }: { task: ProspectionTaskFull; onOpenWhatsApp: () => void }) {
  const c = contactName(task)
  if (task.kind === 'call') {
    return (
      <>
        <div className="pros-section">
          <h3>
            <XI name="phone" className="ico-sm" />
            Coordonnées
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KeyVal label="Téléphone" value={task.contacts?.tel ?? '—'} icon="phoneOut" mono />
            <KeyVal label="Email" value={task.contacts?.email ?? '—'} icon="mail" mono />
          </div>
        </div>
        <div className="pros-section">
          <h3>
            <XI name="doc" className="ico-sm" />
            Script d&apos;appel
          </h3>
          <div className="pros-script">
            <p>{task.payload?.script || task.payload?.scriptName || 'Aucun script associé à cette tâche.'}</p>
          </div>
        </div>
      </>
    )
  }
  if (task.kind === 'whatsapp') {
    return (
      <>
        <div className="pros-section">
          <h3>
            <XI name="whatsapp" className="ico-sm" />
            Message à envoyer
          </h3>
          <div className="pros-msg-card">
            <div className="hd">
              <XI name="whatsapp" className="ico-sm" style={{ color: 'var(--ok)' }} />
              <span className="grow">vers {task.contacts?.tel ?? '—'}</span>
            </div>
            <div className="body-msg">{task.payload?.message || 'Aucun message pré-rédigé.'}</div>
          </div>
        </div>
        <div className="pros-section">
          <h3>
            <XI name="bell" className="ico-sm" />
            Procédure
          </h3>
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 12.5, lineHeight: 1.7 }}>
            <li>Cliquez sur <b>Ouvrir WhatsApp</b> — la conversation avec {c.first} s&apos;ouvre.</li>
            <li>Le message pré-rédigé est passé en paramètre ; vérifiez puis envoyez.</li>
            <li>Revenez ici et cliquez <b>Marquer fait</b>.</li>
          </ol>
          <button className="btn ok sm" type="button" style={{ marginTop: 10 }} onClick={onOpenWhatsApp}>
            <XI name="whatsapp" className="ico-sm" />
            Ouvrir WhatsApp
          </button>
        </div>
      </>
    )
  }
  if (task.kind === 'linkedin') {
    return (
      <div className="pros-section">
        <h3>
          <XI name="linkedin" className="ico-sm" />
          Demande de connexion
        </h3>
        <div className="pros-msg-card">
          <div className="hd">
            <XI name="linkedin" className="ico-sm" style={{ color: 'var(--info)' }} />
            <span className="grow">via votre profil LinkedIn</span>
          </div>
          <div className="body-msg">{task.payload?.message || 'Aucun message pré-rédigé.'}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="pros-section">
      <h3>
        <XI name="mail" className="ico-sm" />
        Email à valider
      </h3>
      <div className="pros-msg-card">
        <div className="body-msg">{task.payload?.message || task.title || '—'}</div>
      </div>
    </div>
  )
}

function ProsContext({ task }: { task: ProspectionTaskFull }) {
  return (
    <div className="pros-section">
      <h3>
        <XI name="company" className="ico-sm" />
        Entreprise
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KeyVal label="Nom" value={task.entreprises?.name ?? '—'} icon="company" />
        <KeyVal label="Site web" value={task.entreprises?.site_web_canonique ?? '—'} icon="globe" mono />
        <KeyVal label="Email contact" value={task.contacts?.email ?? '—'} icon="mail" mono />
        <KeyVal label="Téléphone" value={task.contacts?.tel ?? '—'} icon="phone" mono />
      </div>
    </div>
  )
}

function KeyVal({ label, value, icon, mono }: { label: string; value: string; icon: string; mono?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 7,
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <XI name={icon} className="ico-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 500 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text)',
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function ProsAside({ task }: { task: ProspectionTaskFull }) {
  return (
    <>
      <div className="blk">
        <h4>Tâche</h4>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {task.title || kindLabel(task.kind)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
          échéance {new Date(task.due_at).toLocaleString('fr-FR')}
        </div>
      </div>
      <div className="blk">
        <h4>Mode focus</h4>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Chaque clic « Marquer fait » avance automatiquement vers la tâche suivante de la file.
        </div>
      </div>
    </>
  )
}
