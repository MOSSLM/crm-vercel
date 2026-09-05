// conditions-db.ts — aller chercher ce qu'il faut pour trancher une fourche.
//
// MÊME DÉCOUPAGE QUE `regulator.ts` / `regulator-db.ts` : la décision est pure
// (`conditions.ts`, éprouvable sans base), la collecte est ici. Ce fichier ne
// décide de rien — il relève, et il a le droit de ne pas trouver.
//
// NE PAS TROUVER EST UN RÉSULTAT. Un champ laissé `undefined` veut dire « pas
// allé chercher », un `null` veut dire « cherché, rien pour ce prospect » : les
// deux rendent `non_mesure`, et c'est voulu. Ce qui serait faux, c'est de
// rendre `false` — on ne peut pas distinguer après coup une entreprise sans
// e-mail d'une lecture qui a échoué.
//
// UNE SEULE PASSE, SEPT LECTURES. Une condition s'évalue au moment où le tick
// arrive dessus, pour UN prospect : on lit large une fois plutôt que d'ajouter
// une requête par champ. Chaque lecture est indépendante et facultative — une
// table absente coûte un champ à `undefined`, jamais le tick.
import type { SupabaseClient } from '@supabase/supabase-js'
import { collecterCanaux } from '@/lib/prospects/canal'
import { intentByEnterprise } from '@/lib/analytics-radar/site-intent'
import { effectifPlancher, type FaitsProspect } from '@/lib/automations/conditions'

/** L'identité du prospect, telle que l'inscription la porte. */
export interface CibleCondition {
  entrepriseId: number | null
  contactId: string | null
  opportuniteId: string | null
}

const premier = <T,>(v: unknown): T | null =>
  (Array.isArray(v) ? (v[0] as T | undefined) : (v as T | null)) ?? null

/**
 * Ce qu'on sait de ce prospect, maintenant.
 *
 * Sans entreprise, on ne sait rien : l'essentiel des faits est porté par elle,
 * et rendre un objet vide dit exactement ça — toutes les conditions rendront
 * `non_mesure`, aucune ne prétendra un `non`.
 */
