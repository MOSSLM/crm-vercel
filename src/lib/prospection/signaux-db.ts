// signaux-db.ts — la passe d'une veille : lire, comparer, ne garder que le neuf.
//
// MÊME DÉCOUPAGE QUE `regulator.ts` / `regulator-db.ts` : la règle est pure
// (`signaux.ts`, éprouvable sans base), la lecture est ici. Ce fichier ne décide
// de rien — il relève, et il a le droit d'échouer.
//
// L'ORDRE DES LECTURES N'EST PAS INDIFFÉRENT. On lit LE DÉCLENCHEUR D'ABORD,
// le périmètre ensuite. C'est le déclencheur qui est sélectif — 98 RGE qui
// expirent, 220 sites injoignables — pendant que le périmètre pèse 908 ou
// 60 456 fiches. Commencer par le périmètre reviendrait à charger le parc pour
// en écarter 99,7 %.
//
// PAS DE SEGMENT, ET C'EST MESURÉ. Le plan dit « une veille = un segment + un
// déclencheur ». `segments_entreprises` porte ZÉRO ligne au 20/08/2026 :
// brancher le filtre par segment aujourd'hui serait construire pour personne,
// et il se poserait de toute façon comme un filtre APRÈS la lecture du
// déclencheur — la colonne `segment_id` est déjà en base pour ça. Ce qui existe
// à la place, `perimetre`, porte la seule distinction qui sert aujourd'hui :
// les 908 qu'on démarche, ou tout le parc.
//
// AUCUNE ÉCRITURE HORS `veille_constats`. Une passe ne touche ni les
// entreprises, ni les inscriptions, ni les tâches. C'est ce qui la rend
// relançable sans conséquence — la discipline « chercher et écrire sont deux
// scripts séparés » du registre des bots, appliquée à une veille.
import type { SupabaseClient } from '@supabase/supabase-js'
import { delta, type BilanPasse, type Declencheur } from './signaux'

/**
 * Le plafond de lecture, et pourquoi il est dit plutôt que subi.
 *
 * Le RGE qui expire touche 7 948 entreprises sur le parc. PostgREST rend 1 000
 * lignes par défaut ; on pagine jusqu'à ce plafond, et AU-DELÀ ON LE DIT. Un
 * relevé tronqué en silence se lirait comme un compte exhaustif — c'est la
 * règle « pas de plafond muet » du registre.
 */
const PLAFOND = 12_000
const PAGE = 1_000

/** Ce qu'une lecture de déclencheur rend : l'entreprise, et la preuve. */
export interface Trouvaille {
  entrepriseId: number
  /** Ce qui a déclenché, tel qu'on l'a lu. Sans preuve, un signal n'est pas actionnable. */
  valeur: Record<string, unknown>
}

export interface Veille {
  id: string
  declencheur: Declencheur
  perimetre: 'attribuees' | 'parc'
  premierePasseLe: string | null
}

const ISO_JOUR = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Lire toutes les pages d'une requête, jusqu'au plafond.
 *
 * Rend `tronque: true` quand le plafond a mordu — c'est cette information qui
 * remonte jusqu'au bilan, et jusqu'à l'écran.
 */
async function toutesLesPages<T>(
  requete: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ lignes: T[]; tronque: boolean; erreur: string | null }> {
  const lignes: T[] = []
  for (let de = 0; de < PLAFOND; de += PAGE) {
    const { data, error } = await requete(de, de + PAGE - 1)
    if (error) return { lignes, tronque: false, erreur: error.message }
    const page = data ?? []
    lignes.push(...page)
    if (page.length < PAGE) return { lignes, tronque: false, erreur: null }
  }
  return { lignes, tronque: true, erreur: null }
}

/* ── Les cinq lectures ───────────────────────────────────────────────────── */

type LectureRge = { entreprise_id: number | null; date_fin: string | null; nom_qualification: string | null }
type LectureAudit = { entreprise_id: number | null; note_globale: number | null; url_analysee: string | null; http_status: number | null }
type LectureRapport = { entreprise_id: number | null; vues: number | null; plaquette_vues: number | null; vu_le: string | null; plaquette_vu_le: string | null }

/**
 * Le RGE, sur ses deux versants.
 *
 * `retiree_le` non nul veut dire que la qualification a disparu de la base
 * ADEME entre deux relevés : ce n'est plus une échéance, c'est une ligne morte.
 * L'ignorer ferait sonner l'alarme sur des certificats qui n'existent plus.
 *
 * Une entreprise porte plusieurs qualifications (156 216 lignes pour 57 575
 * entreprises, soit près de trois chacune) : on garde la PLUS PROCHE, parce que
 * c'est celle qui date l'urgence.
 */
