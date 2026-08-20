// passe-db.ts — la couche base du lissage : les faits, les constats, la file.
//
// La décision est dans `passe.ts`, qui est pur. Ici on lit et on écrit — même
// découpage que `regulator.ts` / `regulator-db.ts`.
//
// ── CE QUE CE FICHIER A DÛ TRANCHER, ET SUR QUELLE PREUVE ─────────────────
//
// `constats_presence` est la table des trois états, mais elle est presque vide :
// 297 lignes courantes sur 60 726 fiches, et elles ne parlent que du site. Le
// reste de ce qu'on sait vit dans des COLONNES — `siret`, `google_place_id`,
// `site_web_canonique`, `identite_rafraichie_le`, `est_rge_indicatif`.
//
// Lancer une passe sans regarder ces colonnes referait 2 923 identités déjà
// faites et 2 676 RGE déjà connus. Il faut donc DÉRIVER un constat des colonnes.
// Deux règles, et les deux sont mesurées, pas choisies :
//
// **1. Le constat l'emporte sur la colonne.** Relevé le 20/08 : 67 entreprises
// portent un constat `absent` ET une URL en colonne. En les regardant, le
// constat a raison à chaque fois — « le nom de domaine n'existe pas
// (NXDOMAIN) », « l'URL détenue n'est pas la leur ». La colonne n'a jamais été
// nettoyée ; le constat, lui, porte sa date, sa source et sa preuve. Une
// colonne porte un état sans provenance, un constat porte un acte daté : c'est
// ce qui départage.
//   ⚠️ CETTE NOTE A DIT UNE FAUSSETÉ, et la base l'a corrigée le 20/08 : on
//   lisait ici que `v_entreprises_presence_site` « fait l'inverse » et
//   appellerait « présent » ces 67 fiches. Mesuré, c'est 0 — la vue laissait
//   déjà le constat gagner. Son vrai défaut était l'inverse : 25 291 fiches
//   avec une URL en colonne et sans constat y étaient déclarées « inconnu »,
//   c'est-à-dire « personne n'a regardé ». Corrigé par
//   `sql/20260820_presence_site_colonne.sql`, qui ajoute `origine_statut` et
//   `confiance_statut` — une URL en colonne vaut HAUTE, jamais CERTAINE.
//
// **2. Le RGE se lit dans `est_rge_indicatif`, JAMAIS dans `rge_rafraichi_le`.**
// 54 878 fiches portent la même estampille à la microseconde près
// (`2026-08-16 02:17:00.123097+00`) — et ce sont EXACTEMENT les 54 878 dont
// `est_rge_indicatif` est nul. Le remplissage de masse a écrit « interrogé »
// sans jamais appeler l'ADEME. La règle n'a donc pas besoin de connaître cette
// date : elle lit la réponse, et une fiche sans réponse n'a pas été regardée.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PLAN_DEFAUT,
  SUJETS,
  estArret,
  prochaineEtape,
  type Confiance,
  type Constat,
  type Etat,
  type FaitsDuProspect,
  type Lieu,
  type PlanPasse,
  type Sujet,
} from '@/lib/lissage/passe'

/* ── Lire ce qu'on sait déjà ──────────────────────────────────────────────── */

interface LigneEntreprise {
  id: number
  name: string | null
  ville: string | null
  code_postal: string | null
  siret: string | null
  google_place_id: string | null
  site_web_canonique: string | null
  canonical_url: string | null
}

interface LignePubliques {
  entreprise_id: number
  identite_rafraichie_le: string | null
  siret_interroge: string | null
  est_rge_indicatif: boolean | null
}

interface LigneConstat {
  entreprise_id: number
  sujet: string
  etat: string
  confiance: string
  source: string | null
}

const rempli = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/** Le constat courant d'un sujet, tel que le module pur le consomme. */
export interface ConstatCourant {
  etat: Etat
  confiance: Confiance
  /** D'où il vient : un id de bot, ou `colonne:<nom>` quand il est dérivé. */
  source: string
}

