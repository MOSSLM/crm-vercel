// outils-serveur.ts — les outils que l'app peut lancer toute seule.
//
// POURQUOI CE FICHIER EXISTE
// Sur les 34 bots du registre, UN SEUL est un skill Claude. Quatorze sont des
// routes, deux des edge functions, quatre des crons : vingt tournent déjà côté
// serveur. Ce qui empêchait de les lancer depuis l'app n'était pas leur nature,
// c'est qu'aucun n'avait d'écran ni de file. Ce module est l'adaptateur : il
// prend un outil du registre et rend des CONSTATS, dans le vocabulaire des trois
// états.
//
// ── LA SEULE RÈGLE DE TRADUCTION ──────────────────────────────────────────
// Chaque service rend déjà trois issues — `ok`, `vide`, `erreur` — et elles se
// lisent exactement comme nos trois états, à une nuance près qui décide tout :
//
//   ok     → present   la source a répondu, et elle porte quelque chose.
//   vide   → absent    LA SOURCE A RÉPONDU, ET ELLE N'A RIEN. Un résultat.
//   erreur → inconnu   la source n'a pas répondu. Ce n'est PAS « il n'en a pas ».
//
// La nuance : `vide` ne vaut `absent` que si la source FAIT AUTORITÉ sur la
// question. L'ADEME fait autorité sur le RGE — un artisan qui n'est pas au
// registre n'est pas RGE, le registre des bots le dit déjà (« l'ADEME prime sur
// ce que le site affiche »). L'annuaire des entreprises ne fait PAS autorité sur
// l'existence d'une entreprise : un SIRET qu'il ne connaît pas veut dire que
// notre SIRET est faux, pas que l'entreprise n'existe pas. Là, `vide` vaut
// `inconnu` — et c'est un rapprochement à refaire, pas une donnée à écrire.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hydraterIdentite, hydraterRge } from '@/lib/donnees-publiques/service'
import {
  chercherCandidats,
  enregistrerCandidats,
  validerCandidat,
} from '@/lib/donnees-publiques/resolution'
import {
  fichesAChoisir,
  identiteEvidente,
  identiteProbable,
  type CandidatSiret,
} from '@/lib/lissage/choix-siret'
import type { Constat, FaitsDuProspect } from '@/lib/lissage/passe'

/** Ce qu'un outil rend : des constats, de la matière, une remarque, ou une panne. */
export interface Execution {
  constats: Constat[]
  /** Ce qu'il a TROUVÉ sans le décider — lu par les outils aval de la passe. */
  dossier?: Record<string, unknown>
  /**
   * LA PANNE : la source n'a pas répondu. Elle remonte jusqu'à l'écran en
   * rouge, et elle ne se tait pas.
   */
  erreur?: string
  /**
   * LA REMARQUE : la source A RÉPONDU, et voici ce qu'elle dit. « L'annuaire ne
   * propose aucun candidat », « code postal différent du registre »,
   * « entreprise cessée ».
   *
   * ── POURQUOI CE CHAMP A DÛ EXISTER ────────────────────────────────────
   * Tout ça passait par `erreur`, donc l'écran l'affichait comme une panne — et
   * il en affichait presque à chaque tour, sur du fonctionnement parfaitement
   * normal. C'est exactement la confusion que ce module combat depuis son
   * en-tête, prise à l'envers : `vide` n'est pas `erreur`. Une source qui
   * répond « je n'ai rien » a fait son travail.
   *
   * Le coût de la confusion n'est pas cosmétique : une alerte qui crie tout le
   * temps finit par ne plus être lue, et c'est la vraie panne qu'on rate.
   */
  note?: string
}

export type ExecuteurServeur = (
  sb: SupabaseClient,
  faits: FaitsDuProspect,
) => Promise<Execution>

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * L'identité légale, par l'annuaire officiel.
 *
 * ⚠️ `hydraterIdentite` pose `identite_rafraichie_le` MÊME QUAND ELLE NE TROUVE
 * RIEN — la même famille de piège que les 54 878 estampilles RGE. On ne se fie
 * donc pas à ce qu'elle a écrit, on se fie à ce qu'elle a RENDU.
 */
