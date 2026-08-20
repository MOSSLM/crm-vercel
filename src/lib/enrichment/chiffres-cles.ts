/**
 * Les chiffres clés d'un site, déduits du registre — sans un seul crédit d'IA.
 *
 * CE QUE ÇA RÉPARE. Mesuré le 20/08/2026 : **564 dossiers sur 882 n'ont pas
 * d'années d'expérience**, et c'est de loin la variable qui manque le plus après
 * un enrichissement. Or l'enrichissement la CHERCHE — dans le texte du site du
 * prospect, avec un LLM — alors que 352 de ces 564 portent déjà, en base, la
 * date d'immatriculation de l'entreprise. On payait un modèle pour deviner ce
 * qu'une soustraction donne exactement.
 *
 * LE BARÈME EST CELUI DE MATTEO, pas une invention d'ici (09/08/2026) :
 * « s'il n'y a pas d'infos sur le site tu regardes depuis combien de temps la
 * boîte existe et tu multiplies les années d'expérience par 40 environ, ça te
 * donne le nombre de chantiers ». Trois règles en découlent, et une quatrième
 * qui les gouverne toutes :
 *
 *  1. années = ancienneté au registre (`date_creation`) ;
 *  2. installations = `max(années × 40, avis × 4)`, arrondi à la dizaine — le
 *     second terme évite le chiffre absurde chez une entreprise jeune mais très
 *     évaluée, dont les avis prouvent l'activité mieux que son immatriculation ;
 *  3. clients satisfaits = installations × 0,75, arrondi à la dizaine ;
 *  4. **jamais au-dessus de la réalité.** Un chiffre sous-estimé se relève après
 *     confirmation et ne coûte rien ; un chiffre surestimé démasqué en
 *     rendez-vous coûte la vente.
 *
 * CE QUE CE MODULE NE FAIT PAS, ET NE DOIT JAMAIS FAIRE :
 *
 *  · il ne touche pas aux colonnes `*_official` — elles sont réservées à ce que
 *    le client a confirmé, et une estimation qui les écraserait effacerait la
 *    seule donnée vraie de la ligne ;
 *  · il ne BAISSE jamais un chiffre. Monter au barème corrige une sous-estimation
 *    (sans risque : « relever un chiffre sous-estimé après confirmation ne coûte
 *    rien ») ; descendre effacerait peut-être une revendication vraie du site ;
 *  · il ne rend RIEN quand le registre est muet. Sans date de création il n'y a
 *    pas d'ancienneté, et inventer « 10 ans » par défaut mettrait un chiffre
 *    faux sur un site vendu — c'est exactement ce que le barème interdit.
 *    Ces fiches-là relèvent du lissage, qui va chercher le SIRET puis la date.
 *
 * ⚠️ LE BARÈME SE CALCULE SUR LE REGISTRE, JAMAIS SUR L'ANNÉE AFFICHÉE.
 * C'est la garde la plus importante du module, et elle vient d'une mesure :
 * **131 dossiers affichent plus d'ancienneté que le registre, et 7 le dépassent
 * de plus de vingt ans** — « Ocean Clim Plomberie » annonce **100 ans** pour une
 * entreprise immatriculée le 10/09/2024. Multiplier cette année-là par 40
 * donnerait 4 000 chantiers : on aurait pris un chiffre faux et on l'aurait
 * rendu quarante fois plus faux. En partant du registre, une ancienneté gonflée
 * ne contamine jamais les deux autres chiffres.
 */

import { ancienneteAnnees } from '@/lib/donnees-publiques/fiche'

/** Ce que le registre et la fiche Google savent d'une entreprise. */
export interface MatiereChiffres {
  /** `entreprises_donnees_publiques.date_creation`, au format `AAAA-MM-JJ`. */
  dateCreation: string | null
  /** `entreprises.nombre_avis` — la preuve d'activité d'une jeune entreprise. */
  nombreAvis: number | null
}

/** Ce qu'un dossier lead magnet porte déjà, estimé comme confirmé. */
export interface ChiffresPoses {
  annees: string | null
  clients: string | null
  installations: string | null
  anneesOfficiel: string | null
  clientsOfficiel: string | null
  installationsOfficiel: string | null
}

export interface ChiffresDeduits {
  annees: number
  installations: number
  clients: number
}

/**
 * Une stat vide AU SENS DU RENDU. Reprise mot pour mot de `filledStat`
 * (`src/components/marketing-pipeline/required-fields.ts`) : « 0 », « - » et
 * « — » n'affichent rien sur le site, donc ils ne comptent pas comme remplis.
 * Diverger d'un seul de ces quatre cas ferait qu'on croirait avoir comblé une
 * ligne que le board continuerait à compter comme manquante.
 */
const vide = (v: string | null | undefined): boolean => {
  const t = (v ?? '').trim()
  return t === '' || t === '0' || t === '-' || t === '—'
}

/** À la dizaine, jamais à zéro : « 0 chantiers » ne s'affiche pas mieux que rien. */
const dizaine = (n: number): number => Math.max(10, Math.round(n / 10) * 10)

/**
 * L'année avant laquelle une date de création n'est plus une date, mais un aveu.
 *
 * `1900-01-01` est la SENTINELLE de SIRENE pour « date inconnue » — 4 fiches la
 * portent au 20/08/2026. Prise au mot, elle annoncerait **126 ans d'expérience**
 * sur un site qu'on vend à un artisan, c'est-à-dire précisément le chiffre
 * surestimé que le barème interdit : « un chiffre surestimé démasqué en
 * rendez-vous coûte la vente ».
 *
 * Le seuil est à 1950 et pas à 1900 pile, parce qu'une sentinelle ne s'écrit pas
 * toujours de la même façon selon la source, et qu'une entreprise réellement
 * plus ancienne que ça se compte sur les doigts d'une main (13 fiches sur
 * 3 343). Perdre treize déductions vaut mieux qu'un « 126 ans » en page
 * d'accueil : ces fiches tombent dans « pas de date », ce qui est la vérité.
 */
