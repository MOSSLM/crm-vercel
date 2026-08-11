/**
 * Le questionnaire du compte rendu vient du **form builder**, pas d'un schéma
 * figé dans le code : les questions qu'on pose en rendez-vous bougent au fil
 * des appels, et il faut pouvoir les changer depuis `/forms` sans déploiement.
 *
 * Convention : un formulaire portant le tag `compte-rendu` (ou `rdv`) devient
 * utilisable comme grille de compte rendu. Aucune table de configuration en
 * plus — le tag suffit, et il est déjà indexé (`idx_forms_tags`).
 *
 * Ce module ne contient que des fonctions pures : sélection du formulaire,
 * questions réellement à remplir, complétion, et relecture d'un compte rendu
 * ancien dont le formulaire a changé depuis.
 */

import type { Form, FormQuestion } from '@/types';
import { resolveFlow } from '@/lib/form-builder/evaluate-logic';

/** Tags qui rendent un formulaire éligible comme grille de compte rendu. */
export const TAGS_COMPTE_RENDU = ['compte-rendu', 'rdv'] as const;

/**
 * Types de questions qui n'attendent aucune saisie. On les écarte partout :
 * un écran d'accueil façon Typeform n'a pas de sens en prise de notes, et il
 * fausserait le compteur de complétion.
 */
const TYPES_STRUCTURELS = new Set(['welcome', 'statement', 'end']);

export function estQuestionSaisissable(q: FormQuestion): boolean {
  return !TYPES_STRUCTURELS.has(q.type);
}

const normaliser = (s: string) => s.trim().toLowerCase();

/** Le formulaire porte-t-il un des tags de compte rendu ? */
export function estFormulaireCompteRendu(form: Pick<Form, 'tags'>): boolean {
  const tags = new Set((form.tags ?? []).map(normaliser));
  return TAGS_COMPTE_RENDU.some((t) => tags.has(t));
}

/**
 * Les formulaires utilisables comme grille, du plus récemment modifié au plus
 * ancien — celui qu'on vient d'ajuster est presque toujours celui qu'on veut.
 */
export function formulairesEligibles(forms: Form[]): Form[] {
  return forms
    .filter(estFormulaireCompteRendu)
    .sort((a, b) => tempsDe(b.updated_at) - tempsDe(a.updated_at));
}

