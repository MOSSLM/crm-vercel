// signaux.ts — ce qu'une veille surveille, et ce qu'elle ne saura jamais voir. Pur.
//
// ─────────────────────────────────────────────────────────────────────────────
// UNE VEILLE MONTRE, ELLE N'AGIT JAMAIS
// ─────────────────────────────────────────────────────────────────────────────
// C'est la seule règle à retenir de ce fichier. Un déclencheur n'inscrit
// personne, n'envoie rien, ne crée aucune tâche : il pose une ligne sur un
// écran. Ce projet a déjà payé 59 inscriptions gelées pour un mécanisme qui
// avançait sans que personne le voie ; un signal qui déclencherait un envoi
// referait la même faute, en pire — il partirait.
//
// ─────────────────────────────────────────────────────────────────────────────
// DEUX NATURES, ET C'EST CE QUI DÉCIDE DE TOUT
// ─────────────────────────────────────────────────────────────────────────────
// Presque rien de ce qu'on possède n'est un événement. « Son RGE expire dans
// 90 jours » est vrai aujourd'hui, demain, et tous les jours jusqu'à
// l'échéance : c'est un ÉTAT. Le rendre à chaque passe ressortirait les mêmes
// 98 entreprises indéfiniment, et un écran qui répète est un écran qu'on cesse
// de lire.
//
// La mémoire de la veille (`veille_constats`) est ce qui convertit un état en
// événement, du point de vue du CRM : « la première fois que NOUS l'avons vu ».
// D'où la conséquence qu'il faut écrire noir sur blanc :
//
//   ⚠️ LA PREMIÈRE PASSE EST UNE REPRISE, PAS UNE VEILLE. Elle ramasse
//   l'arriéré. 220 sites injoignables ne sont pas tombés cette nuit, et
//   afficher « 220 signaux » le lendemain de la création serait un mensonge par
//   présentation.
//
// ─────────────────────────────────────────────────────────────────────────────
// UN DÉCLENCHEUR QUI TOUCHE UN TIERS DU PARC N'EST PAS UN SIGNAL
// ─────────────────────────────────────────────────────────────────────────────
// « Note d'audit sous 50 » vise 305 entreprises attribuées sur 908. Ce n'est
// pas un signal, c'est un SEGMENT : ça ne se traite pas au fil de l'eau, ça se
// verse dans une campagne. Le catalogue porte donc `nature`, et l'écran range
// les deux séparément — sinon la file des vrais signaux (le rapport ouvert, à
// 3 sur tout le parc) se noie dans le stock.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QU'ON NE SAIT PAS VOIR EST ÉCRIT ICI, PAS OMIS
// ─────────────────────────────────────────────────────────────────────────────
// Le plan nommait « la note d'audit qui chute » et « le concurrent détecté ».
// Ni l'un ni l'autre n'est mesurable, et les mesures sont dans `HORS_PORTEE`
// avec leur raison. Les taire aurait produit un catalogue qui a l'air complet ;
// les écrire, c'est dire précisément ce qu'il faudrait construire pour les
// obtenir.

/* ── Le catalogue ────────────────────────────────────────────────────────── */

export const DECLENCHEURS = [
  'rge_expire_bientot',
  'rge_perime',
  'site_injoignable',
  'audit_faible',
  'rapport_ouvert',
] as const
export type Declencheur = (typeof DECLENCHEURS)[number]

/** Un signal se traite au fil de l'eau ; un segment se verse dans une campagne. */
export type NatureDeclencheur = 'signal' | 'segment'

export interface FicheDeclencheur {
  cle: Declencheur
  libelle: string
  nature: NatureDeclencheur
  /** La table et la colonne lues — pour n'avoir jamais à le deviner. */
  source: string
  /**
   * Ce que ça permet de DIRE au prospect. Un signal sans accroche est une
   * ligne de plus sur un écran : c'est la phrase qui décide si on appelle.
   */
  accroche: string
  /** Effectif relevé le 20/08/2026. `parc` est nul quand la mesure ne le distingue pas. */
  densite: { attribuees: number; parc: number | null }
  /**
   * Vrai quand le déclencheur lit un instant plutôt qu'un état permanent. Aucun
   * ne l'est aujourd'hui, et c'est justement pourquoi `veille_constats` existe.
   */
  evenementNatif: boolean
}

