'use client'
// ProspectionPage — onglet Démarchage : file de tâches manuelles 3 colonnes.
// Porté depuis claude design/automations-prospection.jsx.
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { useAuth } from '@/components/AuthContext'
import { XI } from './icons'
import { useRefData } from './ref-data'
import { TaskBoard } from './TaskBoard'
import {
  assignProspectionTask,
  declareReply,
  listAwaitingReply,
  listProspectionTasks,
  completeProspectionTask,
  snoozeProspectionTask,
  skipProspectionTask,
  type AwaitingReplyRow,
  type ProspectionTaskFull,
} from './prospection-db'
import { lienWhatsApp } from '@/lib/prospects/canal'

/**
 * L'onglet des séquences garées. Pas dans `TABS` : il ne filtre pas des tâches,
 * il montre autre chose — des inscriptions qui n'ont plus de tâche du tout.
 */
const AWAITING_TAB = 'awaiting'

const TABS: { id: string; label: string; icon: string; match: (t: ProspectionTaskFull) => boolean }[] = [
  { id: 'today', label: "Aujourd'hui", icon: 'cal', match: () => true },
  { id: 'call', label: 'Appels', icon: 'phone', match: (t) => t.kind === 'call' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', match: (t) => t.kind === 'whatsapp' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', match: (t) => t.kind === 'linkedin' },
  { id: 'overdue', label: 'En retard', icon: 'warning', match: (t) => new Date(t.due_at).getTime() < Date.now() },
]

/**
 * Les séquences arrêtées en attendant une réponse du prospect.
 *
 * C'est le seul endroit où l'on peut les relancer : la tâche qui a envoyé le
 * message est terminée, elle a quitté la file. Sans cette liste, le prospect
 * resterait garé indéfiniment — la séquence attendrait un clic qui n'a nulle
 * part où se produire.
 */
