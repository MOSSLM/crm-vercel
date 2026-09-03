// choix-siret.ts — trancher une identité légale, sur pièces. Pur.
//
// CE QUE CET ÉCRAN DÉBLOQUE
// `recherche-entreprises` propose des candidats et ne choisit jamais. C'est la
// bonne règle — un rapprochement faux n'est pas une donnée fausse isolée, c'est
// une contamination : mauvais SIRET → mauvaise identité, mauvaises finances, et
// mauvaises qualifications RGE, qui finissent en logos sur un site public qu'on
// produit. Mais une règle qui interdit d'écrire sans porte pour trancher ne
// protège rien : elle empile.
//
// MESURÉ LE 20/08/2026, ET LE CHIFFRE BRUT MENT. `entreprise_siret_candidats`
// porte 506 lignes `propose` sur 186 fiches — mais **172 de ces fiches ont déjà
// un SIRET**, écrit par un versement antérieur (`proeco_registre_auto` 139,
// `api_gouv` 19, `proeco_site_mentions_legales` 14) qui n'est jamais passé par
// `validerCandidat` et n'a donc rejeté personne. 458 de ces 506 lignes ne sont
// plus une décision à prendre.
//
// **14 fiches attendent vraiment**, avec 48 candidats. Aucune n'a de candidat
// dont les quatre critères concordent, et 8 sur 14 sont serrées : ce sont les
// cas durs, ceux que le score ne tranche pas. C'est exactement pourquoi cet
// écran montre les quatre critères et signale les écarts faibles, au lieu
// d'aligner des « 71/100 ».
//
// Le gisement, lui, est devant : **2 648 fiches vivantes sans SIRET**, dont
// 1 479 portent un nom ET une commune — donc cherchables. C'est la passe de
// lissage qui les amènera ici.
//
// ── LE CRITÈRE, ET IL VIENT DU REGISTRE DES BOTS ──────────────────────────
// « Pour écrire un rapprochement sans relecture humaine, il faut adresse + code
// postal + nom + métier concordants. Trois sur quatre ne suffisent pas. »
//
// Ce module ne fait donc PAS un quatrième score : `score.ts` en a déjà un, à
// cinq composantes pondérées, et en fabriquer un second serait exactement la
// faute que ce fichier existe pour éviter. Il RELIT le détail existant à la
// lumière des quatre critères du registre, pour que l'écran puisse dire « les
// quatre concordent » au lieu d'afficher « 87/100 » — un chiffre qu'on ne sait
// pas contester.
//
// ⚠️ ET MÊME QUAND LES QUATRE CONCORDENT, ON NE VALIDE PAS TOUT SEUL. Le
// registre autorise l'écriture sans relecture ; l'écran, lui, garde le clic.
// La raison est mesurée : la fiche 57 « KM Dépannage » a deux SIREN plausibles à
// la MÊME adresse et au MÊME patronyme — l'un chauffagiste, l'autre taxi. Les
// quatre critères concordent pour les deux.

import type { Etat } from '@/lib/lissage/passe'

/* ── Ce que la table porte ────────────────────────────────────────────────── */

/**
 * Le détail d'un score. IL Y EN A DEUX FORMATS EN BASE, et les confondre fait
 * exactement le contraire de ce que cet écran promet.
 *
 * ── CE QUE LA BASE PORTE, MESURÉ LE 20/08/2026 ────────────────────────────
 * Sur les candidats en attente de décision, **48 sur 54 sont au format
 * `proeco`** — celui d'un versement antérieur dont le producteur n'est pas dans
 * le dépôt (`CLAUDE.md` le signale déjà : « ProÉco figure dans les libellés,
 * mais aucun bot du dépôt ne l'interroge »). Six seulement viennent de
 * `score.ts`. Lire tout le monde avec le barème de `score.ts` affichait donc du
 * faux pour 89 % de l'écran.
 *
 * Les deux barèmes, relevés sur 1 253 lignes :
 *
 *              `score.ts`              `proeco`
 *   nom        0 → 45                  0 → 25
 *   codePostal 0 / 10 / 25             0 / 7 / 20
 *   adresse    `ville`, 0 → 15         `adresse`, 0 / 20 / 45 + `niveau_adresse`
 *   activite   0 / 10                  0 / 10
 *   etat       0 / 5                   0 / 5
 *
 * Appliquer « nom ≥ 36 » à un barème qui plafonne le nom à 25 rejette TOUS ses
 * candidats, y compris les parfaits. Constaté à l'écran : « AVIZ'ENERGIE »,
 * adresse exacte, bon code postal, bon métier, **score 100** — affiché
 * « 1/4 critères ». L'écran poussait à écarter le meilleur candidat de la file.
 *
 * ⚠️ ET LE BARÈME `proeco` EST LE MEILLEUR DES DEUX sur le critère qui compte
 * le plus pour le registre : il compare l'adresse AU NIVEAU DE LA VOIE
 * (`niveau_adresse` vaut `exacte`, `voie` ou `non`), là où `score.ts` ne compare
 * que la commune. Quand il dit « exacte », c'est vraiment le critère « adresse »
 * du registre qui est tenu — pas une approximation.
 */
