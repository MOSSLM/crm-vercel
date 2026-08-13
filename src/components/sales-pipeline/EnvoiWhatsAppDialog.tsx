'use client'
// EnvoiWhatsAppDialog — le dernier écran avant d'ouvrir WhatsApp.
//
// CE QU'IL CORRIGE
// Le bouton « Ouvrir WhatsApp » composait un numéro choisi en silence et
// envoyait le texte que le moteur avait préparé, sans jamais montrer ni l'un ni
// l'autre. Trois conséquences, toutes invisibles jusqu'à l'envoi :
//
//   · 47 entreprises du parc portent PLUSIEURS numéros distincts (standard,
//     portable du gérant, ligne d'un second contact). L'écran n'en montrait
//     aucun, et rien ne disait à qui on écrivait vraiment.
//   · Le sélecteur de version épinglait « contact » sur l'inscription, mais la
//     tâche déjà préparée gardait son texte : on croyait avoir basculé, et
//     c'était l'autre version qui partait.
//   · Un fixe ouvert sur `wa.me` ne mène nulle part. Il fallait l'apprendre en
//     tombant sur la page d'erreur.
//
// Tout est donc posé à plat AVANT le geste : à qui, sur quel numéro, avec quel
// texte — et c'est exactement ce texte-là qui part.
import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, User, Building2, Phone, X, AlertTriangle } from 'lucide-react'
import { VARIANT_LABELS, type MessageVariant } from '@/lib/automations/variables'
import { numerosDuProspect, type NumeroProspect } from '@/lib/prospects/numeros'
import type { SalesBoardRow, SalesTaskInfo } from './types'

/**
 * Le texte réellement retenu pour une version donnée.
 *
 * Les DEUX versions voyagent dans la tâche (`payload.variant` /
 * `payload.variantAlt`), rendues par le moteur au moment de la préparer. On ne
 * recalcule donc rien ici : afficher un texte reconstitué dans le navigateur,
 * c'est risquer de montrer autre chose que ce qui est prêt à partir.
 */
export function texteDeLaVersion(task: SalesTaskInfo | undefined, variant: MessageVariant): string {
  if (!task) return ''
  if (task.variant === variant) return task.message
  if (task.variantAlt?.variant === variant) return task.variantAlt.message
  return task.message
}

/** Les versions réellement disponibles — une seule quand le modèle n'en a qu'une. */
export function versionsDisponibles(task: SalesTaskInfo | undefined): MessageVariant[] {
  if (!task) return []
  const alt = task.variantAlt?.variant
  return alt && alt !== task.variant ? [task.variant, alt] : [task.variant]
}

/**
 * Les numéros du prospect, ordonnés pour WhatsApp — mobiles d'abord, décideur en
 * tête. `numerosDuProspect` est la seule définition de « quels numéros a ce
 * prospect » : la file de démarchage s'en sert déjà, la carte doit dire la même
 * chose qu'elle.
 */
export function numerosWhatsApp(row: SalesBoardRow): NumeroProspect[] {
  const j = row.joignable
  // Réponse d'API antérieure au champ : on retombe sur ce que la ligne porte
  // déjà, plutôt que d'afficher « aucun numéro » sur un prospect joignable.
  const source = j
    ? { entreprise: { telephones: j.companyPhones }, contacts: j.contacts }
    : {
        entreprise: { telephone: row.phone },
        contacts: row.contact
          ? [{ id: row.contact.id, first_name: row.contact.name, tel: row.contact.phone, role_title: row.contact.role }]
          : [],
      }
  return numerosDuProspect(source, 'whatsapp')
}

