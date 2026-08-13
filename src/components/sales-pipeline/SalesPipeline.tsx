'use client'
// SalesPipeline — le pipeline commercial : une ligne par prospect, deux groupes
// de colonnes.
//
//   ╔═══ SÉQUENCE · Artisans ════════════════╗  ┌─── PIPELINE · Agent SAMA ───┐
//   ║ J+0 Email │ J+1 WhatsApp │ J+5 Appel   ║  │ RDV calé │ Client signé     │
//   ╚════════════════════════════════════════╝  └─────────────────────────────┘
//
// La séquence pousse le prospect toute seule jusqu'à sa dernière étape ; le
// commercial reprend la main à l'étape de reprise du pipeline. Règle d'or : on
// n'intervient que quand le prospect réagit.
//
// UNE PARTIE À LA FOIS. Les colonnes du milieu sont les étapes d'UNE séquence :
// tant qu'on n'en affichait qu'une pour tout le monde, les prospects des autres
// séquences tombaient sous des colonnes qui n'étaient pas les leurs. Le tableau
// se choisit donc par onglets (`.parts`) : une séquence, la vue d'ensemble, ou
// le stock à démarcher. Chaque onglet annonce son nombre — rien ne disparaît,
// tout se regarde séparément.
import React from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bolt,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  Clock,
  Globe,
  Inbox,
  Layers,
  Mail,
  MailPlus,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pause,
  Phone,
  Play,
  Search,
  Slash,
  User,
  X,
} from 'lucide-react'
import { ArchiveDialog, type ArchiveTarget } from '@/components/archive/ArchiveDialog'
import { authedFetch } from '@/utils/authedFetch'
import { getCompanyDisplayName } from '@/utils/displayHelpers'
import {
  ALL_SEQUENCES,
  NO_SEQUENCE,
  SALES_REACTIONS,
  SEQUENCE_TINT,
  STEP_OUTCOMES,
  channelOf,
  isStepColumn,
  partKind,
  type SalesColumn,
  type SalesReactionId,
  type SequencePart,
} from '@/lib/sales-pipeline/stages'
import { formatHM } from '@/lib/automations/regulator'
import { errorLabel } from '@/lib/sales-pipeline/error-labels'
import type { MessageVariant } from '@/lib/automations/variables'
import { lienWhatsApp } from '@/lib/prospects/canal'
import type { NumeroProspect } from '@/lib/prospects/numeros'
import { QueueRows } from '@/components/automations/regulator/RegulatorPage'
import { Avatar, colorForId, eta, hm, hmd, initialsOf } from '@/components/automations/regulator/parts'
import { KIND_ICON, SalesCell, columnIcon, columnStepId, eur, rgba, type SalesHandlers } from './SalesCells'
import { EnvoiWhatsAppDialog } from './EnvoiWhatsAppDialog'
import type { SalesBoardData, SalesBoardRow, SalesFilters, SalesMissingEmailRow } from './types'
import './sp-skin.css'

export type SalesPipelineVariant = 'admin' | 'agent'

/** Ce que la modale de saisie d'adresse a besoin de savoir. */
type EmailTarget = { id: string; name: string; current: string | null }

const STATUS_TABS: { id: SalesFilters['status']; label: string }[] = [
  { id: 'actifs', label: 'Actifs' },
  { id: 'rdv', label: 'Phase commerciale' },
  { id: 'won', label: 'Signés' },
  { id: 'closed', label: 'Clos' },
  { id: 'tous', label: 'Tous' },
  { id: 'archives', label: 'Archivés' },
]

const displayName = (row: SalesBoardRow) =>
  getCompanyDisplayName(row.companyName || row.name, row.companyUrl) || row.companyName

/* ── Mémorisation des sélecteurs ─────────────────────────────────────────── */
// Même principe que le template du Marketing Pipeline : sans ça, chaque retour
// sur la page repartait sur le premier choix de la liste.
const storageKey = (variant: SalesPipelineVariant, what: string) => `sp:${variant}:${what}`

function readStored(variant: SalesPipelineVariant, what: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(storageKey(variant, what))
  } catch {
    return null
  }
}

function store(variant: SalesPipelineVariant, what: string, value: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(storageKey(variant, what), value)
    else window.localStorage.removeItem(storageKey(variant, what))
  } catch {
    /* stockage indisponible (mode privé) : la sélection tient pour la session */
  }
}