export interface DetailScoreLu {
  nom?: number
  codePostal?: number
  activite?: number
  etat?: number
  alertes?: string[]
  /** `score.ts` : la commune, 0 → 15. */
  ville?: number
  /**
   * `score.ts` : la voie, 0 → 20. Ajoutée le 03/09/2026, donc ABSENTE des lignes
   * antérieures — c'est pour ça qu'elle se lit en `?? 0` partout : le barème
   * s'est enrichi sans qu'aucun candidat déjà noté change de verdict.
   */
  rue?: number
  nomCompareA?: string | null
  /** `proeco` : l'adresse, 0 / 20 / 45. */
  adresse?: number
  /** `proeco` : `exacte` | `voie` | `non` — plus parlant que les points. */
  niveau_adresse?: string | null
  nom_compare_a?: string | null
}

/** Lequel des deux barèmes a noté ce candidat. */
export type Bareme = 'score-ts' | 'proeco'

/** `proeco` se reconnaît à ses deux clés propres, absentes de `score.ts`. */
export function baremeDe(detail: DetailScoreLu | null | undefined): Bareme {
  const d = detail ?? {}
  return d.niveau_adresse !== undefined || d.adresse !== undefined ? 'proeco' : 'score-ts'
}

/** À quoi l'adresse a été comparée — l'écran doit le dire, pas le supposer. */
export function libelleAdresse(detail: DetailScoreLu | null | undefined): string {
  if (baremeDe(detail) !== 'proeco') {
    // `score.ts` sait maintenant comparer la voie, et il faut le DIRE : afficher
    // « commune » sur un candidat retenu pour son numéro de rue ferait passer le
    // critère le plus fort du dossier pour le plus faible.
    const rue = detail?.rue ?? 0
    if (rue >= SEUILS['score-ts'].rue) return 'adresse exacte'
    if (rue > 0) return 'même voie'
    return 'commune'
  }
  const n = detail?.niveau_adresse
  if (n === 'exacte') return 'adresse exacte'
  if (n === 'voie') return 'même voie'
  return 'adresse'
}

/** Le nom auquel on a comparé, quel que soit le barème qui l'a écrit. */
export const nomCompareA = (detail: DetailScoreLu | null | undefined): string | null =>
  detail?.nomCompareA ?? detail?.nom_compare_a ?? null

/** Une ligne d'`entreprise_siret_candidats`, réduite à ce que l'écran lit. */
export interface CandidatSiret {
  id: string
  entrepriseId: number
  siret: string
  denomination: string | null
  enseignes: string[]
  adresse: string | null
  codePostal: string | null
  ville: string | null
  /** `A` actif, `C` cessé. Un cessé reste proposable : c'est peut-être le bon. */
  etatAdministratif: string | null
  nafCode: string | null
  score: number
  detail: DetailScoreLu | null
}

/* ── Les quatre critères du registre ──────────────────────────────────────── */

/**
 * Les seuils, un jeu par barème, et pourquoi ceux-là.
 *
 * LA RÈGLE COMMUNE AUX DEUX : le code postal se tient à L'ÉGALITÉ STRICTE, donc
 * au maximum du barème. Les deux accordent des points partiels au même
 * département (10 sur 25 chez `score.ts`, 7 sur 20 chez `proeco`) — c'est un
 * encouragement à regarder, jamais une concordance. Deux communes d'un même
 * département sont deux adresses différentes, et c'est précisément le cas qui
 * ressemble le plus à un bon candidat sans en être un.
 *
 * Le nom se tient à 80 % du maximum dans les deux cas (36/45 et 20/25) : en
 * dessous, on est sur un « ça pourrait être ça », pas sur une concordance.
 *
 * L'adresse est le seul endroit où les deux ne disent pas la même chose :
 *   · `score.ts` n'a que la COMMUNE (12 sur 15). On le dit à l'écran plutôt que
 *     de faire croire qu'on a comparé une rue ;
 *   · `proeco` a la VOIE, et son palier haut (45, `niveau_adresse: 'exacte'`)
 *     est le vrai critère « adresse » du registre.
 *
 * Le métier est binaire dans les deux : le NAF est dans les codes attendus, ou non.
 */
