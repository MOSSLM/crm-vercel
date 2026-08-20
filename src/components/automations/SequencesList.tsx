'use client'
// SequencesList — onglet Séquences : cartes résumé + tableau des séquences.
// Porté depuis claude design/automations-sequences.jsx.
//
// LA LISTE EST AUSSI L'ENDROIT OÙ L'ON RANGE
// Ouvrir une séquence pour changer son état revenait à traverser tout l'éditeur
// pour un geste d'une seconde, et il n'existait AUCUN moyen d'en supprimer une :
// les essais s'empilaient sous le même nom (« Nouvelle séquence », trois fois)
// sans qu'on puisse faire le ménage. D'où deux ajouts qui vont ensemble :
//   · le menu « … » de chaque ligne — le geste sur UNE séquence ;
//   · les cases à cocher et la barre d'actions — le même geste sur un lot,
//     parce que le ménage se fait rarement une ligne à la fois.
//
// SUPPRIMER N'EST PAS ARCHIVER, ET LA DIFFÉRENCE COMPTE
// `automations` est référencée en `on delete cascade` par
// `sequence_enrollments`, qui l'est lui-même par `prospection_tasks` : supprimer
// une séquence emporte l'historique de démarchage de tous ses prospects. La
// confirmation le dit en comptant les inscriptions concernées, et propose
// l'archivage — qui ne détruit rien — dès qu'il y en a.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { authedFetch } from '@/utils/authedFetch'
import { XI } from './icons'
import { SearchInput, StatusBadge } from './atoms'
import { useRefData } from './ref-data'
import {
  createAutomation,
  deleteAutomation,
  duplicateAutomation,
  listAgents,
  listAttributions,
  listAutomations,
  setAttribution,
  setAutomationsStatus,
  setModeAcces,
  type AgentRef,
} from './automations-db'
import {
  MODE_ACCES_LABEL,
  agentsParSequence,
  libelleAcces,
  modeAcces,
  type AttributionSequence,
  type ModeAcces,
} from '@/lib/automations/acces'
import { MiniWindows, colorForId, hm } from './regulator/parts'
import { DEFAULT_WINDOWS, formatHM, normalizeWindows } from '@/lib/automations/regulator'
import type { RegulatorView } from './regulator/types'
import type { Automation, AutomationStatus, SeqStepKind, SequenceDefinition } from './types'
import './regulator.css'

interface EnrollAgg {
  active: number
  paused: number
  finished: number
  /** Toutes inscriptions confondues — c'est ce que la suppression emporte. */
  total: number
}

const AGG_VIDE: EnrollAgg = { active: 0, paused: 0, finished: 0, total: 0 }

/** Icône par canal — la même que dans l'éditeur, pour lire une séquence d'un coup d'œil. */
const CHANNEL_ICON: Record<SeqStepKind, string> = {
  email: 'mail',
  whatsapp: 'whatsapp',
  sms: 'sms',
  linkedin: 'linkedin',
  call: 'phone',
  task: 'task',
  wait: 'clock',
  // Une condition n'est pas un canal : elle n'envoie rien, elle aiguille.
  condition: 'branch',
  // Un passage de relais non plus : il ferme cette séquence et en ouvre une autre.
  transition: 'share',
}

type StatusFilter = 'all' | AutomationStatus

