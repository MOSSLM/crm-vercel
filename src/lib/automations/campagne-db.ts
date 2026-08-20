// campagne-db.ts — la couche base des campagnes.
//
// La décision est dans `campagne.ts`, qui est pur. Ici on ne fait que lire et
// écrire — même découpage que `regulator.ts` / `regulator-db.ts`.
//
// UNE PASSE DE REQUÊTES PAR LOT, JAMAIS UNE PAR LEAD. Une campagne de 300
// prospects avec sept requêtes chacune, c'est 2 100 allers-retours : la revue
// avant lancement deviendrait une page qui ne s'ouvre pas. Tout ce qui suit
// charge un lot d'identifiants d'un coup et referme en mémoire.

import type { SupabaseClient } from '@supabase/supabase-js'
import { collecterCanaux, type Canal } from '@/lib/prospects/canal'
import {
  motifEcart,
  revue,
  type FaitsDuLead,
  type MotifEcart,
  type OrigineLead,
  type RevueCampagne,
  type StatutListe,
} from '@/lib/automations/campagne'
import type { PublicVise } from '@/lib/prospects/canal'

/** Une ligne de `campagne_leads`, telle qu'on la lit. */
export interface LigneCampagneLead {
  id: number
  automation_id: string
  entreprise_id: number
  contact_id: string | null
  enrollment_id: string | null
  origine: OrigineLead
  origine_ref: string | null
  statut: StatutListe
  motif_ecart: MotifEcart | null
  ajoute_le: string
}

/**
 * Les faits d'un lot de prospects, prêts pour `motifEcart`.
 *
 * Sept lectures, quel que soit le nombre de leads. La clé est l'identifiant
 * d'entreprise : c'est le seul dénominateur que toutes ces tables partagent, et
 * c'est aussi le bon niveau métier — on ne démarche pas deux fois la même
 * entreprise parce qu'elle a deux contacts.
 */
export async function chargerFaits(
  sb: SupabaseClient,
  entrepriseIds: readonly number[],
): Promise<Map<number, FaitsDuLead>> {
  const ids = [...new Set(entrepriseIds)].filter((n) => Number.isFinite(n))
  const faits = new Map<number, FaitsDuLead>()
  if (ids.length === 0) return faits

  const [entreprises, contacts, inscriptions, echanges, affaires, suppressions, numerosBloques] =
    await Promise.all([
      sb.from('entreprises').select('id, email, telephone, archived_at').in('id', ids),
      sb
        .from('contacts')
        .select('entreprise_id, email, tel, is_decision_maker')
        .in('entreprise_id', ids),
      // `vars` est lu en entier pour une seule raison : `vars.replies`. Voir plus bas.
      sb
        .from('sequence_enrollments')
        .select('entreprise_id, status, vars')
        .in('entreprise_id', ids),
      sb.from('email_logs').select('entreprise_id, outcome').in('entreprise_id', ids),
      sb
        .from('opportunites')
        .select('id, entreprise_id, archived_at')
        .in('entreprise_id', ids)
        .is('archived_at', null),
      sb.from('email_suppressions').select('email'),
      sb.from('phone_blacklist').select('e164'),
    ])

  const parEntreprise = <T extends { entreprise_id: number | null }>(rows: T[] | null) => {
    const m = new Map<number, T[]>()
    for (const r of rows ?? []) {
      // `Number(null)` vaut zéro : tester la nullité AVANT de convertir, sinon
      // les lignes sans entreprise se rangent toutes sous l'identifiant 0.
      if (r.entreprise_id == null) continue
      const k = Number(r.entreprise_id)
      if (!Number.isFinite(k)) continue
      const l = m.get(k)
      if (l) l.push(r)
      else m.set(k, [r])
    }
    return m
  }

  const contactsPar = parEntreprise(contacts.data as { entreprise_id: number | null; email: string | null; tel: string | null; is_decision_maker: boolean | null }[] | null)
  const inscriptionsPar = parEntreprise(inscriptions.data as { entreprise_id: number | null; status: string; vars: Record<string, unknown> | null }[] | null)
  const echangesPar = parEntreprise(echanges.data as { entreprise_id: number | null; outcome: string | null }[] | null)
  const affairesPar = parEntreprise(affaires.data as { entreprise_id: number | null }[] | null)

  const emailsSupprimes = new Set(
    ((suppressions.data ?? []) as { email: string | null }[])
      .map((r) => (r.email ?? '').trim().toLowerCase())
      .filter(Boolean),
  )
  const numerosNoirs = new Set(
    ((numerosBloques.data ?? []) as { e164: string | null }[])
      .map((r) => (r.e164 ?? '').replace(/\D/g, ''))
      .filter(Boolean),
  )

  for (const ent of (entreprises.data ?? []) as {
    id: number
    email: string | null
    telephone: string | null
    archived_at: string | null
  }[]) {
    const fiches = contactsPar.get(ent.id) ?? []
    const canauxDuProspect = collecterCanaux({
      entrepriseEmail: ent.email,
      entrepriseTelephones: ent.telephone ? [ent.telephone] : [],
      contacts: fiches.map((c) => ({
        email: c.email,
        tel: c.tel,
        isDecisionMaker: c.is_decision_maker ?? false,
      })),
    })

    const desEchanges = echangesPar.get(ent.id) ?? []
    const desInscriptions = inscriptionsPar.get(ent.id) ?? []

    faits.set(ent.id, {
      canaux: canauxDuProspect.canaux as Set<Canal>,
      archive: ent.archived_at != null,
      aUneAffaire: (affairesPar.get(ent.id) ?? []).length > 0,
      desabonne:
        (canauxDuProspect.email != null &&
          emailsSupprimes.has(canauxDuProspect.email.trim().toLowerCase())) ||
        (canauxDuProspect.mobile != null &&
          numerosNoirs.has(canauxDuProspect.mobile.replace(/\D/g, ''))),
      inscriptionVivanteAilleurs: desInscriptions.some(
        (i) => i.status === 'active' || i.status === 'paused',
      ),
      aDejaReagi:
        desEchanges.some((e) => REACTIONS.has(e.outcome ?? '')) || desInscriptions.some(aRepondu),
    })
  }

  return faits
}

