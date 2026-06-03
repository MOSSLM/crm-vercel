// =====================================================================
// Pré-détection des problèmes d'audit
// =====================================================================
// Combine plusieurs signaux (HTML brut du site, PageSpeed, données Google,
// jugements du LLM) pour pré-cocher les « soucis » les plus courants sur le
// site d'un prospect. Le commercial n'a plus qu'à vérifier dans l'éditeur
// d'audit (boutons « Voir le site » / « Voir Google »).
//
// ⚠️ Les clés ci-dessous DOIVENT rester synchronisées avec le catalogue
// front : src/data/auditIssues.ts (AUDIT_ISSUE_CATALOG).
// =====================================================================

import type { RawSiteSignals } from "./scraper.ts";

export const AUDIT_ISSUE_KEYS = {
  NO_REVIEWS: "no_reviews_on_site",
  SLOW: "slow_site",
  PHONE: "phone_not_clickable",
  FORM: "form_not_accessible",
  CTA: "weak_cta",
  OUTDATED: "outdated_or_not_mobile",
} as const;

// Ordre d'affichage = ordre du catalogue front.
const CATALOG_ORDER: string[] = [
  AUDIT_ISSUE_KEYS.NO_REVIEWS,
  AUDIT_ISSUE_KEYS.SLOW,
  AUDIT_ISSUE_KEYS.PHONE,
  AUDIT_ISSUE_KEYS.FORM,
  AUDIT_ISSUE_KEYS.CTA,
  AUDIT_ISSUE_KEYS.OUTDATED,
];

// Au moins 3 problèmes pré-cochés par entreprise (cf. demande métier).
const MIN_ISSUES = 3;

// Seuil de perf mobile PageSpeed en-dessous duquel on considère le site lent.
const SLOW_PERF_THRESHOLD = 0.5;
// Seuil un peu plus large pour autoriser le « remplissage » jusqu'à 3.
const SLOW_PERF_FILL_THRESHOLD = 0.6;

export interface DetectInput {
  /** L'entreprise a-t-elle des avis Google (peu importe où) ? */
  hasGoogleReviews: boolean;
  /** Le site affiche-t-il déjà des témoignages ? (LLM, null = inconnu) */
  siteShowsTestimonials: boolean | null;
  /** Le site a-t-il des CTA clairs ? (LLM, null = inconnu) */
  siteHasClearCta: boolean | null;
  /** Le design paraît-il moderne ? (LLM, null = inconnu) */
  siteDesignModern: boolean | null;
  /** Signaux déterministes extraits du HTML brut (null = non récupéré) */
  raw: RawSiteSignals | null;
  /** Score perf mobile PageSpeed 0..1 (null = non mesuré) */
  pagespeedPerf: number | null;
}

/** Un problème peut-il être « rempli » sans contredire une preuve positive connue ? */
function canFill(key: string, input: DetectInput): boolean {
  switch (key) {
    case AUDIT_ISSUE_KEYS.NO_REVIEWS:
      // On ne le propose que s'il y a des avis Google ET que le site ne les montre pas (ou inconnu).
      return input.hasGoogleReviews && input.siteShowsTestimonials !== true;
    case AUDIT_ISSUE_KEYS.CTA:
      return input.siteHasClearCta !== true;
    case AUDIT_ISSUE_KEYS.FORM:
      return input.raw ? input.raw.hasForm !== true : true; // inconnu → autorisé
    case AUDIT_ISSUE_KEYS.OUTDATED:
      return input.siteDesignModern !== true;
    case AUDIT_ISSUE_KEYS.SLOW:
      // Ne pas remplir « lent » si on a mesuré que le site est rapide.
      return input.pagespeedPerf != null && input.pagespeedPerf < SLOW_PERF_FILL_THRESHOLD;
    case AUDIT_ISSUE_KEYS.PHONE:
      return input.raw ? input.raw.phoneInText && !input.raw.hasTelLink : false;
    default:
      return false;
  }
}

// Ordre de priorité pour compléter jusqu'à MIN_ISSUES (du plus universel au plus spécifique).
const FILL_PRIORITY: string[] = [
  AUDIT_ISSUE_KEYS.NO_REVIEWS,
  AUDIT_ISSUE_KEYS.CTA,
  AUDIT_ISSUE_KEYS.OUTDATED,
  AUDIT_ISSUE_KEYS.FORM,
  AUDIT_ISSUE_KEYS.SLOW,
  AUDIT_ISSUE_KEYS.PHONE,
];

/**
 * Détecte les problèmes du site puis complète jusqu'à au moins 3 (sans
 * contredire une preuve positive). Retourne des clés dans l'ordre du catalogue.
 */
export function detectAuditIssues(input: DetectInput): string[] {
  const issues = new Set<string>();

  // --- Détections « positives » ---
  // Avis clients non mis en avant : il y a des avis Google mais le site ne les montre pas.
  if (input.hasGoogleReviews && input.siteShowsTestimonials === false) {
    issues.add(AUDIT_ISSUE_KEYS.NO_REVIEWS);
  }
  // Site lent (PageSpeed mobile).
  if (input.pagespeedPerf != null && input.pagespeedPerf < SLOW_PERF_THRESHOLD) {
    issues.add(AUDIT_ISSUE_KEYS.SLOW);
  }
  // Téléphone non cliquable : numéro présent dans le texte mais pas de lien tel:.
  if (input.raw && input.raw.phoneInText && !input.raw.hasTelLink) {
    issues.add(AUDIT_ISSUE_KEYS.PHONE);
  }
  // Formulaire absent de la home.
  if (input.raw && !input.raw.hasForm) {
    issues.add(AUDIT_ISSUE_KEYS.FORM);
  }
  // CTA faibles.
  if (input.siteHasClearCta === false) {
    issues.add(AUDIT_ISSUE_KEYS.CTA);
  }
  // Design daté ou non responsive (pas de viewport meta).
  if (input.siteDesignModern === false || (input.raw && !input.raw.hasViewport)) {
    issues.add(AUDIT_ISSUE_KEYS.OUTDATED);
  }

  // --- Complément jusqu'à MIN_ISSUES (sans contredire les preuves) ---
  for (const key of FILL_PRIORITY) {
    if (issues.size >= MIN_ISSUES) break;
    if (!issues.has(key) && canFill(key, input)) issues.add(key);
  }

  return CATALOG_ORDER.filter((k) => issues.has(k));
}