export async function releverLesFaits(
  sb: SupabaseClient,
  cible: CibleCondition,
): Promise<FaitsProspect> {
  if (cible.entrepriseId == null) return {}
  const id = cible.entrepriseId
  const faits: FaitsProspect = {}

  const [entreprise, contacts, presence, publiques, pipeline, rebond, appel, jetons] = await Promise.all([
    sb.from('entreprises').select('email, telephone, telephones, cohorte_demarchage').eq('id', id).maybeSingle(),
    sb.from('contacts').select('email, tel, first_name, last_name, is_decision_maker').eq('entreprise_id', id),
    sb.from('v_presence_actuelle').select('etat').eq('entreprise_id', id).eq('sujet', 'site_web').maybeSingle(),
    sb.from('entreprises_donnees_publiques').select('chiffre_affaires, tranche_effectif_code').eq('entreprise_id', id).maybeSingle(),
    cible.opportuniteId
      ? sb.from('sales_pipeline_state').select('rdv_at').eq('opportunite_id', cible.opportuniteId).maybeSingle()
      : Promise.resolve({ data: null }),
    // Un rebond dur suffit : `email_suppressions` est la liste des adresses
    // qu'on a cessé de servir, `delivery_status` la trace de l'envoi qui l'a
    // causée. On interroge la première, c'est elle qui fait autorité.
    sb.from('email_logs').select('delivery_status').eq('entreprise_id', id).eq('delivery_status', 'bounced').limit(1),
    // ⚠️ L'ISSUE SE LIT SUR LA NOTE, PAS SUR LE STATUT DE LA TÂCHE.
    //
    // On lisait `prospection_tasks.status` — `pending` / `done` / `skipped` /
    // `snoozed`. Le vocabulaire de la condition, lui, parle de « a répondu »,
    // « pas intéressé », « mis de côté » : deux listes qui ne se rencontrent
    // jamais, donc une condition qui répondait « non » à tout le monde sans que
    // rien ne le dise. Une fourche qui ne mesure jamais ce qu'elle prétend
    // tester est pire qu'une fourche absente : elle a l'air de fonctionner.
    //
    // Ce que l'agent note en terminant une tâche va dans `email_logs.outcome`,
    // avec le vocabulaire de `STEP_OUTCOMES` — c'est là qu'il faut regarder.
    sb.from('email_logs').select('outcome, created_at').eq('entreprise_id', id)
      .not('outcome', 'is', null).order('created_at', { ascending: false }).limit(1),
    // Les vues des liens à jeton — le seul signal d'intention qu'on mesure
    // vraiment. Comptées côté serveur à l'ouverture de la page, sans pixel ni
    // réécriture de lien : rien n'est posé chez le destinataire, donc rien
    // n'abîme la réputation de la boîte.
    sb.from('entreprises_rapport_public').select('vues, plaquette_vues, plaquette_token')
      .eq('entreprise_id', id).maybeSingle(),
  ])

  const ent = entreprise.data as
    | { email: string | null; telephone: string | null; telephones: string[] | null; cohorte_demarchage: string | null }
    | null

  const fiches = (contacts.data ?? []) as {
    email: string | null; tel: string | null
    first_name: string | null; last_name: string | null; is_decision_maker: boolean | null
  }[]

  if (ent) {
    // `collecterCanaux` est LA lecture des canaux du CRM — entreprise et
    // contacts confondus, décideurs d'abord. La refaire ici donnerait une
    // seconde définition de « joignable », et les deux divergeraient.
    const canaux = collecterCanaux({
      entrepriseEmail: ent.email,
      entrepriseTelephones: [ent.telephone, ...(ent.telephones ?? [])],
      contacts: fiches.map((c) => ({
        email: c.email, tel: c.tel, isDecisionMaker: c.is_decision_maker ?? false,
      })),
    })
    // ── ON NE MASQUE RIEN, ET C'EST UNE DÉCISION DE MATTEO ────────────────
    //
    // Une version de ce fichier rendait `aEmail` faux quand le canal e-mail
    // était suspendu, pour que l'échelle de canaux CONTOURNE le barreau et
    // descende à l'appel. Ça marchait — et c'était le mauvais arbitrage.
    //
    // Le verdict d'une question s'écrit UNE FOIS dans l'inscription
    // (`vars.conditions`), puis elle avance. Contourner ne reportait donc pas
    // l'e-mail : il l'ABANDONNAIT. Le jour où le canal rouvre, le prospect est
    // déjà passé à l'appel et ne revient pas en arrière. Matteo préfère qu'il
    // attende : « si ça fige ceux qu'on doit contacter par e-mail, ça me va ».
    //
    // Le fait redevient donc ce qu'il dit : « il a une adresse ». La suspension
    // se joue au moment de l'envoi (`canalSuspendu` dans `engine.ts`), où elle
    // retient l'inscription au lieu de la faire avancer — et où elle se relit à
    // chaque tick, donc se lève d'elle-même à la réouverture.
    faits.aEmail = canaux.canaux.has('email')
    faits.aMobile = canaux.canaux.has('mobile')
    faits.aFixe = canaux.canaux.has('fixe')
    faits.cohorte = ent.cohorte_demarchage
    // NOMINATIF veut dire qu'on peut écrire À QUELQU'UN : un nom ET une
    // adresse. 75 fiches sur 905 — c'est ce chiffre qui interdit de proposer
    // « 30 jours équilibré » en tête du catalogue.
    faits.aContactNominatif = fiches.some(
      (c) => (c.email ?? '').trim() !== '' && `${c.first_name ?? ''}${c.last_name ?? ''}`.trim() !== '',
    )
  }

  // TROIS ÉTATS, ET C'EST NOTRE AVANTAGE. `absent` est un constat, `inconnu`
  // aussi — ils ne s'écrivent pas comme le même NULL. Aucune ligne du tout,
  // en revanche, veut dire qu'on n'a jamais regardé.
  const etat = (presence.data as { etat: string | null } | null)?.etat
  faits.presenceWeb =
    etat === 'present' || etat === 'absent' || etat === 'inconnu' ? etat : null

  const pub = publiques.data as { chiffre_affaires: number | null; tranche_effectif_code: string | null } | null
  faits.ca = pub?.chiffre_affaires ?? null
  // `NN` rend `null` : « effectif inconnu » n'est pas « zéro salarié ».
  faits.effectif = effectifPlancher(pub?.tranche_effectif_code)

  faits.rdvPris = cible.opportuniteId
    ? Boolean((pipeline.data as { rdv_at: string | null } | null)?.rdv_at)
    : undefined

  faits.aRebondi = ((rebond.data ?? []) as unknown[]).length > 0

  // PAS DE LIGNE = PAS DE RAPPORT PUBLIÉ, donc rien à ouvrir : `undefined`,
  // « on n'a pas mesuré ». Zéro vue sur un rapport QUI EXISTE, en revanche, est
  // une mesure : il a été publié et personne ne l'a ouvert. Aplatir les deux
  // ferait passer pour « pas intéressé » un prospect à qui on n'a jamais rien
  // envoyé — et c'est précisément la distinction que ce CRM refuse de perdre.
  const jeton = jetons.data as
    | { vues: number | null; plaquette_vues: number | null; plaquette_token: string | null }
    | null
  faits.rapportVu = jeton ? (jeton.vues ?? 0) > 0 : undefined
  faits.plaquetteVue = jeton?.plaquette_token ? (jeton.plaquette_vues ?? 0) > 0 : undefined

  // Aucune note du tout : `null`, « on a cherché, il n'y a rien » — la
  // condition rendra `non_mesure`, pas `non`. Un prospect qu'on n'a jamais
  // appelé n'a pas « refusé ».
  const derniere = premier<{ outcome: string | null }>(appel.data)
  faits.issueDernierAppel = derniere?.outcome ?? null

  faits.demoVisitee = await lireLaVisiteDeLaDemo(sb, id)

  return faits
}