/** Les issues d'échange qui disent « il y a quelqu'un au bout du fil ». */
const REACTIONS = new Set(['answered', 'later', 'not_interested', 'blocked'])

/**
 * Ce prospect a-t-il répondu ?
 *
 * LA RÉPONSE VIT DANS `vars.replies`, ET NULLE PART AILLEURS. C'est le piège le
 * plus coûteux du parc : `sales_pipeline_state.replied` vaut `false` sur 153
 * lignes sur 153 (mesuré le 19/08/2026), alors que 55 prospects ont bel et bien
 * répondu. Un garde-fou adossé à `replied` les renverrait tous en premier
 * contact — et « perdre l'avancée » commence exactement là.
 *
 * On lit donc le sac de l'inscription, qui est la seule source honnête.
 */
function aRepondu(inscription: { vars: Record<string, unknown> | null }): boolean {
  const replies = (inscription.vars ?? {})['replies']
  if (!replies || typeof replies !== 'object') return false
  return Object.keys(replies as Record<string, unknown>).length > 0
}

/** Ce qu'on ajoute à une liste de campagne. */
export interface AjoutDeLeads {
  automationId: string
  entrepriseIds: readonly number[]
  origine: OrigineLead
  origineRef?: string | null
  ajoutePar?: string | null
  /** Le public visé par la séquence, pour trancher qui part et qui est écarté. */
  cible: PublicVise
}

export interface ResultatAjout {
  ajoutes: number
  deja: number
  revue: RevueCampagne
}

/**
 * Ajoute des prospects à la liste d'une campagne, sans en inscrire aucun.
 *
 * DEUX RÈGLES QUI TIENNENT LE MODÈLE
 *
 * 1. `on conflict do nothing`. Rafraîchir un segment ajoute le delta et ne
 *    retire JAMAIS personne : un segment qui rétrécit parce qu'une entreprise
 *    vient d'être enrichie ne doit pas sortir de la campagne quelqu'un à qui on
 *    a déjà écrit — le dénominateur bougerait sous la mesure.
 *
 * 2. On peuple depuis les ENTREPRISES, jamais depuis les opportunités. 149
 *    entreprises attribuées n'ont aucune affaire (mesuré le 19/08) : peupler
 *    depuis `opportunites` ferait disparaître 112 leads joignables en silence.
 *    Elles entrent avec le motif `sans_affaire`, qui est réparable et le dit.
 */
