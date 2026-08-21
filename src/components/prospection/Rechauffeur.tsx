'use client'
// Rechauffeur — la chauffe du domaine, et ce qu'elle autorise aujourd'hui.
//
// CE QUE CET ÉCRAN DOIT RENDRE VISIBLE, dans cet ordre :
//   1. combien on peut démarcher aujourd'hui, et POURQUOI ce chiffre-là ;
//   2. ce que l'outil écrit au nom de son propriétaire — un réchauffeur qu'on
//      ne peut pas relire est un réchauffeur qu'on n'ose pas laisser tourner ;
//   3. ce qui manque au maillage, nommé, plutôt qu'un score qui baisse sans
//      qu'on sache quoi corriger.
//
// ET CE QU'IL NE DOIT SURTOUT PAS FAIRE : afficher un taux de placement quand
// aucun placement n'a été mesuré. Un zéro et une absence de mesure ne sont pas
// la même chose — c'est la règle héritée d'`etages.ts`, et c'est ici qu'elle
// compte le plus, parce que « 0 % en boîte » ferait paniquer alors que le
// chiffre voulait dire « on n'en sait rien ».
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle, BookOpen, ChevronDown, ChevronRight,
  Flame, Inbox, Info, Plus, Power, Trash2,
} from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import { HOTE_LWS, MODES_OPERATOIRES, suggestionHote } from '@/lib/rechauffeur/fournisseurs'
import type { Sante } from '@/lib/rechauffeur/sante'
import './lem-skin.css'

interface LigneExpediteur {
  id: string
  email: string
  nom: string
  domaineSignant: string
  statut: string
  demarreLe: string | null
  jour: number
  cibleJour: number
  fenetre: { de: number; a: number }
  coefficient: number
  viseAujourdHui: number
  glissant: {
    envoyes: number; enBoite: number; enSpam: number
    introuvables: number; reponses: number; echecs: number
  }
  sante: Sante
  capacite: { chauffeAujourdhui: number; froidAujourdhui: number; explication: string } | null
}

interface Temoin {
  id: string
  email: string
  nom: string
  famille: string
  peut_lire: boolean
  branche: boolean
  actif: boolean
  plafond_jour: number
  recus_aujourdhui: number
}

interface Etat {
  expediteurs: LigneExpediteur[]
  maillage: Temoin[]
  capaciteMaillage: number
  famillesManquantes: string[]
  temoinsActifs: number
  mesurePossible: boolean
  coffrePret: boolean
}

const STATUTS: Record<string, { texte: string; ton: string }> = {
  en_pause: { texte: 'en pause', ton: 'neutre' },
  chauffe: { texte: 'en chauffe', ton: 'ok' },
  entretien: { texte: 'entretien', ton: 'neutre' },
  erreur: { texte: 'erreur', ton: 'danger' },
  dns_bloquant: { texte: 'DNS bloquant', ton: 'danger' },
}

const TON_VERDICT: Record<string, string> = {
  monter: 'ok',
  tenir: 'neutre',
  redescendre: 'attention',
}

