// moteur.ts — le tick du réchauffeur : planifier, puis envoyer.
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/warmup/engine.ts` (486 l.),
// dont il ne reprend pour l'instant que les deux premières phases. L'original
// en avait six : planifier · envoyer · MESURER LE PLACEMENT · SORTIR DU SPAM ·
// RÉPONDRE · agréger. Les trois manquantes ont toutes le même prérequis —
// LIRE les boîtes témoins en IMAP — et l'IMAP n'est pas une dépendance du CRM.
// Les ajouter, c'est ajouter `imapflow` : une décision qui se prend, pas qui se
// glisse dans un commit de portage.
//
// CE QUE CE MOTEUR VAUT SANS CETTE MOITIÉ, dit franchement : il envoie du
// courrier ordinaire depuis l'adresse de prospection vers des boîtes qui le
// reçoivent — c'est déjà du trafic légitime, et c'est déjà ce qui construit
// l'historique d'envoi. Mais il ne SAIT PAS où le courrier atterrit. Or
// `sante()` refuse de monter le palier tant qu'aucun placement n'est mesuré :
// le réchauffeur ne s'emballera donc pas tout seul. Il tiendra son palier de
// départ, et l'écran dira pourquoi. C'est le bon comportement pour une moitié
// d'outil — pas de chiffre inventé, pas de progression fantôme.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  coefficientDuJour,
  creneauxDuJour,
  jourDeChauffe,
  palierDuJour,
} from './courbe'
import { delaiDeReponseMs } from './courbe'
import {
  capaciteDuMaillage,
  choisirTemoins,
  doitRepondre,
  type Temoin,
} from './appariement'
import { composerMessage, composerReponse, nouvelleReference } from './contenu'
import { envoyerChauffe } from './envoi-resend'
import { envoyerDepuisTemoin, sauverDuSpam, scanner } from './connecteur-imap'
import {
  chargerExpediteurs,
  chargerTemoins,
  historiqueAppariement,
  journaliser,
  marquerEchec,
  marquerEnvoye,
  messagesDus,
  planifierMessages,
  recompterLeJour,
  reclamerLaJournee,
  reclamerMessage,
  enregistrerReponse,
  marquerIntrouvables,
  marquerPlacement,
  marquerRepondu,
  marquerSortiDuSpam,
  messageParReference,
  messagesARepondre,
  secretDuTemoin,
  type Expediteur,
} from './rechauffeur-db'

export interface ResultatTick {
  expediteurs: number
  planifies: number
  envoyes: number
  echecs: number
  /** Messages qu'un autre tick avait déjà pris. */
  doubles: number
  enBoite: number
  enSpam: number
  sortisDuSpam: number
  introuvables: number
  /**
   * Messages soldés sans avoir été regardés : leur témoin n'a pas
   * d'identifiants. Ils sont partis — ils construisent de l'historique — et
   * ils n'apprennent rien. Comptés à part pour qu'ils ne se déguisent jamais
   * en rejets silencieux.
   */
  nonMesures: number
  reponses: number
  /** Ce que l'humain doit lire — jamais un compteur muet. */
  alertes: string[]
}

/**
 * Combien d'envois au maximum sur un tick.
 *
 * Le cron tourne toutes les dix minutes et les créneaux sont étalés sur onze
 * heures : en régime normal, un ou deux messages sont dus. La borne protège du
 * rattrapage après une coupure — soixante envois d'un coup effaceraient
 * l'étalement horaire, qui est la moitié du travail.
 */
const MAX_ENVOIS_PAR_TICK = 6

/**
 * Sur combien de temps on relit les boîtes témoins.
 *
 * Quatre heures pour un cron aux dix minutes, soit vingt-quatre passages de
 * recouvrement. C'est délibérément large : un message classé en spam peut
 * mettre du temps à apparaître, et relire un message déjà mesuré ne coûte
 * rien — `mesurerPlacements` ignore tout ce qui n'est plus « en attente ».
 */
const FENETRE_SCAN_MINUTES = 240

/** Les réponses sont bornées comme les envois : pas de rafale après une coupure. */
const MAX_REPONSES_PAR_TICK = 10

/** Le jour civil, en UTC — le même repère que `rechauffe_jours.jour`. */
function jourCivil(quand: Date): string {
  return quand.toISOString().slice(0, 10)
}

/** Planifie la journée d'un expéditeur, si elle ne l'est pas déjà. */
async function planifierJournee(
  sb: SupabaseClient,
  expediteur: Expediteur,
  temoins: Temoin[],
  maintenant: Date,
  alertes: string[],
): Promise<number> {
  const jour = jourDeChauffe(expediteur.demarreLe, maintenant)
  if (jour <= 0) return 0

  const jourISO = jourCivil(maintenant)
  if (!(await reclamerLaJournee(sb, expediteur.id, jourISO, jour))) return 0

  const palier = palierDuJour(jour, expediteur.cibleJour)
  const vise = Math.round(palier.chauffe * coefficientDuJour(maintenant))
  if (vise <= 0) return 0

  const { recents, chargeDuJour } = await historiqueAppariement(sb, expediteur.id, maintenant)
  const capacite = capaciteDuMaillage(temoins, chargeDuJour)
  if (capacite < vise) {
    alertes.push(
      `${expediteur.email} : la courbe demande ${vise} messages, le maillage n'en porte que ${capacite}.`,
    )
  }

  const choisis = choisirTemoins(temoins, Math.min(vise, capacite), { recents, chargeDuJour })
  if (choisis.length === 0) return 0

  const creneaux = creneauxDuJour(choisis.length, maintenant, expediteur.fuseau, expediteur.fenetre)
  const messages = choisis.map((temoin, i) => {
    const compose = composerMessage({
      nomExpediteur: expediteur.nom,
      emailExpediteur: expediteur.email,
      nomDestinataire: temoin.nom,
      emailDestinataire: temoin.email,
    })
    return {
      reference: nouvelleReference(),
      expediteurId: expediteur.id,
      temoinId: temoin.id,
      objet: compose.objet,
      texte: compose.texte,
      prevuLe: creneaux[i].toISOString(),
    }
  })

  const n = await planifierMessages(sb, messages)
  await journaliser(sb, 'journee_planifiee', { jour, vise, planifies: n }, expediteur.id)
  return n
}


