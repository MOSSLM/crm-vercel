import type { FormQuestionType } from '@/types';

export interface QuestionTypeDef {
  id: FormQuestionType;
  label: string;
  cat: string;
  icon: string;
}

export const QUESTION_TYPES: QuestionTypeDef[] = [
  { id: 'welcome',       label: 'Welcome',        cat: 'structure', icon: 'welcome' },
  { id: 'statement',     label: 'Statement',      cat: 'structure', icon: 'statement' },
  { id: 'end',           label: 'Écran de fin',   cat: 'structure', icon: 'end' },
  { id: 'short_text',    label: 'Texte court',    cat: 'text',      icon: 'textShort' },
  { id: 'long_text',     label: 'Texte long',     cat: 'text',      icon: 'textLong' },
  { id: 'email',         label: 'Email',          cat: 'contact',   icon: 'email' },
  { id: 'phone',         label: 'Téléphone',      cat: 'contact',   icon: 'phone' },
  { id: 'number',        label: 'Nombre',         cat: 'number',    icon: 'number' },
  { id: 'slider',        label: 'Slider',         cat: 'number',    icon: 'slider' },
  { id: 'multi_choice',  label: 'Choix multiple', cat: 'choice',    icon: 'multiChoice' },
  { id: 'single_choice', label: 'Choix unique',   cat: 'choice',    icon: 'multiChoice' },
  { id: 'dropdown',      label: 'Dropdown',       cat: 'choice',    icon: 'dropdown' },
  { id: 'yes_no',        label: 'Oui / Non',      cat: 'choice',    icon: 'yesno' },
  { id: 'rating',        label: 'Note (étoiles)', cat: 'rating',    icon: 'rating' },
  { id: 'scale',         label: 'Échelle 1-10',   cat: 'rating',    icon: 'scale' },
  { id: 'date',          label: 'Date',           cat: 'advanced',  icon: 'date' },
  { id: 'file',          label: 'Upload fichier', cat: 'advanced',  icon: 'upload' },
];

export const QT: Record<string, QuestionTypeDef> = Object.fromEntries(
  QUESTION_TYPES.map((q) => [q.id, q]),
);

export interface QuestionTypeGroup {
  id: string;
  label: string;
  items: FormQuestionType[];
}

export const QT_GROUPS: QuestionTypeGroup[] = [
  { id: 'structure', label: 'Structure', items: ['welcome', 'statement', 'end'] },
  { id: 'choice',    label: 'Choix',     items: ['multi_choice', 'single_choice', 'dropdown', 'yes_no'] },
  { id: 'text',      label: 'Texte',     items: ['short_text', 'long_text'] },
  { id: 'contact',   label: 'Contact',   items: ['email', 'phone'] },
  { id: 'rating',    label: 'Note',      items: ['rating', 'scale'] },
  { id: 'number',    label: 'Nombre',    items: ['number', 'slider'] },
  { id: 'advanced',  label: 'Avancé',    items: ['date', 'file'] },
];