export const SEUILS: Readonly<
  Record<Bareme, { nom: number; codePostal: number; adresse: number; rue: number; metier: number }>
> = {
  // `rue` à 20, c'est-à-dire LE MAXIMUM de la composante : même voie ET même
  // numéro. `similariteVoie` rend 0,5 pour un autre numéro de la même voie et
  // 0,7 quand un numéro manque — dans une zone artisanale, l'autre numéro est
  // le voisin, et un voisin n'est pas une concordance. C'est le même arbitrage
  // que `proeco`, dont le critère se tient à `niveau_adresse: 'exacte'`.
  'score-ts': { nom: 36, codePostal: 25, adresse: 12, rue: 20, metier: 10 },
  proeco: { nom: 20, codePostal: 20, adresse: 45, rue: 45, metier: 10 },
}

export interface Concordance {
  nom: boolean
  codePostal: boolean
  /** La commune ou la voie, selon le barème — voir `libelleAdresse`. */
  adresse: boolean
  /**
   * L'adresse tenue AU NIVEAU DE LA VOIE, numéro compris. C'est un sous-cas
   * strict d'`adresse`, et il ne sert qu'à une chose : autoriser l'écriture
   * automatique quand le NOM ne concorde pas. Une commune et un métier ne
   * distinguent pas un artisan de son concurrent d'en face ; un numéro de rue,
   * si.
   */
  adresseExacte: boolean
  metier: boolean
  /** Sur quatre. Le registre dit que trois ne suffisent pas. */
  compte: number
  /** Les quatre concordent. Le seul cas que le registre dirait écrivable seul. */
  lesQuatre: boolean
  /** Lequel des deux barèmes a servi — l'écran ne doit pas avoir à le deviner. */
  bareme: Bareme
  /** « commune », « adresse exacte », « même voie » — ce qu'on a vraiment comparé. */
  libelleAdresse: string
}

export function concordance(detail: DetailScoreLu | null | undefined): Concordance {
  const d = detail ?? {}
  const bareme = baremeDe(detail)
  const seuils = SEUILS[bareme]
  // Chaque barème a sa colonne d'adresse : `ville` chez `score.ts`, `adresse`
  // chez `proeco`. Lire la mauvaise rend 0 et fait échouer le critère en silence.
  const pointsAdresse = bareme === 'proeco' ? (d.adresse ?? 0) : (d.ville ?? 0)

  const nom = (d.nom ?? 0) >= seuils.nom
  const codePostal = (d.codePostal ?? 0) >= seuils.codePostal
  // DEUX FAÇONS DE TENIR LE CRITÈRE D'ADRESSE chez `score.ts`, et la seconde
  // est la bonne : la commune (12/15) le tenait faute de mieux, la voie exacte
  // (20/20) le tient vraiment. L'union ne relâche rien — une ligne notée avant
  // le 03/09 n'a pas de `rue`, donc elle est jugée exactement comme avant.
  const adresse =
    pointsAdresse >= seuils.adresse || (bareme === 'score-ts' && (d.rue ?? 0) >= seuils.rue)
  const adresseExacte =
    bareme === 'proeco' ? d.niveau_adresse === 'exacte' : (d.rue ?? 0) >= seuils.rue
  const metier = (d.activite ?? 0) >= seuils.metier
  const compte = [nom, codePostal, adresse, metier].filter(Boolean).length
  return {
    nom,
    codePostal,
    adresse,
    adresseExacte,
    metier,
    compte,
    lesQuatre: compte === 4,
    bareme,
    libelleAdresse: libelleAdresse(detail),
  }
}