/**
 * Phase 3 et 4 — mesurer où le courrier a atterri, et le sortir du spam.
 *
 * ON NE LIT QUE CE QUI PORTE NOTRE EN-TÊTE. Un témoin est une vraie boîte avec
 * du vrai courrier ; `extraireReference` écarte tout ce qui n'est pas à nous,
 * et rien d'autre n'est jamais ouvert, déplacé ni marqué.
 *
 * UN PLACEMENT NE SE RÉÉCRIT PAS. Une fois qu'un message est dit « en boîte »
 * ou « en spam », les passages suivants le laissent tel quel : c'est ce qui
 * rend l'historique des sept jours stable, alors que `sante()` décide dessus.
 * Sans ça, sauver un message du spam le ferait basculer en « boîte » au tick
 * d'après, et le taux de placement mesurerait notre propre sauvetage.
 */
async function mesurerPlacements(
  sb: SupabaseClient,
  temoins: Temoin[],
  resultat: ResultatTick,
): Promise<void> {
  for (const temoin of temoins) {
    if (!temoin.actif) continue

    let acces
    try {
      acces = await secretDuTemoin(sb, temoin.id)
    } catch (err) {
      resultat.alertes.push(
        `${temoin.email} : secret illisible (${err instanceof Error ? err.message : 'erreur'}). ` +
          'La clé de chiffrement a-t-elle changé ?',
      )
      continue
    }
    if (!acces) continue // témoin sans identifiants : envoi à l'aveugle assumé

    let trouves
    try {
      trouves = await scanner(acces.hote, acces.secret, FENETRE_SCAN_MINUTES)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erreur'
      resultat.alertes.push(`Lecture impossible sur ${temoin.email} : ${message.slice(0, 160)}`)
      await sb.from('rechauffe_temoins').update({ derniere_erreur: message.slice(0, 500) }).eq('id', temoin.id)
      continue
    }

    for (const trouve of trouves) {
      const message = await messageParReference(sb, trouve.reference)
      if (!message || message.placement !== 'attente') continue

      await marquerPlacement(sb, message.id, trouve.dossier)
      await journaliser(sb, trouve.dossier === 'spam' ? 'trouve_spam' : 'trouve_boite',
        { temoin: temoin.email }, message.expediteurId, message.id)

      if (trouve.dossier === 'boite') {
        resultat.enBoite += 1
        continue
      }

      resultat.enSpam += 1
      try {
        await sauverDuSpam(acces.hote, acces.secret, trouve)
        await marquerSortiDuSpam(sb, message.id)
        await journaliser(sb, 'sorti_du_spam', { temoin: temoin.email }, message.expediteurId, message.id)
        resultat.sortisDuSpam += 1
      } catch (err) {
        // Le sauvetage peut échouer (dossier introuvable, droits) : le
        // PLACEMENT reste enregistré, et c'est lui qui porte la mesure.
        await journaliser(sb, 'sauvetage_echoue',
          { erreur: err instanceof Error ? err.message.slice(0, 300) : 'erreur' },
          message.expediteurId, message.id)
      }
    }
  }
}

