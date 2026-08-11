'use client'
// TaskBoard — « Tâches à la main », une colonne par personne.
//
// La file en 3 volets répond à « qu'est-ce que je fais maintenant ». Elle ne
// répond pas à « qui croule et qui n'a rien », qui est la question de l'admin :
// le régulateur distribue tout seul, et sans vue d'ensemble on ne voit pas
// qu'une file est bouchée avant que le prospect ait refroidi.
//
// Chaque carte porte le message déjà rédigé, le motif de son attribution, et
// peut changer de main sans toucher à la règle globale.
import React, { useState } from 'react'
import { toast } from 'sonner'
import { XI } from './icons'
import { Avatar } from './regulator/parts'
import { lienWhatsApp } from '@/lib/prospects/canal'
import { sourceNumeros, useNumeros } from './NumeroPicker'
import type { UsageNumero } from '@/lib/prospects/numeros'
import type { ProspectionTaskFull } from './prospection-db'
import type { UserRef } from './types'

export interface BoardColumn {
  /** `''` = les tâches que personne n'a : elles doivent rester visibles. */
  id: string
  name: string
  role: string | null
  isAdmin: boolean
  tasks: ProspectionTaskFull[]
}

const KIND_ICON: Record<string, string> = {
  call: 'phone',
  whatsapp: 'whatsapp',
  linkedin: 'linkedin',
  email: 'mail',
}

const contactLabel = (t: ProspectionTaskFull): string =>
  `${t.contacts?.first_name ?? ''} ${t.contacts?.last_name ?? ''}`.trim() || 'Contact'

/** Colonnes triées : l'admin en dernier — c'est le filet, pas le point de départ. */
export function buildColumns(tasks: ProspectionTaskFull[], users: UserRef[]): BoardColumn[] {
  const byAssignee = new Map<string, ProspectionTaskFull[]>()
  for (const t of tasks) {
    const key = t.assignee_id ?? ''
    const list = byAssignee.get(key)
    if (list) list.push(t)
    else byAssignee.set(key, [t])
  }

  const known = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role ?? null,
    isAdmin: u.role === 'admin',
    tasks: byAssignee.get(u.id) ?? [],
  }))

  // Un destinataire absent du référentiel (compte supprimé, profil non chargé)
  // ne doit pas escamoter ses tâches : on lui fabrique une colonne.
  const orphanIds = [...byAssignee.keys()].filter((id) => id !== '' && !users.some((u) => u.id === id))
  const orphans = orphanIds.map((id) => ({
    id,
    name: 'Agent inconnu',
    role: null,
    isAdmin: false,
    tasks: byAssignee.get(id) ?? [],
  }))

  const unassigned = byAssignee.get('')
  const columns = [...known, ...orphans].filter((c) => c.tasks.length > 0 || !c.isAdmin)

  if (unassigned && unassigned.length > 0) {
    columns.push({ id: '', name: 'Sans destinataire', role: null, isAdmin: false, tasks: unassigned })
  }

  return columns.sort(
    (a, b) =>
      Number(a.id === '') - Number(b.id === '') ||
      Number(a.isAdmin) - Number(b.isAdmin) ||
      b.tasks.length - a.tasks.length ||
      a.name.localeCompare(b.name),
  )
}

