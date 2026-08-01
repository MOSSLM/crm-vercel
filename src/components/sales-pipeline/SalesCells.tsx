'use client'
// SalesCells — le contenu d'une cellule de la matrice, étape par étape.
//
// Sept états possibles par cellule : à venir (locked), en cours (active),
// faite (done), sautée (skip), perdue, blacklistée, à recontacter. La grammaire
// visuelle est celle du Marketing Pipeline : grisé = fait, blanc + ombré = en
// cours, pointillés = à venir.
import React from 'react'
import {
  AlertTriangle,
  Bolt,
  Building2,
  Calendar,
  Check,
  ChevronsRight,
  ClipboardCheck,
  Clock,
  Euro,
  FileText,
  Globe,
  Layers,
  Lock,
  Mail,
  MessageCircle,
  Pause,
  Phone,
  Play,
  Send,
  Slash,
  Target,
  TrendingUp,
  Undo2,
  User,
  type LucideIcon,
} from 'lucide-react'
import { SALES_STAGES, hasInterest, type SalesStageId, type SalesStageDef } from '@/lib/sales-pipeline/stages'
import { holdReasonLabel } from '@/lib/automations/regulator'
import { eta, hm, hmd } from '@/components/automations/regulator/parts'
import type { SalesBoardRow } from './types'

export const STAGE_ICON: Record<SalesStageId, LucideIcon> = {
  seq: Layers,
  email: Mail,
  wa: MessageCircle,
  call: Phone,
  rdv: Calendar,
  propo: FileText,
  nego: Target,
  signe: Euro,
}

const CTA_ICON: Record<SalesStageId, LucideIcon> = {
  seq: Layers,
  email: Bolt,
  wa: MessageCircle,
  call: Phone,
  rdv: Calendar,
  propo: Send,
  nego: TrendingUp,
  signe: Check,
}

export interface SalesHandlers {
  /** Ouvre la modale de mise en séquence pour ces lignes. */
  onEnroll: (rows: SalesBoardRow[]) => void
  /** Ouvre le tiroir de la file d'envoi. */
  onQueue: () => void
  /** CTA d'une étape : WhatsApp, cockpit d'appel, RDV, proposition… */
  onWork: (stage: SalesStageDef, row: SalesBoardRow) => void
  /** « Fait » / « Étape faite » / « Signé ». */
  onValidate: (row: SalesBoardRow, stage: SalesStageId) => void
  /** Ouvre le popover « le prospect a réagi ». */
  onReact: (event: React.MouseEvent, row: SalesBoardRow) => void
  /** Rouvre une étape sautée, ou remet la ligne en jeu. */
  onRevive: (row: SalesBoardRow, stage?: SalesStageId) => void
  /** Le prospect a déjà répondu : on saute directement au RDV. */
  onSkipToRdv: (row: SalesBoardRow) => void
  busy: string | null
}