/**
 * Les faits d'un lot de prospects, prêts pour `prochaineEtape`.
 *
 * QUATRE LECTURES, quel que soit le nombre de prospects. Mille fiches à quatre
 * requêtes chacune, ce serait quatre mille allers-retours : l'écran ne
 * s'ouvrirait pas. Même règle que `campagne-db.chargerFaits`.
 *
 * `candidatsPar` vient de la file (`lissage_leads.dossier`) : le serveur ne peut
 * pas voir les dossiers que l'exécuteur local écrit sur son disque, donc c'est
 * la ligne de file qui porte le compte.
 */
export async function chargerFaits(
  sb: SupabaseClient,
  entrepriseIds: readonly number[],
  candidatsPar?: ReadonlyMap<number, number>,
): Promise<Map<number, FaitsDuProspect>> {
  const ids = [...new Set(entrepriseIds)].filter((n) => Number.isFinite(n))
  const faits = new Map<number, FaitsDuProspect>()
  if (ids.length === 0) return faits

  const [entreprises, publiques, constats, candidatsIdentite] = await Promise.all([
    sb
      .from('entreprises')
      .select('id, name, ville, code_postal, siret, google_place_id, site_web_canonique, canonical_url')
      .in('id', ids),
    sb
      .from('entreprises_donnees_publiques')
      .select('entreprise_id, identite_rafraichie_le, siret_interroge, est_rge_indicatif')
      .in('entreprise_id', ids),
    // La vue rend DÉJÀ le dernier constat par (entreprise, sujet) : pas de tri
    // à refaire ici, et surtout pas de « dernier gagne » réimplémenté de travers.
    sb
      .from('v_presence_actuelle')
      .select('entreprise_id, sujet, etat, confiance, source')
      .in('entreprise_id', ids)
      .in('sujet', [...SUJETS]),
    // Les candidats d'identité en attente d'une décision. LA TABLE EXISTAIT
    // DÉJÀ — avec son score décomposé, sa validation admin et son historique de
    // rejets — et la file n'en fabrique surtout pas une seconde : deux listes de
    // candidats SIRET finiraient par se contredire, et c'est la contradiction
    // qui écrit un mauvais SIRET.
    sb
      .from('entreprise_siret_candidats')
      .select('entreprise_id')
      .in('entreprise_id', ids)
      .eq('statut', 'propose'),
  ])

  const pubParId = new Map<number, LignePubliques>()
  for (const p of (publiques.data ?? []) as LignePubliques[]) {
    if (p.entreprise_id != null) pubParId.set(Number(p.entreprise_id), p)
  }

  const candidatsIdentiteParId = new Map<number, number>()
  for (const c of (candidatsIdentite.data ?? []) as { entreprise_id: number }[]) {
    const id = Number(c.entreprise_id)
    candidatsIdentiteParId.set(id, (candidatsIdentiteParId.get(id) ?? 0) + 1)
  }

  const constatsParId = new Map<number, Partial<Record<Sujet, ConstatCourant>>>()
  for (const c of (constats.data ?? []) as LigneConstat[]) {
    if (c.entreprise_id == null) continue
    const id = Number(c.entreprise_id)
    const sac = constatsParId.get(id) ?? {}
    sac[c.sujet as Sujet] = {
      etat: c.etat as Etat,
      confiance: c.confiance as Confiance,
      source: c.source ?? 'inconnue',
    }
    constatsParId.set(id, sac)
  }

  for (const e of (entreprises.data ?? []) as LigneEntreprise[]) {
    const id = Number(e.id)
    const pub = pubParId.get(id)
    const explicites = constatsParId.get(id) ?? {}
    const url = rempli(e.site_web_canonique) ?? rempli(e.canonical_url)

    faits.set(id, {
      entrepriseId: id,
      nom: rempli(e.name),
      ville: rempli(e.ville),
      codePostal: rempli(e.code_postal),
      siret: rempli(e.siret),
      placeId: rempli(e.google_place_id),
      url,
      candidats: candidatsPar?.get(id) ?? 0,
      candidatsIdentite: candidatsIdentiteParId.get(id) ?? 0,
      constats: {
        // Le constat explicite d'abord, la colonne en repli — la règle 1 du
        // en-tête, et elle vaut pour les quatre sujets sans exception.
        identite: explicites.identite ?? deduireIdentite(pub),
        rge: explicites.rge ?? deduireRge(pub),
        fiche_google: explicites.fiche_google ?? deduireFicheGoogle(e.google_place_id),
        site_web: explicites.site_web ?? deduireSite(url),
      },
    })
  }
  return faits
}