/**
 * Phase 5 — les témoins répondent.
 *
 * LA RÉPONSE PART DU SMTP DU TÉMOIN, jamais de Resend. Une réponse expédiée
 * par le vrai Gmail est un vrai message Gmail-vers-nous : c'est le signal
 * d'engagement le plus fort qu'un fournisseur enregistre, et le faire partir
 * de chez nous le viderait de tout son sens.
 */
async function faireRepondre(
  sb: SupabaseClient,
  temoins: Map<string, Temoin>,
  expediteurs: Map<string, Expediteur>,
  resultat: ResultatTick,
  maintenant: Date,
): Promise<void> {
  const dus = await messagesARepondre(sb, MAX_REPONSES_PAR_TICK, maintenant)

  for (const du of dus) {
    const temoin = temoins.get(du.temoinId)
    const expediteur = expediteurs.get(du.expediteurId)
    if (!temoin || !expediteur) continue

    const acces = await secretDuTemoin(sb, du.temoinId).catch(() => null)
    if (!acces) {
      // Sans identifiants on ne peut pas faire répondre : on retire l'échéance
      // plutôt que de la laisser se représenter à chaque tick pour l'éternité.
      await marquerRepondu(sb, du.id, maintenant)
      continue
    }

    const compose = composerReponse(
      {
        nomExpediteur: temoin.nom,
        emailExpediteur: temoin.email,
        nomDestinataire: expediteur.nom,
        emailDestinataire: expediteur.email,
      },
      du.objetOriginal,
    )

    try {
      const envoi = await envoyerDepuisTemoin(acces.hote, acces.secret, {
        nomExpediteur: temoin.nom,
        emailExpediteur: temoin.email,
        vers: expediteur.email,
        nomDestinataire: expediteur.nom,
        objet: compose.objet,
        texte: compose.texte,
        reference: compose.reference,
        enReponseA: du.messageIdRfc,
      })
      await enregistrerReponse(sb, {
        expediteurId: du.expediteurId,
        temoinId: du.temoinId,
        reference: compose.reference,
        objet: compose.objet,
        messageIdRfc: envoi.messageIdRfc,
      }, maintenant)
      await marquerRepondu(sb, du.id, maintenant)
      await journaliser(sb, 'repondu', { par: temoin.email }, du.expediteurId, du.id)
      resultat.reponses += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erreur'
      resultat.alertes.push(`Réponse impossible depuis ${temoin.email} : ${message.slice(0, 160)}`)
      await sb.from('rechauffe_temoins').update({ derniere_erreur: message.slice(0, 500) }).eq('id', du.temoinId)
    }
  }
}

/**
 * Un tick.
 *
 * PLANIFIER PUIS ENVOYER DANS LE MÊME PASSAGE, et non l'inverse : un créneau
 * tiré pour 8 h 12 doit pouvoir partir au tick de 8 h 20 du même jour. Planifier
 * après aurait décalé toute la première journée d'un cran.
 */