const ANNEE_PLANCHER = 1950

/**
 * Les trois chiffres que le registre permet de déduire, ou `null` s'il est muet.
 *
 * `maintenant` est un paramètre et non `new Date()` : une déduction qui change
 * de résultat selon l'heure d'exécution ne se teste pas, et l'ancienneté est
 * précisément la grandeur qui bouge toute seule.
 */
export function deduireChiffres(
  matiere: MatiereChiffres,
  maintenant: Date = new Date(),
): ChiffresDeduits | null {
  // Le plancher AVANT le calcul : `ancienneteAnnees` fait son travail sans se
  // demander si la date a un sens, et c'est très bien — la question « cette date
  // est-elle une vraie date ? » appartient à celui qui va l'afficher.
  const annee = Number((matiere.dateCreation ?? '').slice(0, 4))
  if (!Number.isFinite(annee) || annee < ANNEE_PLANCHER) return null

  const annees = ancienneteAnnees({ date_creation: matiere.dateCreation }, maintenant)
  if (annees == null) return null
  // Une entreprise immatriculée cette année a zéro an d'ancienneté ; on affiche
  // « 1 », parce qu'un site qui annonce « 0 ans d'expérience » se retourne
  // contre lui-même, et parce que c'est le chiffre le plus BAS qui reste vrai.
  const ans = Math.max(1, annees)
  const avis = Math.max(0, Number(matiere.nombreAvis) || 0)
  const installations = dizaine(Math.max(ans * 40, avis * 4))
  return { annees: ans, installations, clients: dizaine(installations * 0.75) }
}

/** Le nombre caché dans une case, ou `null` si elle n'en porte pas. */
const nombre = (v: string | null | undefined): number | null => {
  if (vide(v)) return null
  const n = Number((v ?? '').replace(/[^0-9]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Le patch à écrire sur `lead_magnet_projects`.
 *
 * Il remplit les cases vides ET remonte au barème celles qui sont en dessous —
 * parce que les deux sont le même défaut vu à deux moments. Mesuré le 20/08 :
 * **146 dossiers sur 326 portent des installations inférieures au barème**, et
 * 29 le sont massivement, parce qu'une estimation antérieure les tirait des
 * seuls avis Google (`avis × 2,8` environ). Un site qui annonce
 * « 40 ans d'expérience » à côté de « 14 chantiers » se retourne contre
 * lui-même — et remplir l'ancienneté sans toucher au reste FABRIQUE cette
 * contradiction plutôt que de la corriger.
 *
 * Le sens est unique : on monte, on ne descend jamais. Un chiffre supérieur au
 * barème peut être une revendication vraie du site ; l'écraser reviendrait à
 * sous-estimer le prospect, ce que le barème interdit dans l'autre sens.
 *
 * `null` quand il n'y a rien à écrire : l'appelant saute alors l'UPDATE au lieu
 * de pousser un `updated_at` pour rien, exactement comme `buildCompanyPatch`.
 */
export function patchChiffresCles(
  matiere: MatiereChiffres,
  poses: ChiffresPoses,
  maintenant: Date = new Date(),
): Record<string, string> | null {
  const d = deduireChiffres(matiere, maintenant)
  if (!d) return null

  const patch: Record<string, string> = {}
  /**
   * Une case à écrire, ou rien.
   *
   * Un chiffre CONFIRMÉ par le client est intouchable, même si l'estimation est
   * vide à côté : c'est lui qui s'affichera. Sans cette garde, on écrirait une
   * estimation sous un chiffre vrai — invisible au rendu, mais faux en base.
   */
  const poser = (
    colonne: string,
    estimation: string | null,
    officiel: string | null,
    barème: number,
  ) => {
    if (!vide(officiel)) return
    const actuel = nombre(estimation)
    if (actuel != null && actuel >= barème) return
    patch[colonne] = String(barème)
  }

  poser('stat_years_experience', poses.annees, poses.anneesOfficiel, d.annees)
  poser('stat_installations_completed', poses.installations, poses.installationsOfficiel, d.installations)
  poser('stat_satisfied_clients', poses.clients, poses.clientsOfficiel, d.clients)
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * L'ancienneté affichée est-elle indéfendable au regard du registre ?
 *
 * Ce module ne la corrige PAS — la règle de Matteo est claire : « quand le site
 * revendique plus d'ancienneté que le registre, retenir la revendication du
 * site, c'est l'expérience métier du dirigeant ». Un écart de dix ans est donc
 * légitime. Cent ans annoncés pour une entreprise immatriculée en 2024 ne l'est
 * pas : ce n'est plus une revendication, c'est un chiffre cassé.
 *
 * D'où cette lecture séparée, que la route COMPTE et remonte à l'écran. Un
 * défaut qu'on ne sait pas corriger tout seul doit au moins se voir.
 */
export function ancienneteDouteuse(
  matiere: MatiereChiffres,
  poses: ChiffresPoses,
  maintenant: Date = new Date(),
): boolean {
  const d = deduireChiffres(matiere, maintenant)
  if (!d) return false
  const affichee = nombre(poses.anneesOfficiel) ?? nombre(poses.annees)
  return affichee != null && affichee > d.annees + 20
}