/**
 * L'identité, déduite de `entreprises_donnees_publiques`.
 *
 * `identite_rafraichie_le` est une estampille, donc suspecte par principe après
 * ce qu'a fait le remplissage RGE. Elle est croisée avec `siret_interroge` :
 * une hydratation qui a vraiment tourné laisse le SIRET qu'elle a interrogé.
 * Les deux valent 2 923 en base — elles se confirment l'une l'autre.
 *
 * Aucun `absent` ici, jamais : une entreprise a toujours une identité légale.
 * Ne pas la trouver veut dire qu'on n'a pas su la rapprocher — c'est `inconnu`,
 * et c'est un travail humain (« l'adresse prime sur le nom » du registre).
 */
function deduireIdentite(pub: LignePubliques | undefined): ConstatCourant | undefined {
  if (!pub) return undefined
  if (rempli(pub.siret_interroge) && pub.identite_rafraichie_le) {
    return { etat: 'present', confiance: 'certaine', source: 'colonne:identite_rafraichie_le' }
  }
  return undefined
}

/**
 * Le RGE, déduit de `est_rge_indicatif` — et de rien d'autre.
 *
 * `haute` et non `certaine` : la colonne dit elle-même « indicatif ». Le registre
 * ADEME est la source qui tranche, et c'est `ademe-rge` qui la consulte.
 */
function deduireRge(pub: LignePubliques | undefined): ConstatCourant | undefined {
  if (!pub || pub.est_rge_indicatif == null) return undefined
  return {
    etat: pub.est_rge_indicatif ? 'present' : 'absent',
    confiance: 'haute',
    source: 'colonne:est_rge_indicatif',
  }
}

/**
 * La fiche Google : `haute`, et pas `certaine`.
 *
 * Un `place_id` en base prouve qu'une fiche a existé le jour où on l'a
 * ramassée — pas qu'elle vit encore. Un artisan qui ferme laisse sa fiche
 * passer en `CLOSED_PERMANENTLY`, et notre colonne n'en sait rien. `certaine`
 * rendrait le sujet indéboulonnable et laisserait `refresh-google-stats` — le
 * seul outil qui va le vérifier — sans jamais rien à faire.
 */
function deduireFicheGoogle(placeId: string | null): ConstatCourant | undefined {
  return rempli(placeId)
    ? { etat: 'present', confiance: 'haute', source: 'colonne:google_place_id' }
    : undefined
}

/**
 * Le site : `haute` et non `certaine`, justement à cause des 67.
 *
 * Une URL en colonne n'a pas été vérifiée — un tiers d'entre elles sont des
 * NXDOMAIN ou le site de quelqu'un d'autre. Elle vaut donc une présomption, pas
 * une preuve, et une passe exigeant `certaine` la fera repasser au vérificateur.
 */
function deduireSite(url: string | null): ConstatCourant | undefined {
  return url ? { etat: 'present', confiance: 'haute', source: 'colonne:site_web_canonique' } : undefined
}

/* ── Écrire un constat ────────────────────────────────────────────────────── */

/**
 * Poser des constats. C'est la seule écriture de vérité de tout le lissage.
 *
 * `valeur` est mise à null dès que l'état n'est pas `present` : la contrainte
 * `constat_coherent` le refuserait, et elle a raison — un « absent » avec une
 * valeur se contredit lui-même. On ne laisse pas la base attraper ça, parce
 * qu'un rejet en lot fait échouer les constats voisins qui étaient bons.
 *
 * ON N'ÉCRASE RIEN : `constats_presence` est un journal, chaque constat s'ajoute
 * et `v_presence_actuelle` rend le dernier. L'historique est ce qui permettra de
 * dire un jour « on croyait qu'il n'avait pas de site, on s'est trompés ».
 */