export function TaskBoard({
  tasks,
  users,
  sequenceNames,
  canReassign,
  onComplete,
  onReassign,
}: {
  tasks: ProspectionTaskFull[]
  users: UserRef[]
  sequenceNames: Record<string, string>
  /** Seul un admin peut redonner une tâche à quelqu'un d'autre. */
  canReassign: boolean
  onComplete: (task: ProspectionTaskFull) => void
  onReassign: (task: ProspectionTaskFull, assigneeId: string | null) => void
}) {
  const columns = React.useMemo(() => buildColumns(tasks, users), [tasks, users])
  const max = Math.max(1, ...columns.map((c) => c.tasks.length))

  if (tasks.length === 0) {
    return (
      <div className="tb-empty">
        <XI name="checkBig" className="ico-xl" style={{ color: 'var(--ok)' }} />
        <div className="t">Aucune tâche à la main</div>
        <p>WhatsApp, LinkedIn et appels apparaîtront ici dès qu’une séquence en préparera un.</p>
      </div>
    )
  }

  return (
    <div className="tb-cols">
      {columns.map((col) => (
        <div key={col.id || 'none'} className={'tb-col' + (col.isAdmin ? ' adm' : '') + (col.id === '' ? ' none' : '')}>
          <div className="tb-col-h">
            {col.id ? <Avatar id={col.id} name={col.name} size={26} /> : <span className="tb-av-none">—</span>}
            <span style={{ minWidth: 0 }}>
              <span className="nm">{col.name}</span>
              <span className="rl">
                {col.id === ''
                  ? 'personne ne les a — à distribuer'
                  : col.isAdmin
                    ? 'admin · filet de sécurité'
                    : 'agent'}
              </span>
            </span>
            <span className="c">{col.tasks.length}</span>
          </div>
          <div className="tb-load">
            <i style={{ width: `${(col.tasks.length / max) * 100}%` }} />
          </div>
          <div className="tb-col-b">
            {col.tasks.length === 0 && <div className="tb-none">file vide</div>}
            {col.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                users={users}
                sequenceName={task.automation_id ? sequenceNames[task.automation_id] : undefined}
                canReassign={canReassign}
                onComplete={() => onComplete(task)}
                onReassign={(id) => onReassign(task, id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskCard({
  task,
  users,
  sequenceName,
  canReassign,
  onComplete,
  onReassign,
}: {
  task: ProspectionTaskFull
  users: UserRef[]
  sequenceName?: string
  canReassign: boolean
  onComplete: () => void
  onReassign: (assigneeId: string | null) => void
}) {
  const overdue = new Date(task.due_at).getTime() < Date.now()
  const message = task.payload?.message ?? ''
  // Le numéro préparé par le moteur est le défaut — sur une entreprise sans
  // fiche contact, il vient de `entreprises.telephone`. Mais 47 entreprises du
  // parc en ont plusieurs, et l'agent doit pouvoir en essayer un autre sans
  // quitter la carte.
  const usage: UsageNumero = task.kind === 'call' ? 'appel' : 'whatsapp'
  const numeros = useNumeros(sourceNumeros(task), usage, task.payload?.phone ?? task.contacts?.tel ?? null)
  const [choisi, setChoisi] = useState<string | null>(null)
  const phone = choisi ?? numeros[0]?.e164 ?? ''

  /** Ce que « ouvrir » veut dire pour ce canal — le CRM n'envoie jamais à votre place. */
  function open() {
    if (task.kind === 'whatsapp') {
      // `wa.me` veut l'international sans `+` : un `06…` recopié tel quel
      // donnait `wa.me/0646…`, que WhatsApp ne résout pas — la tâche ouvrait
      // une page d'erreur et l'agent croyait à une panne.
      const url = lienWhatsApp(phone, message)
      if (!url) {
        toast.error('Aucun numéro exploitable sur cette fiche')
        return
      }
      window.open(url, '_blank')
      return
    }
    if (task.kind === 'call') {
      if (!phone) {
        toast.error('Aucun numéro sur ce contact')
        return
      }
      window.location.href = `tel:${phone}`
      return
    }
    const url = task.contacts?.linkedin_url
    if (!url) {
      toast.error('Aucun profil LinkedIn sur ce contact')
      return
    }
    window.open(url, '_blank')
  }

  const openLabel =
    task.kind === 'whatsapp' ? 'Ouvrir WhatsApp' : task.kind === 'call' ? 'Appeler' : 'Ouvrir LinkedIn'

  return (
    <div className={'tb-card' + (overdue ? ' late' : '')}>
      <div className="hd">
        <span className="ic" data-kind={task.kind}>
          <XI name={KIND_ICON[task.kind] ?? 'task'} className="ico-xs" />
        </span>
        <span className="n">{contactLabel(task)}</span>
        <span className="h">
          {overdue
            ? 'en retard'
            : new Date(task.due_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="co">
        {task.entreprises?.name ?? '—'}
        {sequenceName && ` · ${sequenceName}`}
      </div>
      {message && <div className="msg">{message}</div>}
      {task.routing_reason && (
        <div className="rz">
          <XI name="user" className="ico-xs" />
          {task.routing_reason}
        </div>
      )}
      {/* Le choix n'apparaît que s'il y en a un : une carte ne doit pas porter un
          sélecteur à une seule entrée. */}
      {numeros.length > 1 && (task.kind === 'whatsapp' || task.kind === 'call') && (
        <label className="tb-assign">
          <span>Numéro</span>
          <select className="select" value={phone} onChange={(e) => setChoisi(e.target.value)}>
            {numeros.map((n) => (
              <option key={n.e164} value={n.e164}>
                {n.affichage} · {n.libelleOrigine}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="acts">
        <button type="button" className="btn accent xs" onClick={open}>
          <XI name={KIND_ICON[task.kind] ?? 'task'} className="ico-xs" />
          {openLabel}
        </button>
        <button type="button" className="btn xs" title="Marquer comme fait" onClick={onComplete}>
          <XI name="check" className="ico-xs" />
        </button>
      </div>
      {canReassign && (
        <label className="tb-assign">
          <span>Confier à</span>
          <select
            className="select"
            value={task.assignee_id ?? ''}
            onChange={(e) => onReassign(e.target.value || null)}
          >
            <option value="">Personne</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.role === 'admin' ? ' · admin' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
