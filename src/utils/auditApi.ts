import { supabase } from './supabase/client';
import type { Audit, AuditContent, AuditTemplate } from '@/types';
import {
  problemsFromKeys,
  solutionsFromKeys,
  ensureMinIssueKeys,
  backfillProblemKeys,
  backfillSolutionKeys,
} from '@/data/auditIssues';
import { getDefaultAuditContent } from '@/lib/audit/default-content';

// Le contenu par défaut vit dans `@/lib/audit/default-content` (module pur,
// utilisable côté serveur pour la création d'audit par un agent) ; réexporté
// ici pour les appelants existants.
export { getDefaultAuditContent };

function normalizeAuditContent(content: Partial<AuditContent> | null | undefined): AuditContent {
  const defaults = getDefaultAuditContent();
  const source = content ?? {};

  return {
    page1: { ...defaults.page1, ...(source.page1 ?? {}) },
    page2: {
      ...defaults.page2,
      ...(source.page2 ?? {}),
      // Rétro-lie les cartes anciennes (sans `key`) au catalogue pour que la
      // checklist les affiche déjà cochées et ne les duplique pas.
      problems: backfillProblemKeys(source.page2?.problems?.length ? source.page2.problems : defaults.page2.problems),
    },
    page3: {
      ...defaults.page3,
      ...(source.page3 ?? {}),
      solutions: backfillSolutionKeys(source.page3?.solutions?.length ? source.page3.solutions : defaults.page3.solutions),
    },
    page4: {
      ...defaults.page4,
      ...(source.page4 ?? {}),
      livrables: source.page4?.livrables?.length ? source.page4.livrables : defaults.page4.livrables,
    },
    page5: {
      ...defaults.page5,
      ...(source.page5 ?? {}),
      planning_steps: source.page5?.planning_steps?.length ? source.page5.planning_steps : defaults.page5.planning_steps,
      services: source.page5?.services?.length ? source.page5.services : defaults.page5.services,
    },
    page6: {
      ...defaults.page6,
      ...(source.page6 ?? {}),
      next_steps: source.page6?.next_steps?.length ? source.page6.next_steps : defaults.page6.next_steps,
    },
    global_style: {
      ...(defaults.global_style ?? {}),
      ...(source.global_style ?? {}),
    },
  };
}

function hydrateAudit(audit: Audit): Audit {
  return {
    ...audit,
    content: normalizeAuditContent(audit.content),
  };
}

export async function fetchAuditTemplates(): Promise<AuditTemplate[]> {
  const { data, error } = await supabase
    .from('audit_templates')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as AuditTemplate[];
}

export async function fetchAuditByOpportunite(opportuniteId: string): Promise<Audit | null> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('opportunite_id', opportuniteId)
    .maybeSingle();
  if (error) throw error;
  return data ? hydrateAudit(data as Audit) : null;
}

export async function createAudit(params: {
  opportunite_id: string;
  template_id?: string;
  entreprise_nom?: string;
  entreprise_adresse?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
  /** Clés de problèmes pré-détectées par l'enrichissement (edge function). */
  detected_issue_keys?: string[];
}): Promise<Audit> {
  const content = getDefaultAuditContent({
    entreprise_nom: params.entreprise_nom,
    entreprise_adresse: params.entreprise_adresse,
    entreprise_ville: params.entreprise_ville,
    entreprise_secteur: params.entreprise_secteur,
    demo_url: params.demo_site_url,
  });

  // Pré-cocher les problèmes détectés automatiquement (au moins 3).
  if (params.detected_issue_keys && params.detected_issue_keys.length > 0) {
    const keys = ensureMinIssueKeys(params.detected_issue_keys);
    content.page2.problems = problemsFromKeys(keys);
    content.page3.solutions = solutionsFromKeys(keys);
  }

  const { entreprise_adresse: _unusedAddress, detected_issue_keys: _unusedKeys, ...insertableParams } = params;

  const { data, error } = await supabase
    .from('audits')
    .insert({
      ...insertableParams,
      content,
      statut: 'draft',
    })
    .select()
    .single();

  if (error) throw error;
  return hydrateAudit(data as Audit);
}

export async function upsertAudit(params: {
  opportunite_id: string;
  template_id?: string;
  entreprise_nom?: string;
  entreprise_adresse?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
  detected_issue_keys?: string[];
}): Promise<Audit> {
  const existing = await fetchAuditByOpportunite(params.opportunite_id);
  if (existing) return existing;
  return createAudit(params);
}

function isAuthError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST301' ||
    !!error.message?.includes('JWT') ||
    !!error.message?.includes('expired')
  );
}

export async function saveAudit(
  auditId: string,
  content: AuditContent,
  meta: { entreprise_logo_url?: string; statut: 'draft' | 'ready' }
): Promise<void> {
  const { error } = await supabase
    .from('audits')
    .update({ content, ...meta, updated_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) {
    if (isAuthError(error)) throw new Error('SESSION_EXPIRED');
    throw error;
  }
}

export async function savePdfUrl(auditId: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase
    .from('audits')
    .update({ pdf_url: pdfUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) throw error;
}
