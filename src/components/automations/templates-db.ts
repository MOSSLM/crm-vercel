'use client'
// templates-db.ts — CRUD des modèles de messages réutilisables.
//
// Les trois tables existent depuis la v2 des automatisations et le moteur les
// lit déjà (`processSequenceEnrollment`). Ce qui manquait, c'est de quoi en
// CRÉER : le `SupaSelect` du builder est un sélecteur en lecture seule, et
// aucun écran n'écrivait dans `whatsapp_templates` ni `call_scripts` — elles
// étaient vides, donc les étapes correspondantes n'avaient rien à choisir.
//
// Un modèle sert à écrire une fois ce qu'on répète : les deux messages WhatsApp
// des séquences multicanal (l'accroche « je suis bien avec… » puis l'envoi du
// site) sont partagés par plusieurs séquences.
import { supabase } from '@/utils/supabase/client'

/** Les trois familles, et la table qui les porte. */
export type TemplateFamily = 'email' | 'whatsapp' | 'call'

export const TEMPLATE_TABLES: Readonly<Record<TemplateFamily, string>> = {
  email: 'email_templates',
  whatsapp: 'whatsapp_templates',
  call: 'call_scripts',
}

export const TEMPLATE_LABELS: Readonly<Record<TemplateFamily, { one: string; many: string; hint: string }>> = {
  email: {
    one: 'Modèle d’e-mail',
    many: 'E-mails',
    hint: 'Objet + corps. Envoyé automatiquement par le régulateur.',
  },
  whatsapp: {
    one: 'Modèle WhatsApp',
    many: 'WhatsApp',
    hint: 'Préparé pour l’agent, jamais envoyé par le CRM : il ouvre WhatsApp, message déjà écrit.',
  },
  call: {
    one: 'Script d’appel',
    many: 'Appels',
    hint: 'Ce que l’agent a sous les yeux pendant qu’il compose.',
  },
}

export interface MessageTemplate {
  id: string
  family: TemplateFamily
  name: string
  /** E-mail seulement — vide ailleurs. */
  subject: string | null
  body: string
  /** Appel seulement : durée estimée, texte libre (« 3 min »). */
  duration: string | null
}

type Row = Record<string, unknown>

const toTemplate = (family: TemplateFamily, row: Row): MessageTemplate => ({
  id: String(row.id),
  family,
  name: (row.name as string | null) ?? 'Sans nom',
  subject: (row.subject as string | null) ?? null,
  body: (row.body as string | null) ?? '',
  duration: (row.duration as string | null) ?? null,
})

/** Les colonnes propres à chaque famille — les tables n'ont pas la même forme. */
const columns = (family: TemplateFamily): string =>
  family === 'email' ? 'id,name,subject,body' : family === 'call' ? 'id,name,duration,body' : 'id,name,body'

export async function listTemplates(family: TemplateFamily): Promise<MessageTemplate[]> {
  const { data, error } = await supabase.from(TEMPLATE_TABLES[family]).select(columns(family)).order('name')
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map((r) => toTemplate(family, r))
}

/** Les trois familles d'un coup, pour la page qui les montre côte à côte. */
export async function listAllTemplates(): Promise<Record<TemplateFamily, MessageTemplate[]>> {
  const [email, whatsapp, call] = await Promise.all([
    listTemplates('email').catch(() => []),
    listTemplates('whatsapp').catch(() => []),
    listTemplates('call').catch(() => []),
  ])
  return { email, whatsapp, call }
}

/** Le sous-ensemble de colonnes que la famille accepte réellement en écriture. */
function payloadFor(family: TemplateFamily, input: Partial<MessageTemplate>): Row {
  const out: Row = {}
  if (input.name !== undefined) out.name = input.name
  if (input.body !== undefined) out.body = input.body
  // Écrire `subject` sur `whatsapp_templates` ferait échouer la requête entière :
  // la colonne n'existe pas. On filtre ici plutôt que chez chaque appelant.
  if (family === 'email' && input.subject !== undefined) out.subject = input.subject
  if (family === 'call' && input.duration !== undefined) out.duration = input.duration
  return out
}

export async function createTemplate(
  family: TemplateFamily,
  input: { name: string; body?: string; subject?: string | null; duration?: string | null },
): Promise<MessageTemplate> {
  // `email_templates` porte des politiques RLS par utilisateur
  // (`user_id = auth.uid()`, `is_default = false`) là où les deux autres tables
  // sont ouvertes aux authentifiés. Sans `user_id`, l'insertion est rejetée.
  const extra: Row = {}
  if (family === 'email') {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Session expirée')
    extra.user_id = auth.user.id
    extra.is_default = false
  }

  const { data, error } = await supabase
    .from(TEMPLATE_TABLES[family])
    .insert({ body: '', ...extra, ...payloadFor(family, input) })
    .select(columns(family))
    .single()
  if (error) throw error
  return toTemplate(family, data as unknown as Row)
}

export async function updateTemplate(
  family: TemplateFamily,
  id: string,
  patch: Partial<MessageTemplate>,
): Promise<void> {
  const { error } = await supabase.from(TEMPLATE_TABLES[family]).update(payloadFor(family, patch)).eq('id', id)
  if (error) throw error
}

export async function deleteTemplate(family: TemplateFamily, id: string): Promise<void> {
  const { error } = await supabase.from(TEMPLATE_TABLES[family]).delete().eq('id', id)
  if (error) throw error
}