const stepsOf = (seq: Automation) => {
  const def = (seq.definition as SequenceDefinition) || { steps: [] }
  return Array.isArray(def.steps) ? def.steps : []
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
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Automation[] | null>(null)
  const [agents, setAgents] = useState<AgentRef[]>([])
  const [attributions, setAttributions] = useState<AttributionSequence[]>([])
  const [confirmAcces, setConfirmAcces] = useState<Automation[] | null>(null)

  async function loadSequences() {
    const [seqs, enr, tasks, ags, attrs] = await Promise.all([
      listAutomations('sequence'),
      supabase.from('sequence_enrollments').select('automation_id,status'),
      supabase.from('prospection_tasks').select('automation_id').eq('status', 'pending'),
      // Les deux moitiés de l'accès. En échec — table absente, droits — la
      // liste reste lisible : elle affiche simplement « Tous les agents ».
      listAgents().catch(() => [] as AgentRef[]),
      listAttributions().catch(() => [] as AttributionSequence[]),
    ])
    setRows(seqs)
    setAgents(ags)
    setAttributions(attrs)
    const map: Record<string, EnrollAgg> = {}
    for (const e of (enr.data ?? []) as { automation_id: string; status: string }[]) {
      const a = (map[e.automation_id] ??= { active: 0, paused: 0, finished: 0, total: 0 })
      a.total++
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
    return seqs
  }

  useEffect(() => {
    loadSequences()
      .catch(() => toast.error('Chargement des séquences impossible'))
      .finally(() => setLoading(false))
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

  const counts = useMemo(
    () => ({
      on: rows.filter((r) => r.status === 'on').length,
      paused: rows.filter((r) => r.status === 'paused').length,
      draft: rows.filter((r) => r.status === 'draft').length,
      archived: rows.filter((r) => r.status === 'archived').length,
      // Le plan de travail, archives exclues : c'est ce que « Toutes » montre.
      live: rows.filter((r) => r.status !== 'archived').length,
    }),
    [rows],
  )

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      // Les archives ne se mélangent pas au reste : on va les chercher.
      if (filterStatus === 'all' ? r.status === 'archived' : r.status !== filterStatus) return false
      if (needle && !r.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, filterStatus, q])

  const totalActive = useMemo(
    () => Object.values(agg).reduce((s, a) => s + a.active, 0),
    [agg],
  )
  const tz = reg?.settings.timezone ?? 'Europe/Paris'
  const defaultWindows = reg?.settings.defaultWindows ?? DEFAULT_WINDOWS

  // La sélection ne survit pas à un changement de filtre : agir sur des lignes
  // qu'on ne voit plus est le meilleur moyen d'archiver la mauvaise séquence.
  const visibleIds = useMemo(() => new Set(visibles.map((s) => s.id)), [visibles])
  const selected = useMemo(
    () => visibles.filter((s) => selection.has(s.id)),
    [visibles, selection],
  )
  useEffect(() => {
    setSelection((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibleIds])

  function toggle(id: string) {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = visibles.length > 0 && visibles.every((s) => selection.has(s.id))

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

  /**
   * Le même changement d'état sur une ligne ou sur un lot.
   *
   * Activer demande une étape : c'est la règle de l'éditeur (`toggleStatus`), et
   * une séquence vide activée n'enverrait rien tout en se disant en service. Les
   * séquences vides du lot sont donc écartées, et NOMMÉES — « 2 ignorées » sans
   * dire lesquelles obligerait à rouvrir chaque ligne pour comprendre.
   */
  async function applyStatus(cibles: Automation[], status: AutomationStatus) {
    const vides = status === 'on' ? cibles.filter((s) => stepsOf(s).length === 0) : []
    const partants = cibles.filter((s) => !vides.includes(s))
    if (partants.length === 0) {
      toast.error(
        vides.length === 1
          ? `« ${vides[0].name} » n’a aucune étape — ajoutez-en une avant de l’activer.`
          : 'Ces séquences n’ont aucune étape — ajoutez-en une avant de les activer.',
      )
      return
    }
    setBusy(true)
    try {
      await setAutomationsStatus(
        partants.map((s) => s.id),
        status,
      )
      await loadSequences()
      setSelection(new Set())
      toast.success(messageStatut(status, partants.length))
      if (vides.length > 0) {
        toast.warning(
          `Sans étape, donc pas activée${vides.length > 1 ? 's' : ''} : ${vides.map((s) => s.name).join(', ')}`,
        )
      }
    } catch {
      toast.error('Changement d’état impossible')
    } finally {
      setBusy(false)
    }
  }

  /**
   * L'accès enregistré depuis la boîte : le mode sur chaque séquence, puis les
   * agents cochés/décochés.
   *
   * Seuls les DELTAS partent. Deux raisons, et la seconde est la vraie : une
   * case laissée INDÉTERMINÉE sur un lot panaché (`null`) veut dire « je n'y ai
   * pas touché ». La réécrire à `false` retirerait, sans que rien ne l'annonce,
   * un agent des séquences où il était pourtant coché — le prix d'être venu
   * changer autre chose.
   */
  async function handleAcces(
    cibles: Automation[],
    mode: ModeAcces,
    apres: Map<string, boolean | null>,
    avant: Map<string, boolean | null>,
  ) {
    setBusy(true)
    try {
      const ids = cibles.map((s) => s.id)
      await setModeAcces(cibles, mode)
      for (const agent of agents) {
        const veut = apres.get(agent.id)
        if (veut == null || veut === avant.get(agent.id)) continue
        await setAttribution(ids, agent.id, veut)
      }
      await loadSequences()
      setSelection(new Set())
      setConfirmAcces(null)
      const retenus = agents.filter((a) => apres.get(a.id) !== false).length
      toast.success(
        mode === 'tous'
          ? cibles.length === 1
            ? 'Séquence ouverte à tous les agents'
            : `${cibles.length} séquences ouvertes à tous les agents`
          : `Accès réservé à ${libelleAcces('choisis', retenus).toLowerCase()}`,
      )
    } catch {
      toast.error('Enregistrement des accès impossible')
    } finally {
      setBusy(false)
    }
  }

  async function handleDuplicate(cibles: Automation[]) {
    setBusy(true)
    try {
      const copies: Automation[] = []
      for (const s of cibles) copies.push(await duplicateAutomation(s))
      await loadSequences()
      setSelection(new Set())
      if (copies.length === 1) {
        toast.success(`« ${copies[0].name} » créée en brouillon`)
        router.push(`/automations/sequences/${copies[0].id}`)
      } else {
        toast.success(`${copies.length} copies créées en brouillon`)
      }
    } catch {
      toast.error('Duplication impossible')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(cibles: Automation[]) {
    setBusy(true)
    try {
      for (const s of cibles) await deleteAutomation(s.id)
      await loadSequences()
      setSelection(new Set())
      setConfirmDelete(null)
      toast.success(cibles.length === 1 ? 'Séquence supprimée' : `${cibles.length} séquences supprimées`)
    } catch {
      toast.error('Suppression impossible')
    } finally {
      setBusy(false)
    }
  }

  const openMenu = (seq: Automation, e: React.MouseEvent) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu((cur) => (cur?.id === seq.id ? null : { id: seq.id, top: r.bottom + 4, left: r.right }))
  }

  const menuSeq = menu ? rows.find((r) => r.id === menu.id) ?? null : null
  const parSequence = useMemo(() => agentsParSequence(attributions), [attributions])

  return (
    <div className="alist-page">
      <div className="alist-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Séquences de prospection</h1>
          <div className="desc">
            Cadences multi-canal alternant emails automatiques et actions manuelles (appels, WhatsApp, LinkedIn).
          </div>
        </div>
        <Link href="/automations/sequences/stats" className="btn outline">
          <XI name="chart" className="ico-sm" />
          Statistiques
        </Link>
        <button className="btn accent" type="button" onClick={handleCreate} disabled={creating}>
          <XI name="plus" className="ico-sm" />
          Nouvelle séquence
        </button>
      </div>

      <div className="summary-grid">
        <SummaryCard icon="flame" color="var(--accent)" bg="var(--accent-tint)" value={totalActive} label="Prospects actifs" desc="dans une séquence" />
        <SummaryCard icon="inbox" color="var(--info)" bg="var(--info-tint)" value={counts.live} label="Séquences" desc="hors archives" />
        <SummaryCard icon="phone" color="var(--manual)" bg="var(--manual-tint)" value={pendingTasks} label="Tâches du jour" desc="appels + WhatsApp à traiter" />
        <SummaryCard icon="checkBig" color="var(--ok)" bg="var(--ok-tint)" value={counts.on} label="Séquences actives" desc="en cours d'exécution" />
      </div>

      <div className="alist-filters">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher une séquence…" style={{ flex: 1, maxWidth: 320 }} />
        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
        <div className="seg">
          {(
            [
              { v: 'all' as const, l: `Toutes (${counts.live})` },
              { v: 'on' as const, l: `Actives (${counts.on})` },
              { v: 'paused' as const, l: `En pause (${counts.paused})` },
              { v: 'draft' as const, l: `Brouillons (${counts.draft})` },
              // Onglet montré seulement s'il y a quelque chose dedans : une
              // case vide en permanence occupe la place sans rien dire.
              ...(counts.archived > 0
                ? [{ v: 'archived' as const, l: `Archivées (${counts.archived})` }]
                : []),
            ] as { v: StatusFilter; l: string }[]
          ).map((o) => (
            <button key={o.v} type="button" aria-pressed={filterStatus === o.v} onClick={() => setFilterStatus(o.v)}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <BulkBar
          selected={selected}
          busy={busy}
          onStatus={(s) => applyStatus(selected, s)}
          onDuplicate={() => handleDuplicate(selected)}
          onAcces={() => setConfirmAcces(selected)}
          onDelete={() => setConfirmDelete(selected)}
          onClear={() => setSelection(new Set())}
        />
      )}

      <div className="alist-table">
        <div className="seq-list-row is-head">
          <div>
            <input
              type="checkbox"
              className="seq-check"
              checked={allSelected}
              // Une case cochée alors que seule une partie du tableau l'est
              // mentirait sur ce que « tout décocher » va faire.
              ref={(el) => {
                if (el) el.indeterminate = !allSelected && selected.length > 0
              }}
              disabled={visibles.length === 0}
              aria-label="Tout sélectionner"
              onChange={() =>
                setSelection(allSelected ? new Set() : new Set(visibles.map((s) => s.id)))
              }
            />
          </div>
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
          visibles.map((seq) => {
            const steps = stepsOf(seq)
            const a = agg[seq.id] ?? AGG_VIDE
            const total = a.active + a.paused + a.finished
            const finishedPct = total === 0 ? 0 : Math.round((a.finished / total) * 100)
            const pipeline = seq.settings?.pipeline
              ? ref.pipelines.find((p) => p.id === seq.settings.pipeline)
              : null
            const stage = seq.settings?.stage
              ? ref.stages.find((s) => String(s.id) === String(seq.settings.stage))
              : null
            const kinds = steps.map((s) => s.kind)
            const windows = normalizeWindows(seq.settings?.sendWindows)
            const shown = windows.length > 0 ? windows : defaultWindows
            const regSeq = reg?.sequences.find((x) => x.id === seq.id)
            const waTasks = tasksBySeq[seq.id] ?? 0
            const isSel = selection.has(seq.id)
            return (
              <div
                key={seq.id}
                className={'seq-list-row' + (isSel ? ' is-sel' : '') + (seq.status === 'archived' ? ' is-archived' : '')}
                onClick={() => router.push(`/automations/sequences/${seq.id}`)}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="seq-check"
                    checked={isSel}
                    aria-label={`Sélectionner ${seq.name}`}
                    onChange={() => toggle(seq.id)}
                  />
                </div>
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
                    {` · ${steps.length} étape${steps.length > 1 ? 's' : ''}`}
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
                  {/* L'accès se lit dans la liste, pas seulement dans la boîte :
                      c'est la seule façon de repérer d'un coup d'œil celle qu'on
                      a restreinte à un agent et oubliée. */}
                  <AccesPill seq={seq} parSequence={parSequence} agents={agents} />
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn ghost sm icon row-more"
                    aria-label={`Actions sur ${seq.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menu?.id === seq.id}
                    onClick={(e) => openMenu(seq, e)}
                  >
                    <XI name="more" className="ico-sm" />
                  </button>
                </div>
              </div>
            )
          })}
        {!loading && visibles.length === 0 && (
          <div className="empty-row" style={{ padding: 32 }}>
            {rows.length === 0
              ? 'Aucune séquence. Cliquez sur « Nouvelle séquence » pour démarrer une cadence de prospection.'
              : 'Aucune séquence ne correspond à ce filtre.'}
          </div>
        )}
      </div>

      {menu && menuSeq && (
        <RowMenu
          seq={menuSeq}
          top={menu.top}
          left={menu.left}
          onClose={() => setMenu(null)}
          onOpen={() => router.push(`/automations/sequences/${menuSeq.id}`)}
          onStatus={(s) => applyStatus([menuSeq], s)}
          onDuplicate={() => handleDuplicate([menuSeq])}
          onAcces={() => setConfirmAcces([menuSeq])}
          onDelete={() => setConfirmDelete([menuSeq])}
        />
      )}

      {confirmAcces && (
        <AccesDialog
          cibles={confirmAcces}
          agents={agents}
          parSequence={parSequence}
          busy={busy}
          onCancel={() => setConfirmAcces(null)}
          onConfirm={(mode, apres, avant) => handleAcces(confirmAcces, mode, apres, avant)}
        />
      )}

      {confirmDelete && (
        <DeleteDialog
          cibles={confirmDelete}
          agg={agg}
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onArchive={() => {
            const cibles = confirmDelete
            setConfirmDelete(null)
            applyStatus(cibles, 'archived')
          }}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}

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

/** Ce qu'on dit une fois l'état changé — au singulier comme au pluriel. */
function messageStatut(status: AutomationStatus, n: number): string {
  const quoi = n === 1 ? 'Séquence' : `${n} séquences`
  if (status === 'on') return `${quoi} activée${n > 1 ? 's' : ''}`
  if (status === 'paused') return `${quoi} mise${n > 1 ? 's' : ''} en pause`
  if (status === 'draft') return `${quoi} repassée${n > 1 ? 's' : ''} en brouillon`
  if (status === 'archived') return `${quoi} archivée${n > 1 ? 's' : ''}`
  return `${quoi} mise${n > 1 ? 's' : ''} à jour`
}

/* ── Qui voit cette séquence ───────────────────────────────────────────────
 *
 * Muette quand la séquence est ouverte à tous ET qu'aucun agent n'existe : sur
 * un CRM sans freelance, la question ne se pose pas et la pastille ne serait
 * qu'un mot de plus à lire sur chaque ligne. Dès qu'il y a un agent, l'état
 * ouvert se dit aussi — c'en est un, et il se décide.
 */
function AccesPill({
  seq,
  parSequence,
  agents,
}: {
  seq: Automation
  parSequence: Map<string, Set<string>>
  agents: AgentRef[]
}) {
  const mode = modeAcces(seq.settings)
  const nommes = parSequence.get(seq.id) ?? new Set<string>()
  // Un agent supprimé garde sa ligne d'attribution (`on delete cascade` ne
  // joue que sur `user_profiles`) : compter les noms qu'on saurait afficher
  // évite un « 3 agents » qui n'en montre que deux une fois la boîte ouverte.
  const n = agents.filter((a) => nommes.has(a.id)).length
  if (mode === 'tous' && agents.length === 0) return null

  const vide = mode === 'choisis' && n === 0
  return (
    <div
      className={'seq-acces' + (mode === 'choisis' ? ' restreint' : '') + (vide ? ' vide' : '')}
      title={
        vide
          ? 'Restreinte, mais aucun agent coché : personne ne la voit.'
          : mode === 'tous'
            ? MODE_ACCES_LABEL.tous.aide
            : agents
                .filter((a) => nommes.has(a.id))
                .map((a) => a.name)
                .join(', ')
      }
    >
      <XI name={mode === 'tous' ? 'users' : 'user'} className="ico-xs" />
      {libelleAcces(mode, n)}
    </div>
  )
}

/* ── Boîte « Accès des agents » ────────────────────────────────────────────
 *
 * Deux décisions dans le même écran, dans l'ordre où on les prend : d'abord
 * OUVERT ou RESTREINT, puis — seulement si restreint — à qui. Présenter la
 * liste des agents en permanence laisserait croire que cocher trois noms suffit
 * à fermer la séquence aux autres, alors que le mode seul en décide.
 *
 * Sur un lot, une case peut être dans un troisième état : cochée sur certaines
 * séquences et pas sur d'autres. Elle s'affiche alors indéterminée, et n'écrit
 * RIEN tant qu'on n'y touche pas — sans quoi ouvrir la boîte pour changer le
 * mode retirerait au passage des agents qu'on n'a jamais décochés.
 */
function AccesDialog({
  cibles,
  agents,
  parSequence,
  busy,
  onCancel,
  onConfirm,
}: {
  cibles: Automation[]
  agents: AgentRef[]
  parSequence: Map<string, Set<string>>
  busy: boolean
  onCancel: () => void
  onConfirm: (
    mode: ModeAcces,
    apres: Map<string, boolean | null>,
    avant: Map<string, boolean | null>,
  ) => void
}) {
  /** Pour chaque agent : coché partout (`true`), nulle part (`false`), ou entre les deux (`null`). */
  const initiaux = useMemo(() => {
    const map = new Map<string, boolean | null>()
    for (const a of agents) {
      const n = cibles.filter((s) => parSequence.get(s.id)?.has(a.id)).length
      map.set(a.id, n === 0 ? false : n === cibles.length ? true : null)
    }
    return map
  }, [agents, cibles, parSequence])

  const [mode, setMode] = useState<ModeAcces>(() => {
    const modes = new Set(cibles.map((s) => modeAcces(s.settings)))
    // Lot panaché : on n'invente pas une décision, on part de l'état le plus
    // ouvert — le seul qui ne ferme rien tant qu'on n'a pas validé.
    return modes.size === 1 ? [...modes][0] : 'tous'
  })
  const [coches, setCoches] = useState<Set<string>>(
    () => new Set(agents.filter((a) => initiaux.get(a.id) === true).map((a) => a.id)),
  )
  /** Ce qu'on n'a pas touché reste indéterminé — et ne part donc pas en écriture. */
  const [touches, setTouches] = useState<Set<string>>(new Set())

  const bascule = (id: string) => {
    setTouches((prev) => new Set(prev).add(id))
    setCoches((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const effectifs = useMemo(() => {
    const map = new Map<string, boolean | null>()
    for (const a of agents) map.set(a.id, touches.has(a.id) ? coches.has(a.id) : (initiaux.get(a.id) ?? false))
    return map
  }, [agents, coches, initiaux, touches])

  const nbCoches = agents.filter((a) => effectifs.get(a.id) === true).length
  const nbPartiels = agents.filter((a) => effectifs.get(a.id) === null).length
  const quoi = cibles.length === 1 ? `« ${cibles[0].name} »` : `${cibles.length} séquences`

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="au-skin">
      <div className="modal-backdrop" onClick={onCancel}>
        <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd">
            <div className="grow">
              <div className="title">Accès des agents — {quoi}</div>
            </div>
            <button className="btn ghost sm icon" type="button" onClick={onCancel}>
              <XI name="x" className="ico-sm" />
            </button>
          </div>
          <div className="modal-body">
            <div className="acces-modes">
              {(['tous', 'choisis'] as ModeAcces[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={'acces-mode' + (mode === m ? ' on' : '')}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  <span className="rad">{mode === m && <i />}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="t">{MODE_ACCES_LABEL[m].titre}</span>
                    <span className="s">{MODE_ACCES_LABEL[m].aide}</span>
                  </span>
                </button>
              ))}
            </div>

            {mode === 'choisis' && (
              <div className="acces-agents">
                {agents.length === 0 && (
                  <div className="empty-row">
                    Aucun agent freelance dans le CRM. Restreindre la séquence la rendrait invisible
                    pour tout le monde.
                  </div>
                )}
                {agents.map((a) => {
                  const etat = effectifs.get(a.id) ?? false
                  return (
                    <label key={a.id} className="acces-agent">
                      <input
                        type="checkbox"
                        className="seq-check"
                        checked={etat === true}
                        ref={(el) => {
                          if (el) el.indeterminate = etat === null
                        }}
                        onChange={() => bascule(a.id)}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span className="n">{a.name}</span>
                        {a.email && <span className="e">{a.email}</span>}
                      </span>
                      {etat === null && <span className="pill">sur une partie du lot</span>}
                    </label>
                  )
                })}
                {nbCoches === 0 && nbPartiels === 0 && agents.length > 0 && (
                  <div className="acces-warn">
                    <XI name="warning" className="ico-xs" />
                    Aucun agent coché : {cibles.length === 1 ? 'cette séquence' : 'ces séquences'} ne
                    {cibles.length === 1 ? ' sera visible' : ' seront visibles'} que de vous.
                  </div>
                )}
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.5 }}>
              L’accès vaut pour le pipeline commercial de l’agent, son espace Séquences et le
              pipeline marketing. Il ne touche pas aux inscriptions déjà lancées : les tâches en
              cours restent dans sa file.
            </p>
          </div>
          <div className="modal-ft">
            <button className="btn ghost" type="button" onClick={onCancel}>
              Annuler
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="btn accent"
              type="button"
              disabled={busy}
              onClick={() => onConfirm(mode, effectifs, initiaux)}
            >
              <XI name="check" className="ico-sm" />
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── Barre d'actions de masse ──────────────────────────────────────────────
 *
 * Elle ne propose que ce qui a du sens pour le lot : « activer » disparaît si
 * tout est déjà actif. Un bouton qui ne ferait rien est un bouton qu'on clique
 * pour vérifier qu'il ne fait rien.
 */
function BulkBar({
  selected,
  busy,
  onStatus,
  onDuplicate,
  onAcces,
  onDelete,
  onClear,
}: {
  selected: Automation[]
  busy: boolean
  onStatus: (s: AutomationStatus) => void
  onDuplicate: () => void
  onAcces: () => void
  onDelete: () => void
  onClear: () => void
}) {
  const n = selected.length
  const has = (s: AutomationStatus) => selected.some((x) => x.status !== s)
  // Une archive ne se rallume pas d'un bond : on la sort des archives d'abord.
  // C'est la même règle que le menu d'une ligne, et l'inverse serait un piège —
  // « Activer » sur un lot d'archives remettrait en service ce qu'on a rangé.
  const activables = selected.some((x) => x.status !== 'on' && x.status !== 'archived')
  return (
    <div className="seq-bulkbar">
      <span className="cnt">
        {n} séquence{n > 1 ? 's' : ''} sélectionnée{n > 1 ? 's' : ''}
      </span>
      {activables && (
        <button className="btn ok sm" type="button" disabled={busy} onClick={() => onStatus('on')}>
          <XI name="playFill" className="ico-sm" />
          Activer
        </button>
      )}
      {selected.some((x) => x.status === 'on') && (
        <button className="btn subtle sm" type="button" disabled={busy} onClick={() => onStatus('paused')}>
          <XI name="pause" className="ico-sm" />
          Mettre en pause
        </button>
      )}
      {selected.some((x) => x.status !== 'draft' && x.status !== 'archived') && (
        <button className="btn subtle sm" type="button" disabled={busy} onClick={() => onStatus('draft')}>
          <XI name="undo" className="ico-sm" />
          Repasser en brouillon
        </button>
      )}
      <button className="btn subtle sm" type="button" disabled={busy} onClick={onDuplicate}>
        <XI name="copyClip" className="ico-sm" />
        Dupliquer
      </button>
      <button className="btn subtle sm" type="button" disabled={busy} onClick={onAcces}>
        <XI name="users" className="ico-sm" />
        Accès des agents…
      </button>
      {has('archived') ? (
        <button className="btn subtle sm" type="button" disabled={busy} onClick={() => onStatus('archived')}>
          <XI name="archive" className="ico-sm" />
          Archiver
        </button>
      ) : (
        <button className="btn subtle sm" type="button" disabled={busy} onClick={() => onStatus('paused')}>
          <XI name="undo" className="ico-sm" />
          Sortir des archives
        </button>
      )}
      <button className="btn danger sm" type="button" disabled={busy} onClick={onDelete}>
        <XI name="trash" className="ico-sm" />
        Supprimer
      </button>
      <div style={{ flex: 1 }} />
      <button className="btn ghost sm" type="button" onClick={onClear}>
        Annuler
      </button>
    </div>
  )
}

/* ── Menu « … » d'une ligne ────────────────────────────────────────────────
 *
 * Porté hors du tableau : la liste défile et ses lignes rognent ce qui dépasse,
 * un menu en position absolue s'y retrouverait coupé à la dernière ligne — celle
 * qu'on veut justement supprimer le plus souvent.
 */
function RowMenu({
  seq,
  top,
  left,
  onClose,
  onOpen,
  onStatus,
  onDuplicate,
  onAcces,
  onDelete,
}: {
  seq: Automation
  top: number
  left: number
  onClose: () => void
  onOpen: () => void
  onStatus: (s: AutomationStatus) => void
  onDuplicate: () => void
  onAcces: () => void
  onDelete: () => void
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top, left })

  // Le menu s'ouvre sous le bouton et aligné à DROITE : le bouton est déjà au
  // bord du tableau, un menu aligné à gauche sortirait de l'écran.
  useLayoutEffect(() => {
    const el = popRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const l = Math.max(8, left - r.width)
    const t = top + r.height > window.innerHeight - 8 ? Math.max(8, top - r.height - 32) : top
    setPos({ top: t, left: l })
  }, [top, left])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // `click` et non `mousedown` : le bouton qui a ouvert le menu bascule déjà
    // l'état au clic, un `mousedown` global le refermerait avant, et le clic
    // suivant le rouvrirait — le menu clignoterait sans jamais rester ouvert.
    document.addEventListener('click', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('click', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const item = (icon: string, label: string, run: () => void, danger = false) => (
    <div
      className={'menu-row' + (danger ? ' danger' : '')}
      role="menuitem"
      tabIndex={0}
      onClick={() => {
        onClose()
        run()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClose()
        run()
      }}
    >
      <XI name={icon} className="ico-sm" />
      {label}
    </div>
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="au-skin">
      <div ref={popRef} className="pop row-pop" role="menu" style={{ top: pos.top, left: pos.left }}>
        {item('edit', 'Modifier', onOpen)}
        {item('copyClip', 'Dupliquer', onDuplicate)}
        {item('users', 'Accès des agents…', onAcces)}
        <div className="menu-sep" />
        {seq.status !== 'on' && seq.status !== 'archived' && item('playFill', 'Activer', () => onStatus('on'))}
        {seq.status === 'on' && item('pause', 'Mettre en pause', () => onStatus('paused'))}
        {seq.status !== 'draft' && seq.status !== 'archived' && item('undo', 'Repasser en brouillon', () => onStatus('draft'))}
        {seq.status === 'archived'
          ? item('undo', 'Sortir des archives', () => onStatus('paused'))
          : item('archive', 'Archiver', () => onStatus('archived'))}
        <div className="menu-sep" />
        {item('trash', 'Supprimer…', onDelete, true)}
      </div>
    </div>,
    document.body,
  )
}

/* ── Confirmation de suppression ───────────────────────────────────────────
 *
 * Elle compte ce qui part avec la séquence. `sequence_enrollments` est en
 * `on delete cascade`, et `prospection_tasks` suit par `enrollment_id` : ce
 * n'est pas une ligne de configuration qu'on efface, c'est l'historique de
 * démarchage de tous les prospects passés par là. Dès qu'il y en a un, la
 * sortie proposée par défaut est l'archivage, qui ne détruit rien.
 */
function DeleteDialog({
  cibles,
  agg,
  busy,
  onCancel,
  onArchive,
  onConfirm,
}: {
  cibles: Automation[]
  agg: Record<string, EnrollAgg>
  busy: boolean
  onCancel: () => void
  onArchive: () => void
  onConfirm: () => void
}) {
  const inscriptions = cibles.reduce((n, s) => n + (agg[s.id]?.total ?? 0), 0)
  const actives = cibles.reduce((n, s) => n + (agg[s.id]?.active ?? 0), 0)
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="au-skin">
      <div className="modal-backdrop" onClick={onCancel}>
        <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd">
            <div className="grow">
              <div className="title">
                Supprimer {cibles.length === 1 ? `« ${cibles[0].name} »` : `${cibles.length} séquences`} ?
              </div>
            </div>
            <button className="btn ghost sm icon" type="button" onClick={onCancel}>
              <XI name="x" className="ico-sm" />
            </button>
          </div>
          <div className="modal-body" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
            {inscriptions === 0 ? (
              <p>
                Aucun prospect n’est passé par {cibles.length === 1 ? 'cette séquence' : 'ces séquences'} : la
                suppression n’emporte que sa configuration.
              </p>
            ) : (
              <>
                <p>
                  <strong style={{ color: 'var(--danger)' }}>
                    {inscriptions} inscription{inscriptions > 1 ? 's' : ''}
                  </strong>{' '}
                  {inscriptions > 1 ? 'seront supprimées' : 'sera supprimée'} avec{' '}
                  {cibles.length === 1 ? 'la séquence' : 'les séquences'}, ainsi que les tâches de démarchage qui en
                  découlent{actives > 0 && `, dont ${actives} inscription${actives > 1 ? 's' : ''} encore en cours`}.
                  C’est l’historique de démarchage de ces prospects qui disparaît, et il ne se récupère pas.
                </p>
                <p style={{ marginTop: 10 }}>
                  Pour la retirer des listes sans rien détruire, archivez-la : elle sort des écrans où l’on choisit une
                  séquence, ses inscriptions se figent, et elle repart si vous la réactivez.
                </p>
              </>
            )}
            {cibles.length > 1 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
                {cibles.map((s) => (
                  <li key={s.id}>
                    {s.name}
                    {(agg[s.id]?.total ?? 0) > 0 && (
                      <span style={{ color: 'var(--text-3)' }}> — {agg[s.id].total} inscription{agg[s.id].total > 1 ? 's' : ''}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-ft">
            <button className="btn ghost" type="button" onClick={onCancel}>
              Annuler
            </button>
            <div style={{ flex: 1 }} />
            {inscriptions > 0 && (
              <button className="btn subtle" type="button" disabled={busy} onClick={onArchive}>
                <XI name="archive" className="ico-sm" />
                Archiver plutôt
              </button>
            )}
            <button className="btn danger-fill" type="button" disabled={busy} onClick={onConfirm}>
              <XI name="trash" className="ico-sm" />
              Supprimer définitivement
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
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