/** Ce qui doit sauter aux yeux, jamais être fondu dans le score. */
export function alertes(c: CandidatSiret): string[] {
  const liste = [...(c.detail?.alertes ?? [])]
  // L'état cessé est déjà porté par `score.ts` quand il a noté le candidat.
  // On ne le redit que s'il manque : les 506 lignes en attente ont été notées
  // par plusieurs générations du module, et une alerte perdue est une alerte.
  if (c.etatAdministratif === 'C' && !liste.some((a) => /cess/i.test(a))) {
    liste.push('Entreprise CESSÉE au registre')
  }
  // `F` est l'établissement FERMÉ — l'entreprise peut vivre ailleurs, mais pas
  // ici, et c'est « ici » que la fiche désigne.
  if (c.etatAdministratif === 'F' && !liste.some((a) => /ferm|cess/i.test(a))) {
    liste.push('Établissement FERMÉ au registre')
  }
  return liste
}

/* ── La file de décisions ─────────────────────────────────────────────────── */

/** Le côté fiche : ce à quoi on rapproche. */
export interface FicheDuParc {
  entrepriseId: number
  nom: string | null
  ville: string | null
  codePostal: string | null
  /** Le dernier constat d'identité, s'il y en a un — pour ne pas rejuger. */
  identite?: { etat: Etat } | null
}

export interface CandidatJuge extends CandidatSiret {
  concordance: Concordance
  alertes: string[]
  /** Les 9 premiers chiffres du SIRET. Dérivé, jamais relu — même règle que
   *  `enregistrerCandidats`, qui écrit `siret.slice(0, 9)`. */
  siren: string
}

/** Les 9 premiers chiffres du SIRET : l'entreprise, par opposition à son établissement. */
export const sirenDe = (siret: string): string => (siret ?? '').replace(/\D/g, '').slice(0, 9)

/**
 * UNE ENTREPRISE, ET SES ÉTABLISSEMENTS.
 *
 * ── POURQUOI ON REGROUPE PAR SIREN ────────────────────────────────────────
 * Deux SIRET de même SIREN posent DEUX questions, et la première version les
 * confondait en une seule :
 *
 *   1. « est-ce la bonne entreprise ? » — ça reste un jugement. Le fait que
 *      deux candidats partagent un SIREN ne prouve pas que CE SIREN est le bon :
 *      on peut avoir deux établissements de la mauvaise entreprise.
 *   2. « lequel des établissements ? » — ça, ça se décide tout seul. Le SIREN
 *      étant le même, tout ce qui compte est identique (raison sociale,
 *      dirigeants, finances, et le RGE, que `hydraterRge` interroge sur
 *      `siret:<SIREN>*`). Seule l'ADRESSE change, et le score l'intègre déjà :
 *      45 points sur le barème `proeco`, plus le code postal. Le mieux noté EST
 *      celui dont l'adresse colle le mieux.
 *
 * Faire trancher un humain sur la question 2, c'est dépenser la ressource la
 * plus rare de la chaîne pour un choix sans enjeu. On la tranche donc, et on
 * DIT qu'on l'a tranchée — `autres` reste ouvert pour qui connaît le terrain
 * mieux que le score.
 */
export interface EntrepriseCandidate {
  siren: string
  /** L'établissement le mieux rapproché : celui que le bouton valide. */
  retenu: CandidatJuge
  /** Les autres établissements du même SIREN, du mieux au moins bien noté. */
  autres: CandidatJuge[]
  /** Combien d'établissements en tout. 1 = il n'y avait pas de choix à faire. */
  etablissements: number
}