export async function ajouterLeads(
  sb: SupabaseClient,
  ajout: AjoutDeLeads,
): Promise<ResultatAjout> {
  const ids = [...new Set(ajout.entrepriseIds)].filter((n) => Number.isFinite(n))
  if (ids.length === 0) {
    return { ajoutes: 0, deja: 0, revue: revue([], ajout.cible) }
  }

  const faits = await chargerFaits(sb, ids)

  const lignes = ids.map((entrepriseId) => {
    const f = faits.get(entrepriseId) ?? { canaux: new Set<Canal>() }
    const motif = motifEcart(f, ajout.cible)
    return {
      automation_id: ajout.automationId,
      entreprise_id: entrepriseId,
      origine: ajout.origine,
      origine_ref: ajout.origineRef ?? null,
      ajoute_par: ajout.ajoutePar ?? null,
      statut: motif ? ('ecarte' as const) : ('a_lancer' as const),
      motif_ecart: motif,
    }
  })

  const { data, error } = await sb
    .from('campagne_leads')
    .upsert(lignes, { onConflict: 'automation_id,entreprise_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(error.message)

  const ajoutes = (data ?? []).length
  return {
    ajoutes,
    deja: ids.length - ajoutes,
    revue: revue(
      ids.map((id) => ({ faits: faits.get(id) ?? { canaux: new Set<Canal>() } })),
      ajout.cible,
    ),
  }
}

/**
 * La revue d'une campagne : combien partent, et pourquoi les autres non.
 *
 * Recalculée à la lecture plutôt que lue dans `statut`/`motif_ecart`, et c'est
 * volontaire : entre l'ajout et le lancement, un prospect peut avoir été enrichi,
 * archivé, ou avoir répondu. Un écran de revue qui affiche l'état du jour de
 * l'ajout ferait lancer sur une photo périmée.
 */
export async function revueDeCampagne(
  sb: SupabaseClient,
  automationId: string,
  cible: PublicVise,
): Promise<RevueCampagne> {
  const { data, error } = await sb
    .from('campagne_leads')
    .select('entreprise_id')
    .eq('automation_id', automationId)
    .neq('statut', 'termine')
  if (error) throw new Error(error.message)

  const ids = (data ?? []).map((r) => Number((r as { entreprise_id: number }).entreprise_id))
  const faits = await chargerFaits(sb, ids)
  return revue(
    ids.map((id) => ({ faits: faits.get(id) ?? { canaux: new Set<Canal>() } })),
    cible,
  )
}

/**
 * Réaligne `statut` et `motif_ecart` sur les faits d'aujourd'hui.
 *
 * À appeler avant un lancement. Ne touche jamais aux lignes déjà `inscrit` ou
 * `termine` : leur sort ne dépend plus de la liste mais de leur inscription.
 */
export async function rafraichirStatuts(
  sb: SupabaseClient,
  automationId: string,
  cible: PublicVise,
): Promise<{ misAJour: number }> {
  const { data, error } = await sb
    .from('campagne_leads')
    .select('id, entreprise_id, statut, motif_ecart')
    .eq('automation_id', automationId)
    .in('statut', ['a_lancer', 'ecarte'])
  if (error) throw new Error(error.message)

  const lignes = (data ?? []) as Pick<
    LigneCampagneLead,
    'id' | 'entreprise_id' | 'statut' | 'motif_ecart'
  >[]
  const faits = await chargerFaits(sb, lignes.map((l) => l.entreprise_id))

  let misAJour = 0
  for (const ligne of lignes) {
    const f = faits.get(ligne.entreprise_id) ?? { canaux: new Set<Canal>() }
    const motif = motifEcart(f, cible)
    const statut: StatutListe = motif ? 'ecarte' : 'a_lancer'
    if (statut === ligne.statut && motif === ligne.motif_ecart) continue
    const { error: majErr } = await sb
      .from('campagne_leads')
      .update({ statut, motif_ecart: motif })
      .eq('id', ligne.id)
    if (majErr) throw new Error(majErr.message)
    misAJour += 1
  }
  return { misAJour }
}

/**
 * Les entreprises prêtes à être inscrites, dans l'ordre d'ajout.
 *
 * `limite` n'est pas un confort : on inscrit par paquets. Le régulateur espace
 * les e-mails, mais les étapes manuelles créent leur tâche TOUT DE SUITE —
 * lancer 300 WhatsApp d'un coup fait tomber 300 cartes le même matin dans la
 * file d'un agent dont le quota est de 60 par jour.
 */
export async function leadsALancer(
  sb: SupabaseClient,
  automationId: string,
  limite: number,
): Promise<{ entrepriseId: number; contactId: string | null }[]> {
  const { data, error } = await sb
    .from('campagne_leads')
    .select('entreprise_id, contact_id')
    .eq('automation_id', automationId)
    .eq('statut', 'a_lancer')
    .order('ajoute_le', { ascending: true })
    .limit(Math.max(1, Math.min(limite, 200)))
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    entrepriseId: Number((r as { entreprise_id: number }).entreprise_id),
    contactId: ((r as { contact_id: string | null }).contact_id ?? null) as string | null,
  }))
}