export async function tickRechauffeur(
  sb: SupabaseClient,
  options: { maintenant?: Date; maxEnvois?: number } = {},
): Promise<ResultatTick> {
  const maintenant = options.maintenant ?? new Date()
  const maxEnvois = options.maxEnvois ?? MAX_ENVOIS_PAR_TICK
  const resultat: ResultatTick = {
    expediteurs: 0, planifies: 0, envoyes: 0, echecs: 0, doubles: 0,
    enBoite: 0, enSpam: 0, sortisDuSpam: 0, introuvables: 0, nonMesures: 0, reponses: 0,
    alertes: [],
  }

  const [expediteurs, temoins] = await Promise.all([
    chargerExpediteurs(sb),
    chargerTemoins(sb),
  ])
  resultat.expediteurs = expediteurs.length
  if (expediteurs.length === 0) return resultat

  if (temoins.filter((t) => t.actif).length === 0) {
    resultat.alertes.push(
      'Aucun témoin actif : rien à chauffer. Un réchauffeur sans destinataire ne fait rien du tout.',
    )
    return resultat
  }

  for (const e of expediteurs) {
    resultat.planifies += await planifierJournee(sb, e, temoins, maintenant, resultat.alertes)
  }

  // ── Envoi ────────────────────────────────────────────────────────────────
  const parExpediteur = new Map(expediteurs.map((e) => [e.id, e]))
  const parTemoin = new Map(temoins.map((t) => [t.id, t]))
  const dus = await messagesDus(sb, maxEnvois, maintenant)

  for (const m of dus) {
    const expediteur = parExpediteur.get(m.expediteurId)
    const temoin = parTemoin.get(m.temoinId)
    // Un expéditeur remis en pause, ou un témoin éteint depuis la
    // planification : le message reste en file, il ne part pas.
    if (!expediteur || !temoin || !temoin.actif) continue

    if (!(await reclamerMessage(sb, m))) {
      resultat.doubles += 1
      continue
    }

    const envoi = await envoyerChauffe({
      de: expediteur.email,
      nomExpediteur: expediteur.nom,
      vers: temoin.email,
      nomDestinataire: temoin.nom,
      objet: m.objet,
      texte: m.texte,
      reference: m.reference,
    })

    if (envoi.ok) {
      // Le témoin répondra-t-il ? On tire UNE FOIS, ici, et on inscrit la date.
      // Tirer à chaque tick ferait dépendre le comportement du témoin de la
      // fréquence à laquelle on l'observe — un même message finirait toujours
      // par obtenir sa réponse, à force de repasser.
      const reponseDue = doitRepondre(temoin)
        ? new Date(maintenant.getTime() + delaiDeReponseMs())
        : null
      await marquerEnvoye(sb, m.id, envoi.resendId ?? null, maintenant, reponseDue)
      await journaliser(sb, 'envoye', { vers: temoin.email, reponseAttendue: !!reponseDue }, expediteur.id, m.id)
      resultat.envoyes += 1
    } else {
      await marquerEchec(sb, m.id, envoi.erreur ?? 'Erreur inconnue')
      await journaliser(sb, 'echec_envoi', { erreur: envoi.erreur }, expediteur.id, m.id)
      resultat.echecs += 1
    }
  }

  // ── Mesure, sauvetage, réponses ─────────────────────────────────────────
  // APRÈS l'envoi, dans le même tick : un message parti il y a huit minutes
  // est déjà arrivé chez le témoin, et la fenêtre de scan de quatre heures le
  // rattrapera de toute façon au passage suivant.
  await mesurerPlacements(sb, temoins, resultat)

  await faireRepondre(sb, parTemoin, parExpediteur, resultat, maintenant)

  // Ni boîte ni spam au bout de six heures : il faut solder, sans quoi ces
  // messages resteraient « en attente » pour toujours et fausseraient le taux
  // de placement en le laissant artificiellement haut.
  //
  // MAIS EN DEUX TAS. Chez un témoin lisible, c'est un rejet silencieux — le
  // pire des trois cas, on ne saura même pas quoi corriger. Chez un témoin
  // sans identifiants, personne n'est allé voir : le message est peut-être
  // parfaitement arrivé, et le compter comme un rejet ferait chuter le score
  // d'un expéditeur qui va bien. C'est le cas d'Outlook.com, qui n'accepte
  // plus que OAuth2 sur IMAP et ne peut donc pas être branché par mot de
  // passe.
  const soldes = await marquerIntrouvables(sb, 6, maintenant)
  resultat.introuvables = soldes.introuvables
  resultat.nonMesures = soldes.nonMesures

  // L'agrégat se RECOMPTE depuis les messages plutôt que de s'incrémenter :
  // un compteur qu'on incrémente diverge au premier tick interrompu, et plus
  // rien ne dit lequel des deux chiffres est le bon.
  const jourISO = jourCivil(maintenant)
  for (const e of expediteurs) await recompterLeJour(sb, e.id, jourISO)

  return resultat
}