function Expediteur({ e, mesurePossible }: { e: LigneExpediteur; mesurePossible: boolean }) {
  const statut = STATUTS[e.statut] ?? { texte: e.statut, ton: 'neutre' }
  const mesures = e.glissant.enBoite + e.glissant.enSpam

  return (
    <div className="lem-carte" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{e.email}</strong>
        <span className="lem-pill" data-ton={statut.ton}>{statut.texte}</span>
        {e.jour > 0 ? (
          <span className="lem-pill" data-ton="neutre">jour {e.jour} de chauffe</span>
        ) : (
          <span className="lem-pill" data-ton="attention">jamais démarrée</span>
        )}
      </div>

      {/* Les deux nombres qui comptent, et leur justification en clair. Un
          plafond sans son motif est un plafond qu'on contourne. */}
      <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
        <div>
          <div className="lem-second" style={{ fontSize: 12 }}>Chauffe visée aujourd’hui</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{e.viseAujourdHui}</div>
          <div className="lem-second" style={{ fontSize: 11.5 }}>
            cible {e.cibleJour}/j · {e.fenetre.de} h–{e.fenetre.a} h
            {e.coefficient < 1 && ` · week-end, ${Math.round(e.coefficient * 100)} %`}
          </div>
        </div>
        <div>
          <div className="lem-second" style={{ fontSize: 12 }}>Prospection autorisée</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{e.capacite?.froidAujourdhui ?? 0}</div>
          <div className="lem-second" style={{ fontSize: 11.5 }}>
            {e.capacite?.explication ?? 'La chauffe n’a pas démarré.'}
          </div>
        </div>
      </div>

      {/* ── L'honnêteté du chiffre de placement ──────────────────────────── */}
      <div style={{ marginTop: 14 }}>
        {mesures === 0 ? (
          <div className="lem-alerte" data-gravite="info">
            <Info size={14} />
            <span>
              <strong>Aucun placement mesuré.</strong> Le palier est gelé tant qu’on ne sait pas
              où atterrit le courrier — ce n’est pas « 0 % en boîte », c’est « on n’en sait
              rien », et les deux ne se traitent pas pareil.
              {!mesurePossible && ' Aucun témoin n’est lisible : il faut brancher l’IMAP d’au moins une boîte.'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="lem-pill" data-ton={TON_VERDICT[e.sante.verdict] ?? 'neutre'}>
              score {e.sante.score}/100 · {e.sante.verdict}
            </span>
            <span className="lem-second" style={{ fontSize: 12.5 }}>
              {Math.round(e.sante.tauxPlacement * 100)} % en boîte sur {mesures} mesurés ·
              {' '}{e.glissant.reponses} réponse(s) · {e.glissant.echecs} échec(s)
            </span>
          </div>
        )}
        {mesures > 0 && (
          <div className="lem-second" style={{ fontSize: 12.5, marginTop: 6 }}>{e.sante.motif}</div>
        )}
      </div>
    </div>
  )
}


/**
 * Le formulaire d'ajout d'un témoin.
 *
 * LE MOT DE PASSE EST FACULTATIF, ET C'EST VOULU. On peut enregistrer une boîte
 * sans identifiants : elle recevra du courrier — ce qui construit déjà de
 * l'historique — mais on ne saura pas où il atterrit. L'écran le dit alors en
 * toutes lettres (« envoi à l'aveugle ») plutôt que de refuser la saisie. Un
 * outil qui exige tout avant de rien accepter est un outil qu'on n'amorce
 * jamais.
 */
function Formulaire({ coffrePret, apres }: { coffrePret: boolean; apres: () => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [f, setF] = useState({
    email: '', nom: '', hote: '', port: 993, motDePasse: '', plafondJour: 8,
  })

  // L'HÔTE NE SE TAPE PLUS, IL SE DÉDUIT. Le formulaire proposait
  // `mail84.lwspanel.com` en dur — le serveur de NOTRE hébergeur, pour une
  // boîte Gmail : faux neuf fois sur dix, dans un champ que personne ne peut
  // vérifier de tête. `hotes-connus.ts` savait déjà répondre ; il n'était
  // simplement jamais consulté ici.
  const devine = suggestionHote(f.email)
  const estDeduit = !!devine && f.hote === devine.hote

  const saisirEmail = (email: string) => {
    const s = suggestionHote(email)
    setF((p) => (s ? { ...p, email, hote: s.hote, port: s.port } : { ...p, email }))
  }

  const soumettre = async () => {
    if (!f.email.trim() || !f.nom.trim()) {
      toast.error('L’adresse et le nom sont requis.')
      return
    }
    setEnvoi(true)
    try {
      const corps: Record<string, unknown> = {
        email: f.email.trim(), nom: f.nom.trim(), plafondJour: Number(f.plafondJour),
      }
      if (f.motDePasse) {
        corps.motDePasse = f.motDePasse
        // Vide, la route redéduit : mieux vaut son catalogue que notre champ.
        if (f.hote.trim()) corps.hote = f.hote.trim()
        corps.port = Number(f.port)
      }
      const res = await authedFetch('/api/prospection/rechauffeur/temoins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Enregistrement impossible')
      toast.success(
        data.branche
          ? `${data.email} branché (${data.famille}) — le placement sera mesuré.`
          : `${data.email} enregistré (${data.famille}) — envoi à l’aveugle, sans mesure.`,
      )
      setF({ ...f, email: '', nom: '', motDePasse: '' })
      setOuvert(false)
      apres()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setEnvoi(false)
    }
  }

  if (!ouvert) {
    return (
      <button className="lem-btn principal" onClick={() => setOuvert(true)} style={{ marginTop: 12 }}>
        <Plus size={14} /> Ajouter un témoin
      </button>
    )
  }

  return (
    <div style={{ marginTop: 12, padding: 14, border: '1px solid var(--lem-bord)', borderRadius: 12 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <label>
          <div className="lem-second" style={{ fontSize: 12 }}>Adresse</div>
          <input className="lem-champ" value={f.email} placeholder="prenom@orange.fr"
            onChange={(e) => saisirEmail(e.target.value)} />
        </label>
        <label>
          <div className="lem-second" style={{ fontSize: 12 }}>Nom affiché</div>
          <input className="lem-champ" value={f.nom} placeholder="Claire Petit"
            onChange={(e) => setF({ ...f, nom: e.target.value })} />
        </label>
        <label>
          <div className="lem-second" style={{ fontSize: 12 }}>Messages/jour</div>
          <input className="lem-champ" type="number" min={0} max={50} value={f.plafondJour}
            onChange={(e) => setF({ ...f, plafondJour: Number(e.target.value) })} />
        </label>
      </div>

      <div className="lem-second" style={{ fontSize: 12, margin: '14px 0 8px' }}>
        La famille (Gmail, Orange, Free…) se déduit toute seule de l’adresse — et le serveur
        IMAP avec elle. Il n’y a qu’une boîte de notre hébergeur à saisir à la main :
        <code> {HOTE_LWS}</code>, port 993.
      </div>

      {coffrePret ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <label>
            <div className="lem-second" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
              Serveur IMAP
              {estDeduit && (
                <span className="lem-pill" data-ton="ok">déduit · {devine.libelle}</span>
              )}
            </div>
            <input className="lem-champ" value={f.hote} placeholder={HOTE_LWS}
              onChange={(e) => setF({ ...f, hote: e.target.value })} />
          </label>
          <label>
            <div className="lem-second" style={{ fontSize: 12 }}>Port</div>
            <input className="lem-champ" type="number" value={f.port}
              onChange={(e) => setF({ ...f, port: Number(e.target.value) })} />
          </label>
          <label>
            <div className="lem-second" style={{ fontSize: 12 }}>
              Mot de passe <span style={{ opacity: 0.6 }}>(facultatif)</span>
            </div>
            <input className="lem-champ" type="password" value={f.motDePasse} autoComplete="new-password"
              onChange={(e) => setF({ ...f, motDePasse: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="lem-alerte">
          <AlertTriangle size={14} />
          <span>
            <strong>Pas de clé de chiffrement.</strong> Le mot de passe ne serait pas relisible, donc
            le champ n’est pas proposé — mieux vaut le dire avant qu’après. Poser la variable
            <code> RECHAUFFEUR_CLE</code> pour l’activer. Sans elle, le témoin recevra sans qu’on
            mesure rien.
          </span>
        </div>
      )}

      <div className="lem-second" style={{ fontSize: 11.5, marginTop: 10 }}>
        Le mot de passe est chiffré à l’arrivée (AES-256-GCM) et n’est jamais renvoyé au navigateur.
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="lem-btn principal" onClick={soumettre} disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="lem-btn discret" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </div>
  )
}

/**
 * Le mode d'emploi du maillage — ce que Matteo doit faire, fournisseur par
 * fournisseur.
 *
 * POURQUOI IL EST SUR CETTE PAGE ET PAS DANS `docs/`. Le geste se fait ici :
 * c'est ici qu'on découvre qu'il faut un mot de passe d'application, et ici
 * qu'on abandonne quand on ne le sait pas. Une documentation qu'il faut aller
 * chercher ailleurs est une documentation qu'on ne lit qu'après avoir échoué.
 *
 * IL EST REPLIÉ PAR DÉFAUT. Six fournisseurs détaillés au-dessus du formulaire
 * repousseraient hors de l'écran la seule chose qu'on vient y faire. Il
 * s'ouvre tout seul quand le maillage est vide — c'est exactement le moment où
 * personne ne sait par où commencer.
 */
function ModeEmploi({
  famillesManquantes,
  capaciteMaillage,
  cible,
}: {
  famillesManquantes: string[]
  capaciteMaillage: number
  cible: number
}) {
  const [ouvert, setOuvert] = useState(capaciteMaillage === 0)
  const Chevron = ouvert ? ChevronDown : ChevronRight

  return (
    <div className="lem-carte" style={{ padding: 18, marginTop: 16 }}>
      <button
        className="lem-btn discret"
        onClick={() => setOuvert((o) => !o)}
        style={{ padding: 0, gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--lem-encre)' }}
      >
        <Chevron size={15} />
        <BookOpen size={15} />
        Ajouter des boîtes témoins — le mode d’emploi, fournisseur par fournisseur
      </button>

      {/* LE DIMENSIONNEMENT SE DIT MÊME REPLIÉ. C'est le seul chiffre qui
          répond à « combien de boîtes faut-il ? », et il change tout seul. */}
      <p className="lem-second" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
        Le maillage porte <strong>{capaciteMaillage} message(s) par jour</strong>
        {cible > 0 ? (
          <>
            {' '}; la courbe en vise jusqu’à <strong>{cible}</strong> au régime de croisière.{' '}
            {capaciteMaillage < cible
              ? 'C’est donc le maillage qui plafonne la chauffe, pas la courbe : il faut des boîtes en plus, ou un plafond par boîte plus haut.'
              : 'Le maillage suit la courbe : il n’est pas le facteur limitant.'}
          </>
        ) : (
          '. Aucun expéditeur n’est enregistré : il n’y a pas encore de courbe à suivre.'
        )}
      </p>

      {ouvert && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div className="lem-alerte" data-gravite="info">
            <Info size={14} />
            <span>
              <strong>Ce qu’on cherche, c’est la diversité avant le volume.</strong> Cinq familles
              comptent — Google, Microsoft, Yahoo, <strong>Orange et Free</strong> — parce que ce
              sont celles de nos prospects. Cent messages tous chez Gmail ne disent rien de ce que
              fait Orange. Mieux vaut huit boîtes à 5 messages/jour que trois boîtes à 15 : une
              adresse qui reçoit quinze fois par jour du même expéditeur est elle-même un motif.
              <br />
              <strong>Deux ou trois boîtes par famille, pas davantage</strong> — au-delà, on
              achète de la capacité qu’on a déjà et un signal qu’on n’aura pas : une quatrième
              adresse Gmail ne dit rien qu’une troisième n’ait déjà dit.
            </span>
          </div>

          {MODES_OPERATOIRES.map((m) => {
            const manquante = famillesManquantes.includes(m.famille)
            return (
              <div
                key={m.famille}
                style={{
                  border: '1px solid var(--lem-bord)',
                  borderRadius: 'var(--lem-rayon)',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{m.libelle}</strong>
                  {m.famille !== 'autre' && (
                    <span className="lem-pill" data-ton={manquante ? 'attention' : 'ok'}>
                      {manquante ? 'famille absente du maillage' : 'famille couverte'}
                    </span>
                  )}
                  <span className="lem-pill" data-ton="neutre">
                    {m.creation === 'libre'
                      ? 'se crée en cinq minutes'
                      : m.creation === 'abonnement'
                        ? 'abonnement requis — la boîte s’emprunte'
                        : 'dans le panneau de l’hébergeur'}
                  </span>
                </div>

                <div className="lem-second" style={{ fontSize: 12, marginTop: 6 }}>
                  IMAP <code>{m.imap}</code> · port 993 ·{' '}
                  {m.famille === 'autre'
                    ? 'à taper, il ne se devine pas depuis l’adresse'
                    : 'rempli tout seul dès que l’adresse est saisie'}
                </div>

                <ol style={{ fontSize: 13, margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>
                  {m.etapes.map((etape, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{etape}</li>
                  ))}
                </ol>

                {m.piege && (
                  <div className="lem-alerte" style={{ marginTop: 10 }}>
                    <AlertTriangle size={14} />
                    <span>{m.piege}</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* ── Les deux questions qui reviennent, tranchées ici ─────────── */}
          <div style={{ border: '1px solid var(--lem-bord)', borderRadius: 'var(--lem-rayon)', padding: '12px 14px' }}>
            <strong style={{ fontSize: 14 }}>Créer un domaine, créer des adresses</strong>
            <ul style={{ fontSize: 13, margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.6 }}>
              <li>
                <strong>Un domaine Vercel ne porte pas de courrier.</strong> Ni un{' '}
                <code>*.vercel.app</code>, ni un domaine dont Vercel tient le DNS : Vercel héberge
                des sites, pas des boîtes. Il n’y a aucune adresse à créer là-bas — au mieux on y
                pose un enregistrement MX qui désigne un vrai hébergeur de messagerie.
              </li>
              <li>
                <strong>Les boîtes se créent chez LWS</strong>, dans le panneau de l’hébergement du
                domaine, onglet Emails. Elles sont comprises dans l’hébergement : c’est la façon la
                moins chère d’ajouter de la <em>capacité</em>. Serveur <code>{HOTE_LWS}</code>,
                port 993, identifiant = l’adresse complète.
              </li>
              <li>
                <strong>Un domaine neuf n’a pas besoin de vieillir pour recevoir.</strong>{' '}
                L’âge d’un domaine compte pour ce qu’il ENVOIE, pas pour ce qu’il reçoit : une
                boîte témoin créée aujourd’hui est utilisable aujourd’hui. C’est l’inverse d’un
                domaine expéditeur, qui lui demande un mois avant de servir.
              </li>
              <li>
                <strong>Jamais une boîte sur le domaine qui envoie.</strong>{' '}
                <code>contact@samadigitalstudio.fr</code> écrivant à une adresse du même domaine ne
                mesure rien : la réputation se construit chez le fournisseur du destinataire, et
                là le destinataire c’est nous. Ces boîtes-là ne remplacent aucune des cinq familles.
              </li>
            </ul>
          </div>

          <div className="lem-alerte" data-gravite="info">
            <Info size={14} />
            <span>
              <strong>Le mot de passe se tape ici, jamais ailleurs.</strong> Il est chiffré à
              l’arrivée (AES-256-GCM) et n’est jamais renvoyé au navigateur — pas même à toi. Il ne
              se colle donc ni dans un fichier, ni dans une conversation : le formulaire est le
              seul endroit qui sait quoi en faire.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function Rechauffeur() {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [chargement, setChargement] = useState(true)

  const recharger = React.useCallback(async () => {
    try {
      const res = await authedFetch('/api/prospection/rechauffeur')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Lecture impossible')
      setEtat(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lecture impossible')
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => { void recharger() }, [recharger])

  const basculer = async (t: Temoin) => {
    const res = await authedFetch('/api/prospection/rechauffeur/temoins', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, actif: !t.actif }),
    })
    if (!res.ok) { toast.error('Bascule impossible'); return }
    await recharger()
  }

  const retirer = async (t: Temoin) => {
    const res = await authedFetch(`/api/prospection/rechauffeur/temoins?id=${t.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { toast.error(data?.error ?? 'Retrait impossible'); return }
    // Un témoin qui a déjà reçu n'est pas supprimé mais éteint : ses messages
    // partiraient avec lui, et l'historique de placement changerait
    // rétroactivement sous la décision de palier.
    toast.success(
      data.eteint
        ? `${t.email} éteint — il a ${data.messages} message(s) à son histoire, on ne les efface pas.`
        : `${t.email} retiré.`,
    )
    await recharger()
  }

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Réchauffeur</h1>
            <p className="lem-sous">
              Du courrier ordinaire, envoyé chaque jour vers des boîtes témoins, pour que le
              domaine ait un historique avant de démarcher. Il part par Resend, comme la
              prospection — c’est la seule façon dont la chauffe lui profite.
            </p>
          </div>
        </header>

        {chargement ? (
          <div className="lem-carte"><div className="lem-vide">Lecture de la chauffe…</div></div>
        ) : !etat ? (
          <div className="lem-carte"><div className="lem-vide">État indisponible.</div></div>
        ) : (
          <>
            {etat.temoinsActifs === 0 && (
              <div className="lem-alerte" data-gravite="bloquant" style={{ marginBottom: 16 }}>
                <AlertTriangle size={14} />
                <span>
                  <strong>Aucun témoin actif.</strong> Un réchauffeur sans destinataire ne fait
                  rien du tout. Il faut des boîtes réelles chez les fournisseurs de tes
                  prospects — Gmail, Outlook, Yahoo, et surtout <strong>Orange et Free</strong>,
                  omniprésents chez les artisans et absents de tous les réseaux de chauffe
                  américains.
                </span>
              </div>
            )}

            {etat.expediteurs.length === 0 ? (
              <div className="lem-carte"><div className="lem-vide">Aucun expéditeur enregistré.</div></div>
            ) : (
              etat.expediteurs.map((e) => (
                <Expediteur key={e.id} e={e} mesurePossible={etat.mesurePossible} />
              ))
            )}

            {/* ── Le maillage ─────────────────────────────────────────────── */}
            <div className="lem-carte" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Inbox size={15} />
                <strong>Le maillage de témoins</strong>
                <span className="lem-pill" data-ton="neutre">
                  {etat.capaciteMaillage} message(s) de capacité aujourd’hui
                </span>
              </div>
              <p className="lem-second" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
                Un témoin qu’on ne peut pas lire reçoit sans rien nous apprendre : le message
                part, mais on ne saura jamais s’il est arrivé en boîte ou en spam.
              </p>

              {etat.famillesManquantes.length > 0 && (
                <div className="lem-alerte" style={{ marginBottom: 10 }}>
                  <AlertTriangle size={14} />
                  <span>
                    Familles absentes : <strong>{etat.famillesManquantes.join(', ')}</strong>.
                    Cent messages tous chez Gmail ne disent rien de ce que fait Orange.
                  </span>
                </div>
              )}

              {etat.maillage.length === 0 ? (
                <div className="lem-vide">Aucun témoin enregistré.</div>
              ) : (
                <table className="lem-table">
                  <tbody>
                    {etat.maillage.map((t) => (
                      <tr key={t.id}>
                        <td style={{ width: 92 }}>
                          <span className="lem-pill" data-ton="neutre">{t.famille}</span>
                        </td>
                        <td>
                          <div>{t.email}</div>
                          <div className="lem-second" style={{ fontSize: 11.5 }}>
                            {t.recus_aujourdhui}/{t.plafond_jour} aujourd’hui
                          </div>
                        </td>
                        <td style={{ width: 240, textAlign: 'right' }}>
                          {!t.actif && <span className="lem-pill" data-ton="neutre">éteint</span>}
                          {t.actif && t.peut_lire && (
                            <span className="lem-pill" data-ton="ok">lisible</span>
                          )}
                          {t.actif && !t.peut_lire && (
                            <span className="lem-pill" data-ton="attention">envoi à l’aveugle</span>
                          )}
                          <button className="lem-btn discret"
                            title={t.actif ? 'Éteindre' : 'Rallumer'}
                            style={{ marginLeft: 8 }} onClick={() => void basculer(t)}>
                            <Power size={13} />
                          </button>
                          <button className="lem-btn discret"
                            title="Retirer" style={{ marginLeft: 4 }} onClick={() => void retirer(t)}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* LE DIRE AVANT D'OUVRIR LE FORMULAIRE, PAS DEDANS. Sans la clé,
                  les champs IMAP ne sont pas proposés — et quelqu'un qui vient
                  brancher ses boîtes cherche « où mettre l'IMAP » sur une page
                  qui n'en parle qu'une fois le formulaire déplié. */}
              {!etat.coffrePret && (
                <div className="lem-alerte" style={{ marginTop: 12 }}>
                  <AlertTriangle size={14} />
                  <span>
                    <strong>Les champs IMAP ne sont pas proposés</strong> tant que la variable
                    <code> RECHAUFFEUR_CLE</code> n’est pas posée sur Vercel — Production
                    <em> et</em> Preview. Sans elle le mot de passe serait chiffré sans clé, donc
                    illisible : mieux vaut ne pas le demander que le perdre. Une fois la variable
                    posée et le déploiement refait, serveur, port et mot de passe apparaissent
                    ci-dessous.
                  </span>
                </div>
              )}

              <Formulaire coffrePret={etat.coffrePret} apres={() => void recharger()} />
            </div>

            <ModeEmploi
              famillesManquantes={etat.famillesManquantes}
              capaciteMaillage={etat.capaciteMaillage}
              cible={Math.max(0, ...etat.expediteurs.map((e) => e.cibleJour))}
            />

            <div className="lem-alerte" data-gravite="info" style={{ marginTop: 16 }}>
              <Flame size={14} />
              <span>
                La santé module la <strong>prospection</strong>, jamais la chauffe. On ne réduit
                pas la chauffe parce que ça va mal : c’est précisément le remède.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