export interface FicheAChoisir {
  fiche: FicheDuParc
  /** Une entrée par ENTREPRISE, pas par établissement. */
  entreprises: EntrepriseCandidate[]
  meilleurScore: number
  /** Un candidat au moins a ses quatre critères concordants. */
  evidente: boolean
  /**
   * Deux candidats se tiennent à moins de 8 points. Sans ce drapeau, l'œil
   * valide le premier de la liste sans voir qu'il y avait un second à deux
   * points. `classer` rend déjà tous les candidats pour cette raison exacte ;
   * l'écran doit finir le travail.
   */
  serree: boolean
  /**
   * Cette fiche ne propose qu'UNE entreprise, à plusieurs établissements.
   *
   * ── POURQUOI CETTE DISTINCTION EXISTE ─────────────────────────────────
   * Deux SIRET de même SIREN ne sont pas deux entreprises : c'est UNE
   * entreprise et DEUX ÉTABLISSEMENTS. Signalé par Matteo le 20/08 devant
   * « Aviz'energie » et « CK Travaux » — « les deux font sens, comment
   * faire ? ». La question était juste, et l'écran n'y répondait pas : il
   * criait « deux candidats se tiennent, lisez l'adresse » sur un cas qui
   * n'est pas dangereux du tout.
   *
   * Ce que le choix NE change PAS, vérifié dans le code :
   *   · raison sociale, dirigeants, forme juridique — attachés au SIREN ;
   *   · CA, résultat net, tranche d'effectif — au niveau de l'unité légale ;
   *   · **les qualifications RGE** — `hydraterRge` appelle l'ADEME avec
   *     `tousEtablissements: true`, donc `siret:<SIREN>*`. Tous les
   *     établissements sont couverts quel que soit celui qu'on retient.
   *
   * Ce qu'il change : l'ADRESSE écrite sur la fiche — `fetchIdentite` rend
   * celle de l'établissement demandé. D'où la règle : prendre celui où
   * l'activité a lieu, pas forcément le siège. C'est le piège CLIMIZ que
   * `resolution.ts` nomme déjà, dont le siège est dans un autre
   * arrondissement que l'activité.
   */
  memeEntreprise: boolean
  /** Le SIREN commun, quand il n'y en a qu'un. De quoi le montrer à l'écran. */
  siren: string | null
  /** Le total d'établissements proposés, toutes entreprises confondues. */
  etablissements: number
}

/** L'écart en dessous duquel deux candidats ne se départagent pas au score. */
export const ECART_SERRE = 8

/**
 * Regrouper les établissements d'un même SIREN, le mieux rapproché en tête.
 *
 * L'ordre à l'intérieur d'un SIREN N'EST PAS COSMÉTIQUE : c'est lui qui décide
 * quel établissement le bouton validera. Le score porte déjà l'adresse et le
 * code postal, donc « le mieux noté » veut dire « celui dont l'adresse colle le
 * mieux » — ce qui est exactement la règle qu'on veut : prendre l'établissement
 * où l'activité a lieu, pas forcément le siège.
 */
function parEntreprise(candidats: readonly CandidatJuge[]): EntrepriseCandidate[] {
  const groupes = new Map<string, CandidatJuge[]>()
  for (const c of candidats) {
    const liste = groupes.get(c.siren) ?? []
    liste.push(c)
    groupes.set(c.siren, liste)
  }
  return [...groupes.entries()]
    .map(([siren, liste]) => {
      liste.sort((a, b) => b.score - a.score)
      return { siren, retenu: liste[0], autres: liste.slice(1), etablissements: liste.length }
    })
    .sort((a, b) => b.retenu.score - a.retenu.score)
}

/**
 * Grouper les candidats par fiche, et ordonner la file.
 *
 * L'ORDRE N'EST PAS COSMÉTIQUE : les fiches évidentes d'abord, parce qu'une
 * session de validation avance à la vitesse de ses décisions faciles, et que
 * commencer par les cas serrés est le meilleur moyen de refermer l'écran. Même
 * raisonnement que le `order by score desc` de la route existante, appliqué au
 * niveau de la FICHE et non du candidat.
 *
 * Les fiches sans candidat ne sont pas rendues : il n'y a rien à trancher, et
 * les faire figurer donnerait une file qui ne se vide jamais.
 */
export function fichesAChoisir(
  candidats: readonly CandidatSiret[],
  fiches: readonly FicheDuParc[],
): FicheAChoisir[] {
  const parFiche = new Map<number, CandidatJuge[]>()
  for (const c of candidats) {
    const liste = parFiche.get(c.entrepriseId) ?? []
    liste.push({
      ...c,
      concordance: concordance(c.detail),
      alertes: alertes(c),
      siren: sirenDe(c.siret),
    })
    parFiche.set(c.entrepriseId, liste)
  }

  const sorties: FicheAChoisir[] = []
  for (const fiche of fiches) {
    const liste = parFiche.get(fiche.entrepriseId)
    if (!liste || liste.length === 0) continue
    const entreprises = parEntreprise(liste)
    const meilleurScore = entreprises[0].retenu.score
    sorties.push({
      fiche,
      entreprises,
      meilleurScore,
      evidente: liste.some((c) => c.concordance.lesQuatre),
      // SERRÉE SE MESURE ENTRE ENTREPRISES DISTINCTES, et c'est tout l'objet du
      // regroupement : deux établissements d'un même SIREN à deux points d'écart
      // ne sont pas un cas dangereux, et crier au danger dessus use l'attention
      // qu'on veut garder pour les vrais.
      serree:
        entreprises.length > 1 &&
        meilleurScore - entreprises[1].retenu.score < ECART_SERRE,
      memeEntreprise: entreprises.length === 1 && entreprises[0].etablissements > 1,
      siren: entreprises.length === 1 ? entreprises[0].siren : null,
      etablissements: liste.length,
    })
  }

  return sorties.sort((a, b) => {
    if (a.evidente !== b.evidente) return a.evidente ? -1 : 1
    return b.meilleurScore - a.meilleurScore
  })
}