export async function ecrireConstats(
  sb: SupabaseClient,
  entrepriseId: number,
  constats: readonly Constat[],
  par = 'lissage',
): Promise<number> {
  const lignes = constats.map((c) => ({
    entreprise_id: entrepriseId,
    sujet: c.sujet,
    etat: c.etat,
    valeur: c.etat === 'present' ? (rempli(c.valeur) ?? null) : null,
    confiance: c.confiance,
    source: c.source,
    preuve: c.preuve ?? {},
    constate_par: par,
  }))
  // Un « présent » sans valeur ne prouve rien : la contrainte le refuse, et le
  // laisser passer ferait tomber tout le lot. On l'écarte en le disant.
  const valides = lignes.filter((l) => l.etat !== 'present' || l.valeur !== null)
  if (valides.length === 0) return 0
  const { error } = await sb.from('constats_presence').insert(valides)
  if (error) throw new Error(`ecrireConstats: ${error.message}`)
  return valides.length
}

/* ── La passe et sa file ──────────────────────────────────────────────────── */

export type StatutLigne = 'a_faire' | 'en_cours' | 'complet' | 'sans_prise' | 'erreur'

export interface LigneFile {
  id: number
  passeId: string
  entrepriseId: number
  statut: StatutLigne
  outil: string | null
  lieu: Lieu | null
  tentes: string[]
  motif: string | null
  dossier: Record<string, unknown>
  tentatives: number
}

interface LigneFileBrute {
  id: number
  passe_id: string
  entreprise_id: number
  statut: string
  outil: string | null
  lieu: string | null
  tentes: string[] | null
  motif: string | null
  dossier: Record<string, unknown> | null
  tentatives: number | null
}

const versLigne = (r: LigneFileBrute): LigneFile => ({
  id: Number(r.id),
  passeId: r.passe_id,
  entrepriseId: Number(r.entreprise_id),
  statut: r.statut as StatutLigne,
  outil: r.outil,
  lieu: (r.lieu as Lieu | null) ?? null,
  tentes: r.tentes ?? [],
  motif: r.motif,
  dossier: r.dossier ?? {},
  tentatives: r.tentatives ?? 0,
})

export interface Passe {
  id: string
  nom: string
  criteres: Record<string, unknown>
  plan: PlanPasse
  statut: 'brouillon' | 'en_cours' | 'en_pause' | 'terminee'
  creeLe: string
}

/** Le plan lu en base, complété par les défauts — un jsonb peut être partiel. */
export function planDe(brut: unknown): PlanPasse {
  const p = (brut ?? {}) as Partial<PlanPasse>
  const sujets = Array.isArray(p.sujets)
    ? p.sujets.filter((s): s is Sujet => (SUJETS as readonly string[]).includes(s))
    : []
  return {
    sujets: sujets.length > 0 ? sujets : PLAN_DEFAUT.sujets,
    exigence: p.exigence ?? PLAN_DEFAUT.exigence,
    facture: p.facture ?? PLAN_DEFAUT.facture,
    local: p.local ?? PLAN_DEFAUT.local,
  }
}

export async function creerPasse(
  sb: SupabaseClient,
  entree: { nom: string; criteres: Record<string, unknown>; plan: PlanPasse; creePar?: string | null },
): Promise<Passe> {
  const { data, error } = await sb
    .from('lissage_passes')
    .insert({
      nom: entree.nom,
      criteres: entree.criteres,
      plan: entree.plan,
      cree_par: entree.creePar ?? null,
    })
    .select('id, nom, criteres, plan, statut, cree_le')
    .single()
  if (error) throw new Error(`creerPasse: ${error.message}`)
  const r = data as { id: string; nom: string; criteres: Record<string, unknown>; plan: unknown; statut: string; cree_le: string }
  return {
    id: r.id,
    nom: r.nom,
    criteres: r.criteres ?? {},
    plan: planDe(r.plan),
    statut: r.statut as Passe['statut'],
    creeLe: r.cree_le,
  }
}