const identiteParAnnuaire: ExecuteurServeur = async (sb, faits) => {
  const r = await hydraterIdentite(
    sb,
    { entreprise_id: faits.entrepriseId, siret: faits.siret },
    // `bouton` et non `cron` : c'est un humain qui a lancé la passe, et le
    // journal doit pouvoir distinguer les deux.
    { declencheur: 'bouton' },
  )
  if (r.statut === 'erreur') return { constats: [], erreur: r.message ?? 'annuaire injoignable' }
  if (r.statut === 'vide') {
    // L'annuaire ne fait pas autorité sur l'EXISTENCE : ce SIRET-ci ne lui dit
    // rien, ce qui met en cause notre rapprochement, pas l'entreprise.
    return {
      constats: [
        {
          sujet: 'identite',
          etat: 'inconnu',
          confiance: 'haute',
          source: 'donnees-publiques',
          preuve: { pourquoi: 'l’annuaire ne connaît pas ce SIRET — le rapprochement est à refaire', siret: faits.siret },
        },
      ],
    }
  }
  return {
    constats: [
      {
        sujet: 'identite',
        etat: 'present',
        confiance: 'certaine',
        valeur: faits.siret,
        source: 'donnees-publiques',
        preuve: { champs: r.champs },
      },
    ],
  }
}

/**
 * Le RGE, par le registre ADEME.
 *
 * C'EST LE SEUL OUTIL DONT LE « VIDE » VAUT « ABSENT », et c'est justifié : le
 * registre ADEME est la définition de la qualification. Ne pas y être, c'est ne
 * pas l'être. Le registre des bots le dit déjà — « un site qui affiche RGE sans
 * être au registre ne l'est pas ».
 *
 * C'est aussi l'outil qui répare les 54 878 : chaque passage écrit une vraie
 * réponse là où le remplissage de masse n'avait posé qu'une date.
 */
const rgeParAdeme: ExecuteurServeur = async (sb, faits) => {
  const r = await hydraterRge(sb, { entreprise_id: faits.entrepriseId, siret: faits.siret })
  if (r.statut === 'erreur') return { constats: [], erreur: r.message ?? 'ADEME injoignable' }
  const present = r.statut === 'ok'
  return {
    constats: [
      {
        sujet: 'rge',
        etat: present ? 'present' : 'absent',
        confiance: 'certaine',
        valeur: present ? `${r.ajoutees} qualification(s) RGE` : null,
        source: 'ademe-rge',
        preuve: { ajoutees: r.ajoutees, retirees: r.retirees },
      },
    ],
  }
}

/**
 * Chercher l'identité par le nom — et ne rien décider.
 *
 * Le registre est formel : « la résolution SIRET PROPOSE des candidats, elle ne
 * CHOISIT jamais », et « pour écrire sans relecture, il faut adresse + code
 * postal + nom + métier concordants ; trois sur quatre ne suffisent pas ». Cet
 * outil n'écrit donc AUCUN constat.
 *
 * ⚠️ IL PASSE PAR `chercherCandidats`, PAS PAR `searchByName`. La première
 * version appelait l'API directement et déposait ses trouvailles dans le
 * `dossier` de la ligne de file — c'est-à-dire qu'elle créait une SECONDE liste
 * de candidats SIRET, à côté d'`entreprise_siret_candidats` qui existait depuis
 * le 08/08 avec son score décomposé, ses rejets et sa validation admin. Deux
 * listes de candidats finissent toujours par se contredire, et ici la
 * contradiction s'écrit en SIRET faux — donc en identité fausse, en finances
 * fausses, et en logos RGE sur un site public.
 *
 * Au passage, `chercherCandidats` fait tout ce que l'appel direct ne faisait
 * pas : il filtre par code postal avant d'élargir, il essaie les variantes du
 * nom (« CLIMIZ » rend 0 résultat, « TOP CLIMATISATION » est la bonne), il note
 * et il ne garde que ce qui dépasse le seuil de proposition.
 */
const candidatsParNom: ExecuteurServeur = async (sb, faits) => {
  try {
    const candidats = await chercherCandidats({
      entreprise_id: faits.entrepriseId,
      name: faits.nom,
      ville: faits.ville,
      code_postal: faits.codePostal,
      adresse: faits.adresse,
      avis: faits.avis,
    })
    const enregistres = await enregistrerCandidats(sb, faits.entrepriseId, candidats)
    return {
      constats: [],
      // Le dossier ne porte QUE des compteurs : la matière, elle, vit dans la
      // table. Y recopier les candidats les ferait diverger dès la première
      // décision humaine.
      dossier: {
        identite_candidats: enregistres,
        identite_meilleur_score: candidats[0]?.score ?? null,
      },
      // Zéro candidat n'est pas une panne : c'est un résultat, et il se dit —
      // dans `note`, pas dans `erreur`.
      note:
        candidats.length === 0
          ? 'l’annuaire ne propose aucun candidat sur ce nom'
          : enregistres === 0
            ? 'tous les candidats de cette fiche ont déjà été tranchés'
            : undefined,
    }
  } catch (e) {
    return { constats: [], erreur: message(e) }
  }
}