/* ── L'identité qui se tranche toute seule ────────────────────────────────── */

/**
 * Le SIRET à écrire SANS relecture, ou `null` s'il faut un humain.
 *
 * ── LA RÈGLE VIENT DU REGISTRE DES BOTS, MOT POUR MOT ─────────────────────
 * « Pour écrire un rapprochement sans relecture humaine, il faut adresse +
 * code postal + nom + métier concordants. Trois sur quatre ne suffisent pas. »
 *
 * Deux conditions, et il faut LES DEUX :
 *
 *   1. UNE SEULE ENTREPRISE CANDIDATE. Plusieurs SIREN veut dire que l'annuaire
 *      hésite entre des entreprises différentes — et c'est exactement le piège
 *      « KM Dépannage » : deux SIREN à la MÊME adresse et au MÊME patronyme,
 *      l'un chauffagiste, l'autre taxi. Un humain doit voir les deux.
 *      Plusieurs ÉTABLISSEMENTS d'un même SIREN, en revanche, ne posent pas la
 *      question : l'identité légale, les finances et le RGE sont identiques, et
 *      seule l'adresse change — le mieux noté est celui dont l'adresse colle.
 *
 *   2. LES QUATRE CRITÈRES concordent pour l'établissement retenu. Trois ne
 *      suffisent pas, et « presque » n'existe pas ici : un rapprochement faux
 *      n'est pas une donnée fausse isolée, c'est une contamination qui finit en
 *      logos RGE sur un site public.
 *
 * Mesuré le 20/08 sur 210 fiches en attente : 141 n'ont qu'un SIREN, dont 72
 * ont un établissement aux quatre critères. Ces 72 n'ont rien à faire dans un
 * écran de décision — les y laisser, c'est user l'attention qu'il faut garder
 * pour les 138 autres.
 *
 * ⚠️ CE N'EST PAS LA DERNIÈRE VÉRIFICATION. `validerCandidat` réinterroge le
 * registre avant d'écrire, quelle que soit la voie. Ce module dit « on peut se
 * passer d'un humain », jamais « on peut se passer du registre ».
 */
export function identiteEvidente(fiche: FicheAChoisir): CandidatJuge | null {
  if (fiche.entreprises.length !== 1) return null
  const retenu = fiche.entreprises[0].retenu
  return retenu.concordance.lesQuatre ? retenu : null
}