export function EnvoiWhatsAppDialog({
  row,
  task,
  pinned,
  busy,
  onClose,
  onSend,
  onPin,
}: {
  row: SalesBoardRow
  task: SalesTaskInfo | undefined
  /** Version épinglée sur l'inscription — `null` = le moteur choisit. */
  pinned: MessageVariant | null
  busy: boolean
  onClose: () => void
  onSend: (arg: { numero: NumeroProspect; variant: MessageVariant; message: string }) => void
  onPin: (variant: MessageVariant | null) => void
}) {
  const numeros = useMemo(() => numerosWhatsApp(row), [row])
  const versions = useMemo(() => versionsDisponibles(task), [task])

  const [numeroChoisi, setNumeroChoisi] = useState<string | null>(
    // Celui que le moteur a posé sur la tâche s'il est encore dans la liste,
    // sinon le premier — le meilleur mobile connu.
    () => {
      const prepare = numerosDuProspect({ entreprise: { telephone: task?.phone ?? null } }, 'whatsapp')[0]
      const dansLaListe = prepare && numeros.some((n) => n.e164 === prepare.e164) ? prepare.e164 : null
      return dansLaListe ?? numeros[0]?.e164 ?? null
    },
  )
  const [variant, setVariant] = useState<MessageVariant>(() => pinned ?? task?.variant ?? 'company')

  const numero = numeros.find((n) => n.e164 === numeroChoisi) ?? null
  const message = texteDeLaVersion(task, variant)
  const nonMobile = numero != null && numero.type !== 'mobile'

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="mp-scope sp-scope">
      <div className="modal-scrim" onClick={onClose}>
        <div className="modal wa-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd">
            <span className="sw" style={{ background: 'rgba(37,211,102,.12)', color: '#25d366' }}>
              <MessageCircle className="ico" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mt">Envoyer sur WhatsApp</div>
              <div className="ms">
                {row.companyName}
                {row.ville ? ` · ${row.ville}` : ''}
              </div>
            </div>
            <button className="btn ghost sm icon" type="button" onClick={onClose} aria-label="Fermer">
              <X className="ico-sm" />
            </button>
          </div>

          <div className="wa-body">
            {/* ── À qui ────────────────────────────────────────────────────
                Le numéro n'est pas une donnée technique : c'est une personne.
                D'où le nom et le rôle sous chaque ligne — un standard et le
                portable du gérant ne se travaillent pas de la même façon. */}
            <div className="wa-col">
              <div className="wa-lbl">
                <User className="ico-xs" />À qui
                {numeros.length > 1 && <span className="wa-count">{numeros.length} numéros connus</span>}
              </div>
              {numeros.length === 0 && (
                <div className="wa-empty">
                  Aucun numéro composable sur cette fiche — ni sur l’entreprise, ni sur ses contacts.
                </div>
              )}
              {numeros.map((n) => (
                <button
                  key={n.e164}
                  type="button"
                  className={'wa-dest' + (n.e164 === numeroChoisi ? ' on' : '')}
                  aria-pressed={n.e164 === numeroChoisi}
                  onClick={() => setNumeroChoisi(n.e164)}
                >
                  <span className="rad">{n.e164 === numeroChoisi && <i />}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="who">
                      {n.origine.kind === 'contact' ? (
                        <>
                          <User className="ico-xs" />
                          {n.origine.nom}
                          {n.origine.role && <span className="role">{n.origine.role}</span>}
                        </>
                      ) : (
                        <>
                          <Building2 className="ico-xs" />
                          {row.companyName}
                          <span className="role">fiche entreprise</span>
                        </>
                      )}
                    </span>
                    <span className="num mono">
                      {n.affichage}
                      <span className={'kind ' + n.type}>{n.type === 'autre' ? 'non reconnu' : n.type}</span>
                    </span>
                  </span>
                </button>
              ))}
              {nonMobile && (
                <div className="wa-warn">
                  <AlertTriangle className="ico-xs" />
                  WhatsApp n’aboutit que sur un mobile. Ce numéro ouvrira une conversation vide.
                </div>
              )}
            </div>

            {/* ── Quoi ─────────────────────────────────────────────────────
                Le message montré est CELUI qui part : la bascule change le
                texte sous les yeux, elle ne se contente pas d'épingler un
                réglage dont on verrait l'effet au message suivant. */}
            <div className="wa-col">
              <div className="wa-lbl">
                <MessageCircle className="ico-xs" />
                Message
                {versions.length > 1 && <span className="wa-count">2 versions préparées</span>}
              </div>
              {versions.length > 1 && (
                <div className="sp-variant" role="group" aria-label="Version du message">
                  {versions.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="sp-variant-b"
                      aria-pressed={variant === v}
                      title={VARIANT_LABELS[v].hint}
                      onClick={() => setVariant(v)}
                    >
                      {VARIANT_LABELS[v].tab}
                      {pinned === v && <span className="pin">épinglée</span>}
                    </button>
                  ))}
                </div>
              )}
              <div className="wa-msg">{message || 'Aucun message préparé par la séquence.'}</div>
              {versions.length > 1 && (
                <label className="wa-pin">
                  <input
                    type="checkbox"
                    checked={pinned === variant}
                    // Épingler vaut pour la SUITE de la séquence, e-mails
                    // compris : ceux-là partent par le régulateur, sans
                    // personne devant l'écran pour rechoisir.
                    onChange={(e) => onPin(e.target.checked ? variant : null)}
                  />
                  Garder cette version pour les prochaines étapes de ce prospect
                </label>
              )}
            </div>
          </div>

          <div className="modal-foot">
            <span className="msg">
              {numero
                ? `WhatsApp s’ouvre sur ${numero.affichage}, message déjà écrit.`
                : 'Renseignez un numéro sur la fiche pour pouvoir écrire.'}
            </span>
            <button className="btn" type="button" onClick={onClose}>
              Annuler
            </button>
            <button
              className="btn accent"
              type="button"
              disabled={busy || !numero}
              onClick={() => numero && onSend({ numero, variant, message })}
            >
              <Phone className="ico-sm" />
              Ouvrir WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