export const FICHES: Record<Declencheur, FicheDeclencheur> = {
  rge_expire_bientot: {
    cle: 'rge_expire_bientot',
    libelle: 'RGE qui expire sous 90 jours',
    nature: 'signal',
    source: 'entreprise_rge_qualifications.date_fin (retiree_le nul)',
    accroche:
      'Sa qualification tombe bientôt : il va la renouveler, et c’est le moment où son site et sa plaquette doivent être à jour.',
    densite: { attribuees: 98, parc: 7948 },
    evenementNatif: false,
  },
  rge_perime: {
    cle: 'rge_perime',
    libelle: 'RGE périmé',
    nature: 'signal',
    source: 'entreprise_rge_qualifications.date_fin < aujourd’hui (retiree_le nul)',
    accroche:
      'Son site affiche peut-être encore un logo RGE qui n’est plus valable — c’est une correction urgente, et elle ouvre la conversation.',
    densite: { attribuees: 2, parc: null },
    evenementNatif: false,
  },
  site_injoignable: {
    cle: 'site_injoignable',
    libelle: 'Site injoignable',
    nature: 'signal',
    source: 'entreprises_audit_site.injoignable',
    accroche:
      'Son site ne répond pas. C’est le seul argument qui n’a pas besoin d’être vendu — mais il faut la CAUSE, pas le constat (voir le diagnostic en sept pannes).',
    densite: { attribuees: 220, parc: 314 },
    evenementNatif: false,
  },
  audit_faible: {
    cle: 'audit_faible',
    libelle: 'Note d’audit sous 50',
    nature: 'segment',
    source: 'entreprises_audit_site.note_globale',
    accroche:
      'Le site existe et il est mauvais : c’est la cohorte A, celle à qui l’on parle de refonte plutôt que de création.',
    densite: { attribuees: 305, parc: null },
    evenementNatif: false,
  },
  rapport_ouvert: {
    cle: 'rapport_ouvert',
    libelle: 'Rapport ou plaquette ouvert',
    nature: 'signal',
    source: 'entreprises_rapport_public.vues / plaquette_vues',
    accroche:
      'Il a ouvert ce qu’on lui a envoyé. C’est le signal le plus rare du CRM — 3 sur tout le parc — et le seul qui prouve une intention.',
    densite: { attribuees: 3, parc: 3 },
    evenementNatif: false,
  },
}

export const estDeclencheur = (v: string): v is Declencheur =>
  (DECLENCHEURS as readonly string[]).includes(v)

/** Les signaux d'abord, puis les segments ; à nature égale, le plus rare devant. */
export function classer(cles: readonly Declencheur[]): Declencheur[] {
  return [...cles].sort((a, b) => {
    const fa = FICHES[a]
    const fb = FICHES[b]
    if (fa.nature !== fb.nature) return fa.nature === 'signal' ? -1 : 1
    return fa.densite.attribuees - fb.densite.attribuees
  })
}

/* ── Ce qu'on ne sait pas voir ───────────────────────────────────────────── */

export interface HorsPortee {
  cle: string
  libelle: string
  /** Pourquoi la mesure n'existe pas — et non pas « pas encore fait ». */
  raison: string
  /** Ce qu'il faudrait construire. Une phrase, pas un chantier vague. */
  ceQuIlFaudrait: string
}

/**
 * Les quatre veilles du plan qui ne sont pas mesurables, et pourquoi.
 *
 * Elles s'affichent à l'écran, grisées. Un catalogue qui les tairait aurait
 * l'air complet ; celui-ci dit ce qui manque, ce qui est la seule façon de
 * décider s'il vaut la peine de le construire.
 */