/**
 * Le SIRET à écrire QUAND LES QUATRE CRITÈRES NE SONT PAS RÉUNIS, ou `null`.
 *
 * ── POURQUOI CETTE SECONDE PORTE ──────────────────────────────────────────
 * `identiteEvidente` ne prend que le cas parfait, et elle a raison de rester
 * ainsi. Mais le reste n'est pas pour autant du travail humain : mesuré le
 * 03/09/2026 sur les 159 fiches en attente du portefeuille Bilal + Matteo,
 * 74 n'avaient qu'UN SEUL SIREN candidat — dont 43 à trois critères sur quatre,
 * et le critère manquant était le MÉTIER dans 33 cas. Faire trancher un humain
 * « est-ce le même artisan ? » quand le nom, la commune et le code postal
 * concordent et que seul le code NAF diffère, c'est dépenser la ressource la
 * plus rare de la chaîne pour un choix qui n'en est pas un.
 *
 * Règle du propriétaire, mot pour mot (03/09/2026) : « quand il y a un seul
 * choix avec un siret inattendu ça peut être une erreur lors de la création si
 * c'est le même nom la même adresse et tout […] quand y en a 2 dont un qui est
 * plus probable on choisit le plus probable, en général c'est le premier
 * présenté ».
 *
 * ── LES QUATRE CAS, ET CE QUI LES JUSTIFIE ────────────────────────────────
 *   A. UN SEUL SIREN, TROIS CRITÈRES. Le quatrième qui manque est presque
 *      toujours le métier : un artisan immatriculé en négoce (46.74B), en
 *      électricité (43.21A) ou en réparation (33.12Z) reste le même artisan.
 *      Quand c'est le NOM qui manque, l'ADRESSE PRIME SUR LE NOM — une enseigne
 *      diffère couramment de la raison sociale (« JP Climatisation » immatriculé
 *      au patronyme du gérant).
 *   B. UN SEUL SIREN, NOM + ADRESSE. Les deux critères qui IDENTIFIENT, même
 *      sans le code postal ni le métier. C'est le « même nom même adresse » de
 *      la règle ci-dessus.
 *   C. PLUSIEURS SIREN, ÉCART DE SCORE NET (>= `ECART_SERRE`) et trois
 *      critères. C'est « le plus probable, en général le premier présenté » —
 *      la liste est triée par score décroissant.
 *   D. PLUSIEURS SIREN À ÉCART SERRÉ, MAIS DONT LES CRITÈRES TRANCHENT. Le
 *      score ne les sépare pas ; le nombre de critères concordants, si.
 *
 * ── CE QU'ELLE REFUSE, ET C'EST LÀ QU'EST LA SÛRETÉ ───────────────────────
 *   · ÉCART SERRÉ ET CRITÈRES ÉGAUX. C'est le piège « KM Dépannage » que
 *     `resolution.ts` nomme : deux SIREN, même adresse, même patronyme, l'un
 *     chauffagiste l'autre taxi. Aucun chiffre ne les sépare — seul un œil.
 *   · MOINS DE DEUX CRITÈRES, ou deux qui ne sont pas nom + adresse.
 *   · UN CANDIDAT DE TÊTE CESSÉ au registre. Une société morte n'est pas un
 *     prospect, et lui fabriquer une démo est du travail perdu.
 *   · **TROIS CRITÈRES SANS LE NOM NI LA VOIE.** Resserré le 03/09/2026, et
 *     c'est le refus le plus important du lot. « Code postal + commune +
 *     métier » est satisfait par TOUS les artisans du même métier de la même
 *     ville : ce n'est pas une identité, c'est un voisinage. Trois écritures
 *     fausses l'ont montré dans la même passe — la fiche 452 « GTR LOC »
 *     recevait le SIRET de l'Agence locale de l'énergie, la 515 « COLDEX »
 *     celui d'ATLAS THERMIQUE, la 21 « Climatisation Paris 2 » celui du
 *     Planning familial. Il faut donc le NOM, ou la VOIE avec son numéro —
 *     quelque chose qui distingue cette entreprise de celle d'en face.
 *
 * ⚠️ COMME `identiteEvidente`, CE N'EST PAS LA DERNIÈRE VÉRIFICATION.
 * `validerCandidat` réinterroge le registre avant d'écrire. Ce garde-fou n'est
 * pas décoratif : sur les 59 fiches tranchées le 03/09, il a rendu HUIT
 * « entreprise cessée » que la ligne candidate disait actives — elle avait été
 * notée avant la cessation.
 */