function tempsDe(iso: string | undefined): number {
  const t = new Date(iso ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Quel formulaire ouvrir. Par ordre de priorité :
 *   1. celui explicitement demandé (on rouvre un compte rendu existant — il
 *      doit se réafficher avec SES questions, même s'il n'est plus tagué) ;
 *   2. un formulaire éligible dédié à cette entreprise (`enterprise_id`) ;
 *   3. le formulaire éligible le plus récemment modifié.
 *
 * Retourne `null` s'il n'y a rien à ouvrir — l'appelant affiche alors
 * l'invitation à en créer un plutôt qu'un formulaire vide.
 */
export function choisirFormulaire(
  forms: Form[],
  opts: { formId?: string | null; entrepriseId?: number | null } = {},
): Form | null {
  if (opts.formId) {
    const voulu = forms.find((f) => f.id === opts.formId);
    if (voulu) return voulu;
  }

  const eligibles = formulairesEligibles(forms);
  if (!eligibles.length) return null;

  if (opts.entrepriseId != null) {
    const dedie = eligibles.find((f) => f.enterprise_id === opts.entrepriseId);
    if (dedie) return dedie;
  }

  return eligibles[0];
}

/**
 * Les questions à afficher, dans l'ordre, logique conditionnelle appliquée.
 *
 * On réutilise `resolveFlow` du form builder pour ne pas avoir deux moteurs de
 * logique qui divergent : une règle qui saute une question dans le formulaire
 * public doit la sauter ici aussi.
 */
export function questionsVisibles(
  form: Pick<Form, 'questions' | 'logic'>,
  reponses: Record<string, unknown>,
): FormQuestion[] {
  const ordre = resolveFlow(
    { questions: form.questions ?? [], logic: form.logic ?? [] },
    reponses,
  );
  const parId = new Map((form.questions ?? []).map((q) => [q.id, q]));
  return ordre
    .map((id) => parId.get(id))
    .filter((q): q is FormQuestion => Boolean(q) && estQuestionSaisissable(q as FormQuestion));
}

/** Une réponse vide est `undefined`, `null`, `''` ou un tableau vide. */
export function estRepondu(valeur: unknown): boolean {
  if (valeur === undefined || valeur === null) return false;
  if (typeof valeur === 'string') return valeur.trim() !== '';
  if (Array.isArray(valeur)) return valeur.length > 0;
  return true;
}

export interface Completion {
  repondues: number;
  total: number;
  /** Entier 0–100. `total` nul ⇒ 0, jamais NaN. */
  pct: number;
  /** Questions obligatoires encore vides — ce qui bloque la clôture. */
  manquantes: FormQuestion[];
}

/**
 * Avancement sur les questions **visibles** : une question sautée par la
 * logique ne doit ni compter comme faite ni comme manquante.
 */
export function calculerCompletion(
  form: Pick<Form, 'questions' | 'logic'>,
  reponses: Record<string, unknown>,
): Completion {
  const visibles = questionsVisibles(form, reponses);
  const repondues = visibles.filter((q) => estRepondu(reponses[q.id])).length;
  const manquantes = visibles.filter((q) => q.required && !estRepondu(reponses[q.id]));
  const total = visibles.length;
  return {
    repondues,
    total,
    pct: total === 0 ? 0 : Math.round((repondues / total) * 100),
    manquantes,
  };
}

// ─── Relecture ────────────────────────────────────────────────────────────────

export interface LigneReponse {
  id: string;
  label: string;
  texte: string;
  /** La question n'existe plus dans le formulaire actuel. */
  orpheline: boolean;
}

/**
 * Met un compte rendu à plat pour l'affichage.
 *
 * Le formulaire a pu changer depuis la saisie : des questions ont été
 * renommées, réordonnées, supprimées. On rend d'abord les réponses dont on
 * retrouve la question — avec son libellé et ses choix actuels — puis les
 * orphelines, brutes, en fin de liste. Perdre une réponse parce que quelqu'un
 * a nettoyé le formulaire serait pire que l'afficher sans son libellé.
 */
export function resumerReponses(
  form: Pick<Form, 'questions'> | null,
  reponses: Record<string, unknown>,
): LigneReponse[] {
  const questions = form?.questions ?? [];
  const connues = new Set(questions.map((q) => q.id));
  const lignes: LigneReponse[] = [];

  for (const q of questions) {
    if (!estQuestionSaisissable(q)) continue;
    const valeur = reponses[q.id];
    if (!estRepondu(valeur)) continue;
    lignes.push({
      id: q.id,
      label: q.title || q.ref || q.id,
      texte: formaterValeur(q, valeur),
      orpheline: false,
    });
  }

  for (const [id, valeur] of Object.entries(reponses)) {
    if (connues.has(id) || !estRepondu(valeur)) continue;
    lignes.push({ id, label: id, texte: formaterValeur(null, valeur), orpheline: true });
  }

  return lignes;
}

/**
 * Rend une valeur lisible. Pour les questions à choix, on remplace les
 * identifiants stockés (`c_heat`) par les libellés (`Chauffage`) — un compte
 * rendu qu'on relit six semaines plus tard doit se lire, pas se décoder.
 */
export function formaterValeur(q: FormQuestion | null, valeur: unknown): string {
  if (valeur === undefined || valeur === null) return '';

  if (Array.isArray(valeur)) {
    return valeur.map((v) => formaterValeur(q, v)).filter(Boolean).join(', ');
  }

  if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';

  const brut = String(valeur);
  const choix = q?.choices?.find((c) => c.id === brut || c.value === brut);
  if (choix) return choix.label;

  if (q?.type === 'yes_no') {
    if (brut === 'yes') return 'Oui';
    if (brut === 'no') return 'Non';
  }

  if (q?.unit && brut !== '') return `${brut} ${q.unit}`;

  return brut;
}

/**
 * Titre par défaut d'un compte rendu, quand on n'en saisit pas.
 * Format : « Appel — 12 août 2026 ».
 */
export function titreParDefaut(canal: string, date: Date): string {
  const libelles: Record<string, string> = {
    appel: 'Appel',
    rdv: 'Rendez-vous',
    visio: 'Visio',
    terrain: 'Visite',
    autre: 'Échange',
  };
  const jour = date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${libelles[canal] ?? 'Échange'} — ${jour}`;
}