/**
 * Poser la population de la passe.
 *
 * `ignoreDuplicates` sur `(passe_id, entreprise_id)` : rejouer le peuplement ne
 * duplique personne et ne remet pas à zéro ceux qui ont déjà avancé. C'est la
 * même prudence que la liste de campagne — un rafraîchissement AJOUTE, il ne
 * retire ni ne réinitialise jamais.
 */
export async function peuplerPasse(
  sb: SupabaseClient,
  passeId: string,
  entrepriseIds: readonly number[],
): Promise<number> {
  const ids = [...new Set(entrepriseIds)].filter((n) => Number.isFinite(n))
  if (ids.length === 0) return 0
  let ajoutes = 0
  // Par paquets : un `insert` de mille lignes passe, un de vingt mille non.
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await sb
      .from('lissage_leads')
      .upsert(
        ids.slice(i, i + 500).map((entreprise_id) => ({ passe_id: passeId, entreprise_id })),
        { onConflict: 'passe_id,entreprise_id', ignoreDuplicates: true },
      )
      .select('id')
    if (error) throw new Error(`peuplerPasse: ${error.message}`)
    ajoutes += (data ?? []).length
  }
  return ajoutes
}

/**
 * Réclamer un lot de lignes à traiter.
 *
 * `pg_advisory_lock` NE MARCHE PAS via PostgREST — la connexion retourne au pool
 * sans que le verrou tombe. On réclame donc ligne par ligne, par clé primaire et
 * compteur de tentatives : `update … where id = … and tentatives = <ce qu'on a
 * lu>`. Si un autre exécuteur l'a prise entre-temps, le compteur a bougé et
 * l'update ne touche rien. C'est l'atomicité de Postgres qui arbitre, pas nous.
 *
 * `lieux` sépare les deux mondes : le serveur prend `null` (pas encore décidé)
 * et `serveur` ; l'exécuteur local ne prend que `local`, et seulement quand
 * Matteo ouvre son localhost. Aucune ligne ne peut être prise par les deux.
 *
 * ⚠️ LE FILTRE DE LIEU EST EN SQL, ET IL DOIT L'ÊTRE. La première version
 * lisait `limit(taille * 3)` lignes triées par id puis écartait les mauvais
 * lieux EN MÉMOIRE. Ça suppose que les lignes indésirables sont rares — elles
 * ne le sont pas : une ligne posée sur une étape locale reste `a_faire` et garde
 * son id, or ce sont les PREMIÈRES traitées, donc celles aux id les plus bas.
 * Elles saturent la fenêtre de lecture et le tick ne voit plus rien d'autre.
 *
 * Mesuré le 20/08 sur la passe « Premier test » : 19 lignes restantes, les 19
 * en attente du poste local, ids 101 à 119. Le tick serveur rendait `prises: 0`
 * à chaque appel, indéfiniment — « j'ai beau appuyer sur avancer la file, ça
 * bloque ». Sur « testt », 24 lignes locales aux ids 121-155 mangeaient déjà
 * 24 des 60 places devant 521 lignes serveur qui commencent à l'id 160.
 */