export function rgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function eur(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${Math.round(value).toLocaleString('fr-FR')} €`
}

/** Résumé d'une étape franchie — ce que la carte grisée raconte. */
function doneSummary(stage: SalesStageDef, row: SalesBoardRow): string {
  switch (stage.id) {
    case 'seq':
      return row.sequence?.name ?? 'Inscrit en séquence'
    case 'email': {
      const n = row.emailsSent || 1
      return `${n} email${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''}`
    }
    case 'wa':
      return 'Message envoyé'
    case 'call':
      return row.state.replied ? 'Il a rappelé' : 'Appel passé'
    case 'rdv':
      return row.state.rdvAt ? `RDV du ${new Date(row.state.rdvAt).toLocaleDateString('fr-FR')}` : 'RDV tenu'
    case 'propo':
      return row.state.propoAmount ? `${eur(row.state.propoAmount)} envoyés` : 'Proposition envoyée'
    case 'nego':
      return row.state.objection ? `Levée : ${row.state.objection}` : 'Négociée'
    case 'signe':
      return `Signé · ${eur(row.montant)}`
    default:
      return 'Fait'
  }
}

function Signals({ row }: { row: SalesBoardRow }) {
  const items: string[] = []
  if (row.emailsSent > 0) items.push(`${row.emailsSent} envoyé${row.emailsSent > 1 ? 's' : ''}`)
  if (items.length === 0 && !row.state.replied) return null
  return (
    <div className="sigs">
      {items.map((t) => (
        <span key={t} className="sig">
          {t}
        </span>
      ))}
      {row.state.replied && <span className="sig hot">a réagi</span>}
    </div>
  )
}

/** Corps de la carte ACTIVE, étape par étape. */
function ActiveBody({
  stage,
  row,
  now,
  timezone,
}: {
  stage: SalesStageDef
  row: SalesBoardRow
  now: number
  timezone: string
}) {
  switch (stage.id) {
    case 'seq':
      return (
        <div className="c-body col">
          <div className="ctx">
            {row.demoUrl && (
              <span className="chip">
                <Globe className="ico-sm" />
                Démo prête
              </span>
            )}
            {row.auditReady && (
              <span className="chip">
                <ClipboardCheck className="ico-sm" />
                Audit prêt
              </span>
            )}
          </div>
          <div className="muted">
            {row.contact ? `${row.contact.name}${row.contact.role ? ` · ${row.contact.role}` : ''}` : 'Aucun contact'}
          </div>
        </div>
      )

    case 'email': {
      const seq = row.sequence
      if (!seq) return <div className="c-body col muted">Aucune séquence en cours.</div>
      if (seq.status === 'paused') {
        return (
          <div className="c-body col">
            <div className="hold">
              <Pause className="ico-sm" />
              Séquence en pause — reprise possible
            </div>
          </div>
        )
      }
      if (!seq.sendAt) {
        return (
          <div className="c-body col">
            <div className="eta wait">
              <span className="v">—:—</span>
              <span className="l">en attente</span>
            </div>
            <div className="why">
              <AlertTriangle className="ico-xs" />
              {holdReasonLabel(seq.holdReason) || 'en file'}
            </div>
            <div className="stepn">{seq.stepLabel}</div>
          </div>
        )
      }
      const remaining = Date.parse(seq.sendAt) - now
      return (
        <div className="c-body col">
          <div className="eta">
            <span className="v">{remaining > 0 ? eta(remaining) : 'imminent'}</span>
            <span className="l">départ {hmd(seq.sendAt, now, timezone)}</span>
          </div>
          <div className="stepn">{seq.stepLabel}</div>
          {seq.holdReason && (
            <div className="why">
              <Clock className="ico-xs" />
              {holdReasonLabel(seq.holdReason, Date.parse(seq.sendAt), timezone)}
            </div>
          )}
          {seq.rank === 0 && (
            <div className="why hot">
              <Bolt className="ico-xs" />
              en tête de file
            </div>
          )}
          <Signals row={row} />
        </div>
      )
    }

    case 'wa': {
      const task = row.tasks.find((t) => t.kind === 'whatsapp' || t.kind === 'linkedin')
      return (
        <div className="c-body col">
          <div className="taskrow">
            <span className="due">
              <Clock className="ico-xs" />à faire {task ? hm(task.dueAt, timezone) : '—:—'}
            </span>
            {row.sequence && (
              <span className="pill">
                étape {row.sequence.currentStep}/{row.sequence.totalSteps}
              </span>
            )}
          </div>
          <div className="msgbox">{task?.message || 'Message pré-rédigé par la séquence.'}</div>
          {task?.routingReason && (
            <span className="routed">
              <User className="ico-xs" />
              {task.routingReason}
            </span>
          )}
        </div>
      )
    }

    case 'call': {
      const task = row.tasks.find((t) => t.kind === 'call')
      return (
        <div className="c-body col">
          <div className="taskrow">
            <span className="due">
              <Clock className="ico-xs" />à faire {task ? hm(task.dueAt, timezone) : '—:—'}
            </span>
            {task?.scriptName && <span className="pill">{task.scriptName}</span>}
          </div>
          {row.phone ? (
            <a className="tel mono" href={`tel:${row.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()}>
              {row.phone}
            </a>
          ) : (
            <div className="muted">Aucun numéro connu</div>
          )}
          <div className="muted">{row.contact?.name ?? 'Contact inconnu'}</div>
        </div>
      )
    }

    case 'rdv':
      return (
        <div className="c-body col">
          <div className="muted">
            {row.state.replied ? 'Il a réagi — on cale le rendez-vous.' : 'Prospect contacté. Caler le créneau.'}
          </div>
          <Signals row={row} />
        </div>
      )

    case 'propo':
      return (
        <div className="c-body col">
          <div className="big">
            {eur(row.montant)}
            {row.type === 'mrr' && row.mrr ? <small> · {eur(row.mrr)}/mois</small> : null}
          </div>
          <div className="muted">
            {row.state.rdvAt
              ? `RDV du ${new Date(row.state.rdvAt).toLocaleDateString('fr-FR')} — proposition à envoyer`
              : 'Proposition à envoyer'}
          </div>
        </div>
      )

    case 'nego':
      return (
        <div className="c-body col">
          <div className="big">{eur(row.state.propoAmount ?? row.montant)}</div>
          {row.state.objection && (
            <div className="ctx">
              <span className="chip">
                <AlertTriangle className="ico-sm" />
                {row.state.objection}
              </span>
            </div>
          )}
          <div className="muted">Relance en cours.</div>
        </div>
      )

    case 'signe':
      return (
        <div className="c-body col">
          <div className="big">{eur(row.montant)}</div>
          <div className="muted">Négociation close — reste la signature.</div>
        </div>
      )

    default:
      return null
  }
}