async function lireRge(
  sb: SupabaseClient,
  sens: 'bientot' | 'perime',
): Promise<{ trouvailles: Trouvaille[]; tronque: boolean; erreur: string | null }> {
  const aujourdhui = ISO_JOUR(new Date())
  const dans90 = ISO_JOUR(new Date(Date.now() + 90 * 86_400_000))

  const { lignes, tronque, erreur } = await toutesLesPages<LectureRge>((de, a) => {
    let q = sb
      .from('entreprise_rge_qualifications')
      .select('entreprise_id, date_fin, nom_qualification')
      .is('retiree_le', null)
      .not('entreprise_id', 'is', null)
    q = sens === 'bientot'
      ? q.gte('date_fin', aujourdhui).lte('date_fin', dans90)
      : q.lt('date_fin', aujourdhui)
    return q.order('date_fin', { ascending: true }).range(de, a)
  })
  if (erreur) return { trouvailles: [], tronque: false, erreur }

  // Le tri par `date_fin` croissant fait que la PREMIÈRE ligne vue pour une
  // entreprise est déjà la plus proche : garder la première suffit.
  const parEntreprise = new Map<number, Trouvaille>()
  for (const l of lignes) {
    if (l.entreprise_id == null || parEntreprise.has(l.entreprise_id)) continue
    parEntreprise.set(l.entreprise_id, {
      entrepriseId: l.entreprise_id,
      valeur: { date_fin: l.date_fin, qualification: l.nom_qualification },
    })
  }
  return { trouvailles: [...parEntreprise.values()], tronque, erreur: null }
}

/**
 * L'état du site, tel que l'audit l'a laissé.
 *
 * ⚠️ `entreprises_audit_site` n'a QU'UNE ligne par entreprise — sa clé primaire
 * est `entreprise_id`. On lit donc un ÉTAT, jamais une évolution : « son site
 * est injoignable », pas « son site vient de tomber ». C'est la mémoire de la
 * veille qui date l'entrée, et le bilan qui dit que la première passe est un
 * arriéré.
 */
async function lireAudit(
  sb: SupabaseClient,
  quoi: 'injoignable' | 'faible',
): Promise<{ trouvailles: Trouvaille[]; tronque: boolean; erreur: string | null }> {
  const { lignes, tronque, erreur } = await toutesLesPages<LectureAudit>((de, a) => {
    let q = sb
      .from('entreprises_audit_site')
      .select('entreprise_id, note_globale, url_analysee, http_status')
      .not('entreprise_id', 'is', null)
    q = quoi === 'injoignable' ? q.is('injoignable', true) : q.not('note_globale', 'is', null).lt('note_globale', 50)
    return q.range(de, a)
  })
  if (erreur) return { trouvailles: [], tronque: false, erreur }

  return {
    trouvailles: lignes
      .filter((l): l is LectureAudit & { entreprise_id: number } => l.entreprise_id != null)
      .map((l) => ({
        entrepriseId: l.entreprise_id,
        valeur: quoi === 'injoignable'
          ? { url: l.url_analysee, http_status: l.http_status }
          : { note_globale: l.note_globale, url: l.url_analysee },
      })),
    tronque,
    erreur: null,
  }
}

/**
 * Ce qu'on lui a envoyé, et qu'il a ouvert.
 *
 * Trois lignes sur tout le parc, et c'est le signal le plus chaud du CRM : le
 * seul qui prouve une intention plutôt qu'un état. Sa rareté n'est pas un
 * défaut de la veille, c'est ce qu'elle mesure — 42 plaquettes ont été
 * fabriquées, 3 ont été ouvertes.
 */
async function lireRapportOuvert(
  sb: SupabaseClient,
): Promise<{ trouvailles: Trouvaille[]; tronque: boolean; erreur: string | null }> {
  const { lignes, tronque, erreur } = await toutesLesPages<LectureRapport>((de, a) =>
    sb
      .from('entreprises_rapport_public')
      .select('entreprise_id, vues, plaquette_vues, vu_le, plaquette_vu_le')
      .not('entreprise_id', 'is', null)
      .or('vues.gt.0,plaquette_vues.gt.0')
      .range(de, a),
  )
  if (erreur) return { trouvailles: [], tronque: false, erreur }

  return {
    trouvailles: lignes
      .filter((l): l is LectureRapport & { entreprise_id: number } => l.entreprise_id != null)
      .map((l) => ({
        entrepriseId: l.entreprise_id,
        valeur: {
          vues_rapport: l.vues ?? 0,
          vues_plaquette: l.plaquette_vues ?? 0,
          derniere_vue: l.plaquette_vu_le ?? l.vu_le,
        },
      })),
    tronque,
    erreur: null,
  }
}

/** L'aiguillage. Un déclencheur inconnu est une panne, pas un vide. */
async function lireLeDeclencheur(sb: SupabaseClient, d: Declencheur) {
  switch (d) {
    case 'rge_expire_bientot': return lireRge(sb, 'bientot')
    case 'rge_perime': return lireRge(sb, 'perime')
    case 'site_injoignable': return lireAudit(sb, 'injoignable')
    case 'audit_faible': return lireAudit(sb, 'faible')
    case 'rapport_ouvert': return lireRapportOuvert(sb)
  }
}

