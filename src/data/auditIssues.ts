import type { AuditProblem, AuditSolution } from '@/types';

// =====================================================================
// Catalogue des problèmes / solutions d'audit
// =====================================================================
// Source de vérité unique des 6 « soucis » les plus courants qu'on peut
// trouver sur le site d'un prospect, chacun associé à SA solution.
//
// Sur la page d'audit on coche les problèmes qui s'appliquent à
// l'entreprise (au moins 3). Cocher un problème affiche sa carte sur la
// page « Situation » ET sa solution pairée sur la page « Solution ».
//
// IMPORTANT : les clés (`key`) sont aussi utilisées par l'edge function
// d'enrichissement Supabase pour pré-cocher les cases automatiquement.
// Si tu ajoutes / renommes une clé ici, garde-la synchronisée avec
// `edge function enrich/audit.ts` (AUDIT_ISSUE_KEYS).
// =====================================================================

export interface AuditIssueDef {
  key: string;
  /** Libellé court pour la checklist de l'éditeur */
  label: string;
  problem: { title: string; desc: string };
  solution: { name: string; desc: string; tag: string };
}

export const AUDIT_ISSUE_CATALOG: AuditIssueDef[] = [
  {
    key: 'no_reviews_on_site',
    label: 'Avis clients absents du site',
    problem: {
      title: 'Vos avis clients ne sont pas mis en avant',
      desc: "Vous avez d'excellents retours sur Google, mais ils n'apparaissent pas sur votre site. C'est pourtant l'un des éléments les plus rassurants pour un visiteur qui hésite.",
    },
    solution: {
      name: 'Témoignages clients intégrés',
      desc: "Vos meilleurs avis Google affichés directement sur le site, au bon endroit, pour rassurer et convaincre au moment décisif.",
      tag: 'Confiance',
    },
  },
  {
    key: 'slow_site',
    label: 'Site lent à charger',
    problem: {
      title: 'Site lent au chargement',
      desc: "Au-delà de 3 secondes d'attente, plus de la moitié des visiteurs quittent la page. Un site lent fait fuir des clients avant même qu'ils voient votre offre.",
    },
    solution: {
      name: 'Performance et rapidité',
      desc: "Un site optimisé qui s'affiche en moins de 2 secondes, sur mobile comme sur ordinateur. Plus de visiteurs gardés, donc plus de contacts.",
      tag: 'Performance',
    },
  },
  {
    key: 'phone_not_clickable',
    label: 'Téléphone non cliquable',
    problem: {
      title: 'Téléphone non cliquable',
      desc: "Sur mobile, votre numéro ne se compose pas en un clic. Chaque manipulation en plus fait perdre des appels entrants pourtant à portée de main.",
    },
    solution: {
      name: 'Appel en un clic',
      desc: "Numéro cliquable et bouton d'appel toujours visible : le visiteur vous joint instantanément depuis son téléphone.",
      tag: 'Conversion',
    },
  },
  {
    key: 'form_not_accessible',
    label: 'Formulaire absent / trop bas / trop long',
    problem: {
      title: "Formulaire difficile d'accès",
      desc: "Votre formulaire de contact est absent, placé trop bas dans la page ou trop long. Résultat : le visiteur intéressé repart sans laisser ses coordonnées.",
    },
    solution: {
      name: 'Formulaire de devis express',
      desc: "Un formulaire court et bien placé, visible dès le premier écran, pour capter la demande au moment où l'envie est là.",
      tag: 'Conversion',
    },
  },
  {
    key: 'weak_cta',
    label: "Pas assez d'appels à l'action",
    problem: {
      title: "Trop peu d'appels à l'action",
      desc: "Sans boutons clairs (« Demander un devis », « Être rappelé »), le visiteur ne sait pas quoi faire ensuite — et finit souvent par ne rien faire.",
    },
    solution: {
      name: 'Parcours de conversion clair',
      desc: "Des appels à l'action visibles et répétés aux bons endroits, qui guident naturellement le visiteur vers la prise de contact.",
      tag: 'Conversion',
    },
  },
  {
    key: 'outdated_or_not_mobile',
    label: 'Site vieillissant / mal adapté au mobile',
    problem: {
      title: 'Site vieillissant ou mal adapté au mobile',
      desc: "Un design daté ou qui s'affiche mal sur téléphone renvoie une image peu professionnelle — alors que 7 visiteurs sur 10 arrivent depuis un mobile.",
    },
    solution: {
      name: 'Design premium, mobile-first',
      desc: "Un site moderne, pensé d'abord pour le mobile, qui inspire confiance dès les 3 premières secondes.",
      tag: 'Design',
    },
  },
];

/** Sélection par défaut quand aucune détection automatique n'est disponible. */
export const DEFAULT_SELECTED_ISSUE_KEYS = [
  'no_reviews_on_site',
  'weak_cta',
  'form_not_accessible',
  'outdated_or_not_mobile',
];

/** Nombre minimum de problèmes à cocher par audit. */
export const MIN_AUDIT_ISSUES = 3;

const ISSUE_BY_KEY = new Map(AUDIT_ISSUE_CATALOG.map((i) => [i.key, i]));

export function getIssueDef(key: string): AuditIssueDef | undefined {
  return ISSUE_BY_KEY.get(key);
}

/** Garde uniquement les clés connues, dans l'ordre du catalogue, sans doublon. */
export function normalizeIssueKeys(keys: readonly string[] | null | undefined): string[] {
  if (!keys || keys.length === 0) return [];
  const wanted = new Set(keys);
  return AUDIT_ISSUE_CATALOG.filter((i) => wanted.has(i.key)).map((i) => i.key);
}

/** Construit les cartes « problème » à partir d'une liste de clés (ordre catalogue). */
export function problemsFromKeys(keys: readonly string[]): AuditProblem[] {
  return normalizeIssueKeys(keys).map((key) => {
    const def = getIssueDef(key)!;
    return { key, title: def.problem.title, desc: def.problem.desc };
  });
}

/** Construit les « solutions » pairées à partir d'une liste de clés (num séquentiel). */
export function solutionsFromKeys(keys: readonly string[]): AuditSolution[] {
  return normalizeIssueKeys(keys).map((key, idx) => {
    const def = getIssueDef(key)!;
    return { key, num: String(idx + 1), name: def.solution.name, desc: def.solution.desc, tag: def.solution.tag };
  });
}

/** Renumérote les solutions séquentiellement (après ajout / retrait). */
export function renumberSolutions(solutions: AuditSolution[]): AuditSolution[] {
  return solutions.map((s, idx) => ({ ...s, num: String(idx + 1) }));
}

/**
 * Garantit au moins `MIN_AUDIT_ISSUES` clés : part des clés fournies (ordre
 * conservé) puis complète avec la sélection par défaut si besoin.
 */
export function ensureMinIssueKeys(keys: readonly string[]): string[] {
  const out = normalizeIssueKeys(keys);
  if (out.length >= MIN_AUDIT_ISSUES) return out;
  for (const fallback of DEFAULT_SELECTED_ISSUE_KEYS) {
    if (out.length >= MIN_AUDIT_ISSUES) break;
    if (!out.includes(fallback)) out.push(fallback);
  }
  return normalizeIssueKeys(out);
}