export const HORS_PORTEE: readonly HorsPortee[] = [
  {
    cle: 'note_audit_chute',
    libelle: 'La note d’audit qui chute',
    raison:
      'entreprises_audit_site a UNE ligne par entreprise — sa clé primaire est entreprise_id. Chaque analyse écrase la précédente : il n’existe aucune note d’avant, donc aucune chute à constater.',
    ceQuIlFaudrait:
      'Une table d’historique des notes, écrite à chaque analyse. entreprises_audit_psi existe et a la bonne forme, mais ne porte que 24 lignes.',
  },
  {
    cle: 'site_tombe',
    libelle: 'Le site qui vient de tomber',
    raison:
      'constats_presence garde bien un historique, mais il enregistre QUI A DIT QUOI, pas ce que le monde a fait. Mesuré le 20/08 : les 159 transitions « présent → absent » sont toutes survenues le même jour, à zéro heure d’intervalle, entre dossier-web et verifier-sites. Ce sont deux bots qui se contredisent, pas 53 sites qui sont tombés.',
    ceQuIlFaudrait:
      'Comparer deux constats de la MÊME source à des dates différentes. En attendant, « site injoignable » donne l’état, et la mémoire de la veille lui donne sa date d’entrée.',
  },
  {
    cle: 'intention_ga4',
    libelle: 'L’intention mesurée sur la démo (GA4)',
    raison:
      'intentBySite interroge l’API GA4 en direct et ne stocke rien : le score n’existe que le temps d’un affichage, avec un cache de 60 s posé pour le quota. Une passe de veille sur 908 entreprises le ferait exploser.',
    ceQuIlFaudrait:
      'Une écriture quotidienne du score par entreprise. Le signal existe déjà là où il sert — la file de démarchage le porte en pastille « Chauds ».',
  },
  {
    cle: 'concurrent_detecte',
    libelle: 'Un concurrent détecté sur son site',
    raison:
      'Rien ne relève l’agence qui a fait le site. entreprises_audit_site.detail porte la technologie, jamais le prestataire.',
    ceQuIlFaudrait:
      'Une lecture des mentions légales ou du pied de page à la recherche d’une signature d’agence. C’est un bot à part entière, à inscrire au registre avant d’être écrit.',
  },
]

/* ── La passe ────────────────────────────────────────────────────────────── */

/**
 * L'état d'une veille, tel que l'écran doit le dire.
 *
 * Les quatre valeurs sont distinctes exprès. C'est la neuvième fois que ce
 * projet pose le même piège — « aucune tâche », « aucun fil », « aucune
 * liste », « aucune passe », « rien à trancher », « prises: 0 », « Aucune
 * campagne », « pas encore de liste » —, et il se poserait ici avec le pire des
 * vides : une veille qui n'a jamais tourné et une veille qui n'a rien trouvé
 * disent des choses opposées. La première ne surveille rien ; la seconde
 * travaille.
 */
export type EtatVeille = 'jamais_passee' | 'reprise_faite' | 'a_jour' | 'panne'

export interface BilanPasse {
  /** Entreprises examinées par la lecture. */
  examinees: number
  /** Nouvelles depuis la dernière passe — ce qui s'affiche comme signal. */
  nouvelles: number
  /** Déjà connues : lues, et volontairement pas rendues. */
  connues: number
  /** Vrai si c'était la PREMIÈRE passe : de l'arriéré, pas des événements. */
  reprise: boolean
  /** La lecture a échoué. Un bilan en panne ne vaut jamais « zéro ». */
  panne?: string
}

export function etatDe(v: { premierePasseLe: string | null; derniereBilan: BilanPasse | null }): EtatVeille {
  if (v.derniereBilan?.panne) return 'panne'
  if (!v.premierePasseLe) return 'jamais_passee'
  if (v.derniereBilan?.reprise) return 'reprise_faite'
  return 'a_jour'
}

/**
 * La phrase de l'écran. Elle est ici, et pas dans le composant, parce qu'elle
 * est la conclusion d'une règle — et qu'une règle se teste.
 */
export function phraseDe(etat: EtatVeille, bilan: BilanPasse | null): string {
  if (etat === 'panne') return `La lecture a échoué — ${bilan?.panne ?? 'raison inconnue'}. Ce n’est pas « rien trouvé ».`
  if (etat === 'jamais_passee') return 'Jamais passée : elle ne surveille encore rien.'
  if (etat === 'reprise_faite') {
    const n = bilan?.nouvelles ?? 0
    return n > 0
      ? `Première passe : ${n} entreprise${n > 1 ? 's' : ''} d’arriéré, pas des événements du jour.`
      : 'Première passe : aucun arriéré. La veille part de zéro.'
  }
  const n = bilan?.nouvelles ?? 0
  if (n === 0) return 'Passée, rien de nouveau depuis la dernière fois.'
  return `${n} nouvelle${n > 1 ? 's' : ''} depuis la dernière passe.`
}

/**
 * Ce que la passe doit retenir d'une lecture.
 *
 * `deja` est l'ensemble des entreprises déjà constatées pour cette veille : le
 * delta est calculé ICI, sans base, donc il est éprouvable. La couche base ne
 * fait que lire et insérer.
 */
export function delta(trouvees: readonly number[], deja: ReadonlySet<number>): number[] {
  const vu = new Set<number>()
  const sortie: number[] = []
  for (const id of trouvees) {
    if (deja.has(id) || vu.has(id)) continue
    vu.add(id)
    sortie.push(id)
  }
  return sortie
}
