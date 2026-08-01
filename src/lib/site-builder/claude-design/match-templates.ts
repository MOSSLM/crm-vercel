/**
 * Rapproche un dossier de template trouvé dans un ZIP Claude Design des
 * templates DÉJÀ importés dans le CRM.
 *
 * Le ZIP livre la même maquette en plusieurs habillages côte à côte
 * (`template CVC - Classique/`, `… - Brut/`, `… - Agence/`). Au réimport, la
 * question n'est jamais « lequel de mes 40 sites veux-tu écraser ? » mais
 * « veux-tu remettre à jour LE template Classique ? ». Proposer toute la liste
 * oblige à retrouver la bonne ligne à chaque fois — et laisse la porte ouverte
 * à réimporter Classique par-dessus Brut.
 *
 * Ce module classe donc les candidats par proximité de nom, en ignorant les
 * mots qui ne distinguent rien (« template », « design », « copie »…) et les
 * mots communs à TOUS les templates (le « CVC » de la famille). Ce qui reste
 * est ce qui identifie vraiment l'habillage.
 *
 * Pur et sans dépendance : sert l'import multi-templates et ses tests.
 */
import { normalizeTemplateName } from "./split-template-bundle";

/** Mots qui n'identifient aucun habillage — présents un peu partout. */
const GENERIC_TOKENS = new Set([
  "template", "templates", "site", "sites", "web", "design", "designs", "claude",
  "export", "exports", "zip", "copie", "copy", "duplicata", "final", "finale",
  "new", "nouveau", "nouvelle", "version", "v1", "v2", "v3", "bis",
]);

export interface NamedTemplate {
  id: string;
  name: string;
}

/** Pourquoi un template est proposé — affiché tel quel dans le menu. */
export type MatchReason = "exact" | "proche" | "variante";

export interface TemplateMatch<T> {
  template: T;
  reason: MatchReason;
}

/** Mots significatifs d'un nom de template, normalisés. */
export function templateTokens(name: string): string[] {
  return normalizeTemplateName(name)
    .split(" ")
    .filter((t) => t.length > 0 && !GENERIC_TOKENS.has(t));
}

const isSubset = (a: string[], b: Set<string>): boolean => a.length > 0 && a.every((t) => b.has(t));

const SCORE: Record<MatchReason, number> = { exact: 3, proche: 2, variante: 1 };

/**
 * Classe les templates existants par proximité avec le nom d'un dossier du ZIP.
 * Ne renvoie QUE les candidats plausibles — un tableau vide signifie « aucun
 * rapprochement possible », et l'appelant doit alors proposer la liste complète
 * plutôt que de laisser l'opérateur sans cible.
 *
 * - `exact`    : mêmes mots significatifs (« template CVC - Classique » ≡ « CVC Classique »)
 * - `proche`   : les mots de l'un sont inclus dans l'autre (« Classique » ⊂ « CVC Classique »)
 * - `variante` : partage un mot que les autres templates n'ont pas
 */
export function rankTemplateMatches<T extends NamedTemplate>(
  detectedName: string,
  templates: T[],
): Array<TemplateMatch<T>> {
  const target = templateTokens(detectedName);
  if (target.length === 0 || templates.length === 0) return [];

  const tokensById = new Map<string, string[]>();
  for (const t of templates) tokensById.set(t.id, templateTokens(t.name));

  // Un mot porté par TOUS les templates (le « CVC » de la famille) ne distingue
  // rien : le retenir rapprocherait Classique de Brut.
  const freq = new Map<string, number>();
  for (const toks of tokensById.values()) {
    for (const tok of new Set(toks)) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  const distinctive = (tok: string) => (freq.get(tok) ?? 0) < templates.length;

  const targetSet = new Set(target);
  const matches: Array<TemplateMatch<T>> = [];

  for (const template of templates) {
    const cand = tokensById.get(template.id) ?? [];
    const candSet = new Set(cand);

    if (cand.length === target.length && isSubset(target, candSet)) {
      matches.push({ template, reason: "exact" });
      continue;
    }
    if (isSubset(target, candSet) || isSubset(cand, targetSet)) {
      matches.push({ template, reason: "proche" });
      continue;
    }
    if (target.some((tok) => candSet.has(tok) && distinctive(tok))) {
      matches.push({ template, reason: "variante" });
    }
  }

  return matches.sort(
    (a, b) => SCORE[b.reason] - SCORE[a.reason] || a.template.name.localeCompare(b.template.name),
  );
}

/** Le template visé sans ambiguïté par ce dossier, s'il y en a un seul. */
export function bestTemplateMatch<T extends NamedTemplate>(
  detectedName: string,
  templates: T[],
): T | null {
  const ranked = rankTemplateMatches(detectedName, templates);
  const best = ranked[0];
  if (!best) return null;
  // Deux « exact » ex æquo : c'est à l'opérateur de trancher, pas à nous.
  if (ranked.length > 1 && ranked[1].reason === best.reason) return null;
  return best.template;
}

export interface TargetOptions<T> {
  /** Les cibles à mettre dans le menu, dans l'ordre d'affichage. */
  targets: T[];
  /** Pourquoi chaque cible correspondante est proposée (absent = hors famille). */
  reasonById: Record<string, MatchReason>;
  /** Combien de templates la restriction laisse de côté. */
  hiddenCount: number;
  /** `true` quand la liste complète est affichée malgré la restriction. */
  opened: boolean;
}

/**
 * Ce que le menu « Cible » doit proposer pour un dossier du ZIP.
 *
 * Par défaut : seulement les templates que ce dossier peut viser. La liste
 * s'ouvre à tout dans trois cas seulement — l'opérateur l'a demandé, rien ne
 * correspond (sinon il n'aurait aucune cible), ou la cible déjà choisie ne fait
 * pas partie des correspondances (sinon le menu afficherait une valeur vide).
 */
export function targetOptions<T extends NamedTemplate>(
  detectedName: string,
  templates: T[],
  opts: { showAll?: boolean; currentTargetId?: string } = {},
): TargetOptions<T> {
  const ranked = rankTemplateMatches(detectedName, templates);
  const scoped = ranked.map((m) => m.template);
  const reasonById: Record<string, MatchReason> = {};
  for (const m of ranked) reasonById[m.template.id] = m.reason;

  const current = opts.currentTargetId ?? "";
  const opened =
    !!opts.showAll ||
    scoped.length === 0 ||
    (!!current && !scoped.some((s) => s.id === current));

  const targets = opened ? templates : scoped;
  return { targets, reasonById, hiddenCount: templates.length - targets.length, opened };
}