export async function reclamerLot(
  sb: SupabaseClient,
  options: { passeId?: string; lieux: readonly (Lieu | null)[]; par: string; taille?: number },
): Promise<LigneFile[]> {
  const taille = Math.max(1, Math.min(options.taille ?? 20, 200))
  // `lieu.is.null` et `lieu.eq.<x>` : la traduction PostgREST de « l'un de ces
  // lieux », `null` compris — que `.in()` ne sait pas exprimer.
  const filtreLieu = options.lieux
    .map((l) => (l === null ? 'lieu.is.null' : `lieu.eq.${l}`))
    .join(',')

  let q = sb
    .from('lissage_leads')
    .select('id, passe_id, entreprise_id, statut, outil, lieu, tentes, motif, dossier, tentatives')
    .eq('statut', 'a_faire')
    .or(filtreLieu)
    .order('id', { ascending: true })
    // La marge ne sert plus qu'aux lignes à bout de tentatives, qu'on écarte en
    // les marquant : le lieu, lui, est déjà trié par la base.
    .limit(taille * 2)
  if (options.passeId) q = q.eq('passe_id', options.passeId)

  const { data, error } = await q
  if (error) throw new Error(`reclamerLot: ${error.message}`)

  const veut = new Set(options.lieux)
  const prises: LigneFile[] = []
  for (const brute of (data ?? []) as LigneFileBrute[]) {
    if (prises.length >= taille) break
    const ligne = versLigne(brute)
    // Ceinture et bretelles : la base a déjà filtré, mais une ligne dont le lieu
    // aurait changé entre la lecture et ici ne doit pas être prise à tort.
    if (!veut.has(ligne.lieu)) continue
    // TROIS TENTATIVES ET ON S'ARRÊTE. Une ligne qui échoue en boucle sur un
    // outil muet doit sortir de la file en le disant, pas la faire tourner.
    if (ligne.tentatives >= 3) {
      await marquer(sb, ligne.id, {
        statut: 'erreur',
        motif: `abandonnée après ${ligne.tentatives} tentatives`,
      })
      continue
    }
    const { data: pris } = await sb
      .from('lissage_leads')
      .update({
        statut: 'en_cours',
        reclame_par: options.par,
        reclame_le: new Date().toISOString(),
        tentatives: ligne.tentatives + 1,
        maj_le: new Date().toISOString(),
      })
      .eq('id', ligne.id)
      .eq('tentatives', ligne.tentatives)
      .eq('statut', 'a_faire')
      .select('id')
    if ((pris ?? []).length > 0) prises.push({ ...ligne, tentatives: ligne.tentatives + 1 })
  }
  return prises
}

