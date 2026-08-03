'use client'
// SalesCells — le contenu d'une cellule de la matrice, colonne par colonne.
//
// Une colonne vient soit de la SÉQUENCE (email / WhatsApp / appel), soit du
// PIPELINE (RDV calé, Client signé…). Le contenu de la carte suit le canal
// pour les premières, le jalon commercial pour les secondes.
//
// Sept états possibles : à venir, en cours, faite, sautée, perdue, blacklistée,
// à recontacter. La grammaire visuelle est celle du Marketing Pipeline :
// grisé = fait, blanc + ombré = en cours, pointillés = à venir.
import React from 'react'
import {
  AlertTriangle,
  Bolt,
  Calendar,
  Check,
  ChevronsRight,
  ClipboardCheck,
  Clock,
  Euro,
  FileText,
  Globe,
  Inbox,
  Layers,
  Linkedin,
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
import { hasInterest, type SalesColumn } from '@/lib/sales-pipeline/stages'
import { holdReasonLabel } from '@/lib/automations/regulator'
import { eta, hm, hmd } from '@/components/automations/regulator/parts'
import type { SalesBoardRow } from './types'

/** Icône d'un canal de séquence. */
export const KIND_ICON: Record<string, LucideIcon> = {
  email: Mail,
  whatsapp: MessageCircle,
  linkedin: Linkedin,
  call: Phone,
  task: ClipboardCheck,
  wait: Clock,
}

/** Icône d'une colonne, quelle que soit son origine. */
export function columnIcon(column: SalesColumn): LucideIcon {
  if (column.group === 'entry') return Inbox
  if (column.kind) return KIND_ICON[column.kind] ?? ClipboardCheck
  const n = column.label.toLowerCase()
  if (n.includes('rdv') || n.includes('rendez')) return Calendar
  if (n.includes('propo') || n.includes('devis')) return FileText
  if (n.includes('nego') || n.includes('négo')) return Target
  if (n.includes('sign') || n.includes('gagn') || n.includes('client')) return Euro
  return TrendingUp
}

function ctaIcon(column: SalesColumn): LucideIcon {
  if (column.group === 'entry') return Layers
  if (column.kind === 'email') return Bolt
  if (column.kind) return KIND_ICON[column.kind] ?? ClipboardCheck
  const n = column.label.toLowerCase()
  if (n.includes('propo') || n.includes('devis')) return Send
  if (n.includes('sign') || n.includes('gagn')) return Check
  return columnIcon(column)
}

export interface SalesHandlers {
  onEnroll: (rows: SalesBoardRow[]) => void
  onQueue: () => void
  onWork: (column: SalesColumn, row: SalesBoardRow) => void
  onValidate: (row: SalesBoardRow, columnId: string) => void
  onReact: (event: React.MouseEvent, row: SalesBoardRow) => void
  onRevive: (row: SalesBoardRow, columnId?: string) => void
  onSkipToDeal: (row: SalesBoardRow) => void
  /** Saisir à la main l'adresse manquante d'un prospect. */
  onAddEmail: (row: SalesBoardRow) => void
  /** Sauter l'étape email et enchaîner sur le canal suivant (WhatsApp). */
  onSkipEmail: (row: SalesBoardRow) => void
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

/** Résumé d'une colonne franchie — ce que la carte grisée raconte. */
function doneSummary(column: SalesColumn, row: SalesBoardRow): string {
  if (column.group === 'entry') return row.sequence?.name ?? 'Mis en séquence'
  if (column.group === 'sequence') {
    switch (column.kind) {
      case 'email': {
        const n = row.emailsSent || 1
        return `${n} email${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''}`
      }
      case 'call':
        return row.state.replied ? 'Il a rappelé' : 'Appel passé'
      default:
        return 'Message envoyé'
    }
  }
  const n = column.label.toLowerCase()
  if (n.includes('rdv') || n.includes('rendez')) {
    return row.state.rdvAt ? `RDV du ${new Date(row.state.rdvAt).toLocaleDateString('fr-FR')}` : 'RDV tenu'
  }
  if (n.includes('propo') || n.includes('devis')) {
    return row.state.propoAmount ? `${eur(row.state.propoAmount)} envoyés` : 'Proposition envoyée'
  }
  if (n.includes('nego') || n.includes('négo')) return row.state.objection ? `Levée : ${row.state.objection}` : 'Négociée'
  if (n.includes('sign') || n.includes('gagn')) return `Signé · ${eur(row.montant)}`
  return 'Fait'
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

/** Corps de la carte ACTIVE. */
function ActiveBody({
  column,
  row,
  now,
  timezone,
}: {
  column: SalesColumn
  row: SalesBoardRow
  now: number
  timezone: string
}) {
  // ── Colonne d'entrée ────────────────────────────────────────────────────
  // Ce qui compte ici, c'est de décider : ce prospect est-il prêt à être
  // démarché ? On montre donc ce qui manque, pas ce qui va bien.
  if (column.group === 'entry') {
    return (
      <div className="c-body col">
        <div className="ctx">
          {row.auditReady ? (
            <span className="chip">
              <ClipboardCheck className="ico-sm" />
              Audit prêt
            </span>
          ) : (
            <span className="chip miss">
              <ClipboardCheck className="ico-sm" />
              Sans audit
            </span>
          )}
          {row.demoUrl ? (
            <span className="chip">
              <Globe className="ico-sm" />
              Démo prête
            </span>
          ) : (
            <span className="chip miss">
              <Globe className="ico-sm" />
              Sans démo
            </span>
          )}
          {/* Le drapeau tombe dès le stock de départ : on sait avant de lancer
              la séquence que l'étape email sera impossible pour ce prospect. */}
          {row.emailMissing && (
            <span className="chip danger">
              <Mail className="ico-sm" />
              Sans email
            </span>
          )}
        </div>
        {row.contact ? (
          <div className="muted">
            {row.contact.name}
            {row.contact.role ? ` · ${row.contact.role}` : ''}
          </div>
        ) : (
          <div className="why" style={{ color: 'var(--danger)' }}>
            <AlertTriangle className="ico-xs" />
            Aucun contact — impossible de démarcher
          </div>
        )}
        {/* Inscrit ailleurs : sans ça, la ligne semblerait n'avoir rien fait. */}
        {row.sequence && (
          <div className="why">
            <Layers className="ico-xs" />
            déjà dans « {row.sequence.name} »
          </div>
        )}
      </div>
    )
  }

  // ── Colonnes de séquence ────────────────────────────────────────────────
  if (column.group === 'sequence') {
    if (column.kind === 'email') {
      const seq = row.sequence
      // Sans adresse, rien n'est préparé : ni créneau, ni compte à rebours. La
      // cellule dit ce qui manque et propose les deux seules sorties possibles
      // (saisir l'adresse, ou passer au canal suivant) — cf. le pied de carte.
      if (row.emailMissing) {
        return (
          <div className="c-body col">
            <div className="hold danger">
              <AlertTriangle className="ico-sm" />
              Aucun email connu
            </div>
            <div className="why">
              <Slash className="ico-xs" />
              hors file d’envoi — rien n’est préparé
            </div>
            {seq && <div className="stepn">{seq.stepLabel}</div>}
          </div>
        )
      }
      if (!seq) {
        return (
          <div className="c-body col">
            <div className="muted">Pas encore en séquence.</div>
          </div>
        )
      }
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

    if (column.kind === 'call') {
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
          {task?.routingReason && (
            <span className="routed">
              <User className="ico-xs" />
              {task.routingReason}
            </span>
          )}
        </div>
      )
    }

    // WhatsApp / LinkedIn / tâche : un message préparé, jamais envoyé seul.
    const task = row.tasks.find((t) => t.kind === column.kind) ?? row.tasks[0]
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

  // ── Colonnes de pipeline ────────────────────────────────────────────────
  const name = column.label.toLowerCase()
  if (name.includes('rdv') || name.includes('rendez')) {
    return (
      <div className="c-body col">
        <div className="muted">
          {row.state.replied ? 'Il a réagi — on cale le rendez-vous.' : 'Prospect contacté. Caler le créneau.'}
        </div>
        <Signals row={row} />
      </div>
    )
  }
  if (name.includes('propo') || name.includes('devis')) {
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
  }
  if (name.includes('nego') || name.includes('négo')) {
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
  }
  if (name.includes('sign') || name.includes('gagn') || name.includes('client')) {
    return (
      <div className="c-body col">
        <div className="big">{eur(row.montant)}</div>
        <div className="muted">Négociation close — reste la signature.</div>
      </div>
    )
  }
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
}

export function SalesCell({
  row,
  column,
  now,
  timezone,
  handlers,
}: {
  row: SalesBoardRow
  column: SalesColumn
  now: number
  timezone: string
  handlers: SalesHandlers
}) {
  const status = row.cells[column.id]
  const seg = {
    ['--seg' as string]: column.color,
    ['--seg-soft' as string]: rgba(column.color, 0.22),
    ['--seg-wash' as string]: rgba(column.color, 0.05),
  }
  const busy = handlers.busy === row.id
  const Icon = columnIcon(column)
  const CtaIcon = ctaIcon(column)
  // Teinte de groupe portée jusqu'au bas du tableau, pour que l'encadrement
  // du groupe séquence se lise sur toute la hauteur.
  const groupClass = column.group === 'sequence' ? ' in-seq' : column.group === 'entry' ? ' in-entry' : ''
  const inSequence = column.group === 'sequence'

  if (status === 'locked') {
    return (
      <div className={'mx-cell locked' + groupClass}>
        <div className="locked-ph">
          <Lock />
          <span className="t">À venir</span>
        </div>
      </div>
    )
  }

  if (status === 'skip') {
    return (
      <div className={'mx-cell' + groupClass} style={seg}>
        <div className="card is-skip">
          <div className="c-hd">
            <span className="skip-ic">
              <ChevronsRight />
            </span>
            <span className="c-ttl">Sauté</span>
          </div>
          <div className="c-body">{row.state.skipReason || 'Étape sautée.'}</div>
          <div className="done-foot">
            <button className="link-btn" disabled={busy} onClick={() => handlers.onRevive(row, column.id)}>
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
      <div className={'mx-cell' + groupClass} style={seg}>
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
      <div className={'mx-cell' + groupClass} style={seg}>
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
      <div className={'mx-cell done' + groupClass} style={seg}>
        <div className="card is-done">
          <div className="c-hd">
            <span className="done-check">
              <Check />
            </span>
            <span className="c-ttl">{column.label}</span>
          </div>
          <div className="done-line">{doneSummary(column, row)}</div>
          <div className="done-foot">
            <button className="link-btn" onClick={() => handlers.onWork(column, row)}>
              <Icon className="ico-sm" />
              Voir
            </button>
            {row.state.stageDates[column.id] && (
              <span className="done-date">
                {new Date(row.state.stageDates[column.id]).toLocaleDateString('fr-FR', {
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
  // Une tâche manuelle n'a plus lieu d'être si le prospect a déjà réagi.
  if (column.mode === 'manual' && hasInterest(row.state)) {
    return (
      <div className={'mx-cell' + groupClass} style={seg}>
        <div className="card is-nn">
          <div className="c-hd">
            <span className="c-dot" />
            <span className="c-ttl">{column.label}</span>
            <span className="c-tag">
              <span className="pill ok">Inutile</span>
            </span>
          </div>
          <div className="c-body">Le prospect a déjà réagi — on passe à la suite.</div>
          <div className="c-foot">
            <button className="btn ok sm" disabled={busy} onClick={() => handlers.onSkipToDeal(row)}>
              <ChevronsRight className="ico-sm" />
              Passer au RDV
            </button>
            <button
              className="btn ghost sm icon"
              title="Le faire quand même"
              onClick={() => handlers.onWork(column, row)}
            >
              <Icon className="ico-sm" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isEntry = column.group === 'entry'
  const tagLabel = isEntry
    ? 'En attente'
    : column.mode === 'auto'
      ? 'Auto'
      : column.mode === 'manual'
        ? 'À faire'
        : 'En cours'
  const tagKind = isEntry ? 'outline' : column.mode === 'auto' ? 'magic' : column.mode === 'manual' ? 'warn' : 'accent'
  const isLastPipelineColumn = column.group === 'pipeline' && /sign|gagn|client/i.test(column.label)
  // Sans contact identifiable, la mise en séquence échouerait côté serveur :
  // autant le dire tout de suite plutôt que d'offrir un bouton qui rate.
  const canEnroll = isEntry && !!row.contact
  // Étape email impossible : la carte change de verbe. Plutôt qu'un lien vers
  // une file où ce prospect ne figure pas, elle propose de saisir l'adresse — et
  // le pied de carte offre la sortie : passer au canal suivant.
  const emailBlocked = column.kind === 'email' && row.emailMissing

  if (emailBlocked) {
    return (
      <div className={'mx-cell active-cell' + groupClass} style={seg}>
        <div className="card active is-blocked">
          <div className="c-hd">
            <span className="c-dot" />
            <span className="c-ttl">{column.label}</span>
            <span className="c-tag">
              <span className="pill danger">Sans email</span>
            </span>
          </div>

          {row.sequence && (
            <div className="seqline">
              <i style={{ background: 'var(--seg)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sequence.name}</span>
              <span className="st">
                {row.sequence.currentStep}/{row.sequence.totalSteps}
              </span>
            </div>
          )}

          <ActiveBody column={column} row={row} now={now} timezone={timezone} />

          <button className="cta" disabled={busy} onClick={() => handlers.onAddEmail(row)}>
            <Mail className="ico-sm" />
            Ajouter l’email
          </button>

          <div className="c-foot">
            <button className="btn sm" disabled={busy} onClick={() => handlers.onSkipEmail(row)}>
              <ChevronsRight className="ico-sm" />
              Passer à WhatsApp
            </button>
            <button className="btn ghost sm icon" title="Le prospect a réagi" onClick={(e) => handlers.onReact(e, row)}>
              <Bolt className="ico-sm" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={'mx-cell active-cell' + groupClass} style={seg}>
      <div className="card active">
        <div className="c-hd">
          <span className="live-dot" />
          <span className="c-ttl">{column.label}</span>
          <span className="c-tag">
            <span className={`pill ${tagKind}`}>{tagLabel}</span>
          </span>
        </div>

        {inSequence && row.sequence && (
          <div className="seqline">
            <i style={{ background: 'var(--seg)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.sequence.name}</span>
            <span className="st">
              {row.sequence.currentStep}/{row.sequence.totalSteps}
            </span>
          </div>
        )}

        <ActiveBody column={column} row={row} now={now} timezone={timezone} />

        <button
          className="cta"
          disabled={busy || (isEntry && !canEnroll)}
          title={isEntry && !canEnroll ? 'Aucun contact rattaché à ce prospect' : undefined}
          onClick={() => (isEntry ? handlers.onEnroll([row]) : handlers.onWork(column, row))}
        >
          <CtaIcon className="ico-sm" />
          {column.cta}
        </button>

        <div className="c-foot">
          {isEntry ? (
            // Le stock de départ, c'est aussi là qu'on trie : soit on lance,
            // soit on écarte. Pas de « fait » à valider à la main.
            <button className="btn ghost sm danger-h" onClick={(e) => handlers.onReact(e, row)}>
              <Slash className="ico-sm" />
              Écarter
            </button>
          ) : isLastPipelineColumn ? (
            <>
              <button className="btn ok sm" disabled={busy} onClick={() => handlers.onValidate(row, column.id)}>
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
              <button className="btn ok sm" disabled={busy} onClick={() => handlers.onValidate(row, column.id)}>
                <Check className="ico-sm" />
                {column.mode === 'manual' ? 'Fait' : 'Étape faite'}
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