/**
 * L'identité qui se tranche sans personne.
 *
 * ── POURQUOI CET OUTIL EXISTE, ET POURQUOI IL EST PRUDENT ─────────────────
 * Le registre des bots autorise l'écriture sans relecture à une condition
 * précise : « adresse + code postal + nom + métier concordants ; trois sur
 * quatre ne suffisent pas ». On l'applique enfin — jusqu'ici l'écran demandait
 * un clic même quand les quatre concordaient, ce qui usait l'attention sur des
 * décisions qui n'en étaient pas.
 *
 * `identiteEvidente` ajoute la seconde garde : UN SEUL SIREN candidat. Plusieurs
 * SIREN veut dire que l'annuaire hésite entre des ENTREPRISES, et c'est le
 * piège « KM Dépannage » — deux SIREN à la même adresse et au même patronyme,
 * l'un chauffagiste, l'autre taxi. Plusieurs ÉTABLISSEMENTS d'un même SIREN, en
 * revanche, ne posent pas la question : seule l'adresse change.
 *
 * QUAND IL NE TRANCHE PAS, IL N'ÉCRIT RIEN et ne se plaint pas. Il entre dans
 * `tentes`, et `choix-siret` prend la main au tour suivant — c'est exactement
 * la sortie qu'on veut : l'écran ne reçoit que ce qui demande un jugement.
 *
 * ⚠️ Il ne remplace PAS la vérification au registre : `validerCandidat`
 * réinterroge l'annuaire avant d'écrire, quelle que soit la voie.
 */
const identiteSansRelecture: ExecuteurServeur = async (sb, faits) => {
  const { data, error } = await sb
    .from('entreprise_siret_candidats')
    .select(
      'id, entreprise_id, siret, denomination, enseignes, adresse, code_postal, ville, etat_administratif, naf_code, score, score_detail',
    )
    .eq('entreprise_id', faits.entrepriseId)
    .eq('statut', 'propose')
  if (error) return { constats: [], erreur: error.message }

  const candidats: CandidatSiret[] = ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    id: String(l.id),
    entrepriseId: Number(l.entreprise_id),
    siret: String(l.siret),
    denomination: (l.denomination as string | null) ?? null,
    enseignes: (l.enseignes as string[] | null) ?? [],
    adresse: (l.adresse as string | null) ?? null,
    codePostal: (l.code_postal as string | null) ?? null,
    ville: (l.ville as string | null) ?? null,
    etatAdministratif: (l.etat_administratif as string | null) ?? null,
    nafCode: (l.naf_code as string | null) ?? null,
    score: Number(l.score ?? 0),
    detail: (l.score_detail as CandidatSiret['detail']) ?? null,
  }))

  const [fiche] = fichesAChoisir(candidats, [
    {
      entrepriseId: faits.entrepriseId,
      nom: faits.nom,
      ville: faits.ville,
      codePostal: faits.codePostal,
    },
  ])
  // DEUX PORTES, DANS CET ORDRE. `identiteEvidente` prend le cas parfait —
  // un seul SIREN, les quatre critères. `identiteProbable` prend ce que le
  // registre laissait à un humain alors qu'il n'y avait rien à juger : un
  // artisan immatriculé sous un NAF voisin, une enseigne qui diffère de la
  // raison sociale, deux SIREN que le score sépare nettement. Elle refuse
  // toujours l'écart serré à critères égaux — le piège « KM Dépannage ».
  //
  // L'ordre compte pour la TRAÇABILITÉ, pas pour le résultat : les deux
  // écriraient le même SIRET sur un cas parfait, mais le commentaire ne dirait
  // pas la même chose, et c'est lui qu'on relira dans six mois.
  const evident = fiche ? identiteEvidente(fiche) : null
  const probable = evident ? null : fiche ? identiteProbable(fiche) : null
  const retenu = evident ?? probable?.candidat ?? null
  // Ni l'un ni l'autre : on passe la main SANS bruit. Ce n'est pas une panne,
  // c'est le cas normal — il reste des fiches qui demandent un jugement, et
  // c'est très bien.
  if (!retenu) return { constats: [] }

  const raison = evident
    ? `quatre critères concordants (${evident.concordance.libelleAdresse}), un seul SIREN candidat`
    : `règle élargie — ${probable!.regle}`

  const res = await validerCandidat(sb, {
    entreprise_id: faits.entrepriseId,
    siret: retenu.siret,
    // Personne n'a regardé, et on le DIT. Mettre un uuid d'utilisateur ferait
    // croire dans six mois que quelqu'un a validé cette fiche à la main.
    decide_par: null,
    // `resolution_auto` pour la règle stricte, `resolution_elargie` pour
    // l'autre : les deux ne se relisent pas avec la même confiance, et un seul
    // libellé les confondrait dans les comptes.
    source: evident ? 'resolution_auto' : 'resolution_elargie',
    commentaire: raison,
  })
  if (!res.ok) return { constats: [], erreur: `identite-evidente: ${res.erreur}` }

  return {
    constats: [
      {
        sujet: 'identite',
        etat: 'present',
        // La confiance SUIT LA RÈGLE qui a tranché. « haute » sur les quatre
        // critères, « moyenne » sur la règle élargie : un constat qui se dirait
        // aussi sûr dans les deux cas rendrait le tri impossible plus tard.
        confiance: evident ? 'haute' : 'moyenne',
        valeur: retenu.siret,
        source: 'identite-evidente',
        preuve: {
          score: retenu.score,
          concordance: retenu.concordance,
          regle: raison,
          avertissements: res.avertissements,
        },
      },
    ],
    dossier: { identite_auto: retenu.siret },
    // Les divergences ne bloquent pas mais REMONTENT — un siège ailleurs, une
    // entreprise cessée. Les taire sur une décision prise sans témoin serait
    // exactement l'inverse de ce qu'on veut. Mais ce ne sont PAS des pannes :
    // l'écriture a réussi, et c'est une remarque sur ce qui a été écrit.
    note: res.avertissements.length > 0 ? res.avertissements.join(' · ') : undefined,
  }
}

