'use client'
// Conversations — un lead, un fil, tous canaux et tous coéquipiers.
//
// LE GRIEF, MOT POUR MOT : « je ne vois pas les notes de Bilal », et « on reste
// cantonné à sa carte, sans vue d'ensemble ».
//
// EN CHERCHANT L'ÉCRAN, ON A TROUVÉ PIRE QUE SON ABSENCE. `email_logs` n'a
// jamais eu de colonne d'auteur : les 29 notes existantes ne portent le nom de
// personne. Aucun écran n'aurait pu les attribuer, quel qu'il soit. La colonne
// est posée (`sql/20260820_conversation.sql`), tout ce qui s'écrit désormais
// porte son auteur, et les 29 disent « auteur non enregistré » — pas
// « personne », qui serait un mensonge.
//
// L'ÉTAT DE DÉPART EST HONNÊTE ET IL EST MAIGRE : 206 messages, 133 fils,
// **zéro entrant**. Rien n'est jamais entré dans ce CRM. Ce n'est pas un défaut
// de cet écran, c'est ce qu'il rend enfin visible — et le seul transport qui
// existe aujourd'hui, c'est l'agent qui recopie ce qu'on lui a dit. Les 177
// WhatsApp partent par des `wa.me` ouverts à la main : aucun mécanisme ne
// captera jamais une réponse WhatsApp sans l'API Business.
//
// TOUTE LA LOGIQUE EST AILLEURS — assembler, filtrer, compter et décider de
// « à répondre » vivent dans `@/lib/prospection/conversation`, pur et testé.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Info, Mail, MessageCircle, Phone, Search, StickyNote, MessageSquare } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import {
  CANAL_LABEL, FILTRES_FIL, FILTRE_FIL_LABEL,
  apercu, compterFils, filtrerFils, libelleAuteur,
  type Fil, type FiltreFil, type Message,
} from '@/lib/prospection/conversation'
import { libelleValeur } from '@/lib/prospection/vue-taches'
import './lem-skin.css'

const ICONE_CANAL: Record<string, React.ComponentType<{ size?: number }>> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  note: StickyNote,
  call: Phone,
}

const quand = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * L'écran sert DEUX périmètres, et c'est une seule ligne de différence.
 *
 * `admin` lit tous les fils, `agent` ne lit que ceux de ses entreprises. La
 * lecture est la même des deux côtés (`_lecture.ts`), le mur est côté serveur,
 * et cette prop ne fait que choisir la porte. Dupliquer le composant aurait
 * donné deux fils qui se ressemblent — jusqu'au jour où l'un gagne une colonne.
 */