/**
 * Le prospect est-il venu voir SA démo ?
 *
 * POURQUOI CE CHAMP EXISTE, ET POURQUOI IL REMPLACE `plaquette_vue`.
 * La démo est la seule pièce dont l'URL part réellement chez le prospect — la
 * plaquette est jointe en PDF, le rapport n'est jamais lié. Les compteurs à
 * jeton ne mesurent donc que nos propres ouvertures ; celui-ci mesure la
 * sienne.
 *
 * LES TROIS RÉPONSES, ET LA DIFFÉRENCE ENTRE DEUX D'ENTRE ELLES EST TOUT
 * L'INTÉRÊT DU FICHIER :
 *   · `undefined` — on n'a PAS PU regarder (GA4 non configuré, lecture en
 *     échec). Rendra `non_mesure`, jamais « non ».
 *   · `false`     — on a regardé, et personne n'est venu sur la fenêtre lue.
 *     C'est une mesure, et elle vaut : la démo a été envoyée, elle n'a pas été
 *     ouverte.
 *   · `true`      — au moins une session sur son nom d'hôte.
 *
 * FENÊTRE DE 30 JOURS, et pas les 7 par défaut : une condition de séquence se
 * pose des jours après l'envoi (S2 appelle au J+2 ou J+4, S3 à 30 jours). Sur
 * 7 jours, une visite du lendemain serait déjà sortie de la fenêtre au moment
 * où l'on décide — on lirait « il n'est jamais venu » d'un prospect qui est
 * venu. `intentBySite` met sa lecture en cache, donc les 200 inscriptions d'un
 * même tick partagent un seul appel à GA4.
 *
 * UNE PANNE DE GA4 NE DOIT PAS COÛTER LE TICK : comme les sept autres lectures
 * de ce fichier, celle-ci a le droit d'échouer et rend alors `undefined`.
 */
async function lireLaVisiteDeLaDemo(
  sb: SupabaseClient,
  entrepriseId: number,
): Promise<boolean | undefined> {
  try {
    const parEntreprise = await intentByEnterprise(sb, 30)
    // Une carte vide ne se lit pas comme « personne n'est venu » : sans GA4,
    // `intentBySite` rend une liste vide exactement comme un parc sans visite.
    // On ne peut pas distinguer les deux ici, et on ne le prétend pas.
    if (parEntreprise.size === 0) return undefined
    return (parEntreprise.get(entrepriseId)?.sessions ?? 0) > 0
  } catch {
    return undefined
  }
}

/**
 * L'audit et la démo : deux lectures à part, parce que le moteur les fait DÉJÀ.
 *
 * `etapePromettUnAuditAbsent` / `etapePromettUneDemoAbsente` gardent l'envoi
 * d'un message qui promet une pièce manquante. Une condition « l'audit est-il
 * prêt ? » pose la même question un cran plus tôt — pour AIGUILLER au lieu de
 * geler. Les deux doivent répondre pareil : c'est pourquoi le moteur passe ce
 * qu'il a déjà résolu, plutôt que de le relire ici avec d'autres critères.
 */
export function ajouterLesPieces(
  faits: FaitsProspect,
  pieces: { auditPret?: boolean; demoPrete?: boolean },
): FaitsProspect {
  return {
    ...faits,
    ...(pieces.auditPret !== undefined ? { auditPret: pieces.auditPret } : {}),
    ...(pieces.demoPrete !== undefined ? { demoPrete: pieces.demoPrete } : {}),
  }
}