function AwaitingList({ rows, onDone }: { rows: AwaitingReplyRow[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="empty-row" style={{ padding: 30 }}>
        Aucune séquence en attente de réponse.
      </div>
    )
  }

  async function repondu(row: AwaitingReplyRow) {
    setBusy(row.enrollmentId)
    try {
      await declareReply(row.enrollmentId)
      toast.success(`${row.companyName} — séquence reprise`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reprise impossible')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {rows.map((row) => {
        const depuis = Math.floor((Date.now() - Date.parse(row.since)) / 86_400_000)
        const wa = lienWhatsApp(row.phone)
        return (
          <div key={row.enrollmentId} className="pros-wait-row">
            <div className="hd">
              <span className="nm">{row.companyName}</span>
              <span className="ag">
                {depuis <= 0 ? "aujourd'hui" : `${depuis} j`}
              </span>
            </div>
            <div className="sub">
              {row.sequenceName}
              {row.contactName ? ` · ${row.contactName}` : ''}
            </div>
            <div className="sub">
              {row.relanceAt
                ? `Relance automatique le ${new Date(row.relanceAt).toLocaleDateString('fr-FR')}`
                : 'Aucune relance prévue — la séquence attend ce clic.'}
            </div>
            <div className="acts">
              <button
                type="button"
                className="btn ok xs"
                disabled={busy === row.enrollmentId}
                onClick={() => repondu(row)}
              >
                <XI name="check" className="ico-xs" />
                Il a répondu
              </button>
              {wa && (
                <a className="btn xs" href={wa} target="_blank" rel="noopener noreferrer" title="Rouvrir la conversation">
                  <XI name="whatsapp" className="ico-xs" />
                </a>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

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
  const ref = useRefData()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tasks, setTasks] = useState<ProspectionTaskFull[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('today')
  const [owner, setOwner] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'action' | 'context' | 'history'>('action')
  // « file » répond à « que fais-je maintenant », « board » à « qui croule ».
  const [mode, setMode] = useState<'file' | 'board'>('file')
  const [sequenceNames, setSequenceNames] = useState<Record<string, string>>({})
  // Les inscriptions garées sur une étape « attendre une réponse ». Elles n'ont
  // plus de tâche — celle qui a envoyé le WhatsApp est terminée et a quitté la
  // file — donc sans cette liste il n'existerait aucun endroit où déclarer la
  // réponse, et la séquence resterait garée pour toujours.
  const [awaiting, setAwaiting] = useState<AwaitingReplyRow[]>([])

  function reload() {
    setLoading(true)
    listProspectionTasks()
      .then((rows) => {
        setTasks(rows)
        setSelectedId((cur) => cur ?? rows[0]?.id ?? null)
      })
      .catch(() => toast.error('Chargement de la file impossible'))
      .finally(() => setLoading(false))
    listAwaitingReply()
      .then(setAwaiting)
      .catch(() => {
        /* la file reste utilisable même si l'attente ne se charge pas */
      })
  }

  useEffect(reload, [])

  // Le nom de la séquence d'où vient la tâche : sans lui, une carte WhatsApp
  // hors contexte ne dit pas de quelle campagne elle relève.
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('automations').select('id,name').eq('kind', 'sequence')
      const map: Record<string, string> = {}
      for (const row of (data ?? []) as { id: string; name: string }[]) map[row.id] = row.name
      setSequenceNames(map)
    })()
  }, [])

  /**
   * Qui a quoi. Le régulateur distribue les tâches manuelles ; sans ce filtre,
   * un admin qui reçoit tout le surplus ne voit qu'une file indistincte.
   */
  const owners = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tasks) counts.set(t.assignee_id ?? '', (counts.get(t.assignee_id ?? '') ?? 0) + 1)
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        name: id ? (ref.users.find((u) => u.id === id)?.name ?? 'Agent') : 'Sans destinataire',
      }))
      .sort((a, b) => b.count - a.count)
  }, [tasks, ref.users])

  const filtered = useMemo(() => {
    const m = TABS.find((t) => t.id === activeTab)?.match ?? (() => true)
    return tasks.filter((t) => m(t) && (owner === 'all' || (t.assignee_id ?? '') === owner))
  }, [tasks, activeTab, owner])

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

  /** Marquer faite une tâche depuis le tableau : elle quitte la file sur place. */
  async function completeFromBoard(task: ProspectionTaskFull) {
    try {
      await completeProspectionTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      toast.success('Tâche traitée — la séquence reprend')
    } catch {
      toast.error('Action impossible')
    }
  }

  /** Redonner une tâche sans toucher à la règle globale d'attribution. */
  async function reassign(task: ProspectionTaskFull, assigneeId: string | null) {
    const previous = task.assignee_id ?? null
    // Optimiste : la carte change de colonne tout de suite, et revient si le
    // serveur refuse — un aller-retour visible sur chaque carte serait pénible.
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, assignee_id: assigneeId } : t)))
    try {
      await assignProspectionTask(task.id, assigneeId)
      const name = assigneeId ? (ref.users.find((u) => u.id === assigneeId)?.name ?? 'un agent') : 'personne'
      toast.success(`Tâche confiée à ${name}`)
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, assignee_id: previous } : t)))
      toast.error(err instanceof Error ? err.message : 'Réattribution impossible')
    }
  }

  const modeSwitch = (
    <div className="pros-mode" role="group" aria-label="Affichage de la file">
      <button type="button" className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>
        <XI name="inbox" className="ico-xs" />
        File
      </button>
      <button type="button" className={mode === 'board' ? 'on' : ''} onClick={() => setMode('board')}>
        <XI name="users" className="ico-xs" />
        Par personne
      </button>
    </div>
  )

  if (mode === 'board') {
    return (
      <div className="pros-board">
        <div className="pros-board-hd">
          <div style={{ minWidth: 0 }}>
            <h2>Tâches à la main</h2>
            <div className="subline">
              WhatsApp, LinkedIn et appels ne partent jamais seuls. Les séquences les préparent, le CRM les distribue —
              et vous voyez qui a quoi.
            </div>
          </div>
          <span className="pill">{tasks.length} à traiter</span>
          {overdueCount > 0 && <span className="pill danger">{overdueCount} en retard</span>}
          {modeSwitch}
        </div>
        {loading ? (
          <div className="empty-row" style={{ padding: 40 }}>
            Chargement…
          </div>
        ) : (
          <TaskBoard
            tasks={tasks}
            users={ref.users}
            sequenceNames={sequenceNames}
            canReassign={isAdmin}
            onComplete={completeFromBoard}
            onReassign={reassign}
          />
        )}
      </div>
    )
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
          {modeSwitch}
        </div>
        <div className="pros-side-tabs" role="tablist">
          {TABS.map((tab) => {
            const count = tasks.filter(tab.match).length
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
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
          {awaiting.length > 0 && (
            <button
              type="button"
              role="tab"
              className="pros-side-tab"
              aria-selected={activeTab === AWAITING_TAB}
              onClick={() => setActiveTab(AWAITING_TAB)}
              title="Séquences arrêtées en attendant une réponse du prospect"
            >
              <XI name="user" className="ico-sm" />
              En attente
              <span className="num">{awaiting.length}</span>
            </button>
          )}
        </div>
        {owners.length > 1 && (
          <div className="pros-owner">
            <label htmlFor="pros-owner">Destinataire</label>
            <select id="pros-owner" className="select" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="all">Tout le monde ({tasks.length})</option>
              {owners.map((o) => (
                <option key={o.id || 'none'} value={o.id}>
                  {o.name} ({o.count})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="pros-list">
          {loading && <div className="empty-row" style={{ padding: 30 }}>Chargement…</div>}
          {!loading && activeTab === AWAITING_TAB && (
            <AwaitingList rows={awaiting} onDone={reload} />
          )}
          {!loading &&
            activeTab !== AWAITING_TAB &&
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

      <div className="pros-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'action'} onClick={() => setTab('action')}>
          <XI name="bolt" className="ico-sm" />
          Action
        </button>
        <button type="button" role="tab" aria-selected={tab === 'context'} onClick={() => setTab('context')}>
          <XI name="company" className="ico-sm" />
          Contexte
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
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