/* ── Le périmètre ────────────────────────────────────────────────────────── */

/**
 * Les entreprises qu'on démarche. `null` veut dire « tout le parc » — et non
 * pas « aucune » : la nuance décide de tout, un ensemble vide filtrerait tout.
 */
async function lirePerimetre(
  sb: SupabaseClient,
  perimetre: Veille['perimetre'],
): Promise<{ ids: Set<number> | null; erreur: string | null }> {
  if (perimetre === 'parc') return { ids: null, erreur: null }
  const { lignes, erreur } = await toutesLesPages<{ id: number }>((de, a) =>
    sb.from('entreprises').select('id').not('owner_id', 'is', null).range(de, a),
  )
  if (erreur) return { ids: null, erreur }
  return { ids: new Set(lignes.map((l) => l.id)), erreur: null }
}

/* ── La passe ────────────────────────────────────────────────────────────── */

export interface ResultatPasse {
  bilan: BilanPasse
  /** Les nouvelles, dans l'ordre où la lecture les a rendues. */
  nouvelles: Trouvaille[]
}

/**
 * Une passe complète : lire, comparer à ce qu'on a déjà vu, insérer le delta.
 *
 * L'IDEMPOTENCE EST UNE INSERTION, PAS UNE LECTURE — même règle que la
 * réception des e-mails. L'unicité `(veille_id, entreprise_id)` tranche en
 * base ; le `delta()` pur qui précède n'est qu'une économie d'écritures, jamais
 * la garantie. Deux passes lancées en même temps ne peuvent donc pas doubler un
 * constat, quel que soit l'entrelacement.
 */
export async function passerLaVeille(sb: SupabaseClient, veille: Veille): Promise<ResultatPasse> {
  const reprise = veille.premierePasseLe == null
  const vide = (panne?: string): ResultatPasse => ({
    bilan: { examinees: 0, nouvelles: 0, connues: 0, reprise, ...(panne ? { panne } : {}) },
    nouvelles: [],
  })

  const lecture = await lireLeDeclencheur(sb, veille.declencheur)
  if (lecture.erreur) return vide(lecture.erreur)

  const perimetre = await lirePerimetre(sb, veille.perimetre)
  if (perimetre.erreur) return vide(perimetre.erreur)

  const dansLePerimetre = perimetre.ids
    ? lecture.trouvailles.filter((t) => perimetre.ids!.has(t.entrepriseId))
    : lecture.trouvailles

  // Ce qu'on a DÉJÀ constaté pour cette veille. Une lecture qui échoue ici
  // n'autorise pas à tout redéclarer neuf : sans mémoire, on ne sait plus ce
  // qui est un événement, et on republierait l'arriéré entier.
  const deja = await toutesLesPages<{ entreprise_id: number }>((de, a) =>
    sb.from('veille_constats').select('entreprise_id').eq('veille_id', veille.id).range(de, a),
  )
  if (deja.erreur) return vide(deja.erreur)
  const connus = new Set(deja.lignes.map((l) => l.entreprise_id))

  const nouveauxIds = delta(dansLePerimetre.map((t) => t.entrepriseId), connus)
  const parId = new Map(dansLePerimetre.map((t) => [t.entrepriseId, t]))
  const nouvelles = nouveauxIds.map((id) => parId.get(id)!).filter(Boolean)

  if (nouvelles.length) {
    const { error } = await sb.from('veille_constats').insert(
      nouvelles.map((t) => ({
        veille_id: veille.id,
        entreprise_id: t.entrepriseId,
        reprise,
        valeur: t.valeur,
      })),
      // Une passe concurrente a pu poser la même ligne entre notre lecture et
      // notre insertion : le conflit dit « déjà vu », il n'est pas une panne.
      { count: 'exact' },
    )
    // 23505 = l'unicité a tranché. Tout autre code est une vraie panne, et un
    // bilan en panne ne doit jamais se lire comme « rien trouvé ».
    if (error && (error as { code?: string }).code !== '23505') return vide(error.message)
  }

  const bilan: BilanPasse = {
    examinees: dansLePerimetre.length,
    nouvelles: nouvelles.length,
    connues: dansLePerimetre.length - nouvelles.length,
    reprise,
    ...(lecture.tronque
      ? { panne: `lecture tronquée au plafond de ${PLAFOND} lignes — le relevé est incomplet` }
      : {}),
  }

  const maintenant = new Date().toISOString()
  await sb
    .from('veilles')
    .update({
      derniere_passe_le: maintenant,
      derniere_passe_bilan: bilan,
      ...(reprise ? { premiere_passe_le: maintenant } : {}),
    })
    .eq('id', veille.id)

  return { bilan, nouvelles }
}
