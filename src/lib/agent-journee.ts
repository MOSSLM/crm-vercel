/**
 * La journée d'un commercial, et le moment où on l'en félicite.
 *
 * CE QUE ÇA N'EST PAS : un objectif, un quota, une limite. Le CRM en a eu un —
 * `task_max_per_agent`, hérité du mode de routage « pref » : au-delà de huit
 * tâches en attente, les suivantes basculaient chez l'admin. Avec un seul
 * commercial, ce plafond ne répartissait rien et l'empêchait simplement de
 * travailler. Il a été retiré (mode `strict`).
 *
 * Ce module fait l'inverse : il COMPTE ce qui a été fait et marque les paliers.
 * Franchir un palier ne ferme aucune file, ne met rien en pause, ne change
 * l'attribution de rien. On dit bravo, et la journée continue exactement comme
 * avant — c'est la seule règle à ne jamais casser ici.
 *
 * Module PUR : ni base, ni React, ni `Date.now()` implicite. Les paliers se
 * testent sur des nombres, l'affichage se teste sur des chaînes.
 */

/** Un palier tous les vingt contacts. Vingt parce que c'est ce qui a été
 *  demandé, et parce qu'un palier trop bas cesse d'être une bonne nouvelle. */
export const PAS_PALIER = 20;

/** Les canaux d'un contact, dans l'ordre où on les montre. `task` couvre les
 *  étapes manuelles qui n'ont pas de canal propre. */
export const CANAUX_JOURNEE = ["whatsapp", "call", "linkedin", "email", "task"] as const;
export type CanalJournee = (typeof CANAUX_JOURNEE)[number];

export const LIBELLE_CANAL: Readonly<Record<CanalJournee, string>> = {
  whatsapp: "WhatsApp",
  call: "Appels",
  linkedin: "LinkedIn",
  email: "E-mails",
  task: "Autres",
};

export interface CanalCompte {
  canal: CanalJournee;
  libelle: string;
  nombre: number;
}

export interface StatsJournee {
  /** Tâches de démarchage terminées aujourd'hui. */
  contacts: number;
  /** Le détail par canal, canaux vides exclus. */
  parCanal: CanalCompte[];
  /** Ce qu'il reste dans sa file — affiché comme une suite, jamais comme un dû. */
  restantes: number;
  /** Début de journée retenu (ISO), pour que l'UI sache de quel jour on parle. */
  debutJournee: string;
}

/** Le plus haut palier atteint avec `contacts`, ou 0 avant le premier. */
export function palierAtteint(contacts: number, pas: number = PAS_PALIER): number {
  if (!Number.isFinite(contacts) || contacts < pas || pas <= 0) return 0;
  return Math.floor(contacts / pas) * pas;
}

/**
 * Le palier à fêter maintenant : le plus haut atteint qui n'a pas encore été
 * montré aujourd'hui. `null` quand il n'y a rien à dire.
 *
 * On ne montre QUE le plus haut : un agent qui ouvre le CRM à 43 contacts a
 * franchi 20 et 40 dans la même absence, et empiler deux félicitations ferait
 * de la fête une file d'attente.
 */
export function celebrationAMontrer(
  contacts: number,
  dejaMontres: readonly number[] = [],
  pas: number = PAS_PALIER,
): number | null {
  const palier = palierAtteint(contacts, pas);
  if (palier === 0) return null;
  return dejaMontres.includes(palier) ? null : palier;
}

/**
 * Tous les paliers franchis entre deux relevés — sert au marquage, pas à
 * l'affichage : on note les intermédiaires comme vus pour ne pas les ressortir
 * plus tard, alors qu'on n'en célèbre qu'un.
 */
export function paliersFranchis(avant: number, apres: number, pas: number = PAS_PALIER): number[] {
  const out: number[] = [];
  if (pas <= 0) return out;
  const debut = Math.floor(Math.max(0, avant) / pas) * pas;
  for (let p = debut + pas; p <= palierAtteint(apres, pas); p += pas) out.push(p);
  return out;
}

export interface TexteCelebration {
  titre: string;
  /** Une phrase, celle qui dit que rien ne s'arrête. */
  message: string;
}

/**
 * Ce que la carte raconte. Le premier palier de la journée se dit autrement que
 * le quatrième — « tes 20 premiers contacts » n'a de sens qu'une fois.
 */
export function texteCelebration(palier: number, stats: StatsJournee): TexteCelebration {
  const premier = palier <= PAS_PALIER;
  const titre = premier
    ? `Bravo — tes ${palier} premiers contacts du jour 🎉`
    : `${palier} contacts aujourd'hui 🔥`;

  const reste = stats.restantes > 0
    ? ` Il reste ${stats.restantes} ${stats.restantes > 1 ? "fiches" : "fiche"} dans ta file si tu enchaînes.`
    : " Ta file est vide — belle journée.";

  return {
    titre,
    message: premier
      ? `Rien ne se ferme, tu peux continuer autant que tu veux.${reste}`
      : `Tu es à ${stats.contacts} contacts.${reste}`,
  };
}

/** Le détail par canal, prêt à afficher : canaux vides retirés, ordre stable. */
export function detailParCanal(brut: Partial<Record<string, number>>): CanalCompte[] {
  const out: CanalCompte[] = [];
  for (const canal of CANAUX_JOURNEE) {
    const nombre = brut[canal] ?? 0;
    if (nombre > 0) out.push({ canal, libelle: LIBELLE_CANAL[canal], nombre });
  }
  return out;
}

/** Clé de mémorisation des paliers déjà fêtés : par agent ET par jour, sinon la
 *  fête de la veille étoufferait celle du matin. */
export function cleMemoire(agentId: string, debutJournee: string): string {
  return `sama:journee:${agentId}:${debutJournee.slice(0, 10)}`;
}