export function identiteProbable(
  fiche: FicheAChoisir,
): { candidat: CandidatJuge; regle: string } | null {
  const premier = fiche.entreprises[0];
  if (!premier) return null;
  const retenu = premier.retenu;
  // Ni une entreprise cessée, ni un ÉTABLISSEMENT FERMÉ — et le second n'est
  // pas le premier. L'annuaire code l'unité légale en `C` et l'établissement en
  // `F` ; ne refuser que `C` laissait écrire le SIRET d'un local vidé, où la
  // fiche Google montre pourtant une activité. Vu sur la fiche 628
  // « JP Climatisation » : deux établissements du même SIREN, le fermé du 5 bis
  // impasse Victor Hugo gagnait contre l'ouvert du numéro 8.
  if (estCesse(retenu)) return null;

  const compte = retenu.concordance.compte;
  const c = retenu.concordance;

  // ── CE QUI DISTINGUE, par opposition à ce qui situe. Le code postal, la
  // commune et le métier se partagent entre voisins ; le nom et le numéro de
  // rue, non. Sans l'un des deux, on ne tranche pas — quel que soit le compte.
  //
  // ⚠️ ET LA VOIE NE REMPLACE LE NOM QUE POUR UNE PERSONNE PHYSIQUE. Une
  // société porte une raison sociale : si elle ne concorde pas, c'est qu'on
  // regarde une AUTRE société — le voisin de palier, pas l'artisan. Mesuré le
  // 03/09 : « Axima Equans » recevait le SIRET de SURCOF et « MACLEM » celui de
  // GAIA L'ÉNERGIE DE DEMAIN, deux sociétés bien réelles à la bonne adresse et
  // du bon métier. Une entreprise individuelle, elle, n'a QUE l'état civil de
  // son patron au registre : le nom ne peut alors pas concorder, et l'adresse
  // est le seul lien qui existe — c'est le cas d'AR CLIM, immatriculée ADRIEN
  // RODRIGUEZ, et de GARAGE P.J MOTORS, immatriculé JUSTIN PAGE.
  const distingue = c.nom || (c.adresseExacte && retenu.denomination === null);
  if (!distingue) return null;

  if (fiche.entreprises.length === 1) {
    if (compte >= 3) {
      const manquant = !c.metier ? 'métier' : !c.nom ? 'nom' : !c.adresse ? 'adresse' : 'code postal';
      const appui = c.nom ? 'nom' : 'voie exacte, entreprise individuelle';
      return {
        candidat: retenu,
        regle: `un seul SIREN, 3 critères sur 4 (manque : ${manquant}, tenu par le ${appui})`,
      };
    }
    if (compte === 2 && c.nom && c.adresse) {
      return { candidat: retenu, regle: `un seul SIREN, nom + ${c.libelleAdresse} concordants` };
    }
    return null;
  }

  if (compte < 3) return null;
  const second = fiche.entreprises[1].retenu;
  const ecart = retenu.score - second.score;
  if (ecart >= ECART_SERRE) {
    return { candidat: retenu, regle: `${fiche.entreprises.length} SIREN, écart de score net (${ecart})` };
  }
  if (compte > second.concordance.compte) {
    return {
      candidat: retenu,
      regle: `${fiche.entreprises.length} SIREN à écart serré, mais ${compte} critères contre ${second.concordance.compte}`,
    };
  }
  // ── E. ÉCART SERRÉ, CRITÈRES ÉGAUX, MAIS L'AUTRE EST MORT.
  // Le score ne les sépare pas et les critères non plus — sauf que l'un des
  // deux a fermé. Ce qui exerce aujourd'hui à cette adresse ne peut pas être
  // l'établissement clos. Vu sur la fiche 441 « Liftasud » : SRA LIFTASUD,
  // cessée en décembre 2022, et LIFTASUD, ouverte, au MÊME 200 rue Léon Blum.
  if (estCesse(second)) {
    return {
      candidat: retenu,
      regle: `${fiche.entreprises.length} SIREN à écart serré, mais le suivant a fermé`,
    };
  }
  return null;
}

/**
 * Cessée ou fermée. DEUX CODES POUR UNE MÊME NOUVELLE : l'annuaire écrit `C`
 * sur une unité légale qui a cessé et `F` sur un établissement qui a fermé.
 * `alertes()` ne regardait que `C` — un établissement fermé passait sans un mot.
 */
const estCesse = (c: CandidatJuge): boolean =>
  c.etatAdministratif === 'C' || c.etatAdministratif === 'F'

/**
 * Ce que la file dit d'elle-même, en une phrase.
 *
 * Un compteur nu (« 186 ») ne dit pas s'il reste une heure de travail ou dix
 * minutes. Le découpage évidentes / serrées / le reste, si.
 */
export function resumeDeLaFile(fiches: readonly FicheAChoisir[]): {
  fiches: number
  entreprises: number
  etablissements: number
  evidentes: number
  serrees: number
} {
  return {
    fiches: fiches.length,
    // Le nombre de DÉCISIONS à prendre, qui n'est pas le nombre de lignes en
    // base : plusieurs établissements d'un même SIREN ne font qu'une décision.
    entreprises: fiches.reduce((n, f) => n + f.entreprises.length, 0),
    etablissements: fiches.reduce((n, f) => n + f.etablissements, 0),
    evidentes: fiches.filter((f) => f.evidente).length,
    serrees: fiches.filter((f) => f.serree).length,
  }
}
