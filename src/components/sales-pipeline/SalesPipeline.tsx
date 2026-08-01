'use client'
// SalesPipeline — le pipeline commercial : une ligne par prospect, huit colonnes.
//
// Le modèle mental tient en trois moteurs qui avancent en parallèle et se lisent
// sur une seule ligne : la SÉQUENCE décide quoi envoyer, le RÉGULATEUR décide
// quand l'email part, le COMMERCIAL prend la main dès que le prospect est en
// face. Règle d'or : on n'intervient que quand le prospect réagit.
import React from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  Bolt,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  Inbox,
  Layers,
  Mail,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pause,
  Phone,
  Play,
  Search,
  Slash,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import { getCompanyDisplayName } from '@/utils/displayHelpers'
import {
  SALES_REACTIONS,
  SALES_STAGES,
  type SalesReactionId,
  type SalesStageDef,
  type SalesStageId,
} from '@/lib/sales-pipeline/stages'
import { formatHM, windowsUnion } from '@/lib/automations/regulator'
import { QueueRows } from '@/components/automations/regulator/RegulatorPage'
import { Avatar, colorForId, eta, hm, hmd, initialsOf } from '@/components/automations/regulator/parts'
import { SalesCell, STAGE_ICON, eur, rgba, type SalesHandlers } from './SalesCells'
import type { SalesBoardData, SalesBoardRow, SalesFilters } from './types'
import './sp-skin.css'

export type SalesPipelineVariant = 'admin' | 'agent'

const STATUS_TABS: { id: SalesFilters['status']; label: string }[] = [
  { id: 'actifs', label: 'Actifs' },
  { id: 'rdv', label: 'RDV et +' },
  { id: 'won', label: 'Signés' },
  { id: 'closed', label: 'Clos' },
  { id: 'tous', label: 'Tous' },
]

const KIND_COLOR: Record<string, string> = {
  email: '#2A6FDB',
  whatsapp: '#1F8A5B',
  call: '#C8881F',
  linkedin: '#C8881F',
  wait: '#8A877F',
  task: '#8A877F',
}
const KIND_LABEL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  call: 'Appel',
  linkedin: 'LinkedIn',
  wait: 'Attente',
  task: 'Tâche',
}
const KIND_ICON: Record<string, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  call: Phone,
  linkedin: MessageCircle,
  wait: Clock,
  task: Inbox,
}

const displayName = (row: SalesBoardRow) =>
  getCompanyDisplayName(row.companyName || row.name, row.companyUrl) || row.companyName

/** Séquence : la couleur est dérivée de son id, comme dans le régulateur. */
const seqColor = (id: string | null | undefined) => (id ? colorForId(id) : 'var(--text-4)')