/** Note l'inscription née d'un lead — le seul lien entre la liste et le moteur. */
export async function marquerInscrit(
  sb: SupabaseClient,
  automationId: string,
  entrepriseId: number,
  enrollmentId: string | null,
): Promise<void> {
  const { error } = await sb
    .from('campagne_leads')
    .update({ statut: 'inscrit', enrollment_id: enrollmentId })
    .eq('automation_id', automationId)
    .eq('entreprise_id', entrepriseId)
  if (error) throw new Error(error.message)
}

/** Écarte un lead à la main, à la revue. Le motif est obligatoire côté base. */
export async function ecarterLead(
  sb: SupabaseClient,
  automationId: string,
  entrepriseId: number,
  motif: MotifEcart = 'manuel',
): Promise<void> {
  const { error } = await sb
    .from('campagne_leads')
    .update({ statut: 'ecarte', motif_ecart: motif })
    .eq('automation_id', automationId)
    .eq('entreprise_id', entrepriseId)
  if (error) throw new Error(error.message)
}

/**
 * Le décompte d'une campagne, tel que la vue le rend.
 *
 * Une ligne par campagne, jamais une ligne par lead : la liste des campagnes
 * affiche quatre nombres et n'a aucune raison de rapatrier dix mille lignes
 * pour les obtenir (cf. `sql/20260819_campagne_leads_compte.sql`).
 */
export interface CompteCampagne {
  total: number
  aLancer: number
  inscrits: number
  ecartes: number
  termines: number
  /** Parmi les écartés, ceux dont le motif se répare (cf. `ecartRattrapable`). */
  ecartesRattrapables: number
  dernierAjout: string | null
}

const COMPTE_VIDE: CompteCampagne = {
  total: 0,
  aLancer: 0,
  inscrits: 0,
  ecartes: 0,
  termines: 0,
  ecartesRattrapables: 0,
  dernierAjout: null,
}

/** Les décomptes de plusieurs campagnes d'un coup, pour l'écran de liste. */
export async function comptesDeCampagnes(
  sb: SupabaseClient,
  automationIds: readonly string[],
): Promise<Map<string, CompteCampagne>> {
  const comptes = new Map<string, CompteCampagne>()
  const ids = [...new Set(automationIds)].filter(Boolean)
  if (ids.length === 0) return comptes

  const { data, error } = await sb
    .from('v_campagne_leads_compte')
    .select('automation_id, total, a_lancer, inscrits, ecartes, termines, ecartes_rattrapables, dernier_ajout')
    .in('automation_id', ids)
  if (error) throw new Error(error.message)

  for (const r of (data ?? []) as {
    automation_id: string
    total: number | string
    a_lancer: number | string
    inscrits: number | string
    ecartes: number | string
    termines: number | string
    ecartes_rattrapables: number | string
    dernier_ajout: string | null
  }[]) {
    comptes.set(r.automation_id, {
      total: Number(r.total),
      aLancer: Number(r.a_lancer),
      inscrits: Number(r.inscrits),
      ecartes: Number(r.ecartes),
      termines: Number(r.termines),
      ecartesRattrapables: Number(r.ecartes_rattrapables),
      dernierAjout: r.dernier_ajout,
    })
  }
  // Une campagne sans aucune ligne n'apparaît pas dans la vue : elle vaut zéro,
  // et l'appelant ne doit pas avoir à distinguer « zéro » de « absent ».
  for (const id of ids) if (!comptes.has(id)) comptes.set(id, { ...COMPTE_VIDE })
  return comptes
}

/**
 * Fait entrer dans la liste les prospects DÉJÀ inscrits à cette séquence.
 *
 * C'EST LA FONCTION QUI RÉPOND À « MES LEADS NE SERONT PAS PERDUS ». 153
 * inscriptions vivent aujourd'hui sans liste : la campagne qui les héberge doit
 * les compter parmi ses leads, sinon la refonte les ferait disparaître de
 * l'écran qui la remplace — et un lead invisible finit toujours par être
 * redémarché depuis le début.
 *
 * Trois règles :
 *
 * 1. **L'inscription fait foi.** Un prospect inscrit entre en `inscrit`, jamais
 *    en `a_lancer` : il est déjà parti, la revue n'a plus à trancher son sort.
 * 2. **Une inscription close entre quand même**, en `termine`. Elle raconte ce
 *    qui a été tenté, et `sortieARedemarcher` (`sortie-sequence.ts`) sait déjà
 *    dire lesquelles méritent un second tour.
 * 3. **On ne réécrit pas une origine.** Un lead venu d'un segment puis inscrit
 *    garde `origine='segment'` : on ne corrige que ce qui manque, le lien vers
 *    l'inscription et le statut.
 */