export function SalesPipeline({ variant = 'admin' }: { variant?: SalesPipelineVariant }) {
  const isAgent = variant === 'agent'
  const base = isAgent ? '/api/agent/sales-pipeline' : '/api/sales-pipeline'

  const [board, setBoard] = React.useState<SalesBoardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const [selection, setSelection] = React.useState<Set<string>>(new Set())
  const [filters, setFilters] = React.useState<SalesFilters>(() => ({
    q: '',
    view: 'all',
    status: 'actifs',
    todoOnly: false,
    page: 0,
    pipelineId: readStored(variant, 'pipeline'),
    part: readStored(variant, 'sequence'),
  }))
  const [search, setSearch] = React.useState('')
  const [modal, setModal] = React.useState<
    { type: 'seq'; rows: SalesBoardRow[] } | { type: 'queue' } | { type: 'missing' } | null
  >(null)
  const [popover, setPopover] = React.useState<{ row: SalesBoardRow; x: number; y: number } | null>(null)
  /** Menu ⋮ d'une ligne — même mécanique portalée que le popover « a réagi ». */
  const [rowMenu, setRowMenu] = React.useState<{ row: SalesBoardRow; x: number; y: number } | null>(null)
  const [archiveTarget, setArchiveTarget] = React.useState<ArchiveTarget | null>(null)
  const [reaction, setReaction] = React.useState<{ row: SalesBoardRow; id: SalesReactionId } | null>(null)
  /** La moitié « Réponse » d'une carte, ouverte sur une étape précise. */
  const [outcome, setOutcome] = React.useState<{ row: SalesBoardRow; column: SalesColumn } | null>(null)
  const [emailTarget, setEmailTarget] = React.useState<EmailTarget | null>(null)
  /**
   * L'écran d'envoi WhatsApp — à qui, sur quel numéro, avec quel texte.
   *
   * Interposé entre le bouton et `wa.me` : composer un numéro choisi en silence
   * et envoyer un texte qu'on n'a pas relu sont deux gestes qu'on ne rattrape
   * pas une fois la conversation ouverte.
   *
   * On garde l'IDENTIFIANT de la ligne, pas la ligne : épingler une version
   * relance le chargement du tableau, et un objet capturé à l'ouverture
   * afficherait encore l'état d'avant l'épingle.
   */
  const [waSend, setWaSend] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 0 })), 320)
    return () => clearTimeout(t)
  }, [search])

  const query = React.useMemo(() => {
    const p = new URLSearchParams()
    if (filters.q) p.set('q', filters.q)
    if (filters.view !== 'all') p.set('view', filters.view)
    p.set('status', filters.status)
    if (filters.todoOnly) p.set('todo', '1')
    if (filters.pipelineId) p.set('pipeline', filters.pipelineId)
    if (filters.part) p.set('sequence', filters.part)
    p.set('page', String(filters.page))
    return p.toString()
  }, [filters])

  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const res = await authedFetch(`${base}/board?${query}`)
        if (!res.ok) throw new Error()
        const data = (await res.json()) as SalesBoardData
        setBoard(data)
        // Le serveur tranche le choix par défaut ; on le mémorise pour que la
        // page rouvre sur la même combinaison.
        store(variant, 'pipeline', data.selectedPipelineId)
        store(variant, 'sequence', data.selectedPart)
      } catch {
        if (!silent) toast.error('Chargement du pipeline impossible')
      } finally {
        setLoading(false)
      }
    },
    [base, query, variant],
  )

  React.useEffect(() => {
    void load()
  }, [load])

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
      setOutcome(null)
      setEmailTarget(null)
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

  /**
   * « Il a répondu » — libère une séquence garée sur une attente-réponse.
   *
   * DÉLIBÉRÉMENT SÉPARÉ des cinq issues « le prospect a réagi », qui stoppent
   * toutes la séquence. Répondre « oui, c'est bien nous » au premier message
   * WhatsApp n'est pas montrer de l'intérêt pour l'offre : c'est ce qui autorise
   * l'envoi du site. Le confondre avec « m'a rappelé » couperait justement les
   * étapes qu'on cherche à enchaîner.
   */
  const declarerReponse = React.useCallback(
    async (rowId: string, enrollmentId: string) => {
      setBusy(rowId)
      try {
        const res = await authedFetch(`/api/automations/enrollments/${enrollmentId}/reply`, { method: 'POST' })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload?.message || 'Reprise impossible')
          return
        }
        // Le demi-tour n'est pas le même geste qu'un déblocage, et le prospect a
        // reçu une relance de plus : le dire évite de croire que rien n'est parti.
        toast.success(
          payload?.rattrapage
            ? 'Demi-tour — la séquence repart sur la suite « il a répondu »'
            : 'Séquence reprise — étape suivante planifiée',
        )
        await load(true)
      } catch {
        toast.error('Action impossible')
      } finally {
        setBusy(null)
      }
    },
    [load],
  )

  const columns = board?.columns ?? []
  const tz = board?.regulator.timezone ?? 'Europe/Paris'
  const entryColumns = columns.filter((c) => c.group === 'entry')
  const sequenceColumns = columns.filter((c) => c.group === 'sequence')
  const pipelineColumns = columns.filter((c) => c.group === 'pipeline')
  const sequenceName = board?.sequences.find((s) => s.id === board?.selectedSequenceId)?.name ?? 'Séquence'
  const pipelineName = board?.pipelines.find((p) => p.id === board?.selectedPipelineId)?.nom ?? 'Pipeline'

  /** La partie affichée, telle que le serveur l'a tranchée. */
  const part: SequencePart = board?.selectedPart ?? filters.part ?? ALL_SEQUENCES
  const kind = partKind(part)
  const setPart = React.useCallback(
    (next: SequencePart) => setFilters((f) => (f.part === next ? f : { ...f, part: next, page: 0 })),
    [],
  )

  /**
   * Colonnes de séquence pas encore faites — celles qu'un raccourci fait sauter.
   *
   * Uniquement de VRAIES étapes : la colonne « en séquence » de la vue
   * d'ensemble n'en est pas une, l'enregistrer comme sautée barrerait une
   * colonne qui ne correspond à rien côté moteur.
   */
  const pendingSequenceColumns = React.useCallback(
    (row: SalesBoardRow) =>
      sequenceColumns
        .filter((c) => isStepColumn(c.id) && (row.cells[c.id] === 'active' || row.cells[c.id] === 'locked'))
        .map((c) => c.id),
    [sequenceColumns],
  )

  /** Les seules colonnes email encore à venir — celles que « passer à WhatsApp » barre. */
  const pendingEmailColumns = React.useCallback(
    (row: SalesBoardRow) =>
      sequenceColumns
        .filter(
          (c) => isStepColumn(c.id) && c.kind === 'email' && (row.cells[c.id] === 'active' || row.cells[c.id] === 'locked'),
        )
        .map((c) => c.id),
    [sequenceColumns],
  )

  const skipEmail = React.useCallback(
    async (row: SalesBoardRow) => {
      const ok = await post(
        'skip-email',
        { opportunite_id: row.id, skip_columns: pendingEmailColumns(row) },
        row.id,
      )
      if (ok) toast.success('Étape email sautée — au tour de WhatsApp.')
    },
    [post, pendingEmailColumns],
  )

  const saveEmail = React.useCallback(
    async (target: EmailTarget, email: string) => {
      const ok = await post('email', { opportunite_id: target.id, email }, target.id)
      if (ok) {
        toast.success(`Email enregistré sur la fiche de ${target.name}.`)
        setEmailTarget(null)
      }
      return ok
    },
    [post],
  )

  /* ── Actions de carte ──────────────────────────────────────────────────── */
  const handlers: SalesHandlers = {
    busy,
    onEnroll: (rows) => setModal({ type: 'seq', rows }),
    onQueue: () => setModal({ type: 'queue' }),
    onWork: (column, row) => void work(column, row),
    onValidate: (row, columnId) =>
      void post(
        'advance',
        { opportunite_id: row.id, stage: columnId },
        row.id,
        `${columns.find((c) => c.id === columnId)?.label ?? 'Étape'} validé`,
      ),
    onReact: (event, row) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      setPopover({ row, x: Math.min(rect.left, window.innerWidth - 280), y: rect.bottom + 6 })
    },
    onRevive: (row, columnId) =>
      void post('revive', { opportunite_id: row.id, stage: columnId }, row.id, 'Étape rouverte'),
    onOutcome: (row, column) => setOutcome({ row, column }),
    onVariant: (row, variant) =>
      void post(
        'variant',
        { opportunite_id: row.id, variant },
        row.id,
        variant
          ? `Version ${variant === 'contact' ? 'contact' : 'entreprise'} épinglée`
          : 'Version rendue au choix automatique',
      ),
    onSkipToDeal: (row) =>
      void post(
        'react',
        {
          opportunite_id: row.id,
          reaction: 'reply',
          reason: 'a déjà réagi — passage direct à la phase commerciale',
          skip_columns: pendingSequenceColumns(row),
        },
        row.id,
        'Envoyé en phase commerciale',
      ),
    onAddEmail: (row) =>
      setEmailTarget({ id: row.id, name: displayName(row), current: row.companyEmail ?? row.contact?.email ?? null }),
    onSkipEmail: (row) => void skipEmail(row),
  }

  /**
   * Le geste WhatsApp lui-même, une fois le destinataire et la version choisis.
   *
   * `wa.me` n'a pas d'API d'envoi : on ouvre la conversation pré-remplie et on
   * journalise au clic, pour que l'échange existe dans l'historique du prospect.
   * Le texte journalisé est CELUI qui a été montré — sans quoi le fil raconterait
   * une autre version que celle qui est partie.
   */
  async function envoyerWhatsApp(
    row: SalesBoardRow,
    arg: { numero: NumeroProspect; variant: MessageVariant; message: string },
  ) {
    const url = lienWhatsApp(arg.numero.e164, arg.message)
    if (!url) {
      toast.error('Ce numéro n’est pas exploitable sur WhatsApp.')
      return
    }
    setWaSend(null)
    window.open(url, '_blank')
    // Le contact du numéro composé, pas celui de l'affaire : on peut très bien
    // écrire au gérant alors que l'opportunité porte l'assistante.
    const contactId = arg.numero.origine.kind === 'contact' ? arg.numero.origine.contactId : null
    const nom = arg.numero.origine.kind === 'contact' ? arg.numero.origine.nom : row.companyName
    await authedFetch('/api/messages/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 'whatsapp',
        contact_id: contactId ?? row.contact?.id,
        entreprise_id: row.entrepriseId,
        opportunite_id: row.id,
        to_email: arg.numero.affichage,
        to_name: nom,
        subject: 'Message WhatsApp',
        body_text: arg.message,
      }),
    }).catch(() => {})
  }

  async function work(column: SalesColumn, row: SalesBoardRow) {
    if (column.group === 'sequence') {
      // Colonne « en séquence » de la vue d'ensemble : elle ne désigne aucune
      // étape précise — le seul geste honnête est d'ouvrir la séquence du
      // prospect, là où les étapes redeviennent comparables.
      if (!column.kind) {
        if (row.sequence) setPart(row.sequence.automationId)
        else toast.error('Ce prospect n’est sur aucune séquence')
        return
      }
      if (column.kind === 'email') {
        setModal({ type: 'queue' })
        return
      }
      if (column.kind === 'call') {
        window.location.href = isAgent ? '/espace-agent/telephonie/cockpit' : '/telephonie/softphone'
        return
      }
      if (column.kind === 'linkedin') {
        const task = row.tasks.find((t) => t.kind === 'linkedin')
        if (task?.linkedin) window.open(task.linkedin, '_blank')
        else toast.error('Aucun profil LinkedIn connu')
        return
      }
      // WhatsApp : on passe par l'écran d'envoi. Il montre les numéros connus
      // du prospect avec leur origine, les deux versions du message, et n'ouvre
      // `wa.me` qu'avec ce qui est affiché — le sélecteur de version épinglait
      // jusqu'ici un réglage dont l'effet ne se voyait qu'au message suivant.
      setWaSend(row.id)
      return
    }

    // Colonnes de pipeline : on renvoie vers l'outil qui fait le travail.
    const name = column.label.toLowerCase()
    if (name.includes('rdv') || name.includes('rendez')) {
      window.location.href = isAgent ? '/espace-agent/rendez-vous' : '/rendez-vous'
      return
    }
    if (row.entrepriseId != null) {
      window.location.href = isAgent
        ? `/espace-agent/entreprises/${row.entrepriseId}`
        : `/companies/${row.entrepriseId}`
    }
  }

  /* ── Rendu ─────────────────────────────────────────────────────────────── */
  const rows = board?.rows ?? []
  const pages = board ? Math.max(1, Math.ceil(board.total / board.perPage)) : 1
  const nextSendIn = board?.regulator.nextSendAt ? Date.parse(board.regulator.nextSendAt) - now : null
  const selected = rows.filter((r) => selection.has(r.id))
  // Relue à chaque rendu : après une épingle, la modale doit montrer l'état
  // rechargé, pas celui capturé à l'ouverture.
  const waSendRow = waSend ? (rows.find((r) => r.id === waSend) ?? null) : null
  /** Ceux de la page qu'on peut encore mettre en séquence. */
  const enrollable = rows.filter((r) => !r.sequence)
  const stockCount = board?.partCounts.noSequence ?? 0

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
            À gauche, ce que <em>la séquence</em> fait toute seule. À droite, ce que <em>vous</em> faites une fois le
            prospect en face. Vous n’intervenez que quand il réagit.
          </div>
        </div>
        <div className="topbar-actions">
          {!isAgent && (
            <Link href="/automations/regulateur" className="btn sm">
              <Bolt className="ico-sm" />
              Réglages du régulateur
            </Link>
          )}
          {/* Dans une séquence, tout le monde est déjà inscrit : proposer « mettre
              en séquence » y offrirait un bouton sans matière. On renvoie au
              stock, qui est l'endroit d'où on lance. */}
          {enrollable.length === 0 && kind === 'one' ? (
            <button className="btn sm" onClick={() => setPart(NO_SEQUENCE)} disabled={loading}>
              <Inbox className="ico-sm" />
              Stock à démarcher
              <span className="ct">{stockCount}</span>
            </button>
          ) : (
            <button
              className="btn accent sm"
              onClick={() => setModal({ type: 'seq', rows: enrollable })}
              disabled={loading || enrollable.length === 0}
            >
              <Layers className="ico-sm" />
              Mettre en séquence
              <span className="ct">{enrollable.length}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Onglets : quelle partie du tableau ? ─────────────────────────── */}
      {board && (
        <PartTabs
          board={board}
          part={part}
          onPick={(next) => {
            setPart(next)
            setSelection(new Set())
          }}
        />
      )}

      {/* ── Barre régulateur ────────────────────────────────────────────── */}
      {board && (
        <button className="regbar" onClick={() => setModal({ type: 'queue' })}>
          <span className="rb-k">
            <Bolt className="ico-sm" />
            Régulateur
          </span>
          {board.regulator.testMode ? (
            <span className="rb-main warn">
              <Bolt className="ico-sm" />
              Phase de test — rien ne part vers un vrai prospect
            </span>
          ) : board.regulator.paused ? (
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
          {board.regulator.openWindows.length > 0 && (
            <span className="rb-s g">
              plages {board.regulator.openWindows.map((w) => `${formatHM(w[0])}–${formatHM(w[1])}`).join(' · ')}
            </span>
          )}
          <span className="rb-now mono">{hm(now, tz)}</span>
        </button>
      )}

      {/* ── Alerte « sans email » ────────────────────────────────────────
          Une entreprise sans adresse ne reçoit rien et n'entre pas dans la
          file : mieux vaut le savoir avant de compter sur l'étape email. */}
      {board && board.counts.missingEmail > 0 && (
        <div className="mailalert">
          <AlertTriangle className="ico-sm" />
          <span>
            <b>{board.counts.missingEmail}</b> entreprise{board.counts.missingEmail > 1 ? 's' : ''} sans email
          </span>
          <span className="txt">
            {board.sequenceHasEmailStep
              ? 'aucun envoi n’est préparé pour elles — saisissez l’adresse, ou sautez l’étape email.'
              : kind === 'none'
                ? 'pas encore en séquence — l’adresse manquera dès le premier envoi.'
                : 'la séquence affichée n’a pas d’étape email : elles ne sont pas bloquées.'}
          </span>
          <button className="btn sm" onClick={() => setModal({ type: 'missing' })}>
            <MailPlus className="ico-sm" />
            Traiter
            <span className="ct">{board.counts.missingEmail}</span>
          </button>
        </div>
      )}

      {/* ── Barre d'outils ──────────────────────────────────────────────── */}
      <div className="toolbar">
        <div className="search">
          <Search className="ico-sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Entreprise, contact, ville…" />
        </div>

        {/* La source des colonnes de droite. Celle de gauche — la séquence — se
            choisit dans les onglets, au-dessus. */}
        <span className="tb-lb">Pipeline</span>
        <select
          className="mp-select"
          value={board?.selectedPipelineId ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, pipelineId: e.target.value, page: 0 }))}
        >
          {(board?.pipelines ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>

        <div className="tb-div" />
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

        {!isAgent && (board?.agents.length ?? 0) > 0 && (
          <>
            <div className="tb-div" />
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
                  className={'av-btn' + (filters.view === agent.id ? ' sel' : filters.view !== 'all' ? ' dim' : '')}
                  title={agent.name}
                  onClick={() => setFilters((f) => ({ ...f, view: f.view === agent.id ? 'all' : agent.id, page: 0 }))}
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
            <span className="l">en négo</span>
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
        <div className="matrix" style={{ ['--ncol' as string]: Math.max(1, columns.length) }}>
          {/* Bandeaux de groupe : on voit d'un coup d'œil ce qui est piloté par
              l'automatisation et ce qui relève du commercial. */}
          <div className="mx-gcorner" />
          {/* La colonne d'entrée n'a pas besoin d'un titre de groupe : son
              en-tête le dit déjà. La cellule sert à compléter la rangée. */}
          {entryColumns.length > 0 && (
            <div className="mx-group entry" style={{ gridColumn: `span ${entryColumns.length}` }} />
          )}
          {sequenceColumns.length > 0 && (
            <div
              className="mx-group seq"
              style={{ gridColumn: `span ${sequenceColumns.length}`, ['--gc' as string]: SEQUENCE_TINT }}
            >
              <Layers className="ico-xs" />
              {kind === 'one' ? `Séquence · ${sequenceName}` : 'Toutes séquences'}
              {/* Une seule colonne en vue d'ensemble : le libellé la remplit
                  déjà, un complément ne ferait que se faire couper. */}
              {kind === 'one' && <span className="n">{sequenceColumns.length} étapes automatisées</span>}
            </div>
          )}
          {pipelineColumns.length > 0 && (
            <div className="mx-group" style={{ gridColumn: `span ${pipelineColumns.length}` }}>
              <Building2 className="ico-xs" />
              Pipeline · {pipelineName}
              <span className="n">reprise du commercial</span>
            </div>
          )}

          <div className="mx-corner">
            <div className="t">
              {board?.total ?? 0} prospect{(board?.total ?? 0) > 1 ? 's' : ''}
            </div>
            <div className="s">
              page {(board?.page ?? 0) + 1}/{pages}
            </div>
          </div>
          {columns.map((column, i) => (
            <ColumnHead key={column.id} column={column} index={i} counts={board?.columnCounts[column.id]} />
          ))}

          {rows.map((row) => (
            <React.Fragment key={row.id}>
              <RowHead
                row={row}
                columns={columns}
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
                onAddEmail={() => handlers.onAddEmail(row)}
                onMore={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setRowMenu({
                    row,
                    x: Math.min(rect.left, window.innerWidth - 280),
                    y: rect.bottom + 6,
                  })
                }}
              />
              {columns.map((column) => (
                <SalesCell key={column.id} row={row} column={column} now={now} timezone={tz} handlers={handlers} />
              ))}
            </React.Fragment>
          ))}

          {rows.length === 0 && (
            <div className="empty">
              <Search />
              <div className="t">
                {loading
                  ? 'Chargement…'
                  : kind === 'one'
                    ? 'Personne sur cette séquence'
                    : kind === 'none'
                      ? 'Plus rien à démarcher'
                      : 'Aucun prospect'}
              </div>
              <div className="s">
                {kind === 'one'
                  ? 'Les autres prospects sont sous un autre onglet — ou dans le stock à démarcher.'
                  : 'Changez d’onglet, de pipeline, ou videz la recherche.'}
              </div>
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
              {/* « Il a répondu » fait CONTINUER la séquence. Les cinq issues du
                  dessous l'arrêtent toutes — il fallait donc les séparer
                  visiblement, pas les mélanger.

                  Deux cas l'ouvrent : l'inscription est garée sur une attente,
                  ou la relance est DÉJÀ partie et il répond quand même — le cas
                  le plus fréquent, puisque c'est elle qui l'a réveillé. Le
                  second ramène l'inscription sur la voie de la conversation au
                  lieu de la laisser dérouler des relances. */}
              {(() => {
                const seq = popover.row.sequence
                const attend = seq?.holdReason === 'awaiting_reply'
                const rattrapage = !attend && !!seq?.rattrapageReponse
                if (!seq?.enrollmentId || (!attend && !rattrapage)) return null
                return (
                  <>
                    <div className="ph">
                      {attend ? 'La séquence attend une réponse' : 'La relance est partie — il a répondu depuis ?'}
                    </div>
                    <button
                      className="pop-item"
                      onClick={() => {
                        const row = popover.row
                        const enrollmentId = row.sequence?.enrollmentId
                        setPopover(null)
                        if (enrollmentId) void declarerReponse(row.id, enrollmentId)
                      }}
                    >
                      <span className="ri ok">
                        <Check className="ico-sm" />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="l">Il a répondu</span>
                        <span className="sn">
                          {attend
                            ? '→ on continue · étape suivante planifiée'
                            : '→ demi-tour vers la suite « il a répondu »'}
                        </span>
                      </span>
                    </button>
                    <div className="ph">Ou bien : le prospect a réagi</div>
                  </>
                )
              })()}
              {popover.row.sequence?.holdReason !== 'awaiting_reply' &&
                !popover.row.sequence?.rattrapageReponse && <div className="ph">Le prospect a réagi</div>}
              {SALES_REACTIONS.map((r) => (
                <button
                  key={r.id}
                  className={'pop-item' + (r.tone === 'danger' ? ' danger' : '')}
                  onClick={() => {
                    const row = popover.row
                    setPopover(null)
                    if (r.id === 'later' || r.id === 'no' || r.id === 'bad') {
                      setReaction({ row, id: r.id })
                      return
                    }
                    void post(
                      'react',
                      { opportunite_id: row.id, reaction: r.id, skip_columns: pendingSequenceColumns(row) },
                      row.id,
                      r.note,
                    )
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

      {/* ── Menu ⋮ d'une ligne ──────────────────────────────────────────── */}
      {rowMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div className="mp-scope-pop-scrim" onClick={() => setRowMenu(null)} />
            <div className="mp-scope-pop" style={{ left: rowMenu.x, top: rowMenu.y, minWidth: 232 }}>
              <div className="ph">{displayName(rowMenu.row)}</div>
              {rowMenu.row.entrepriseId != null && (
                <Link
                  className="pop-item"
                  href={
                    isAgent
                      ? `/espace-agent/entreprises/${rowMenu.row.entrepriseId}`
                      : `/companies/${rowMenu.row.entrepriseId}`
                  }
                  onClick={() => setRowMenu(null)}
                >
                  <Building2 className="ico-sm" />
                  Ouvrir la fiche entreprise
                </Link>
              )}
              <div className="pop-sep" />
              {rowMenu.row.archive ? (
                <button
                  className="pop-item"
                  onClick={() => {
                    const row = rowMenu.row
                    setRowMenu(null)
                    setArchiveTarget({
                      kind: 'opportunite',
                      entrepriseIds: [],
                      opportunityIds: [row.id],
                      label: displayName(row),
                      currentReason: row.archive?.reason ?? 'autre',
                      currentNote: row.archive?.note ?? null,
                    })
                  }}
                >
                  <ArchiveRestore className="ico-sm" />
                  Désarchiver
                </button>
              ) : (
                <>
                  <button
                    className="pop-item danger"
                    onClick={() => {
                      const row = rowMenu.row
                      setRowMenu(null)
                      setArchiveTarget({
                        kind: 'opportunite',
                        entrepriseIds: [],
                        opportunityIds: [row.id],
                        label: displayName(row),
                      })
                    }}
                  >
                    <Archive className="ico-sm" />
                    Archiver l’opportunité…
                  </button>
                  {rowMenu.row.entrepriseId != null && (
                    <button
                      className="pop-item danger"
                      onClick={() => {
                        const row = rowMenu.row
                        setRowMenu(null)
                        setArchiveTarget({
                          kind: 'entreprise',
                          entrepriseIds: [row.entrepriseId as number],
                          opportunityIds: [],
                          label: displayName(row),
                        })
                      }}
                    >
                      <Archive className="ico-sm" />
                      Archiver l’entreprise…
                    </button>
                  )}
                </>
              )}
            </div>
          </>,
          document.body,
        )}

      <ArchiveDialog
        target={archiveTarget}
        apiBase={isAgent ? '/api/agent/archive' : '/api/archive'}
        onClose={() => setArchiveTarget(null)}
        onDone={() => void load(true)}
      />

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      {waSendRow && (
        <EnvoiWhatsAppDialog
          row={waSendRow}
          task={waSendRow.tasks.find((t) => t.kind === 'whatsapp') ?? waSendRow.tasks[0]}
          pinned={waSendRow.sequence?.variant ?? null}
          busy={busy === waSendRow.id}
          onClose={() => setWaSend(null)}
          onSend={(arg) => void envoyerWhatsApp(waSendRow, arg)}
          onPin={(v) => handlers.onVariant(waSendRow, v)}
        />
      )}

      {reaction && (
        <ReactionDialog
          row={reaction.row}
          reaction={reaction.id}
          busy={busy === reaction.row.id}
          onClose={() => setReaction(null)}
          onSubmit={async (body) => {
            const ok = await post(
              'react',
              { opportunite_id: reaction.row.id, skip_columns: pendingSequenceColumns(reaction.row), ...body },
              reaction.row.id,
              'Enregistré',
            )
            if (ok) setReaction(null)
          }}
        />
      )}

      {outcome && (
        <OutcomeDialog
          row={outcome.row}
          column={outcome.column}
          busy={busy === outcome.row.id}
          onClose={() => setOutcome(null)}
          onSubmit={async (body) => {
            const ok = await post(
              'outcome',
              {
                opportunite_id: outcome.row.id,
                // L'étape vient de la COLONNE, pas de l'inscription : on note la
                // réponse à CE message-là, même si la séquence a déjà avancé.
                step_id: columnStepId(outcome.column) ?? undefined,
                column_id: outcome.column.id,
                channel: outcome.column.kind ?? undefined,
                // Une issue qui arrête la ligne barre les étapes non faites —
                // sans quoi elles resteraient « à faire » sur un prospect clos.
                skip_columns: pendingSequenceColumns(outcome.row),
                ...body,
              },
              outcome.row.id,
              'Réponse enregistrée',
            )
            if (ok) setOutcome(null)
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
              const skipped = (payload.results ?? []).filter((r: { status: string }) => r.status !== 'enrolled').length
              toast.success(
                `${enrolled} prospect${enrolled > 1 ? 's' : ''} mis en séquence` +
                  (skipped > 0 ? ` · ${skipped} ignoré${skipped > 1 ? 's' : ''}` : ''),
              )
              setSelection(new Set())
              setModal(null)
              // Ils viennent de quitter le stock : on suit le mouvement plutôt
              // que de les laisser disparaître de l'onglet qu'on regardait.
              if (enrolled > 0 && kind !== 'one') setPart(automationId)
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

      {modal?.type === 'missing' && board && (
        <MissingEmailDrawer
          rows={board.missingEmail}
          total={board.counts.missingEmail}
          hasEmailStep={board.sequenceHasEmailStep}
          agentMode={isAgent}
          busy={busy}
          onClose={() => setModal(null)}
          onAddEmail={(entry) => setEmailTarget({ id: entry.id, name: entry.companyName, current: null })}
          onSkipEmail={(entry) => {
            const row = rows.find((r) => r.id === entry.id)
            if (row) void skipEmail(row)
            else void post('skip-email', { opportunite_id: entry.id }, entry.id, 'Étape email sautée')
          }}
        />
      )}

      {emailTarget && (
        <EmailDialog
          target={emailTarget}
          busy={busy === emailTarget.id}
          onClose={() => setEmailTarget(null)}
          onSubmit={(email) => saveEmail(emailTarget, email)}
        />
      )}
    </div>
  )
}

/* ── Onglets de partie ─────────────────────────────────────────────────── */

/**
 * Le sélecteur de partie : une séquence, le stock, ou la vue d'ensemble.
 *
 * C'est la navigation principale du tableau, pas un filtre de plus — d'où les
 * onglets plutôt qu'une liste déroulante. Chaque onglet porte le nombre de
 * prospects qu'il montrera : on voit du même coup d'œil que rien n'est perdu,
 * seulement rangé ailleurs.
 */
function PartTabs({
  board,
  part,
  onPick,
}: {
  board: SalesBoardData
  part: SequencePart
  onPick: (next: SequencePart) => void
}) {
  // Ordre STABLE : les actives d'abord, puis par nom. Trier par volume ferait
  // danser les onglets à chaque rafraîchissement.
  const sequences = React.useMemo(
    () =>
      [...board.sequences].sort((a, b) =>
        (a.status === 'on') === (b.status === 'on')
          ? a.name.localeCompare(b.name, 'fr')
          : a.status === 'on'
            ? -1
            : 1,
      ),
    [board.sequences],
  )
  const kind = partKind(part)
  const steps = board.columns.filter((c) => c.group === 'sequence').length

  return (
    <div className="parts">
      <span className="tb-lb">Séquence</span>
      <div className="part-row">
        {sequences.map((s) => (
          <button
            key={s.id}
            className={'part' + (part === s.id ? ' on' : '') + (s.status !== 'on' ? ' off' : '')}
            onClick={() => onPick(s.id)}
            title={`${s.steps.length} étapes · ${s.activeEnrollments} inscriptions actives`}
          >
            <i style={{ background: colorForId(s.id) }} />
            <span className="nm">{s.name}</span>
            {s.status !== 'on' && <Pause className="ico-xs" />}
            <span className="ct">{board.partCounts.sequences[s.id] ?? 0}</span>
          </button>
        ))}
        <button
          className={'part alt' + (part === NO_SEQUENCE ? ' on' : '')}
          onClick={() => onPick(NO_SEQUENCE)}
          title="Les prospects qui ne sont sur aucune séquence"
        >
          <Inbox className="ico-xs" />
          <span className="nm">À démarcher</span>
          <span className="ct">{board.partCounts.noSequence}</span>
        </button>
        <button
          className={'part alt' + (part === ALL_SEQUENCES ? ' on' : '')}
          onClick={() => onPick(ALL_SEQUENCES)}
          title="Tout le monde, sans le détail des étapes"
        >
          <Layers className="ico-xs" />
          <span className="nm">Vue d’ensemble</span>
          <span className="ct">{board.partCounts.all}</span>
        </button>
      </div>
      <span className="parts-hint">
        {/* Une séquence qu'on ne vous a pas ouverte n'est pas une séquence
            absente : le dire évite d'aller la chercher dans les filtres. */}
        {board.sequenceAcces?.restreint && board.sequenceAcces.masquees > 0
          ? `${board.sequenceAcces.masquees} séquence${board.sequenceAcces.masquees > 1 ? 's' : ''} ne vous ${board.sequenceAcces.masquees > 1 ? 'sont' : 'est'} pas ouverte${board.sequenceAcces.masquees > 1 ? 's' : ''} — demandez-les à l’admin`
          : kind === 'one'
            ? `${steps} colonne${steps > 1 ? 's' : ''} : les étapes de cette séquence`
            : kind === 'none'
              ? 'jamais mis en séquence — c’est d’ici qu’on lance'
              : 'toutes séquences mêlées : leurs étapes ne sont pas comparables, choisissez-en une pour les voir'}
      </span>
    </div>
  )
}

/* ── En-tête de colonne ────────────────────────────────────────────────── */

function ColumnHead({
  column,
  index,
  counts,
}: {
  column: SalesColumn
  index: number
  counts?: { active: number; done: number }
}) {
  const Icon = columnIcon(column)
  const groupClass =
    column.group === 'sequence' ? ' in-seq' : column.group === 'entry' ? ' in-entry' : ''
  return (
    <div className={'mx-colhead' + groupClass}>
      <div className="hd">
        <span className="sw" style={{ background: rgba(column.color, 0.12), color: column.color }}>
          <Icon className="ico" />
        </span>
        <span className="nm">{column.label}</span>
        <span className="idx">{column.hint ?? String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="meta">
        <b style={{ color: column.color }}>{counts?.active ?? 0}</b>
        {column.group === 'entry' ? ' en attente' : ' en cours'} · {counts?.done ?? 0} faites
        <span className="mode">
          {column.group === 'entry'
            ? 'stock'
            : // Vue d'ensemble : la colonne mêle des étapes automatiques et des
              // tâches à la main — annoncer « auto » serait faux.
              column.group === 'sequence' && !column.kind
              ? 'séquences'
              : column.mode === 'auto'
                ? 'auto'
                : column.mode === 'manual'
                  ? 'tâche'
                  : 'manuel'}
        </span>
      </div>
    </div>
  )
}

/* ── En-tête de ligne ──────────────────────────────────────────────────── */

function RowHead({
  row,
  columns,
  selected,
  agentMode,
  now,
  timezone,
  onToggle,
  onReact,
  onAddEmail,
  onMore,
}: {
  row: SalesBoardRow
  columns: SalesColumn[]
  selected: boolean
  agentMode: boolean
  now: number
  timezone: string
  onToggle: () => void
  onReact: (e: React.MouseEvent) => void
  onAddEmail: () => void
  onMore: (e: React.MouseEvent) => void
}) {
  const doneCount = columns.filter((c) => row.cells[c.id] === 'done').length
  const statusLabel =
    row.state.state === 'won'
      ? 'Signé'
      : row.state.state === 'lost'
        ? 'Perdu'
        : row.state.state === 'black'
          ? 'Blacklisté'
          : row.state.state === 'nurt'
            ? `À recontacter${row.state.nurtureAt ? ` ${new Date(row.state.nurtureAt).toLocaleDateString('fr-FR')}` : ''}`
            : `${doneCount}/${columns.length} étapes`
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
        <button className="rh-more" onClick={onMore} title="Options">
          <MoreVertical className="ico-sm" />
        </button>
      </div>

      <div>
        <div className="rail">
          {columns.map((column) => {
            const status = row.cells[column.id]
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
            return <i key={column.id} className={cls} style={{ ['--seg' as string]: column.color }} />
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

      {/* L'étape réelle du pipeline, visible même pendant la séquence. */}
      {row.stageName && (
        <div className="rh-stage" title="Étape actuelle dans le pipeline">
          <Building2 className="ico-xs" />
          {row.stageName}
        </div>
      )}

      {/* Le drapeau « sans email » vit sur la ligne, pas seulement sur la
          cellule email : on le voit quelle que soit l'étape atteinte. */}
      {row.emailMissing && (
        <button className="rh-flag" onClick={onAddEmail} title="Ajouter l’email de cette entreprise">
          <Mail className="ico-xs" />
          Sans email — ajouter
        </button>
      )}

      {row.sequence ? (
        <div className="rh-seq" style={{ ['--sc' as string]: colorForId(row.sequence.automationId) }}>
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
  const [picked, setPicked] = React.useState<string | null>(
    board.selectedSequenceId && live.some((s) => s.id === board.selectedSequenceId)
      ? board.selectedSequenceId
      : (live[0]?.id ?? null),
  )
  const sequence = board.sequences.find((s) => s.id === picked) ?? null

  const manualSteps = sequence?.steps.filter((s) => s.kind !== 'email' && s.kind !== 'wait').length ?? 0
  const lastSlot = board.queue.filter((q) => q.sendAt).slice(-1)[0]
  const firstEta = lastSlot?.sendAt ?? board.regulator.nextSendAt
  // Ce que la séquence ne pourra pas faire, dit AVANT de la lancer.
  const noEmail = rows.filter((r) => r.emailMissing).length
  const sequenceEmails = sequence?.steps.filter((s) => s.kind === 'email').length ?? 0

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="sw" style={{ background: rgba(SEQUENCE_TINT, 0.12), color: SEQUENCE_TINT }}>
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
                {board.sequenceAcces?.restreint ? (
                  <>
                    <div className="t">Aucune séquence ne vous est ouverte</div>
                    <div className="s">
                      L’admin décide, séquence par séquence, qui peut la lancer. Demandez-lui l’accès
                      à celles dont vous avez besoin.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="t">Aucune séquence</div>
                    <div className="s">Créez-en une dans Automatisations.</div>
                  </>
                )}
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
                    <i style={{ background: colorForId(s.id) }} />
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
                    const channel = channelOf(step.kind)
                    const Icon = KIND_ICON[step.kind] ?? Mail
                    const auto = step.kind === 'email' || step.kind === 'wait'
                    return (
                      <div key={`${step.id}-${i}`} className="step">
                        <span className="d">{step.day > 0 ? `J+${step.day}` : 'J+0'}</span>
                        <span className="ki" style={{ background: rgba(channel.color, 0.12), color: channel.color }}>
                          <Icon className="ico-sm" />
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span className="n">{step.label}</span>
                          <span className="s" style={{ color: 'var(--text-3)', fontSize: 10.5 }}>
                            {channel.label}
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

                {/* Les conséquences annoncées AVANT de valider : c'est ce qui
                    remplace la confiance aveugle dans l'automatisation. */}
                <div className="sd-note">
                  <div>
                    <Bolt className="ico-sm" />
                    <span>
                      {board.regulator.testMode ? (
                        <>
                          <b>Phase de test active</b> — sauf vers une adresse de test, rien ne part et la séquence
                          reste gelée à son étape : ces prospects ne bougeront pas de colonne.
                        </>
                      ) : (
                        <>
                          1<sup>er</sup> email placé en file — départ estimé <b>{hmd(firstEta, now, timezone)}</b>
                          {rows.length > 1
                            ? `, puis les suivants espacés de ${board.regulator.gapMinMinutes} à ${board.regulator.gapMaxMinutes} min.`
                            : '.'}
                        </>
                      )}
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
                  {noEmail > 0 && sequenceEmails > 0 && (
                    <div style={{ color: 'var(--danger)' }}>
                      <AlertTriangle className="ico-sm" />
                      <span>
                        <b>
                          {noEmail} entreprise{noEmail > 1 ? 's' : ''} sans email
                        </b>{' '}
                        — aucun envoi ne sera préparé pour {noEmail > 1 ? 'elles' : 'elle'} : la séquence s’arrêtera à
                        l’étape email tant que l’adresse manque.
                      </span>
                    </div>
                  )}
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
          <span className="sw" style={{ background: rgba('#0E93A6', 0.12), color: '#0E93A6' }}>
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
          {board.regulator.testMode && (
            <div className="dr-row" style={{ color: 'var(--warn)', fontWeight: 500 }}>
              <span className="k" style={{ color: 'inherit' }}>
                Phase de test
              </span>
              <span className="v" style={{ color: 'inherit' }}>
                seules les adresses de test reçoivent · les autres sont gelés
              </span>
            </div>
          )}
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

/* ── Tiroir « sans email » ─────────────────────────────────────────────── */

/**
 * La liste complète des prospects qu'aucun email ne peut atteindre, avec les
 * deux seules sorties : saisir l'adresse, ou sauter l'étape pour enchaîner sur
 * WhatsApp. Elle porte sur tout le périmètre filtré, pas sur la page courante —
 * c'est un compteur qu'on veut voir tomber à zéro.
 */
function MissingEmailDrawer({
  rows,
  total,
  hasEmailStep,
  agentMode,
  busy,
  onClose,
  onAddEmail,
  onSkipEmail,
}: {
  rows: SalesMissingEmailRow[]
  total: number
  hasEmailStep: boolean
  agentMode: boolean
  busy: string | null
  onClose: () => void
  onAddEmail: (entry: SalesMissingEmailRow) => void
  onSkipEmail: (entry: SalesMissingEmailRow) => void
}) {
  const blocked = rows.filter((r) => r.onEmailStep).length

  return (
    <div className="modal-scrim right" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="sw" style={{ background: rgba('#B5322F', 0.12), color: '#B5322F' }}>
            <AlertTriangle className="ico" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">Entreprises sans email</div>
            <div className="ms">
              {total} au total{blocked > 0 ? ` · ${blocked} arrêtée${blocked > 1 ? 's' : ''} sur l’étape email` : ''}
            </div>
          </div>
          <button className="rh-more" onClick={onClose} aria-label="Fermer">
            <X className="ico-sm" />
          </button>
        </div>

        <div className="dr-set">
          <div className="dr-row">
            <span className="k">Dans la file d’envoi</span>
            <span className="v">aucune — rien n’est préparé pour elles</span>
          </div>
          <div className="dr-row">
            <span className="k">Où va l’adresse saisie</span>
            <span className="v">fiche entreprise, comme toutes les autres</span>
          </div>
          {!hasEmailStep && (
            <div className="dr-row" style={{ color: 'var(--text-3)' }}>
              <span className="k" style={{ color: 'inherit' }}>
                Séquence affichée
              </span>
              <span className="v" style={{ color: 'inherit' }}>
                sans étape email — rien n’est bloqué
              </span>
            </div>
          )}
        </div>

        <div className="dr-queue">
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>
              <div className="t">Rien à corriger</div>
              <div className="s">Tous les prospects du filtre ont une adresse.</div>
            </div>
          ) : (
            rows.map((entry) => (
              <div className="me-row" key={entry.id}>
                <span className="rh-logo" style={{ background: colorForId(entry.id) }}>
                  {initialsOf(entry.companyName)}
                </span>
                <span className="who">
                  <span className="nm">{entry.companyName}</span>
                  <span className="sn">
                    {entry.contactName || 'Sans contact'}
                    {entry.sequenceName ? ` · ${entry.sequenceName}` : ' · pas en séquence'}
                    {entry.onEmailStep ? ' · bloquée' : ''}
                  </span>
                </span>
                <span className="acts">
                  <button className="btn accent sm" disabled={busy === entry.id} onClick={() => onAddEmail(entry)}>
                    <MailPlus className="ico-sm" />
                    Email
                  </button>
                  {entry.sequenceName && (
                    <button
                      className="btn sm"
                      disabled={busy === entry.id}
                      title="Sauter l’étape email et passer à WhatsApp"
                      onClick={() => onSkipEmail(entry)}
                    >
                      <ChevronsRight className="ico-sm" />
                      WhatsApp
                    </button>
                  )}
                  {entry.entrepriseId != null && (
                    <Link
                      className="btn ghost sm icon"
                      href={
                        agentMode
                          ? `/espace-agent/entreprises/${entry.entrepriseId}`
                          : `/companies/${entry.entrepriseId}`
                      }
                      title="Ouvrir la fiche entreprise"
                    >
                      <Building2 className="ico-sm" />
                    </Link>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Saisie manuelle de l'adresse ──────────────────────────────────────── */

/**
 * L'adresse saisie ici part sur `entreprises.email` — la colonne où vivent déjà
 * toutes les autres adresses d'entreprise du CRM. Le moteur de séquence s'en
 * sert comme destinataire dès que le contact n'en a pas, donc l'envoi redevient
 * possible sans autre manipulation.
 */
function EmailDialog({
  target,
  busy,
  onClose,
  onSubmit,
}: {
  target: EmailTarget
  busy: boolean
  onClose: () => void
  onSubmit: (email: string) => void
}) {
  const [email, setEmail] = React.useState(target.current ?? '')
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const check = useAddressCheck(email, valid)

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="sw" style={{ background: rgba('#0E93A6', 0.12), color: '#0E93A6' }}>
            <MailPlus className="ico" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">Email de l’entreprise</div>
            <div className="ms">{target.name}</div>
          </div>
          <button className="rh-more" onClick={onClose} aria-label="Fermer">
            <X className="ico-sm" />
          </button>
        </div>

        <form
          className="react-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && !busy) onSubmit(email.trim())
          }}
        >
          <label>
            Adresse
            <input
              type="email"
              value={email}
              autoFocus
              placeholder="contact@entreprise.fr"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {/* Le verdict arrive pendant la saisie : découvrir au tick suivant
              qu'on vient de recopier une adresse morte serait une perte sèche. */}
          {check.state === 'checking' && (
            <p className="muted" style={{ fontSize: 11.5 }}>
              Vérification de l’adresse…
            </p>
          )}
          {check.state === 'done' && check.verdict && (
            <div className={`sp-verdict ${check.verdict.tone}`}>
              <span className="t">{check.verdict.label}</span>
              <span className="d">{check.verdict.reason}</span>
              {check.verdict.suggestion && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setEmail(check.verdict!.suggestion as string)}
                >
                  Vouliez-vous dire {check.verdict.suggestion} ?
                </button>
              )}
            </div>
          )}

          <p className="muted" style={{ fontSize: 11.5 }}>
            Enregistrée sur la fiche entreprise, au même endroit que toutes les autres adresses du CRM. La séquence
            reprend aussitôt : l’étape email repasse dans la file d’envoi.
          </p>
          <div className="modal-foot" style={{ margin: '0 -16px -14px', padding: '10px 16px' }}>
            <button className="btn ghost sm" type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="btn accent sm" type="submit" disabled={!valid || busy}>
              {/* Une adresse jugée morte reste enregistrable : c'est peut-être
                  la bonne et notre verdict qui se trompe. On prévient, on
                  n'interdit pas. */}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Vérification d'une adresse pendant la saisie ──────────────────────── */

type AddressVerdict = {
  tone: 'ok' | 'warn' | 'bad' | 'mute'
  label: string
  reason: string
  suggestion: string | null
}

const VERDICT_TONE: Record<string, AddressVerdict['tone']> = {
  valid: 'ok',
  risky: 'warn',
  invalid: 'bad',
  unknown: 'mute',
  pending: 'mute',
}

const VERDICT_LABEL: Record<string, string> = {
  valid: 'Adresse vérifiée',
  risky: 'Adresse douteuse',
  invalid: 'Adresse invalide',
  unknown: 'Verdict indisponible',
  pending: 'Vérification en attente',
}

/**
 * Vérifie l'adresse en cours de saisie, après une pause de frappe.
 *
 * La vérification tourne côté serveur (DNS, listes, historique de rebonds) et
 * rend son verdict en quelques centaines de millisecondes. La faire ici plutôt
 * qu'après l'enregistrement change tout : on peut corriger une faute de frappe
 * avant qu'elle ne gèle une séquence pendant deux heures.
 */
function useAddressCheck(email: string, valid: boolean) {
  const [state, setState] = React.useState<'idle' | 'checking' | 'done'>('idle')
  const [verdict, setVerdict] = React.useState<AddressVerdict | null>(null)

  React.useEffect(() => {
    if (!valid) {
      setState('idle')
      setVerdict(null)
      return
    }
    const address = email.trim()
    let cancelled = false
    setState('checking')

    // 600 ms : assez pour ne pas vérifier à chaque frappe, assez court pour que
    // le verdict soit là avant que le doigt n'atteigne « Enregistrer ».
    const timer = setTimeout(async () => {
      try {
        const res = await authedFetch('/api/email/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ emails: [address] }),
        })
        if (cancelled) return
        if (!res.ok) {
          setState('idle')
          return
        }
        const data = (await res.json()) as {
          results?: { status?: string; reason?: string; suggestion?: string | null }[]
        }
        const first = data.results?.[0]
        if (!first?.status) {
          setState('idle')
          return
        }
        setVerdict({
          tone: VERDICT_TONE[first.status] ?? 'mute',
          label: VERDICT_LABEL[first.status] ?? first.status,
          reason: first.reason ?? '',
          suggestion: first.suggestion ?? null,
        })
        setState('done')
      } catch {
        // Le vérificateur n'est pas une dépendance dure : sans lui, la saisie
        // fonctionne exactement comme avant.
        if (!cancelled) setState('idle')
      }
    }, 600)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [email, valid])

  return { state, verdict }
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
            Les emails encore planifiés pour ce prospect seront annulés, et ses tâches en attente marquées comme
            sautées.
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

/**
 * Ce que la personne a dit, et ce qu'on en fait.
 *
 * DEUX FAMILLES SÉPARÉES À L'ŒIL, parce que c'est la seule chose qui compte au
 * moment de cliquer : en haut ce qui laisse la ligne vivante, en bas ce qui
 * l'arrête et annule tout ce qui était encore planifié. Les mélanger ferait
 * stopper une séquence pour un « pas de réponse ».
 */
function OutcomeDialog({
  row,
  column,
  busy,
  onClose,
  onSubmit,
}: {
  row: SalesBoardRow
  column: SalesColumn
  busy: boolean
  onClose: () => void
  onSubmit: (body: { outcome: string; note?: string; nurture_at?: string }) => void
}) {
  const existing = (row.notes ?? []).find((n) => n.stepId === columnStepId(column)) ?? null
  const [outcome, setOutcome] = React.useState<string>(existing?.outcome ?? '')
  const [note, setNote] = React.useState(existing?.note ?? '')
  const [date, setDate] = React.useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const meta = STEP_OUTCOMES.find((o) => o.id === outcome) ?? null
  const valid = !!meta && (!meta.needsNote || note.trim().length > 0) && (!meta.needsDate || !!date)

  const groupe = (flow: 'continue' | 'stop') => STEP_OUTCOMES.filter((o) => o.flow === flow)

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <span className="sw" style={{ background: 'var(--bg-2)' }}>
            <MessageCircle className="ico-sm" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">Réponse — {column.label}</div>
            <div className="ms">{displayName(row)}</div>
          </div>
          <button className="rh-more" onClick={onClose} aria-label="Fermer">
            <X className="ico-sm" />
          </button>
        </div>

        <div className="react-form">
          {(['continue', 'stop'] as const).map((flow) => (
            <div key={flow}>
              <div className="sp-outcome-h">
                {flow === 'continue' ? 'On continue' : 'On arrête là'}
              </div>
              <div className="sp-outcome-grid">
                {groupe(flow).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={'sp-outcome ' + o.tone}
                    aria-pressed={outcome === o.id}
                    onClick={() => setOutcome(o.id)}
                  >
                    <span className="l">{o.label}</span>
                    <span className="s">{o.note}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {meta?.needsDate && (
            <label>
              Date de relance
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}

          <label>
            Ce que la personne a dit{meta?.needsNote ? '' : ' (facultatif)'}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Rappeler en septembre, le gérant est en congés. Intéressé par la démo mais veut voir le prix d’abord…"
            />
          </label>

          <p className="muted" style={{ fontSize: 11.5 }}>
            {meta?.flow === 'stop'
              ? 'Les envois encore planifiés seront annulés et les tâches en attente marquées comme sautées.'
              : 'La note rejoint le fil d’échanges de l’entreprise, à sa date, entre les messages qui l’encadrent.'}
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
                outcome,
                note: note.trim() || undefined,
                nurture_at: meta?.needsDate ? date : undefined,
              })
            }
          >
            Enregistrer
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

/** « auj. », « hier », « il y a 4 j ». */
function relativeDay(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'auj.'
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

// Les libellés vivent dans `@/lib/sales-pipeline/error-labels`, partagés avec le
// tableau marketing — qui appelle les mêmes routes et affichait leurs codes bruts.