export function SalesPipeline({ variant = 'admin' }: { variant?: SalesPipelineVariant }) {
  const isAgent = variant === 'agent'
  const base = isAgent ? '/api/agent/sales-pipeline' : '/api/sales-pipeline'

  const [board, setBoard] = React.useState<SalesBoardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [selection, setSelection] = React.useState<Set<string>>(new Set())
  const [filters, setFilters] = React.useState<SalesFilters>({
    q: '',
    view: 'all',
    status: 'actifs',
    sequence: 'all',
    todoOnly: false,
    page: 0,
  })
  const [search, setSearch] = React.useState('')
  const [modal, setModal] = React.useState<{ type: 'seq'; rows: SalesBoardRow[] } | { type: 'queue' } | null>(null)
  const [popover, setPopover] = React.useState<{ row: SalesBoardRow; x: number; y: number } | null>(null)
  const [reaction, setReaction] = React.useState<{ row: SalesBoardRow; id: SalesReactionId } | null>(null)

  // La recherche ne repart pas au serveur à chaque frappe.
  React.useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 0 })), 320)
    return () => clearTimeout(t)
  }, [search])

  const query = React.useMemo(() => {
    const p = new URLSearchParams()
    if (filters.q) p.set('q', filters.q)
    if (filters.view !== 'all') p.set('view', filters.view)
    p.set('status', filters.status)
    if (filters.sequence !== 'all') p.set('sequence', filters.sequence)
    if (filters.todoOnly) p.set('todo', '1')
    p.set('page', String(filters.page))
    return p.toString()
  }, [filters])

  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const res = await authedFetch(`${base}/board?${query}`)
        if (!res.ok) throw new Error()
        setBoard((await res.json()) as SalesBoardData)
      } catch {
        if (!silent) toast.error('Chargement du pipeline impossible')
      } finally {
        setLoading(false)
      }
    },
    [base, query],
  )

  React.useEffect(() => {
    void load()
  }, [load])

  // L'horloge locale fait descendre les comptes à rebours ; le serveur reste la
  // source de vérité et se resynchronise toutes les 45 s.
  React.useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    const refresh = setInterval(() => void load(true), 45_000)
    return () => {
      clearInterval(clock)
      clearInterval(refresh)
    }
  }, [load])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPopover(null)
      setModal(null)
      setReaction(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const post = React.useCallback(
    async (path: string, body: unknown, rowId: string | null, okMessage?: string) => {
      setBusy(rowId)
      try {
        const res = await authedFetch(`${base}/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(errorLabel(payload?.error))
          return false
        }
        if (okMessage) toast.success(okMessage)
        await load(true)
        return true
      } catch {
        toast.error('Action impossible')
        return false
      } finally {
        setBusy(null)
      }
    },
    [base, load],
  )

  const tz = board?.regulator.timezone ?? 'Europe/Paris'

  /* ── Actions de carte ──────────────────────────────────────────────────── */
  const handlers: SalesHandlers = {
    busy,
    onEnroll: (rows) => setModal({ type: 'seq', rows }),
    onQueue: () => setModal({ type: 'queue' }),
    onWork: (stage, row) => void work(stage, row),
    onValidate: (row, stage) =>
      void post('advance', { opportunite_id: row.id, stage }, row.id, `${stageName(stage)} validé`),
    onReact: (event, row) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      setPopover({ row, x: Math.min(rect.left, window.innerWidth - 280), y: rect.bottom + 6 })
    },
    onRevive: (row, stage) => void post('revive', { opportunite_id: row.id, stage }, row.id, 'Étape rouverte'),
    onSkipToRdv: (row) =>
      void post(
        'react',
        { opportunite_id: row.id, reaction: 'reply', reason: 'a déjà réagi — passage direct au RDV' },
        row.id,
        'Envoyé en RDV',
      ),
  }

  async function work(stage: SalesStageDef, row: SalesBoardRow) {
    switch (stage.id) {
      case 'seq':
        setModal({ type: 'seq', rows: [row] })
        return
      case 'email':
        setModal({ type: 'queue' })
        return
      case 'wa': {
        const task = row.tasks.find((t) => t.kind === 'whatsapp' || t.kind === 'linkedin')
        const phone = task?.phone ?? row.contact?.phone ?? row.phone
        const digits = (phone ?? '').replace(/\D/g, '')
        if (!digits) {
          toast.error('Aucun numéro pour ce contact')
          return
        }
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(task?.message ?? '')}`, '_blank')
        // wa.me n'a pas d'API d'envoi : on journalise au clic pour que l'échange
        // apparaisse dans l'historique du contact.
        await authedFetch('/api/messages/log', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            channel: 'whatsapp',
            contact_id: row.contact?.id,
            entreprise_id: row.entrepriseId,
            opportunite_id: row.id,
            to_email: phone,
            to_name: row.contact?.name,
            subject: 'Message WhatsApp',
            body_text: task?.message ?? '',
          }),
        }).catch(() => {})
        return
      }
      case 'call': {
        window.location.href = isAgent ? '/espace-agent/telephonie/cockpit' : '/telephonie/softphone'
        return
      }
      case 'rdv': {
        window.location.href = isAgent ? '/espace-agent/rendez-vous' : '/rendez-vous'
        return
      }
      case 'propo':
      case 'nego': {
        if (row.entrepriseId != null) {
          window.location.href = isAgent
            ? `/espace-agent/entreprises/${row.entrepriseId}`
            : `/companies/${row.entrepriseId}`
        }
        return
      }
      case 'signe':
        await post('advance', { opportunite_id: row.id, stage: 'signe' }, row.id, 'Opportunité gagnée')
        return
    }
  }

  /* ── Rendu ─────────────────────────────────────────────────────────────── */
  const rows = board?.rows ?? []
  const pages = board ? Math.max(1, Math.ceil(board.total / board.perPage)) : 1
  const nextSendIn = board?.regulator.nextSendAt ? Date.parse(board.regulator.nextSendAt) - now : null
  const selected = rows.filter((r) => selection.has(r.id))
  const openWindows = board ? windowsUnion(board.regulator.openWindows.map((w) => [w])) : []

  return (
    <div className="mp-scope sp-scope">
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="topbar">
        <div>
          <div className="kick">
            <span className="bt">
              <Bolt className="ico-sm" />
              pipeline commercial
            </span>
            <span>·</span>
            <span>démarchage sortant</span>
          </div>
          <h1 className="disp">Du premier email à la signature.</h1>
          <div className="sub">
            Chaque ligne est un prospect, chaque colonne une étape. La séquence pousse les cartes vers la droite toute
            seule — <em>vous n’intervenez que quand le prospect réagit</em>.
          </div>
        </div>
        <div className="topbar-actions">
          {!isAgent && (
            <Link href="/automations/regulateur" className="btn sm">
              <Bolt className="ico-sm" />
              Réglages du régulateur
            </Link>
          )}
          <button
            className="btn accent sm"
            onClick={() => setModal({ type: 'seq', rows: rows.filter((r) => !r.sequence) })}
            disabled={loading}
          >
            <Layers className="ico-sm" />
            Mettre en séquence
            <span className="ct">{rows.filter((r) => !r.sequence).length}</span>
          </button>
        </div>
      </div>

      {/* ── Barre régulateur ────────────────────────────────────────────── */}
      {board && (
        <button className="regbar" onClick={() => setModal({ type: 'queue' })}>
          <span className="rb-k">
            <Bolt className="ico-sm" />
            Régulateur
          </span>
          {board.regulator.paused ? (
            <span className="rb-main warn">
              <Pause className="ico-sm" />
              En pause — rien ne part
            </span>
          ) : nextSendIn != null ? (
            <span className="rb-main">
              <span className="cd mono">{eta(nextSendIn)}</span>
              avant le prochain email
              <span className="g">· {hmd(board.regulator.nextSendAt, now, tz)}</span>
            </span>
          ) : (
            <span className="rb-main g">Aucun email en file</span>
          )}
          <span className="rb-s">
            <b>{board.regulator.queued}</b> en file
          </span>
          <span className="rb-s">
            <b>{board.regulator.sentToday}</b>/{board.regulator.dailyCap} envoyés
          </span>
          <span className="rb-s">
            <b>{board.counts.todo}</b> tâches à la main
          </span>
          {openWindows.length > 0 && (
            <span className="rb-s g">
              plages {openWindows.map((w) => `${formatHM(w[0])}–${formatHM(w[1])}`).join(' · ')}
            </span>
          )}
          <span className="rb-now mono">{hm(now, tz)}</span>
        </button>
      )}

      {/* ── Barre d'outils ──────────────────────────────────────────────── */}
      <div className="toolbar">
        <div className="search">
          <Search className="ico-sm" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Entreprise, contact, ville…"
          />
        </div>
        <div className="seg">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={filters.status === tab.id ? 'on' : ''}
              onClick={() => setFilters((f) => ({ ...f, status: tab.id, page: 0 }))}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          className={'btn sm' + (filters.todoOnly ? ' accent' : ' subtle')}
          onClick={() => setFilters((f) => ({ ...f, todoOnly: !f.todoOnly, page: 0 }))}
        >
          <Inbox className="ico-sm" />À faire aujourd’hui
          <span className="ct">{board?.counts.todo ?? 0}</span>
        </button>
        <div className="tb-div" />
        <span className="tb-lb">Séquence</span>
        <select
          className="mp-select"
          value={filters.sequence}
          onChange={(e) => setFilters((f) => ({ ...f, sequence: e.target.value, page: 0 }))}
        >
          <option value="all">Toutes</option>
          {(board?.sequences ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="none">Sans séquence</option>
        </select>

        {!isAgent && (board?.agents.length ?? 0) > 0 && (
          <>
            <div className="tb-div" />
            <span className="tb-lb">Vue</span>
            <div className="own-filter">
              <button
                className={'btn xs subtle' + (filters.view === 'all' ? ' on' : '')}
                style={{ marginRight: 4 }}
                onClick={() => setFilters((f) => ({ ...f, view: 'all', page: 0 }))}
              >
                Tous
              </button>
              {(board?.agents ?? []).map((agent) => (
                <button
                  key={agent.id}
                  className={
                    'av-btn' + (filters.view === agent.id ? ' sel' : filters.view !== 'all' ? ' dim' : '')
                  }
                  title={agent.name}
                  onClick={() =>
                    setFilters((f) => ({ ...f, view: f.view === agent.id ? 'all' : agent.id, page: 0 }))
                  }
                >
                  <Avatar id={agent.id} name={agent.name} size={26} />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="tb-stats">
          <div className="stat">
            <span className="v">{board?.counts.actifs ?? 0}</span>
            <span className="l">actifs</span>
          </div>
          <div className="stat">
            <span className="v acc">{board?.counts.rdvPlus ?? 0}</span>
            <span className="l">rdv+</span>
          </div>
          <div className="stat">
            <span className="v ok">{board?.counts.won ?? 0}</span>
            <span className="l">signés</span>
          </div>
          <div className="stat">
            <span className="v mut">{eur(board?.counts.value ?? 0)}</span>
            <span className="l">en jeu</span>
          </div>
        </div>
      </div>

      {selection.size > 0 && (
        <div className="bulkbar">
          <span className="cnt">
            {selection.size} prospect{selection.size > 1 ? 's' : ''} sélectionné{selection.size > 1 ? 's' : ''}
          </span>
          <button className="btn accent sm" onClick={() => setModal({ type: 'seq', rows: selected })}>
            <Layers className="ico-sm" />
            Mettre en séquence
          </button>
          <button className="btn ghost sm" onClick={() => setSelection(new Set())}>
            Annuler
          </button>
        </div>
      )}

      {/* ── Matrice ─────────────────────────────────────────────────────── */}
      <div className="mx-scroll">
        <div className="matrix" style={{ ['--ncol' as string]: SALES_STAGES.length }}>
          <div className="mx-corner">
            <div className="t">
              {board?.total ?? 0} prospect{(board?.total ?? 0) > 1 ? 's' : ''}
            </div>
            <div className="s">
              page {(board?.page ?? 0) + 1}/{pages}
            </div>
          </div>
          {SALES_STAGES.map((stage, i) => (
            <ColumnHead key={stage.id} stage={stage} index={i} counts={board?.columns[stage.id]} />
          ))}

          {rows.map((row) => (
            <React.Fragment key={row.id}>
              <RowHead
                row={row}
                selected={selection.has(row.id)}
                agentMode={isAgent}
                now={now}
                timezone={tz}
                onToggle={() =>
                  setSelection((s) => {
                    const next = new Set(s)
                    if (next.has(row.id)) next.delete(row.id)
                    else next.add(row.id)
                    return next
                  })
                }
                onReact={(e) => handlers.onReact(e, row)}
              />
              {SALES_STAGES.map((stage) => (
                <SalesCell key={stage.id} row={row} stage={stage} now={now} timezone={tz} handlers={handlers} />
              ))}
            </React.Fragment>
          ))}

          {rows.length === 0 && (
            <div className="empty">
              <Search />
              <div className="t">{loading ? 'Chargement…' : 'Aucun prospect'}</div>
              <div className="s">Changez de vue ou videz la recherche.</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Pied ────────────────────────────────────────────────────────── */}
      <div className="footbar">
        <div className="legend">
          <span className="it">
            <span className="k" style={{ background: 'var(--ok)' }} />
            faite
          </span>
          <span className="it">
            <span className="k" style={{ background: 'var(--accent)' }} />
            en cours
          </span>
          <span className="it">
            <span className="k" style={{ background: 'var(--bg-3)' }} />à venir
          </span>
          <span className="it">
            <span className="k" style={{ background: 'var(--info)', opacity: 0.45 }} />
            sautée
          </span>
          <span className="it">
            <Bolt className="ico-xs" />« a réagi » saute les étapes restantes
          </span>
        </div>
        <div className="pager">
          <button
            className="btn subtle sm icon"
            disabled={(board?.page ?? 0) === 0}
            onClick={() => setFilters((f) => ({ ...f, page: Math.max(0, f.page - 1) }))}
            title="Page précédente"
          >
            <ChevronRight className="ico-sm" style={{ transform: 'rotate(180deg)' }} />
          </button>
          {Array.from({ length: Math.min(pages, 9) }, (_, i) => (
            <button
              key={i}
              className={'pg' + (i === (board?.page ?? 0) ? ' on' : '')}
              onClick={() => setFilters((f) => ({ ...f, page: i }))}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="btn subtle sm icon"
            disabled={(board?.page ?? 0) >= pages - 1}
            onClick={() => setFilters((f) => ({ ...f, page: Math.min(pages - 1, f.page + 1) }))}
            title="Page suivante"
          >
            <ChevronRight className="ico-sm" />
          </button>
        </div>
      </div>

      {/* ── Popover « le prospect a réagi » ─────────────────────────────── */}
      {popover &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div className="mp-scope-pop-scrim" onClick={() => setPopover(null)} />
            <div className="mp-scope-pop" style={{ left: popover.x, top: popover.y, minWidth: 254 }}>
              <div className="ph">Le prospect a réagi</div>
              {SALES_REACTIONS.map((r) => (
                <button
                  key={r.id}
                  className={'pop-item' + (r.tone === 'danger' ? ' danger' : '')}
                  onClick={() => {
                    const row = popover.row
                    setPopover(null)
                    // Deux issues demandent une saisie : la date de relance et le motif.
                    if (r.id === 'later' || r.id === 'no' || r.id === 'bad') {
                      setReaction({ row, id: r.id })
                      return
                    }
                    void post('react', { opportunite_id: row.id, reaction: r.id }, row.id, r.note)
                  }}
                >
                  <span className={`ri ${r.tone}`}>
                    <ReactionIcon id={r.id} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="l">{r.label}</span>
                    <span className="sn">{r.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      {reaction && (
        <ReactionDialog
          row={reaction.row}
          reaction={reaction.id}
          busy={busy === reaction.row.id}
          onClose={() => setReaction(null)}
          onSubmit={async (body) => {
            const ok = await post('react', { opportunite_id: reaction.row.id, ...body }, reaction.row.id, 'Enregistré')
            if (ok) setReaction(null)
          }}
        />
      )}

      {modal?.type === 'seq' && board && (
        <SequenceDialog
          rows={modal.rows}
          board={board}
          now={now}
          timezone={tz}
          busy={busy === '__enroll'}
          onClose={() => setModal(null)}
          onLaunch={async (automationId) => {
            setBusy('__enroll')
            try {
              const res = await authedFetch(`${base}/enroll`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ automation_id: automationId, opportunite_ids: modal.rows.map((r) => r.id) }),
              })
              const payload = await res.json().catch(() => ({}))
              if (!res.ok) {
                toast.error(errorLabel(payload?.error))
                return
              }
              const enrolled = payload.enrolled ?? 0
              const skipped = (payload.results ?? []).filter(
                (r: { status: string }) => r.status !== 'enrolled',
              ).length
              toast.success(
                `${enrolled} prospect${enrolled > 1 ? 's' : ''} mis en séquence` +
                  (skipped > 0 ? ` · ${skipped} ignoré${skipped > 1 ? 's' : ''}` : ''),
              )
              setSelection(new Set())
              setModal(null)
              await load(true)
            } finally {
              setBusy(null)
            }
          }}
        />
      )}

      {modal?.type === 'queue' && board && (
        <QueueDrawer board={board} now={now} timezone={tz} isAgent={isAgent} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

/* ── En-tête de colonne ────────────────────────────────────────────────── */

function ColumnHead({
  stage,
  index,
  counts,
}: {
  stage: SalesStageDef
  index: number
  counts?: { active: number; done: number }
}) {
  const Icon = STAGE_ICON[stage.id]
  return (
    <div className="mx-colhead">
      <div className="hd">
        <span className="sw" style={{ background: rgba(stage.color, 0.12), color: stage.color }}>
          <Icon className="ico" />
        </span>
        <span className="nm">{stage.name}</span>
        <span className="idx">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="meta">
        <b style={{ color: stage.color }}>{counts?.active ?? 0}</b> en cours · {counts?.done ?? 0} faites
      </div>
    </div>
  )
}

/* ── En-tête de ligne ──────────────────────────────────────────────────── */

function RowHead({
  row,
  selected,
  agentMode,
  now,
  timezone,
  onToggle,
  onReact,
}: {
  row: SalesBoardRow
  selected: boolean
  agentMode: boolean
  now: number
  timezone: string
  onToggle: () => void
  onReact: (e: React.MouseEvent) => void
}) {
  const doneCount = SALES_STAGES.filter((s) => row.cells[s.id] === 'done').length
  const statusLabel =
    row.state.state === 'won'
      ? 'Signé'
      : row.state.state === 'lost'
        ? 'Perdu'
        : row.state.state === 'black'
          ? 'Blacklisté'
          : row.state.state === 'nurt'
            ? `À recontacter${row.state.nurtureAt ? ` ${new Date(row.state.nurtureAt).toLocaleDateString('fr-FR')}` : ''}`
            : `${doneCount}/${SALES_STAGES.length} étapes`
  const value = row.type === 'mrr' && row.mrr ? `${eur(row.mrr)}/m` : eur(row.montant)
  const name = displayName(row)
  const closed = row.state.state === 'won' || row.state.state === 'black'

  return (
    <div className={'mx-rowhead' + (selected ? ' row-sel' : '')}>
      <div className="rh-top">
        <input
          type="checkbox"
          className="rh-check"
          checked={selected}
          onChange={onToggle}
          aria-label={`Sélectionner ${name}`}
        />
        <span className="rh-logo" style={{ background: colorForId(row.id) }}>
          {initialsOf(name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rh-name">{name}</div>
          <div className="rh-meta">
            {row.contact && <span>{row.contact.name}</span>}
            {row.ville && (
              <>
                <span className="g">·</span>
                <MapPin className="ico-xs" />
                {row.ville}
              </>
            )}
          </div>
        </div>
        <Link
          href={
            row.entrepriseId != null
              ? agentMode
                ? `/espace-agent/entreprises/${row.entrepriseId}`
                : `/companies/${row.entrepriseId}`
              : '#'
          }
          className="rh-more"
          title="Ouvrir la fiche entreprise"
        >
          <MoreVertical className="ico-sm" />
        </Link>
      </div>

      <div>
        <div className="rail">
          {SALES_STAGES.map((stage) => {
            const status = row.cells[stage.id]
            const cls =
              status === 'done'
                ? 'done'
                : status === 'active'
                  ? 'act'
                  : status === 'skip'
                    ? 'skp'
                    : status === 'lost' || status === 'black'
                      ? 'rej'
                      : status === 'nurt'
                        ? 'nrt'
                        : ''
            return <i key={stage.id} className={cls} style={{ ['--seg' as string]: stage.color }} />
          })}
        </div>
        <div className="rh-line">
          <span className="rh-status" style={{ marginLeft: 0 }}>
            {statusLabel}
          </span>
          <span className="rh-status mono" style={{ color: 'var(--text-2)', fontWeight: 600 }}>
            {value}
          </span>
        </div>
      </div>

      {row.sequence ? (
        <div className="rh-seq" style={{ ['--sc' as string]: seqColor(row.sequence.automationId) }}>
          <i />
          <span className="nm">{row.sequence.name}</span>
          <span className="st">
            {row.sequence.status === 'exited'
              ? 'stoppée'
              : row.sequence.status === 'paused'
                ? 'en pause'
                : row.sequence.status === 'finished'
                  ? 'terminée'
                  : `${row.sequence.currentStep}/${row.sequence.totalSteps}`}
          </span>
        </div>
      ) : (
        <div className="rh-seq none">
          <Slash className="ico-xs" />
          Aucune séquence
        </div>
      )}

      <button className="react-btn" onClick={onReact} disabled={closed}>
        <Bolt className="ico-sm" />
        Le prospect a réagi
        <ChevronDown className="ico-xs chev" />
      </button>

      <div className="rh-foot">
        {row.owner ? (
          <span className="assign has" title={row.owner.name}>
            <Avatar id={row.owner.id} name={row.owner.name} size={20} />
            {row.owner.name.split(' ')[0]}
          </span>
        ) : (
          <span className="assign none">
            <User className="ico-sm" />
            Non attribué
          </span>
        )}
        <div className="rh-links">
          {row.companyUrl && (
            <a
              href={row.companyUrl.startsWith('http') ? row.companyUrl : `https://${row.companyUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              title={row.companyUrl}
            >
              <Globe className="ico-sm" />
            </a>
          )}
          {row.phone && (
            <a href={`tel:${row.phone.replace(/\s/g, '')}`} title={row.phone}>
              <Phone className="ico-sm" />
            </a>
          )}
          {row.lastExchange && (
            <span className="lastex" title={`Dernier échange · ${hm(row.lastExchange.at, timezone)}`}>
              {row.lastExchange.channel === 'whatsapp' ? (
                <MessageCircle className="ico-xs" />
              ) : (
                <Mail className="ico-xs" />
              )}
              {relativeDay(row.lastExchange.at, now)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Modale « mettre en séquence » ─────────────────────────────────────── */

function SequenceDialog({
  rows,
  board,
  now,
  timezone,
  busy,
  onClose,
  onLaunch,
}: {
  rows: SalesBoardRow[]
  board: SalesBoardData
  now: number
  timezone: string
  busy: boolean
  onClose: () => void
  onLaunch: (automationId: string) => void
}) {
  const live = board.sequences.filter((s) => s.status === 'on')
  const [picked, setPicked] = React.useState<string | null>(live[0]?.id ?? null)
  const sequence = board.sequences.find((s) => s.id === picked) ?? null

  const manualSteps = sequence?.steps.filter((s) => s.kind !== 'email' && s.kind !== 'wait').length ?? 0
  // Heure estimée du premier départ : après le dernier créneau déjà réservé.
  const lastSlot = board.queue.filter((q) => q.sendAt).slice(-1)[0]
  const firstEta = lastSlot?.sendAt ?? board.regulator.nextSendAt

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="sw" style={{ background: rgba('#7A5AE0', 0.12), color: '#7A5AE0' }}>
            <Layers className="ico" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">
              Mettre en séquence · {rows.length === 1 ? displayName(rows[0]) : `${rows.length} prospects`}
            </div>
            <div className="ms">La séquence décide quoi envoyer — le régulateur décide quand.</div>
          </div>
          <button className="rh-more" onClick={onClose} aria-label="Fermer">
            <X className="ico-sm" />
          </button>
        </div>

        <div className="modal-body">
          <div className="seq-list">
            {board.sequences.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                <div className="t">Aucune séquence</div>
                <div className="s">Créez-en une dans Automatisations.</div>
              </div>
            )}
            {board.sequences.map((s) => (
              <button
                key={s.id}
                className={'seq-opt' + (picked === s.id ? ' on' : '') + (s.status !== 'on' ? ' off' : '')}
                onClick={() => s.status === 'on' && setPicked(s.id)}
              >
                <span className="rad">{picked === s.id && <i />}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="n">
                    <i style={{ background: seqColor(s.id) }} />
                    {s.name}
                  </span>
                  <span className="s">
                    {s.steps.length} étapes · {s.steps.filter((x) => x.kind !== 'email' && x.kind !== 'wait').length} à
                    la main · {s.activeEnrollments} actifs
                  </span>
                </span>
                {s.status !== 'on' && <span className="pill warn">en pause</span>}
              </button>
            ))}
          </div>

          <div className="seq-detail">
            {sequence ? (
              <>
                <div className="sd-h">Déroulé — {sequence.name}</div>
                <div>
                  {sequence.steps.map((step, i) => {
                    const Icon = KIND_ICON[step.kind] ?? Mail
                    const color = KIND_COLOR[step.kind] ?? '#8A877F'
                    const auto = step.kind === 'email' || step.kind === 'wait'
                    return (
                      <div key={i} className="step">
                        <span className="d">J+{step.day}</span>
                        <span className="ki" style={{ background: rgba(color, 0.12), color }}>
                          <Icon className="ico-sm" />
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span className="n">{step.label}</span>
                          <span className="s" style={{ color: 'var(--text-3)', fontSize: 10.5 }}>
                            {KIND_LABEL[step.kind] ?? step.kind}
                          </span>
                        </span>
                        <span className={'md ' + (auto ? 'auto' : 'manuel')}>{auto ? 'auto' : 'manuel'}</span>
                      </div>
                    )
                  })}
                  {sequence.steps.length === 0 && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Cette séquence n’a pas encore d’étapes.
                    </div>
                  )}
                </div>

                {/* Les trois conséquences annoncées AVANT de valider : c'est ce
                    qui remplace la confiance aveugle dans l'automatisation. */}
                <div className="sd-note">
                  <div>
                    <Bolt className="ico-sm" />
                    <span>
                      1<sup>er</sup> email placé en file — départ estimé <b>{hmd(firstEta, now, timezone)}</b>
                      {rows.length > 1
                        ? `, puis les suivants espacés de ${board.regulator.gapMinMinutes} à ${board.regulator.gapMaxMinutes} min.`
                        : '.'}
                    </span>
                  </div>
                  <div>
                    <Inbox className="ico-sm" />
                    <span>
                      {manualSteps * rows.length} tâche{manualSteps * rows.length > 1 ? 's' : ''} manuelle
                      {manualSteps * rows.length > 1 ? 's' : ''} seront créées et attribuées automatiquement.
                    </span>
                  </div>
                  <div>
                    <Calendar className="ico-sm" />
                    <span>Sortie immédiate si le prospect répond ou prend rendez-vous.</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="muted">Choisissez une séquence à gauche.</div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          {rows.length === 0 && <span className="msg">Aucun prospect sélectionné.</span>}
          <button className="btn ghost sm" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn accent sm"
            disabled={!picked || rows.length === 0 || busy}
            onClick={() => picked && onLaunch(picked)}
          >
            <Play className="ico-sm" />
            Lancer la séquence{rows.length > 1 ? ` · ${rows.length}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Tiroir « file d'envoi » ───────────────────────────────────────────── */

function QueueDrawer({
  board,
  now,
  timezone,
  isAgent,
  onClose,
}: {
  board: SalesBoardData
  now: number
  timezone: string
  isAgent: boolean
  onClose: () => void
}) {
  const planned = board.queue.filter((q) => q.sendAt != null).length
  const blocked = board.queue.length - planned
  const avg = (board.regulator.gapMinMinutes + board.regulator.gapMaxMinutes) / 2

  return (
    <div className="modal-scrim right" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="sw" style={{ background: rgba('#2A6FDB', 0.12), color: '#2A6FDB' }}>
            <Bolt className="ico" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">File d’envoi · un seul tuyau</div>
            <div className="ms">
              {isAgent ? 'Vos prospects' : 'Toutes séquences confondues'} — {planned} planifiés, {blocked} en attente
            </div>
          </div>
          <button className="rh-more" onClick={onClose} aria-label="Fermer">
            <X className="ico-sm" />
          </button>
        </div>

        <div className="dr-set">
          <div className="dr-row">
            <span className="k">Écart entre deux emails</span>
            <span className="v">
              {board.regulator.gapMinMinutes} → {board.regulator.gapMaxMinutes} min
            </span>
          </div>
          <div className="dr-row">
            <span className="k">Plages d’envoi</span>
            <span className="v">
              {board.regulator.openWindows.map((w) => `${formatHM(w[0])}–${formatHM(w[1])}`).join(' · ') || '—'}
            </span>
          </div>
          <div className="dr-row">
            <span className="k">Plafond du jour</span>
            <span className="v">
              {board.regulator.sentToday} / {board.regulator.dailyCap}
            </span>
          </div>
          <div className="dr-bar">
            <i
              style={{
                width: `${Math.min(100, board.regulator.dailyCap ? (board.regulator.sentToday / board.regulator.dailyCap) * 100 : 0)}%`,
              }}
            />
          </div>
          <div className="dr-row">
            <span className="k">Débit moyen</span>
            <span className="v">≈ {(60 / (avg || 1)).toFixed(1)} emails/h</span>
          </div>
          {!isAgent && (
            <Link href="/automations/regulateur" className="btn sm" style={{ width: '100%', marginTop: 8 }}>
              <Bolt className="ico-sm" />
              Régler le régulateur
            </Link>
          )}
        </div>

        <div className="dr-queue au-skin">
          <QueueRows rows={board.queue} now={now} tz={timezone} paused={board.regulator.paused} compact />
        </div>
      </div>
    </div>
  )
}

/* ── Saisie complémentaire pour trois des cinq issues ──────────────────── */

function ReactionDialog({
  row,
  reaction,
  busy,
  onClose,
  onSubmit,
}: {
  row: SalesBoardRow
  reaction: SalesReactionId
  busy: boolean
  onClose: () => void
  onSubmit: (body: { reaction: SalesReactionId; reason?: string; nurture_at?: string }) => void
}) {
  const needsDate = reaction === 'later'
  const [reason, setReason] = React.useState('')
  const [date, setDate] = React.useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const meta = SALES_REACTIONS.find((r) => r.id === reaction)!
  const valid = needsDate ? !!date : reason.trim().length > 0

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="sw" style={{ background: 'var(--bg-2)' }}>
            <ReactionIcon id={reaction} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">{meta.label}</div>
            <div className="ms">
              {displayName(row)} · {meta.note}
            </div>
          </div>
          <button className="rh-more" onClick={onClose} aria-label="Fermer">
            <X className="ico-sm" />
          </button>
        </div>

        <div className="react-form">
          {needsDate && (
            <label>
              Date de relance
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}
          <label>
            {needsDate ? 'Note (facultatif)' : 'Motif'}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                reaction === 'bad'
                  ? 'Numéro attribué à une autre société, établissement fermé…'
                  : reaction === 'no'
                    ? 'A refait son site, pas de budget, déjà équipé…'
                    : 'Budget bloqué jusqu’à la rentrée…'
              }
            />
          </label>
          <p className="muted" style={{ fontSize: 11.5 }}>
            Les emails encore planifiés pour ce prospect seront annulés, et ses tâches en attente marquées comme sautées.
          </p>
        </div>

        <div className="modal-foot">
          <button className="btn ghost sm" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn accent sm"
            disabled={!valid || busy}
            onClick={() =>
              onSubmit({
                reaction,
                reason: reason.trim() || undefined,
                nurture_at: needsDate ? date : undefined,
              })
            }
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

function ReactionIcon({ id }: { id: SalesReactionId }) {
  switch (id) {
    case 'rdv':
      return <Calendar className="ico-sm" />
    case 'reply':
      return <Phone className="ico-sm" />
    case 'later':
      return <Clock className="ico-sm" />
    case 'no':
      return <Slash className="ico-sm" />
    default:
      return <Building2 className="ico-sm" />
  }
}

/* ── Divers ────────────────────────────────────────────────────────────── */

const stageName = (id: SalesStageId) => SALES_STAGES.find((s) => s.id === id)?.name ?? id

/** « aujourd'hui », « hier », « il y a 4 j ». */
function relativeDay(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return "auj."
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

const ERROR_LABELS: Record<string, string> = {
  motif_requis: 'Un motif est obligatoire.',
  date_de_relance_requise: 'Choisissez une date de relance.',
  prospect_non_attribue: 'Ce prospect ne vous est pas attribué.',
  sequence_non_assignee: 'Cette séquence ne vous a pas été attribuée.',
  sequence_inactive: 'Cette séquence est en pause.',
  sequence_introuvable: 'Séquence introuvable.',
  introuvable: 'Introuvable.',
}
const errorLabel = (code: unknown) =>
  (typeof code === 'string' && ERROR_LABELS[code]) || 'Action impossible'

export { UserPlus }