/**
 * Les outils que le serveur sait exécuter, par identifiant du registre.
 *
 * `refresh-google-stats` n'y est PAS, et c'est délibéré : l'edge function prend
 * des `project_ids`, pas des entreprises, et la faire porter le lissage
 * demanderait de traduire l'un en l'autre — un travail à part, qui ne se cache
 * pas dans un adaptateur. Tant qu'elle n'y est pas, la file le DIT au lieu de
 * réessayer trois fois dans le vide.
 */
export const EXECUTEURS: Readonly<Record<string, ExecuteurServeur>> = {
  'identite-evidente': identiteSansRelecture,
  'donnees-publiques': identiteParAnnuaire,
  'ademe-rge': rgeParAdeme,
  'resolution-siret': candidatsParNom,
}

export const outilBranche = (id: string): boolean => id in EXECUTEURS

/**
 * Lancer un outil serveur, sans jamais laisser une exception traverser.
 *
 * Une panne d'outil ne doit pas faire tomber le tick : les autres prospects du
 * lot n'y sont pour rien. Elle devient une erreur écrite sur la ligne, et
 * l'outil entre quand même dans les « tentés » — c'est ce qui empêche la file de
 * relancer indéfiniment ce qui ne répond pas.
 */
export async function executerOutilServeur(
  sb: SupabaseClient,
  outilId: string,
  faits: FaitsDuProspect,
): Promise<Execution> {
  const executeur = EXECUTEURS[outilId]
  if (!executeur) {
    // CE N'EST PAS UNE PANNE, c'est un manque à dire : l'outil existe au
    // registre, rien ne s'est cassé, il n'a simplement pas encore d'exécuteur
    // côté serveur. Le passer en `erreur` faisait crier l'écran en rouge à
    // chaque tour sur du fonctionnement connu — et une alerte qui crie tout le
    // temps finit par ne plus être lue.
    return { constats: [], note: `« ${outilId} » n’est pas encore lançable depuis l’app` }
  }
  try {
    return await executeur(sb, faits)
  } catch (e) {
    return { constats: [], erreur: message(e) }
  }
}