export async function reprendreInscriptions(
  sb: SupabaseClient,
  automationId: string,
): Promise<{ reprises: number; misAJour: number; sansEntreprise: number }> {
  const { data: inscriptionsData, error: errInscr } = await sb
    .from('sequence_enrollments')
    .select('id, entreprise_id, contact_id, status')
    .eq('automation_id', automationId)
  if (errInscr) throw new Error(errInscr.message)

  const inscriptions = (inscriptionsData ?? []) as {
    id: string
    entreprise_id: number | null
    contact_id: string | null
    status: string
  }[]

  // Une inscription sans entreprise ne peut pas entrer : la liste est indexée
  // par entreprise, et c'est le bon niveau — on ne démarche pas deux fois la
  // même société parce qu'elle a deux contacts. On les compte pour le dire.
  //
  // Le `!= null` n'est pas une ceinture : `Number(null)` vaut ZÉRO, pas NaN.
  // Sans lui, une inscription sans entreprise entrerait sous l'identifiant 0 —
  // et la clé étrangère rejetterait le lot entier, pour une ligne.
  const utilisables = inscriptions.filter(
    (i) => i.entreprise_id != null && Number.isFinite(Number(i.entreprise_id)),
  )
  const sansEntreprise = inscriptions.length - utilisables.length
  if (utilisables.length === 0) return { reprises: 0, misAJour: 0, sansEntreprise }

  // Une entreprise peut porter deux inscriptions (une close, une vivante) :
  // c'est la vivante qui compte, sinon la liste dirait « terminé » d'un
  // prospect à qui la séquence écrit encore ce matin.
  const vivante = (s: string) => s === 'active' || s === 'paused'
  const parEntreprise = new Map<number, (typeof utilisables)[number]>()
  for (const i of utilisables) {
    const cle = Number(i.entreprise_id)
    const dejaLa = parEntreprise.get(cle)
    if (!dejaLa || (!vivante(dejaLa.status) && vivante(i.status))) parEntreprise.set(cle, i)
  }

  const { data: existantesData, error: errExist } = await sb
    .from('campagne_leads')
    .select('id, entreprise_id, enrollment_id, statut')
    .eq('automation_id', automationId)
    .in('entreprise_id', [...parEntreprise.keys()])
  if (errExist) throw new Error(errExist.message)

  const existantes = new Map(
    ((existantesData ?? []) as Pick<
      LigneCampagneLead,
      'id' | 'entreprise_id' | 'enrollment_id' | 'statut'
    >[]).map((l) => [Number(l.entreprise_id), l]),
  )

  const statutDe = (s: string): StatutListe => (vivante(s) ? 'inscrit' : 'termine')

  const aInserer = [...parEntreprise.entries()]
    .filter(([entrepriseId]) => !existantes.has(entrepriseId))
    .map(([entrepriseId, inscription]) => ({
      automation_id: automationId,
      entreprise_id: entrepriseId,
      contact_id: inscription.contact_id,
      enrollment_id: inscription.id,
      origine: 'reprise' as const,
      origine_ref: null,
      statut: statutDe(inscription.status),
      motif_ecart: null,
    }))

  let reprises = 0
  if (aInserer.length > 0) {
    const { data, error } = await sb
      .from('campagne_leads')
      .upsert(aInserer, { onConflict: 'automation_id,entreprise_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    reprises = (data ?? []).length
  }

  // Les lignes déjà là qui ignoraient leur inscription : c'est le cas d'un
  // segment ajouté avant la reprise. Une par une, mais seulement celles qui
  // divergent vraiment — en pratique, aucune sur une liste neuve.
  let misAJour = 0
  for (const [entrepriseId, inscription] of parEntreprise) {
    const ligne = existantes.get(entrepriseId)
    if (!ligne) continue
    const statut = statutDe(inscription.status)
    if (ligne.enrollment_id === inscription.id && ligne.statut === statut) continue
    const { error } = await sb
      .from('campagne_leads')
      .update({ enrollment_id: inscription.id, statut, motif_ecart: null })
      .eq('id', ligne.id)
    if (error) throw new Error(error.message)
    misAJour += 1
  }

  return { reprises, misAJour, sansEntreprise }
}