async function marquer(
  sb: SupabaseClient,
  id: number,
  champs: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb
    .from('lissage_leads')
    .update({ ...champs, maj_le: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`marquer(${id}): ${error.message}`)
}

/**
 * Décider ce qu'une ligne devient, une fois ses faits relus.
 *
 * C'est ici que le module pur rencontre la base, et c'est le seul endroit. Trois
 * issues et pas une de plus :
 *
 *   · un outil SERVEUR à lancer → la ligne repart `a_faire` avec son outil posé,
 *     et le tick suivant l'exécutera ;
 *   · un outil LOCAL ou HUMAIN → la ligne repart `a_faire` avec son lieu, et
 *     elle attend là. Elle n'est pas en erreur : elle attend une machine ;
 *   · un arrêt → `complet` ou `sans_prise`, avec son motif EN TOUTES LETTRES.
 *     Une ligne qui sort d'une passe sans motif est celle qui dort trois
 *     semaines sans que personne le voie.
 */
export async function poserProchaineEtape(
  sb: SupabaseClient,
  ligne: LigneFile,
  faits: FaitsDuProspect,
  plan: PlanPasse,
  options: { relacher?: boolean } = {},
): Promise<LigneFile> {
  // `relacher: false` GARDE la réclamation, et ce n'est pas un détail. Le tick
  // décide puis exécute dans la foulée : s'il rendait la ligne à la file entre
  // les deux, un second tick pourrait la reprendre et lancer le même outil en
  // parallèle — deux appels facturés pour une réponse.
  const relacher = options.relacher ?? true
  const suite = prochaineEtape(faits, plan, ligne.tentes)

  if (estArret(suite)) {
    const motif =
      suite.motif === 'complet'
        ? 'tous les sujets du plan sont tranchés'
        : `rien ne peut prendre ${suite.restants.join(', ')} — il manque ${suite.manques.join(', ') || 'un préalable'}`
    await marquer(sb, ligne.id, { statut: suite.motif, outil: null, lieu: null, motif })
    return { ...ligne, statut: suite.motif, outil: null, lieu: null, motif }
  }

  const statut: StatutLigne = relacher ? 'a_faire' : 'en_cours'
  await marquer(sb, ligne.id, {
    statut,
    outil: suite.outil.id,
    lieu: suite.outil.lieu,
    motif: null,
    ...(relacher ? { reclame_par: null, reclame_le: null } : {}),
  })
  return { ...ligne, statut, outil: suite.outil.id, lieu: suite.outil.lieu, motif: null }
}

/**
 * Rendre une ligne à la file sans rien conclure.
 *
 * C'est ce qui arrive à une étape LOCALE ou HUMAINE : le serveur a décidé quoi
 * faire, il ne peut pas le faire, et il n'a surtout pas à la garder. Elle
 * attend l'exécuteur local — c'est-à-dire que Matteo ouvre son localhost — et
 * `tentatives` ne bouge pas, parce que rien n'a été tenté.
 */
export async function relacherLigne(sb: SupabaseClient, ligne: LigneFile): Promise<void> {
  await marquer(sb, ligne.id, { statut: 'a_faire', reclame_par: null, reclame_le: null })
}

/**
 * Rendre à la file les lignes qu'une décision humaine vient de débloquer.
 *
 * POURQUOI ÇA NE PEUT PAS ÊTRE LE TICK QUI S'EN CHARGE. Une ligne posée sur une
 * étape `humain` porte `lieu = 'humain'`, et le tick serveur ne réclame que
 * `null` et `serveur` — c'est exactement ce qui l'empêche de lancer à sa place
 * ce qui demandait un jugement. Personne ne repasserait donc jamais dessus :
 * une fois le SIRET tranché à l'écran, la ligne resterait « attend une
 * relecture » pour toujours, sur une relecture déjà faite.
 *
 * L'outil entre dans `tentes` COMME N'IMPORTE QUEL AUTRE : la décision a été
 * prise une fois, elle n'est pas à reprendre. Si elle n'a rien donné — aucun
 * candidat ne correspondait — la file le verra au tour suivant et sortira la
 * ligne en `sans_prise`, avec son motif. C'est la bonne sortie.
 */
export async function libererEtapeHumaine(
  sb: SupabaseClient,
  entrepriseId: number,
  outil: string,
  motif?: string,
): Promise<number> {
  const { data, error } = await sb
    .from('lissage_leads')
    .select('id, tentes')
    .eq('entreprise_id', entrepriseId)
    .eq('outil', outil)
    .eq('lieu', 'humain')
  if (error) throw new Error(`libererEtapeHumaine: ${error.message}`)

  const lignes = (data ?? []) as { id: number; tentes: string[] | null }[]
  for (const l of lignes) {
    const tentes = (l.tentes ?? []).includes(outil) ? (l.tentes ?? []) : [...(l.tentes ?? []), outil]
    await marquer(sb, Number(l.id), {
      statut: 'a_faire',
      tentes,
      outil: null,
      lieu: null,
      reclame_par: null,
      reclame_le: null,
      motif: motif ?? null,
    })
  }
  return lignes.length
}

/**
 * Enregistrer ce qu'un outil a rendu, et rendre la ligne à la file.
 *
 * L'outil entre dans `tentes` QUOI QU'IL AIT RENDU — y compris quand il n'a rien
 * conclu. C'est ce qui empêche la file de relancer indéfiniment un outil muet
 * sur la même fiche en ayant l'air de travailler. Un CAPTCHA ne se résout pas en
 * réessayant.
 */
export async function enregistrerResultat(
  sb: SupabaseClient,
  ligne: LigneFile,
  resultat: {
    outil: string
    constats?: readonly Constat[]
    dossier?: Record<string, unknown>
    /** La source n'a pas répondu. */
    erreur?: string
    /** La source a répondu, et voici ce qu'elle dit. Pas une panne. */
    note?: string
  },
): Promise<void> {
  if (resultat.constats?.length) {
    await ecrireConstats(sb, ligne.entrepriseId, resultat.constats, resultat.outil)
  }
  const tentes = ligne.tentes.includes(resultat.outil)
    ? ligne.tentes
    : [...ligne.tentes, resultat.outil]
  await marquer(sb, ligne.id, {
    statut: 'a_faire',
    tentes,
    outil: null,
    lieu: null,
    reclame_par: null,
    reclame_le: null,
    // Les deux se consignent sur la ligne — c'est ce qui permet de comprendre
    // plus tard pourquoi elle en est là. Seule `erreur` remontera en alerte.
    motif: resultat.erreur ?? resultat.note ?? null,
    dossier: { ...ligne.dossier, ...(resultat.dossier ?? {}) },
  })
}

/** Le compte des candidats déposés par les outils amont, par entreprise. */
export function candidatsDeLaFile(lignes: readonly LigneFile[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const l of lignes) {
    const c = (l.dossier as { candidats?: unknown }).candidats
    m.set(l.entrepriseId, Array.isArray(c) ? c.length : typeof c === 'number' ? c : 0)
  }
  return m
}

/**
 * Rejouer une passe : ramener dans la file ce qui en était sorti.
 *
 * ── POURQUOI C'EST NÉCESSAIRE ────────────────────────────────────────────
 * Une découverte en entraîne une autre. Trancher un SIRET rend l'hydratation
 * possible, qui rend le RGE possible ; un dossier web ramené par le poste local
 * donne une fiche Google, qui déclare souvent le site. À l'intérieur d'un appel,
 * le moteur enchaîne déjà — il fait quatre tours en rechargeant les faits.
 *
 * Mais une ligne SORTIE en `sans_prise` ne revient jamais, et un outil entré
 * dans `tentes` n'est jamais rappelé. Une fiche qui manquait de code postal au
 * moment où l'annuaire a été interrogé restera « sans prise » pour toujours,
 * même une fois l'adresse trouvée par une autre voie.
 *
 * ── POURQUOI C'EST SANS DANGER ───────────────────────────────────────────
 * Parce que LES CONSTATS RESTENT ÉCRITS. `prochaineEtape` ne propose un outil
 * que pour un sujet NON réglé — c'est l'invariant du module pur depuis le
 * premier jour. Rejouer ne redépense donc rien sur ce qui est déjà tranché : ça
 * ne rouvre que ce qui manquait.
 *
 * ON NE TOUCHE PAS AUX LIGNES `complet` : leurs sujets sont réglés au niveau
 * d'exigence demandé, et les rouvrir ne pourrait rien apporter de plus. Pour
 * repasser sur elles, c'est une passe à exigence plus haute qu'il faut — ce que
 * `PlanPasse.exigence` permet déjà.
 */
export async function rejouerPasse(
  sb: SupabaseClient,
  passeId: string,
): Promise<{ relancees: number }> {
  const { data, error } = await sb
    .from('lissage_leads')
    .update({
      statut: 'a_faire',
      // `tentes` se VIDE, et c'est tout l'objet de la relance : un outil qui
      // n'avait rien trouvé faute d'un préalable doit pouvoir retenter
      // maintenant que ce préalable existe.
      tentes: [],
      outil: null,
      lieu: null,
      motif: null,
      tentatives: 0,
      reclame_par: null,
      reclame_le: null,
      maj_le: new Date().toISOString(),
    })
    .eq('passe_id', passeId)
    .in('statut', ['sans_prise', 'erreur'])
    .select('id')
  if (error) throw new Error(`rejouerPasse: ${error.message}`)
  return { relancees: (data ?? []).length }
}

/** L'avancement d'une passe, par statut. Somme = population, par construction. */
export async function avancementDePasse(
  sb: SupabaseClient,
  passeId: string,
): Promise<Record<StatutLigne, number> & { total: number }> {
  const { data, error } = await sb.from('lissage_leads').select('statut').eq('passe_id', passeId)
  if (error) throw new Error(`avancementDePasse: ${error.message}`)
  const c = { a_faire: 0, en_cours: 0, complet: 0, sans_prise: 0, erreur: 0, total: 0 }
  for (const r of (data ?? []) as { statut: StatutLigne }[]) {
    if (r.statut in c) c[r.statut] += 1
    c.total += 1
  }
  return c
}
