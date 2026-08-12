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
  /**
   * Les versions « à un contact », facultatives.
   *
   * Vides, c'est `subject` / `body` qui partent — le comportement d'avant la
   * bascule à deux variations, donc aucun modèle existant n'a à être retouché.
   * Cf. `sql/20260814_modeles_variantes_contact.sql`.
   */
  subjectContact: string | null
  bodyContact: string | null
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
  subjectContact: (row.subject_contact as string | null) ?? null,
  bodyContact: (row.body_contact as string | null) ?? null,
  duration: (row.duration as string | null) ?? null,
})

/**
 * `*` plutôt que la liste des colonnes.
 *
 * PostgREST fait échouer TOUTE la requête sur une colonne inconnue, et
 * `body_contact` n'arrive qu'avec la migration `20260814`. Nommer les colonnes
 * ferait donc afficher « Chargement des modèles impossible » à un déploiement
 * qui précède la migration, au lieu de simplement ignorer les deux versions.
 * Les trois tables tiennent en quelques colonnes : tout prendre ne coûte rien.
 */
const COLUMNS = '*'

export async function listTemplates(family: TemplateFamily): Promise<MessageTemplate[]> {
  const { data, error } = await supabase.from(TEMPLATE_TABLES[family]).select(COLUMNS).order('name')
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
  // Une version contact vide est écrite `null` et non `''` : c'est ce qui la
  // distingue d'un texte volontairement blanc, et `pickVariant` lit l'absence.
  if (input.bodyContact !== undefined) out.body_contact = input.bodyContact?.trim() ? input.bodyContact : null
  // Écrire `subject` sur `whatsapp_templates` ferait échouer la requête entière :
  // la colonne n'existe pas. On filtre ici plutôt que chez chaque appelant.
  if (family === 'email' && input.subject !== undefined) out.subject = input.subject
  if (family === 'email' && input.subjectContact !== undefined)
    out.subject_contact = input.subjectContact?.trim() ? input.subjectContact : null
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
    .select(COLUMNS)
    .single()
  if (error) throw error
  return toTemplate(family, data as unknown as Row)
}

/** Les colonnes que la migration `20260814` ajoute — absentes avant elle. */
const COLONNES_VARIANTES = ['body_contact', 'subject_contact'] as const

/**
 * L'erreur d'une colonne que le schéma ne connaît pas.
 *
 * PostgREST rend `PGRST204` (« Could not find the 'body_contact' column … in
 * the schema cache ») quand on écrit une colonne absente. On ne la confond pas
 * avec une autre erreur d'écriture : un droit RLS refusé doit rester une erreur.
 */
function colonneVarianteInconnue(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  if (!e || e.code !== 'PGRST204') return false
  return COLONNES_VARIANTES.some((c) => (e.message ?? '').includes(c))
}

const sansVariantes = (payload: Row): Row => {
  const out = { ...payload }
  for (const c of COLONNES_VARIANTES) delete out[c]
  return out
}

/**
 * Ce que l'enregistrement a réellement pu écrire.
 *
 * `sans-variantes` veut dire : la base n'a pas encore reçu
 * `sql/20260814_modeles_variantes_contact.sql`. Le texte principal est
 * enregistré, les deux versions ne le sont pas.
 */
export type SaveOutcome = 'ok' | 'sans-variantes'

export async function updateTemplate(
  family: TemplateFamily,
  id: string,
  patch: Partial<MessageTemplate>,
): Promise<SaveOutcome> {
  const payload = payloadFor(family, patch)
  const { error } = await supabase.from(TEMPLATE_TABLES[family]).update(payload).eq('id', id)
  if (!error) return 'ok'
  if (!colonneVarianteInconnue(error)) throw error

  // Le code peut être déployé avant que la migration soit passée. Faire échouer
  // TOUTE la saisie dans cet intervalle casserait l'écriture des modèles telle
  // qu'elle marchait avant — alors que seules les deux versions sont en jeu. On
  // enregistre donc ce que la base sait porter, et on le dit à l'appelant.
  const { error: err2 } = await supabase
    .from(TEMPLATE_TABLES[family])
    .update(sansVariantes(payload))
    .eq('id', id)
  if (err2) throw err2
  return 'sans-variantes'
}

export async function deleteTemplate(family: TemplateFamily, id: string): Promise<void> {
  const { error } = await supabase.from(TEMPLATE_TABLES[family]).delete().eq('id', id)
  if (error) throw error
}