export function SalesCell({
  row,
  stage,
  now,
  timezone,
  handlers,
}: {
  row: SalesBoardRow
  stage: SalesStageDef
  now: number
  timezone: string
  handlers: SalesHandlers
}) {
  const status = row.cells[stage.id]
  const seg = {
    ['--seg' as string]: stage.color,
    ['--seg-soft' as string]: rgba(stage.color, 0.22),
    ['--seg-wash' as string]: rgba(stage.color, 0.05),
  }
  const busy = handlers.busy === row.id
  const Icon = STAGE_ICON[stage.id]
  const CtaIcon = CTA_ICON[stage.id]

  if (status === 'locked') {
    return (
      <div className="mx-cell locked">
        <div className="locked-ph">
          <Lock />
          <span className="t">À venir</span>
        </div>
      </div>
    )
  }

  if (status === 'skip') {
    return (
      <div className="mx-cell" style={seg}>
        <div className="card is-skip">
          <div className="c-hd">
            <span className="skip-ic">
              <ChevronsRight />
            </span>
            <span className="c-ttl">Sauté</span>
          </div>
          <div className="c-body">{row.state.skipReason || 'Étape sautée.'}</div>
          <div className="done-foot">
            <button className="link-btn" disabled={busy} onClick={() => handlers.onRevive(row, stage.id)}>
              <Undo2 className="ico-sm" />
              Rouvrir
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'lost' || status === 'black') {
    const black = status === 'black'
    return (
      <div className="mx-cell" style={seg}>
        <div className="card is-rej">
          <div className="c-hd">
            <span className="c-dot" />
            <span className="c-ttl">{black ? 'Blacklisté' : 'Perdu'}</span>
            <span className="c-tag">
              <span className="pill danger">{black ? 'Exclu' : 'Clos'}</span>
            </span>
          </div>
          <div className="c-body">{row.state.stateReason || 'Pas donné suite.'}</div>
          <div className="c-foot" style={{ borderTop: 'none', paddingTop: 0 }}>
            <button className="btn subtle sm" disabled={busy} onClick={() => handlers.onRevive(row)}>
              <Undo2 className="ico-sm" />
              Réactiver
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'nurt') {
    return (
      <div className="mx-cell" style={seg}>
        <div className="card is-nurt">
          <div className="c-hd">
            <span className="c-dot" />
            <span className="c-ttl">À recontacter</span>
            {row.state.nurtureAt && (
              <span className="c-tag">
                <span className="pill warn">{new Date(row.state.nurtureAt).toLocaleDateString('fr-FR')}</span>
              </span>
            )}
          </div>
          <div className="c-body">{row.state.stateReason || 'Intéressé, mais plus tard.'}</div>
          <div className="c-foot" style={{ borderTop: 'none', paddingTop: 0 }}>
            <button className="btn subtle sm" disabled={busy} onClick={() => handlers.onRevive(row)}>
              <Play className="ico-sm" />
              Relancer maintenant
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="mx-cell done" style={seg}>
        <div className="card is-done">
          <div className="c-hd">
            <span className="done-check">
              <Check />
            </span>
            <span className="c-ttl">{stage.short}</span>
          </div>
          <div className="done-line">{doneSummary(stage, row)}</div>
          <div className="done-foot">
            <button className="link-btn" onClick={() => handlers.onWork(stage, row)}>
              <Icon className="ico-sm" />
              Voir
            </button>
            {row.state.stageDates[stage.id] && (
              <span className="done-date">
                {new Date(row.state.stageDates[stage.id] as string).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── active ────────────────────────────────────────────────────────────────
  // Une tâche WhatsApp ou un appel n'a plus lieu d'être si le prospect a déjà
  // réagi : on ne relance pas quelqu'un qui a répondu.
  if ((stage.id === 'wa' || stage.id === 'call') && hasInterest(row.state)) {
    return (
      <div className="mx-cell" style={seg}>
        <div className="card is-nn">
          <div className="c-hd">
            <span className="c-dot" />
            <span className="c-ttl">{stage.name}</span>
            <span className="c-tag">
              <span className="pill ok">Inutile</span>
            </span>
          </div>
          <div className="c-body">Le prospect a déjà réagi — on passe directement au RDV.</div>
          <div className="c-foot">
            <button className="btn ok sm" disabled={busy} onClick={() => handlers.onSkipToRdv(row)}>
              <ChevronsRight className="ico-sm" />
              Passer au RDV
            </button>
            <button
              className="btn ghost sm icon"
              title="Le faire quand même"
              onClick={() => handlers.onWork(stage, row)}
            >
              <Icon className="ico-sm" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const tagLabel = stage.id === 'email' ? 'Auto' : stage.mode === 'manual' ? 'À faire' : 'En cours'
  const tagKind = stage.id === 'email' ? 'magic' : stage.mode === 'manual' ? 'warn' : 'accent'

  return (
    <div className="mx-cell active-cell" style={seg}>
      <div className="card active">
        <div className="c-hd">
          <span className="live-dot" />
          <span className="c-ttl">{stage.name}</span>
          <span className="c-tag">
            <span className={`pill ${tagKind}`}>{tagLabel}</span>
          </span>
        </div>

        {row.sequence && stage.id !== 'seq' && stage.id !== 'signe' && (
          <div className="seqline">
            <i style={{ background: 'var(--seg)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sequence.name}</span>
            <span className="st">
              {row.sequence.currentStep}/{row.sequence.totalSteps}
            </span>
          </div>
        )}

        <ActiveBody stage={stage} row={row} now={now} timezone={timezone} />

        <button className="cta" disabled={busy} onClick={() => handlers.onWork(stage, row)}>
          <CtaIcon className="ico-sm" />
          {stage.cta}
        </button>

        <div className="c-foot">
          {stage.id === 'seq' ? (
            <button className="btn ghost sm danger-h" onClick={(e) => handlers.onReact(e, row)}>
              <Slash className="ico-sm" />
              Écarter
            </button>
          ) : stage.id === 'signe' ? (
            <>
              <button className="btn ok sm" disabled={busy} onClick={() => handlers.onValidate(row, 'signe')}>
                <Check className="ico-sm" />
                Signé
              </button>
              <button className="btn ghost sm danger-h" onClick={(e) => handlers.onReact(e, row)}>
                <Slash className="ico-sm" />
                Perdu
              </button>
            </>
          ) : (
            <>
              <button className="btn ok sm" disabled={busy} onClick={() => handlers.onValidate(row, stage.id)}>
                <Check className="ico-sm" />
                {stage.mode === 'manual' ? 'Fait' : 'Étape faite'}
              </button>
              <button
                className="btn ghost sm icon"
                title="Le prospect a réagi"
                onClick={(e) => handlers.onReact(e, row)}
              >
                <Bolt className="ico-sm" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export { SALES_STAGES }