export function Conversations({ perimetre = 'admin' }: { perimetre?: 'admin' | 'agent' } = {}) {
  const base = perimetre === 'agent' ? '/api/agent/conversations' : '/api/prospection/conversations'

  const [fils, setFils] = useState<Fil[]>([])
  const [filtre, setFiltre] = useState<FiltreFil>('tous')
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<number | null>(null)
  const [chargement, setChargement] = useState(true)
  const [panne, setPanne] = useState<string | null>(null)
  const [brouillon, setBrouillon] = useState('')
  const [sens, setSens] = useState<'entrant' | 'interne'>('entrant')
  const [canal, setCanal] = useState<'whatsapp' | 'email' | 'call'>('whatsapp')
  const [occupe, setOccupe] = useState(false)

  const charger = useCallback(async () => {
    const r = await authedFetch(base)
    const j = await r.json()
    if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Chargement impossible')
    setFils(j.fils ?? [])
  }, [base])

  useEffect(() => {
    charger()
      .catch((e: Error) => {
        setPanne(e.message)
        toast.error(e.message)
      })
      .finally(() => setChargement(false))
  }, [charger])

  const compte = useMemo(() => compterFils(fils), [fils])
  const listes = useMemo(() => filtrerFils(fils, filtre, recherche), [fils, filtre, recherche])
  const fil = useMemo(() => fils.find((f) => f.entrepriseId === ouvert) ?? null, [fils, ouvert])

  // Le fil ouvert suit la liste : filtrer jusqu'à le faire disparaître laissait
  // le volet central sur un prospect que la liste ne montre plus.
  useEffect(() => {
    if (ouvert !== null && !listes.some((f) => f.entrepriseId === ouvert)) {
      setOuvert(listes[0]?.entrepriseId ?? null)
    } else if (ouvert === null && listes.length > 0) {
      setOuvert(listes[0].entrepriseId)
    }
  }, [listes, ouvert])

  const consigner = async () => {
    if (!fil || !brouillon.trim()) return
    setOccupe(true)
    try {
      const r = await authedFetch(base, {
        method: 'POST',
        body: JSON.stringify({
          entrepriseId: fil.entrepriseId,
          texte: brouillon.trim(),
          sens,
          canal: sens === 'interne' ? 'note' : canal,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Enregistrement impossible')
      setBrouillon('')
      toast.success(sens === 'entrant' ? 'Réponse consignée' : 'Note ajoutée')
      await charger()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Conversations</h1>
            <p className="lem-sous">
              Un prospect, un fil — e-mail, WhatsApp et notes d’équipe à leur date. C’est ici
              que les notes de chacun se lisent, à côté de ce qui est parti.
            </p>
          </div>
          <Link href="/prospection/taches" className="lem-btn">
            Voir les tâches
          </Link>
        </header>

        {/* L'état de départ, dit franchement plutôt que découvert par une boîte
            vide. Il disparaît dès qu'un premier entrant est consigné. */}
        {!chargement && !panne && compte.ont_parle === 0 && fils.length > 0 && (
          <div className="lem-alerte" data-gravite="info" style={{ marginBottom: 14 }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>Rien n’est jamais entré dans ce CRM.</b> Les {compte.tous} fils ci-dessous ne
              contiennent que ce qu’on a envoyé et ce que l’équipe a noté. Les WhatsApp partent par
              des liens ouverts à la main : <b>aucun mécanisme ne captera jamais une réponse
              WhatsApp</b> sans l’API Business. Le seul transport entrant qui existe, c’est
              « Consigner ce qu’il a dit », en bas d’un fil.
            </div>
          </div>
        )}

        <div className="lem-trois">
          {/* ── Volet gauche : filtres, recherche, liste ──────────────── */}
          <div className="lem-volet">
            <div className="tete">Fils</div>
            <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--lem-bord)' }}>
              <div className="lem-onglets" style={{ marginBottom: 9 }}>
                {FILTRES_FIL.map((f) => (
                  <button
                    key={f}
                    className="lem-onglet"
                    aria-pressed={filtre === f}
                    onClick={() => setFiltre(f)}
                  >
                    {FILTRE_FIL_LABEL[f]} <span className="n">{compte[f]}</span>
                  </button>
                ))}
              </div>
              <label>
                <span className="lem-second" style={{ fontSize: 12, display: 'inline-flex', gap: 5 }}>
                  <Search size={13} /> Chercher
                </span>
                <input
                  className="lem-champ"
                  placeholder="Entreprise, ville, contact"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </label>
            </div>

            <div className="lem-fils">
              {chargement ? (
                <div className="lem-vide">Chargement…</div>
              ) : panne ? (
                // Le volet central dit déjà que la lecture a échoué ; celui-ci
                // ne doit pas dire en même temps que c'est le filtre qui ne
                // rend rien. Deux volets, une seule vérité.
                <div className="lem-vide">
                  <p style={{ marginBottom: 0 }}>Liste indisponible.</p>
                </div>
              ) : listes.length === 0 ? (
                <div className="lem-vide">
                  <p style={{ marginBottom: 0 }}>
                    Aucun fil ne répond à ce filtre
                    {recherche ? ` et à « ${recherche} »` : ''}.
                  </p>
                </div>
              ) : (
                listes.map((f) => (
                  <button
                    key={f.entrepriseId}
                    className="lem-fil"
                    aria-pressed={ouvert === f.entrepriseId}
                    onClick={() => setOuvert(f.entrepriseId)}
                  >
                    <span className="qui">
                      {f.entreprise}
                      {f.aRepondre && (
                        <span className="lem-pill" data-ton="ok" style={{ marginLeft: 6 }}>
                          à répondre
                        </span>
                      )}
                    </span>
                    <span className="quoi">{apercu(f)}</span>
                    <span className="lem-second" style={{ fontSize: 11.5 }}>
                      {f.dernier ? quand(f.dernier.quand) : ''} · {f.messages.length} message
                      {f.messages.length > 1 ? 's' : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Volet central : le fil ────────────────────────────────── */}
          <div className="lem-volet">
            {panne ? (
              <div className="lem-vide">
                <h3>Les fils n’ont pas pu être lus</h3>
                <p>
                  {panne === 'unauthorized'
                    ? 'Session expirée ou compte sans les droits d’administration.'
                    : panne}{' '}
                  Ce n’est pas une messagerie vide : on ne sait pas ce qu’elle contient.
                </p>
              </div>
            ) : !fil ? (
              <div className="lem-vide">
                <h3>Choisissez un fil</h3>
                <p>Chaque prospect a le sien, avec tout ce qui s’est dit, quel que soit le canal.</p>
              </div>
            ) : (
              <>
                <div className="tete" style={{ textTransform: 'none', fontSize: 13.5 }}>
                  <b style={{ color: 'var(--lem-encre)' }}>{fil.entreprise}</b>
                  {fil.contact && <span className="lem-second"> · {fil.contact}</span>}
                </div>

                <div className="lem-echanges">
                  {fil.messages.map((m) => (
                    <Bulle key={m.id} m={m} />
                  ))}
                </div>

                {/* ── Consigner ce qu'il a dit ──────────────────────── */}
                <div style={{ padding: 13, borderTop: '1px solid var(--lem-bord)' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <button
                      className="lem-onglet"
                      aria-pressed={sens === 'entrant'}
                      onClick={() => setSens('entrant')}
                    >
                      Ce qu’il a dit
                    </button>
                    <button
                      className="lem-onglet"
                      aria-pressed={sens === 'interne'}
                      onClick={() => setSens('interne')}
                    >
                      Note d’équipe
                    </button>
                    {sens === 'entrant' && (
                      <select
                        className="lem-champ"
                        style={{ width: 'auto', marginTop: 0 }}
                        value={canal}
                        onChange={(e) => setCanal(e.target.value as typeof canal)}
                        aria-label="Par quel canal"
                      >
                        <option value="whatsapp">par WhatsApp</option>
                        <option value="email">par e-mail</option>
                        <option value="call">au téléphone</option>
                      </select>
                    )}
                  </div>
                  <textarea
                    className="lem-champ"
                    rows={3}
                    placeholder={
                      sens === 'entrant'
                        ? 'Recopier ce que le prospect a répondu, avec ses mots'
                        : 'Ce que l’équipe doit savoir — « rappeler en septembre »…'
                    }
                    value={brouillon}
                    onChange={(e) => setBrouillon(e.target.value)}
                  />
                  <div
                    style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}
                  >
                    <button
                      className="lem-btn principal"
                      onClick={consigner}
                      disabled={occupe || !brouillon.trim()}
                    >
                      {sens === 'entrant' ? 'Consigner' : 'Ajouter la note'}
                    </button>
                    {/* La distinction qui a déjà été payée une fois, dite à
                        l'endroit où le geste se fait. */}
                    <span className="lem-second" style={{ fontSize: 12, maxWidth: '52ch' }}>
                      {sens === 'entrant'
                        ? 'Consigner une réponse ne déclare pas le prospect intéressé : ça débloque une attente, rien de plus.'
                        : 'Une note d’équipe ne répond à personne — le fil restera « à répondre ».'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Volet droit : le dossier ──────────────────────────────── */}
          <div className="lem-volet">
            <div className="tete">Le dossier</div>
            {!fil ? (
              <div className="lem-fiche lem-second">Aucun fil ouvert.</div>
            ) : (
              <dl className="lem-fiche">
                <dt>Entreprise</dt>
                <dd>{fil.entreprise}</dd>
                <dt>Ville</dt>
                <dd>{fil.ville ?? <span className="lem-decor">—</span>}</dd>
                <dt>Cohorte</dt>
                <dd>
                  {fil.cohorte ? (
                    <span className="lem-pill" data-ton="neutre">{libelleValeur(fil.cohorte)}</span>
                  ) : (
                    <span className="lem-decor">hors cohorte</span>
                  )}
                </dd>
                <dt>Contact</dt>
                <dd>{fil.contact ?? <span className="lem-second">aucun nominatif</span>}</dd>
                <dt>Échanges</dt>
                {/* Trois nombres, jamais additionnés : un message est d'un seul
                    sens, mais les afficher en somme donnerait un « total » qui
                    ne veut rien dire de plus que le nombre de lignes. */}
                <dd>
                  {fil.compte.sortant} envoyé{fil.compte.sortant > 1 ? 's' : ''} ·{' '}
                  {fil.compte.entrant} reçu{fil.compte.entrant > 1 ? 's' : ''} ·{' '}
                  {fil.compte.interne} note{fil.compte.interne > 1 ? 's' : ''}
                </dd>
                <dt>Dernier échange</dt>
                <dd>{fil.dernier ? quand(fil.dernier.quand) : '—'}</dd>
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Bulle({ m }: { m: Message }) {
  const Icone = ICONE_CANAL[m.canal]
  return (
    <div className="lem-msg" data-sens={m.sens}>
      <div className="lem-bulle">{m.texte || m.objet || <em>(vide)</em>}</div>
      <div className="lem-meta">
        {Icone ? <Icone size={12} /> : null}
        <span>{CANAL_LABEL[m.canal] ?? m.canal}</span>
        <span>·</span>
        <span>{quand(m.quand)}</span>
        <span>·</span>
        {/* « auteur non enregistré » et « le CRM » sont deux états différents :
            un humain a écrit les 29 premières notes, on ne sait juste pas
            lequel. Dire « personne » serait faux. */}
        <span>{libelleAuteur(m)}</span>
        {m.issue && (
          <span className="lem-pill" data-ton="neutre">{m.issue}</span>
        )}
        {m.remise === 'bounced' && (
          <span className="lem-pill" data-ton="danger">rebond</span>
        )}
        {m.bloquePar && (
          <span className="lem-pill" data-ton="attention">bloqué · {m.bloquePar}</span>
        )}
      </div>
    </div>
  )
}
