// engine.ts — moteur d'exécution des automatisations (workflows + séquences).
// Exécuté côté serveur uniquement (service-role Supabase).
import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { wrapEmailBodyHtml, buildSignatureText } from '@/utils/emailTemplate'
import type { SignatureData } from '@/components/messaging/SignatureSettings'
import { asWorkflow, findNode, getSlotChild, isCondType } from '@/components/automations/workflow-graph'
import { routeTask, type RoutingDecision } from '@/lib/automations/task-routing'
import { etapeSuivante } from '@/lib/automations/branches'
import {
  readReplies,
  readSkippedSteps,
  readStepShifts,
  readVariant,
  stepStartMs,
  type StepAnchor,
} from '@/lib/automations/week'
import {
  interpolateVars,
  otherVariant,
  pickVariant,
  usedVariables,
  variantText,
  type MessageVariant,
  type VarBag,
  type VariantPair,
} from '@/lib/automations/variables'
import { BLOCK_LABEL, allowRecipient } from '@/lib/email/send-guard'
import { recordSend } from '@/lib/email/verify/service'
import {
  cleanEmail,
  loadRegulatorSettings,
  loadTaskLoads,
  loadUnavailableAgents,
  resolveAdminId,
} from '@/lib/automations/regulator-db'
import type {
  Automation,
  WorkflowNode,
  SequenceDefinition,
  SequenceStep,
  SequenceEnrollment,
  TraceEntry,
} from '@/components/automations/types'
import { SITE_DOMAIN } from '@/lib/site-domain'
import { getAppUrl } from '@/lib/app-url'
import { collecterCanaux } from '@/lib/prospects/canal'
import { rapportPublicUrl } from '@/lib/audit-site/rapport-url'
import { aDesMesuresAudit, assurerJetonRapport } from '@/lib/audit-site/rapport'
import { choisirSiteMontrable, urlPubliqueDuSite } from '@/lib/site-builder/demo-share-url'

const DAY_MS = 86_400_000

export interface RunContext {
  opportunite_id?: string | null
  contact_id?: string | null
  entreprise_id?: number | null
  pipeline_id?: string | null
  stage_id?: number | null
  from_stage_id?: number | null
  event?: string
}

type ResolvedEntities = {
  contactId: string | null
  entrepriseId: number | null
  /** Adresse retenue : celle du contact, à défaut celle de l'entreprise. */
  contactEmail: string | null
  /** Adresse de l'entreprise (`entreprises.email`), qu'elle serve de repli ou non. */
  companyEmail: string | null
  contactName: string | null
  contactPhone: string | null
  contactLinkedin: string | null
  /** Lien montré au prospect : le rapport web s'il existe, sinon le PDF. */
  auditUrl: string | null
  /**
   * Le PDF, et lui seul.
   *
   * Distinct d'`auditUrl` parce que la pièce jointe e-mail (`attachAudit`) est
   * ENVOYÉE comme `audit.pdf` : y mettre l'URL du rapport web attacherait une
   * page HTML sous un nom de PDF, illisible pour le destinataire. Un lien et un
   * fichier ne sont pas la même chose, et cette distinction doit survivre à la
   * bascule vers le rapport web.
   */
  auditPdfUrl: string | null
  demoUrl: string | null
  vars: VarBag
}

// ── Résolution des entités + variables ─────────────────────────────────────
async function resolveEntities(sb: SupabaseClient, ctx: RunContext): Promise<ResolvedEntities> {
  let contactId = ctx.contact_id ?? null
  let entrepriseId = ctx.entreprise_id ?? null

  if (ctx.opportunite_id && (!contactId || !entrepriseId)) {
    const { data: opp } = await sb
      .from('opportunites')
      .select('contact_id,entreprise_id')
      .eq('id', ctx.opportunite_id)
      .maybeSingle()
    contactId = contactId ?? (opp?.contact_id ?? null)
    entrepriseId = entrepriseId ?? (opp?.entreprise_id ?? null)
  }

  const vars: VarBag = {}
  let contactEmail: string | null = null
  let companyEmail: string | null = null
  let contactName: string | null = null
  let contactPhone: string | null = null
  let contactLinkedin: string | null = null

  type ContactRow = {
    first_name: string | null
    last_name: string | null
    email: string | null
    tel: string | null
    role_title: string | null
    linkedin_url: string | null
  }
  let c: ContactRow | null = null
  if (contactId) {
    const { data } = await sb
      .from('contacts')
      .select('first_name,last_name,email,tel,role_title,linkedin_url')
      .eq('id', contactId)
      .maybeSingle()
    c = (data as ContactRow | null) ?? null
    if (c) {
      vars['contact.first_name'] = c.first_name ?? ''
      vars['contact.last_name'] = c.last_name ?? ''
      vars['contact.role'] = c.role_title ?? ''
      contactEmail = cleanEmail(c.email)
      contactName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || null
      contactPhone = c.tel ?? null
      contactLinkedin = c.linkedin_url ?? null
    }
  }
  let auditUrl: string | null = null
  let auditPdfUrl: string | null = null
  let demoUrl: string | null = null
  let ownerId: string | null = null
  if (entrepriseId) {
    const { data: e } = await sb
      .from('entreprises')
      .select('name,ville,site_web_canonique,email,telephone,telephones,owner_id')
      .eq('id', entrepriseId)
      .maybeSingle()
    if (e) {
      vars['company.name'] = e.name ?? ''
      vars['company.city'] = e.ville ?? ''
      vars['company.website'] = e.site_web_canonique ?? ''
      companyEmail = cleanEmail(e.email)
      vars['company.email'] = companyEmail ?? ''
      ownerId = (e.owner_id as string | null) ?? null

      // Le téléphone du prospect, entreprise ET contacts confondus. Sans ce
      // repli, une tâche WhatsApp posée sur une entreprise sans fiche contact
      // partait sans numéro : l'agent voyait « aucun numéro » sur une fiche qui
      // en portait un. 70 des 275 entreprises qualifiées sont dans ce cas.
      const numeros = [
        c?.tel,
        e.telephone as string | null,
        ...(Array.isArray(e.telephones) ? (e.telephones as string[]) : []),
      ]
      const canaux = collecterCanaux({
        entrepriseEmail: e.email as string | null,
        entrepriseTelephones: numeros,
        contacts: c ? [{ email: c.email, tel: c.tel }] : [],
      })
      // Un mobile d'abord : c'est le seul numéro qui marche sur WhatsApp, et
      // c'est celui d'une personne plutôt que d'un standard.
      contactPhone = canaux.mobile ?? canaux.fixe ?? contactPhone
      vars['company.phone'] = contactPhone ?? ''
    }

    // Audit + site démo : liens interpolables dans les messages des séquences.
    // L'audit est rattaché à l'opportunité ; on privilégie celle du contexte,
    // sinon le premier audit prêt de l'entreprise.
    const { data: opps } = await sb.from('opportunites').select('id').eq('entreprise_id', entrepriseId)
    const oppIds = (opps ?? []).map((o) => o.id)
    if (oppIds.length > 0) {
      const { data: audits } = await sb
        .from('audits')
        .select('opportunite_id,pdf_url,statut,demo_site_url')
        .in('opportunite_id', oppIds)
      const list = audits ?? []
      const audit =
        (ctx.opportunite_id ? list.find((a) => a.opportunite_id === ctx.opportunite_id) : null) ??
        list.find((a) => a.statut === 'ready' && a.pdf_url) ??
        list[0] ??
        null
      if (audit) {
        if (audit.statut === 'ready' && audit.pdf_url) {
          auditUrl = audit.pdf_url
          auditPdfUrl = audit.pdf_url
        }
        demoUrl = audit.demo_site_url ?? null
      }
    }

    // Le site du site-builder fait foi sur le lien démo de l'audit.
    //
    // DEUX DÉFAUTS CORRIGÉS ICI, ET C'ÉTAIT LE MÊME QUE POUR L'AUDIT.
    //
    // 1. On n'acceptait que `published_domain` ou `published_subdomain`. Or
    //    AUCUN site du parc n'est publié : sur 114 entreprises qualifiées qui
    //    en ont un, zéro a de sous-domaine. `company.demo_url` s'interpolait
    //    donc en vide pour les 295, comme le lien d'audit avant lui.
    //    Un site non publié a pourtant une URL qui marche —
    //    `https://{id}.{SITE_DOMAIN}`, que le middleware route vers l'aperçu —
    //    et c'est déjà ce que le rapport public envoie. Le moteur était le seul
    //    à l'ignorer, faute de lire `id`.
    //
    // 2. Le repli `candidates[0]` prenait n'importe quel site, y compris un
    //    `a_faire`. Le tableau du site-builder est pourtant explicite :
    //    « À faire » veut dire « Prêt à créer », et seul « Prêt » veut dire
    //    « Prêt à envoyer ». Envoyer l'aperçu d'une démo pas commencée est pire
    //    que de ne rien envoyer.
    const { data: sites } = await sb
      .from('sites')
      .select('id,is_published,published_subdomain,published_domain,build_stage,is_template')
      .eq('enterprise_id', entrepriseId)
    // Seul un site publié ou marqué « Prêt » est montrable à un prospect.
    const site = choisirSiteMontrable(sites ?? [])
    if (site) demoUrl = urlPubliqueDuSite(site)

    // Le rapport web PRIME sur le PDF quand un jeton actif existe.
    //
    // Sur WhatsApp comme en e-mail, un PDF est un téléchargement : aucune
    // vignette, une friction, et rien qui dise si le prospect l'a ouvert. Le
    // rapport web se déplie, se lit sur téléphone, et compte ses vues.
    //
    // Le repli sur le PDF est conservé tel quel : les séquences déjà écrites
    // continuent de fonctionner sans être retouchées, et `attachAudit`
    // (pièce jointe e-mail) garde le PDF puisqu'on ne peut pas joindre une page.
    //
    // LE JETON EST CRÉÉ ICI S'IL N'EXISTE PAS. Il ne naissait que dans le
    // dialogue « Partager le rapport », que l'envoi automatique ne traverse
    // jamais : aucun jeton n'existait en base, donc `company.audit_url`
    // s'interpolait en vide pour TOUTES les entreprises, sans exception.
    const rapportUrl = await lireRapportUrl(sb, entrepriseId, ownerId)
    if (rapportUrl) auditUrl = rapportUrl

    vars['company.audit_url'] = auditUrl ?? ''
    vars['company.demo_url'] = demoUrl ?? ''
  }

  // `owner.first_name` et `calendar_link` étaient annoncés dans le builder
  // depuis toujours mais n'ont jamais été remplis : ils s'interpolaient en
  // blanc. Un message signé « — » ou invitant à réserver sur un lien vide part
  // quand même, et personne ne le voit avant le prospect.
  vars['owner.first_name'] = await lireOwnerPrenom(sb, ownerId)
  vars['calendar_link'] = await lireCalendarLink(sb, ownerId)

  // Un contact sans adresse n'est pas une impasse : l'email saisi sur la fiche
  // entreprise (`entreprises.email`) sert de destinataire de repli, c'est là que
  // le pipeline commercial enregistre les adresses ajoutées à la main.
  return {
    contactId,
    entrepriseId,
    contactEmail: contactEmail ?? companyEmail,
    companyEmail,
    contactName,
    contactPhone,
    contactLinkedin,
    auditUrl,
    auditPdfUrl,
    demoUrl,
    vars,
  }
}

/**
 * Le prénom de l'agent qui suit l'entreprise, pour signer les messages.
 *
 * Silencieuse en cas d'erreur, et vide quand personne ne suit le prospect : un
 * message signé d'un blanc reste envoyable, une séquence qui s'interrompt pour
 * ça ne l'est pas.
 */
async function lireOwnerPrenom(sb: SupabaseClient, ownerId: string | null): Promise<string> {
  if (!ownerId) return ''
  try {
    const { data } = await sb.from('user_profiles').select('full_name').eq('id', ownerId).maybeSingle()
    const full = (data?.full_name as string | null) ?? ''
    return full.trim().split(/\s+/)[0] ?? ''
  } catch {
    return ''
  }
}

/**
 * Le lien de réservation de l'agent qui suit l'entreprise (`/rdv/{username}`).
 *
 * Vide quand la page n'existe pas ou est désactivée — plutôt qu'un lien mort :
 * un prospect qui clique sur une page absente est perdu pour de bon.
 */
async function lireCalendarLink(sb: SupabaseClient, ownerId: string | null): Promise<string> {
  if (!ownerId) return ''
  try {
    const { data } = await sb
      .from('scheduling_pages')
      .select('username,is_active')
      .eq('user_id', ownerId)
      .maybeSingle()
    const page = data as { username: string | null; is_active: boolean | null } | null
    if (!page?.username || page.is_active === false) return ''
    return `${getAppUrl()}/rdv/${page.username}`
  } catch {
    return ''
  }
}

/**
 * L'URL du rapport web de l'entreprise, si un jeton actif existe.
 *
 * Silencieuse en cas d'erreur : la table peut ne pas exister (migration non
 * appliquée), et une séquence en cours d'exécution ne doit pas s'interrompre
 * pour ça — elle repart simplement sur le PDF.
 */
async function lireRapportUrl(
  sb: SupabaseClient,
  entrepriseId: number,
  ownerId: string | null,
): Promise<string | null> {
  try {
    const { jeton, erreur } = await assurerJetonRapport(sb, entrepriseId, ownerId)
    if (erreur || !jeton?.actif || !jeton.token) return null
    return rapportPublicUrl(jeton.token)
  } catch {
    return null
  }
}

/** Le texte qu'une étape enverra, une fois ses variables remplies. */
export interface RenderedStepMessage {
  /** E-mail seulement. */
  subject: string | null
  body: string
  /** Nom du modèle ou du script d'où vient le texte, quand il en vient un. */
  source: string | null
  /** Laquelle des deux versions du modèle a été retenue pour ce prospect. */
  variant: MessageVariant
  /**
   * L'AUTRE version, rendue elle aussi — `null` quand le modèle n'en a qu'une.
   *
   * Rendue ici et pas plus tard parce que le pipeline commercial propose de
   * basculer d'une version à l'autre sur la carte : sans les deux textes déjà
   * prêts, chaque bascule serait un aller-retour en base, et l'aperçu montrerait
   * autre chose que ce que le moteur enverrait.
   */
  other: { variant: MessageVariant; subject: string | null; body: string } | null
}

/**
 * Une ligne de modèle, ses deux versions comprises.
 *
 * Les colonnes `*_contact` arrivent avec `20260814_modeles_variantes_contact` :
 * elles peuvent manquer sur une base qui n'a pas encore reçu la migration, d'où
 * l'optionalité, et d'où la lecture en `*` (cf. `lireModele`).
 */
interface TemplateRow {
  name?: string | null
  subject?: string | null
  subject_contact?: string | null
  body?: string | null
  body_contact?: string | null
}

/**
 * Lit un modèle avec ses deux versions.
 *
 * `select('*')` et NON la liste des colonnes : PostgREST fait échouer la requête
 * entière sur une colonne inconnue, et `body_contact` n'existe qu'après la
 * migration. Un déploiement de code qui la précède enverrait alors des messages
 * VIDES — silencieusement, `data` étant nul et `interpolate(null)` rendant ''.
 * Les trois tables tiennent en quelques colonnes ; tout prendre ne coûte rien.
 */
async function lireModele(sb: SupabaseClient, table: string, id: string): Promise<TemplateRow | null> {
  const { data } = await sb.from(table).select('*').eq('id', id).maybeSingle()
  return (data as TemplateRow | null) ?? null
}

/** Les deux écritures de chaque champ d'un modèle, dans l'ordre où on les juge. */
const paires = (row: TemplateRow | null) => [
  { company: row?.subject, contact: row?.subject_contact },
  { company: row?.body, contact: row?.body_contact },
]

/**
 * Le message d'une étape, modèle résolu et variables remplies.
 *
 * PARTAGÉ ENTRE L'ENVOI ET L'APERÇU, et c'est tout l'intérêt : deux chemins
 * distincts finiraient par diverger, et l'écart se découvrirait chez le
 * prospect. Un modèle choisi prime sur le message écrit dans l'étape — même
 * règle des deux côtés.
 *
 * C'est ici que se tranche laquelle des deux versions du modèle part : celle
 * qui nomme le contact quand on peut la tenir jusqu'au bout, sinon celle qui
 * s'adresse à l'entreprise (`pickVariant`). Le sac reste COMPLET pour
 * l'interpolation : un modèle sans version contact garde le droit de citer un
 * prénom dans son texte principal, et ce prénom doit se remplir.
 */
export async function renderStepMessage(
  sb: SupabaseClient,
  step: SequenceStep,
  vars: VarBag,
  forced?: MessageVariant | null,
): Promise<RenderedStepMessage> {
  /** Rend les deux versions d'un modèle, celle qui part en premier. */
  const rendu = (
    pairs: VariantPair[],
    source: string | null,
    avecObjet: boolean,
  ): RenderedStepMessage => {
    const [sujet, corps] = avecObjet ? pairs : [{ company: null, contact: null }, pairs[0]]
    const variant = pickVariant(avecObjet ? [sujet, corps] : [corps], vars, forced)
    const rendreDans = (v: MessageVariant) => ({
      subject: avecObjet ? interpolate(variantText(sujet, v), vars) : null,
      body: interpolate(variantText(corps, v), vars),
    })
    const autre = otherVariant(variant)
    const alt = rendreDans(autre)
    const principal = rendreDans(variant)
    return {
      ...principal,
      source,
      variant,
      // Deux versions identiques ne sont qu'une : le modèle n'a pas été doublé,
      // et proposer une bascule qui ne change rien ferait douter de l'écran.
      other:
        alt.body === principal.body && alt.subject === principal.subject
          ? null
          : { variant: autre, ...alt },
    }
  }

  if (step.kind === 'email') {
    if (!step.template) return { subject: null, body: '', source: null, variant: 'company', other: null }
    const row = await lireModele(sb, 'email_templates', step.template)
    return rendu(paires(row), row?.name ?? null, true)
  }

  if (step.kind === 'whatsapp' && step.template) {
    const row = await lireModele(sb, 'whatsapp_templates', step.template)
    return rendu([{ company: row?.body, contact: row?.body_contact }], row?.name ?? null, false)
  }

  if (step.kind === 'call' && step.script) {
    const row = await lireModele(sb, 'call_scripts', step.script)
    return rendu([{ company: row?.body, contact: row?.body_contact }], row?.name ?? null, false)
  }

  // Message libre écrit dans l'étape : un seul texte, donc pas de variation.
  return { subject: null, body: interpolate(step.message, vars), source: null, variant: 'company', other: null }
}

/**
 * Le texte BRUT d'une étape, variables non résolues.
 *
 * Sert au garde-fou de l'audit : on doit savoir si le message CITE
 * `{{company.audit_url}}` avant de l'interpoler, puisqu'après interpolation il
 * ne reste qu'une URL — impossible de distinguer un lien promis d'un lien
 * absent.
 *
 * Prend `vars` pour lire la version qui partira RÉELLEMENT. Sans ça, le garde
 * jugerait le texte entreprise d'un modèle dont c'est la version contact qui
 * part : il gèlerait une inscription dont le message ne promet rien, ou pire,
 * en laisserait passer une qui promet un audit inexistant.
 */
export async function stepRawText(
  sb: SupabaseClient,
  step: SequenceStep,
  vars: VarBag,
  forced?: MessageVariant | null,
): Promise<string> {
  if (step.kind === 'email' && step.template) {
    const row = await lireModele(sb, 'email_templates', step.template)
    const [sujet, corps] = paires(row)
    const variant = pickVariant([sujet, corps], vars, forced)
    return `${variantText(sujet, variant)}\n${variantText(corps, variant)}`
  }
  if (step.kind === 'whatsapp' && step.template) {
    const row = await lireModele(sb, 'whatsapp_templates', step.template)
    const corps = { company: row?.body, contact: row?.body_contact }
    return variantText(corps, pickVariant([corps], vars, forced))
  }
  if (step.kind === 'call' && step.script) {
    const row = await lireModele(sb, 'call_scripts', step.script)
    const corps = { company: row?.body, contact: row?.body_contact }
    return variantText(corps, pickVariant([corps], vars, forced))
  }
  return step.message ?? ''
}

/**
 * Cette étape promet-elle un audit que l'entreprise n'a pas ?
 *
 * Le lien EXISTE toujours depuis qu'on crée le jeton à la demande — donc son
 * absence ne signale plus rien. Ce qui compte est ce qu'il y a AU BOUT : sans
 * `entreprises_audit_site`, la page est la trame par défaut au nom de
 * l'entreprise, sans capture ni score ni constat la concernant. 192 des 295
 * entreprises qualifiées sont dans ce cas.
 *
 * Envoyer « voici l'audit de votre site » vers cette page-là est pire que de ne
 * rien envoyer : le prospect voit qu'on ne l'a pas regardé, et on ne peut pas
 * rattraper une première impression.
 */
export async function etapePromettUnAuditAbsent(
  sb: SupabaseClient,
  step: SequenceStep,
  entrepriseId: number | null,
  vars: VarBag,
  forced?: MessageVariant | null,
): Promise<boolean> {
  if (entrepriseId == null) return false
  const texte = await stepRawText(sb, step, vars, forced)
  if (!usedVariables(texte).includes('company.audit_url')) return false
  return !(await aDesMesuresAudit(sb, entrepriseId))
}

/**
 * Cette étape promet-elle une démo que l'entreprise n'a pas ?
 *
 * Le pendant exact du garde-fou de l'audit, et pour la même raison : le lien
 * est fabriqué à partir du site, donc son absence ne se voit pas dans le texte
 * interpolé — il ne reste qu'un trou.
 *
 * « Montrable » veut dire publié, ou marqué « Prêt » au tableau du
 * site-builder, dont l'intitulé est « Prêt à envoyer ». Un site resté en « À
 * faire » — « Prêt à créer » — n'a pas été travaillé : envoyer son aperçu à un
 * prospect vend contre soi.
 */
export async function etapePromettUneDemoAbsente(
  sb: SupabaseClient,
  step: SequenceStep,
  vars: VarBag,
  forced?: MessageVariant | null,
): Promise<boolean> {
  if (vars['company.demo_url']) return false
  const texte = await stepRawText(sb, step, vars, forced)
  return usedVariables(texte).includes('company.demo_url')
}

/**
 * Le sac de variables d'un vrai prospect, pour l'aperçu des messages.
 *
 * Passe par `resolveEntities`, donc l'aperçu montre EXACTEMENT ce que l'envoi
 * produira — y compris les liens du rapport et du site démo, et les variables
 * qui resteront vides. Un aperçu calculé autrement mentirait tôt ou tard.
 */
export async function resolveMessageVars(ctx: RunContext): Promise<VarBag> {
  const sb = getServiceClient()
  const ent = await resolveEntities(sb, ctx)
  return ent.vars
}

/**
 * Rendu d'un texte de message.
 *
 * Délègue à `interpolateVars`, qui résout d'abord les anciennes écritures
 * (`{{company_name}}`, `{{prénom}}`…) vers leur clé canonique. Sans ce
 * détour, un modèle rédigé dans la messagerie et choisi dans une étape de
 * séquence partait au prospect avec ses variables vidées.
 */
export function interpolate(text: string | null | undefined, vars: VarBag): string {
  return interpolateVars(text, vars)
}

/** Signature du CRM (mono-équipe) : la plus récemment mise à jour. */
async function getEngineSignature(sb: SupabaseClient): Promise<SignatureData | null> {
  try {
    const { data } = await sb
      .from('email_signature_settings')
      .select('first_name,last_name,job_title,company,email,phone,website,linkedin_url,accent_color')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as SignatureData | null) ?? null
  } catch {
    return null
  }
}

// ── Envoi d'email (Resend) ─────────────────────────────────────────────────
export async function sendEngineEmail(
  sb: SupabaseClient,
  opts: {
    to: string
    toName?: string | null
    subject: string
    text: string
    contactId?: string | null
    entrepriseId?: number | null
    opportuniteId?: string | null
    type?: string
    /** Séquence à l'origine de l'envoi — sert aux plafonds et aux stats par séquence. */
    automationId?: string | null
    enrollmentId?: string | null
    /** Pièces jointes récupérées par URL (ex : PDF d'audit). */
    attachmentUrls?: { filename: string; url: string }[]
  },
): Promise<{ ok: boolean; error?: string; blocked?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY non configuré' }

  // Phase de test : on n'appelle même pas Resend pour un destinataire hors
  // liste blanche. L'envoi est tout de même journalisé — avec son motif — pour
  // qu'on voie exactement ce qui SERAIT parti.
  const verdict = await allowRecipient(sb, opts.to)
  if (!verdict.allowed) {
    try {
      await sb.from('email_logs').insert({
        contact_id: opts.contactId ?? null,
        entreprise_id: opts.entrepriseId ?? null,
        opportunite_id: opts.opportuniteId ?? null,
        automation_id: opts.automationId ?? null,
        enrollment_id: opts.enrollmentId ?? null,
        to_email: opts.to,
        to_name: opts.toName ?? null,
        subject: opts.subject,
        body_text: opts.text,
        type: opts.type ?? 'automation',
        status: 'failed',
        blocked_reason: verdict.reason,
        error_message: BLOCK_LABEL[verdict.reason ?? 'mode_test'],
      })
    } catch {
      /* le log ne doit pas bloquer */
    }
    return { ok: false, blocked: true, error: verdict.reason }
  }

  // Rendu identique aux envois manuels : HTML minimal + signature simple.
  const signature = await getEngineSignature(sb)
  const html = wrapEmailBodyHtml(opts.text, signature)
  const sigText = signature ? buildSignatureText(signature) : ''
  const text = sigText ? `${opts.text}\n\n${sigText}` : opts.text

  let fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  try {
    const { data: conn } = await sb.from('automation_connections').select('config').eq('id', 'resend').maybeSingle()
    const cfg = (conn?.config ?? {}) as Record<string, string>
    if (cfg.from_email) fromEmail = cfg.from_email
  } catch {
    /* utilise l'env */
  }

  const attachments: { filename: string; content: string }[] = []
  for (const att of opts.attachmentUrls ?? []) {
    try {
      const res = await fetch(att.url)
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        attachments.push({ filename: att.filename, content: btoa(binary) })
      }
    } catch {
      // pièce jointe indisponible : l'email part sans elle
    }
  }

  const resend = new Resend(apiKey)
  let status: 'sent' | 'failed' = 'sent'
  let errorMessage: string | undefined
  let resendId: string | undefined

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: opts.toName ? `${opts.toName} <${opts.to}>` : opts.to,
      subject: opts.subject,
      html,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
    if (result.error) {
      status = 'failed'
      errorMessage = result.error.message
    } else {
      resendId = result.data?.id
    }
  } catch (err) {
    status = 'failed'
    errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'
  }

  try {
    await sb.from('email_logs').insert({
      resend_id: resendId ?? null,
      contact_id: opts.contactId ?? null,
      entreprise_id: opts.entrepriseId ?? null,
      opportunite_id: opts.opportuniteId ?? null,
      automation_id: opts.automationId ?? null,
      enrollment_id: opts.enrollmentId ?? null,
      to_email: opts.to,
      to_name: opts.toName ?? null,
      from_email: fromEmail,
      subject: opts.subject,
      body_html: html,
      body_text: text,
      type: opts.type ?? 'automation',
      status,
      error_message: errorMessage ?? null,
    })
  } catch {
    /* le log ne doit pas bloquer */
  }

  // L'envoi a réellement eu lieu : on l'inscrit au compteur de l'adresse ET de
  // son domaine. C'est ce qui ouvre la voie aux autres adresses du domaine
  // (première touche) et ce qui donne son dénominateur au taux de rebond.
  if (status === 'sent') {
    try {
      await recordSend(sb, opts.to)
    } catch {
      /* un compteur manqué ne doit pas faire échouer un envoi réussi */
    }
  }

  return status === 'sent' ? { ok: true } : { ok: false, error: errorMessage }
}

// ── Exécution d'une action de workflow ─────────────────────────────────────
async function executeAction(
  sb: SupabaseClient,
  node: WorkflowNode,
  ctx: RunContext,
  ent: ResolvedEntities,
  automationId: string,
): Promise<TraceEntry> {
  const at = new Date().toISOString()
  const cfg = node.config
  const base = { node_id: node.id, type: node.type, at }

  try {
    switch (node.type) {
      case 'act.send_email': {
        if (!ent.contactEmail) return { ...base, status: 'skipped', message: 'Aucun email destinataire' }
        const tpl = await lireModele(sb, 'email_templates', cfg.template as string)
        if (!tpl) return { ...base, status: 'error', message: 'Template introuvable' }
        // Même arbitrage que dans les séquences : le modèle porte deux versions,
        // c'est le prospect qui décide laquelle part.
        const [sujet, corps] = paires(tpl)
        const variant = pickVariant([sujet, corps], ent.vars)
        const subject = interpolate(variantText(sujet, variant), ent.vars)
        const text = interpolate(variantText(corps, variant), ent.vars)
        const r = await sendEngineEmail(sb, {
          to: ent.contactEmail,
          toName: ent.contactName,
          subject,
          text,
          contactId: ent.contactId,
          entrepriseId: ent.entrepriseId,
          opportuniteId: ctx.opportunite_id ?? null,
          type: 'workflow',
        })
        return r.ok
          ? { ...base, status: 'ok', message: `Email envoyé à ${ent.contactEmail}` }
          : { ...base, status: 'error', message: r.error }
      }
      case 'act.move_stage': {
        if (!ctx.opportunite_id) return { ...base, status: 'skipped', message: 'Pas d’opportunité' }
        await sb.from('opportunites').update({ stage_id: Number(cfg.stage) }).eq('id', ctx.opportunite_id)
        return { ...base, status: 'ok', message: 'Opportunité déplacée' }
      }
      case 'act.add_tag': {
        if (!ctx.opportunite_id) return { ...base, status: 'skipped' }
        const { data: tag } = await sb.from('crm_tags').select('name').eq('id', cfg.tag as string).maybeSingle()
        const { data: opp } = await sb.from('opportunites').select('tags').eq('id', ctx.opportunite_id).maybeSingle()
        const existing = (opp?.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean)
        if (tag?.name && !existing.includes(tag.name)) existing.push(tag.name)
        await sb.from('opportunites').update({ tags: existing.join(', ') }).eq('id', ctx.opportunite_id)
        return { ...base, status: 'ok', message: `Tag « ${tag?.name ?? ''} » ajouté` }
      }
      case 'act.create_task': {
        await sb.from('opportunite_tasks').insert({
          opportunite_id: ctx.opportunite_id ?? null,
          entreprise_id: ent.entrepriseId ?? null,
          titre: interpolate((cfg.title as string) || node.title, ent.vars),
          type: (cfg.task_type as string) ?? 'tt_admin',
          statut: 'todo',
          due_date: new Date(Date.now() + Number(cfg.due_days ?? 2) * 86400000).toISOString(),
          workflow_id: automationId,
        })
        return { ...base, status: 'ok', message: 'Tâche créée' }
      }
      case 'act.notify': {
        const { data: conn } = await sb
          .from('automation_connections')
          .select('config,status')
          .eq('id', 'slack')
          .maybeSingle()
        const url = (conn?.config as Record<string, string>)?.webhook_url
        if (!url || conn?.status !== 'on')
          return { ...base, status: 'skipped', message: 'Slack non configuré' }
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: interpolate((cfg.message as string) || node.title, ent.vars) }),
        })
        return { ...base, status: 'ok', message: 'Notification Slack envoyée' }
      }
      case 'act.webhook': {
        const url = cfg.url as string
        if (!url) return { ...base, status: 'skipped', message: 'URL manquante' }
        await fetch(url, {
          method: (cfg.method as string) || 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event: ctx.event, context: ctx }),
        })
        return { ...base, status: 'ok', message: 'Webhook appelé' }
      }
      case 'act.assign_owner':
        return { ...base, status: 'ok', message: 'Attribution enregistrée (suivi équipe)' }
      case 'act.ai_score':
        return { ...base, status: 'ok', message: 'Score IA — étape journalisée' }
      case 'act.task_call':
      case 'act.task_whatsapp':
      case 'act.task_linkedin': {
        const kind = node.type === 'act.task_call' ? 'call' : node.type === 'act.task_whatsapp' ? 'whatsapp' : 'linkedin'
        let message = ''
        if (kind === 'whatsapp' && cfg.template) {
          const wt = await lireModele(sb, 'whatsapp_templates', cfg.template as string)
          const corps = { company: wt?.body, contact: wt?.body_contact }
          message = interpolate(variantText(corps, pickVariant([corps], ent.vars)), ent.vars)
        } else if (kind === 'linkedin') {
          message = interpolate(cfg.message as string, ent.vars)
        }
        let scriptName: string | undefined
        if (kind === 'call' && cfg.script) {
          const sc = await lireModele(sb, 'call_scripts', cfg.script as string)
          scriptName = sc?.name ?? undefined
          const corps = { company: sc?.body, contact: sc?.body_contact }
          // Le corps passe par `interpolate`, comme dans les séquences. Il en
          // sortait BRUT ici : l'agent lisait « je suis bien avec
          // {{company.name}} ? » à l'écran, en clair, pendant qu'il composait.
          message = interpolate(variantText(corps, pickVariant([corps], ent.vars)), ent.vars)
        }
        await sb.from('prospection_tasks').insert({
          kind,
          contact_id: ent.contactId,
          entreprise_id: ent.entrepriseId,
          opportunite_id: ctx.opportunite_id ?? null,
          automation_id: automationId,
          title: node.title,
          payload: { message, script: message, scriptName, phone: ent.contactPhone, linkedin: ent.contactLinkedin },
        })
        return { ...base, status: 'ok', message: `Tâche ${kind} ajoutée au démarchage` }
      }
      default:
        return { ...base, status: 'skipped', message: 'Action non implémentée' }
    }
  } catch (err) {
    return { ...base, status: 'error', message: err instanceof Error ? err.message : 'Erreur' }
  }
}

// ── Évaluation d'une condition ─────────────────────────────────────────────
async function evalCondition(sb: SupabaseClient, node: WorkflowNode, ctx: RunContext): Promise<boolean> {
  if (node.type === 'cnd.if_tag') {
    if (!ctx.opportunite_id) return false
    const { data: tag } = await sb.from('crm_tags').select('name').eq('id', node.config.tag as string).maybeSingle()
    const { data: opp } = await sb.from('opportunites').select('tags').eq('id', ctx.opportunite_id).maybeSingle()
    return !!tag?.name && (opp?.tags ?? '').includes(tag.name)
  }
  // cnd.if_field
  if (!ctx.opportunite_id) return false
  const field = node.config.field as string
  const op = (node.config.op as string) || 'eq'
  const raw = node.config.value
  if (!field) return false
  const { data: opp } = await sb.from('opportunites').select('*').eq('id', ctx.opportunite_id).maybeSingle()
  const actual = (opp as Record<string, unknown> | null)?.[field]
  const numA = Number(actual)
  const numB = Number(raw)
  const bothNum = !Number.isNaN(numA) && !Number.isNaN(numB)
  switch (op) {
    case 'eq': return String(actual) === String(raw)
    case 'neq': return String(actual) !== String(raw)
    case 'gt': return bothNum && numA > numB
    case 'gte': return bothNum && numA >= numB
    case 'lt': return bothNum && numA < numB
    case 'lte': return bothNum && numA <= numB
    case 'contains': return String(actual ?? '').toLowerCase().includes(String(raw ?? '').toLowerCase())
    case 'isset': return actual != null && actual !== ''
    case 'isnotset': return actual == null || actual === ''
    default: return false
  }
}

function waitMs(cfg: Record<string, unknown>): number {
  const amount = Number(cfg.amount ?? 1)
  const unit = (cfg.unit as string) || 'd'
  const mult = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000
  return Math.max(0, amount) * mult
}

// ── Exécution d'un workflow ────────────────────────────────────────────────
export async function runWorkflowAutomation(
  automation: Automation,
  ctx: RunContext,
  opts: { isTest?: boolean; runId?: string; startNodeId?: string | null } = {},
): Promise<{ runId: string }> {
  const sb = getServiceClient()
  const def = asWorkflow(automation.definition)
  const ent = await resolveEntities(sb, ctx)

  let runId = opts.runId
  let trace: TraceEntry[] = []
  if (!runId) {
    const { data: run } = await sb
      .from('automation_runs')
      .insert({
        automation_id: automation.id,
        status: 'running',
        trigger_type: automation.trigger_type,
        context: ctx as Record<string, unknown>,
        is_test: !!opts.isTest,
      })
      .select('id')
      .single()
    runId = run!.id as string
  } else {
    const { data: run } = await sb.from('automation_runs').select('trace').eq('id', runId).maybeSingle()
    trace = (run?.trace as TraceEntry[]) ?? []
  }

  let nodeId: string | null = opts.startNodeId ?? def.layout.root
  let guard = 0
  let finalStatus: 'success' | 'error' = 'success'

  while (nodeId && guard++ < 60) {
    const node = findNode(def, nodeId)
    if (!node) break

    if (node.cat === 'trigger') {
      nodeId = getSlotChild(def, nodeId, 'next')
      continue
    }
    if (node.type === 'flow.exit') break

    if (isCondType(node.type)) {
      const result = await evalCondition(sb, node, ctx)
      trace.push({ node_id: node.id, type: node.type, status: 'ok', message: result ? 'OUI' : 'NON', at: new Date().toISOString() })
      nodeId = getSlotChild(def, nodeId, result ? 'yes' : 'no')
      continue
    }

    if (node.type === 'flow.wait') {
      const nextId = getSlotChild(def, nodeId, 'next')
      if (nextId) {
        await sb.from('automation_jobs').insert({
          automation_id: automation.id,
          run_id: runId,
          job_type: 'workflow_node',
          payload: { node_id: nextId, context: ctx },
          run_at: new Date(Date.now() + waitMs(node.config)).toISOString(),
        })
      }
      trace.push({ node_id: node.id, type: node.type, status: 'ok', message: 'En attente', at: new Date().toISOString() })
      await sb.from('automation_runs').update({ trace }).eq('id', runId)
      return { runId } // la suite reprendra via le ticker
    }

    const entry = await executeAction(sb, node, ctx, ent, automation.id)
    trace.push(entry)
    if (entry.status === 'error') finalStatus = 'error'
    nodeId = getSlotChild(def, nodeId, 'next')
  }

  await sb.from('automation_runs').update({ status: finalStatus, trace, finished_at: new Date().toISOString() }).eq('id', runId)
  await sb
    .from('automations')
    .update({ runs_7d: (automation.runs_7d ?? 0) + 1, last_run_at: new Date().toISOString() })
    .eq('id', automation.id)
  return { runId }
}

// ── Tâches manuelles : à qui elles reviennent ──────────────────────────────
/**
 * WhatsApp, LinkedIn et appel ne partent jamais tout seuls : la séquence
 * prépare le message, le CRM le pose dans la file de la bonne personne. La
 * règle (propriétaire de préférence / strictement le propriétaire / tout à
 * l'admin) est réglée une fois pour toutes dans le régulateur, et l'admin sert
 * toujours de filet de sécurité.
 */
export async function assignManualTask(
  sb: SupabaseClient,
  target: { entrepriseId: number | null; opportuniteId: string | null; createdBy: string | null },
): Promise<RoutingDecision> {
  const settings = await loadRegulatorSettings(sb)
  const [adminId, loads, unavailable] = await Promise.all([
    resolveAdminId(sb, settings),
    loadTaskLoads(sb),
    loadUnavailableAgents(sb),
  ])

  let ownerId: string | null = null
  if (target.entrepriseId != null) {
    const { data } = await sb.from('entreprises').select('owner_id').eq('id', target.entrepriseId).maybeSingle()
    ownerId = (data?.owner_id as string | null) ?? null
  }
  let opportunityOwnerId: string | null = null
  if (target.opportuniteId) {
    const { data } = await sb.from('opportunites').select('owner_id').eq('id', target.opportuniteId).maybeSingle()
    opportunityOwnerId = (data?.owner_id as string | null) ?? null
  }

  return routeTask(
    { ownerId, createdBy: target.createdBy, opportunityOwnerId },
    {
      mode: settings.taskRoutingMode,
      maxPerAgent: settings.taskMaxPerAgent,
      adminId,
      loads,
      unavailable,
    },
  )
}

// ── Séquences : inscription + avancement ───────────────────────────────────
function stepIsManual(step: SequenceStep): boolean {
  return step.kind === 'call' || step.kind === 'whatsapp' || step.kind === 'linkedin' || step.kind === 'task'
}

/**
 * Pose la tâche d'une étape manuelle — UNE SEULE, quoi qu'il arrive.
 *
 * POURQUOI UN GARDE ICI
 * Deux chemins traitent la même étape à la même seconde. Le geste de l'agent
 * (« il a répondu », « fait ») avance l'inscription puis traite l'étape
 * suivante tout de suite (cf. `traiterEtapeCourante`) : il pose d'abord
 * `next_run_at = maintenant`, et ne le remet à `null` qu'APRÈS avoir créé la
 * tâche — soit deux à quatre secondes plus tard, le temps de lire le modèle,
 * l'audit, la démo et de choisir l'attributaire. Le ticker, qui passe toutes
 * les minutes, voit l'inscription due pendant exactement cette fenêtre et
 * traite la même étape en parallèle.
 *
 * L'agent se retrouvait alors avec le même WhatsApp à envoyer deux fois au
 * même prospect, et l'affaire apparaissait en double dans sa file de démarchage
 * — deux tâches, donc deux cartes, pour une seule opportunité.
 *
 * LE GARDE EST DOUBLE, ET C'EST VOULU
 * La lecture couvre le cas courant — l'étape a déjà sa tâche, on ne réécrit
 * rien. L'index unique partiel `prospection_tasks_enrollment_step_uniq`
 * (cf. `sql/20260819_tache_unique_par_etape.sql`) tranche la vraie course :
 * deux inserts à la même milliseconde, où aucun des deux n'a rien pu lire.
 * Une tâche annulée (`skipped`) sort de l'index : un demi-tour de séquence
 * peut re-poser une étape dont la tâche avait été retirée.
 */
async function poserTacheDEtape(
  sb: SupabaseClient,
  enrollmentId: string,
  stepId: string | undefined,
  tache: Record<string, unknown>,
): Promise<void> {
  if (stepId) {
    const { data: deja } = await sb
      .from('prospection_tasks')
      .select('id')
      .eq('enrollment_id', enrollmentId)
      .eq('step_id', stepId)
      .neq('status', 'skipped')
      .limit(1)
    if ((deja ?? []).length > 0) return
  }
  const { error } = await sb.from('prospection_tasks').insert(tache)
  // 23505 : l'autre chemin a gagné la course. C'est le résultat recherché — une
  // seule tâche existe —, donc rien à signaler.
  if (error && error.code !== '23505') {
    console.warn(
      `[automations] tâche d'étape non créée pour l'inscription ${enrollmentId} (étape ${stepId ?? '?'}) : ${error.message}`,
    )
  }
}

export async function enrollInSequence(
  automation: Automation,
  ctx: RunContext,
  opts: { createdBy?: string | null } = {},
): Promise<{ enrolled: boolean; enrollmentId: string | null }> {
  const sb = getServiceClient()
  const ent = await resolveEntities(sb, ctx)

  // Ce qu'il faut pour démarcher, c'est un CANAL, pas une fiche contact.
  //
  // L'ancienne garde exigeait `contactId` : 70 des 275 entreprises qualifiées
  // n'ont aucune ligne `contacts` et étaient donc inenrôlables en silence — or
  // c'est précisément le segment « sans e-mail, un mobile sur la fiche
  // entreprise », celui de la séquence WhatsApp. On refuse maintenant sur le
  // seul critère qui compte : personne à qui écrire NI appeler.
  if (!ent.contactEmail && !ent.contactPhone) return { enrolled: false, enrollmentId: null }
  if (ent.entrepriseId == null && !ent.contactId) return { enrolled: false, enrollmentId: null }

  // Éviter les doublons actifs. Sur une entreprise sans contact, l'unicité se
  // joue sur l'entreprise — sinon un second clic ouvrirait une deuxième
  // inscription et le prospect recevrait tout en double.
  const dedupe = sb
    .from('sequence_enrollments')
    .select('id')
    .eq('automation_id', automation.id)
    .in('status', ['active', 'paused'])
  const { data: existing } = await (ent.contactId
    ? dedupe.eq('contact_id', ent.contactId)
    : dedupe.eq('entreprise_id', ent.entrepriseId as number)
  ).maybeSingle()
  if (existing) return { enrolled: false, enrollmentId: existing.id }

  const { data: inserted } = await sb
    .from('sequence_enrollments')
    .insert({
      automation_id: automation.id,
      contact_id: ent.contactId,
      opportunite_id: ctx.opportunite_id ?? null,
      entreprise_id: ent.entrepriseId,
      current_step: 0,
      status: 'active',
      next_run_at: new Date().toISOString(),
      vars: ent.vars,
      created_by: opts.createdBy ?? null,
    })
    .select('id')
    .single()
  return { enrolled: true, enrollmentId: inserted?.id ?? null }
}

/**
 * Exécute l'étape courante d'une inscription.
 *
 * L'HEURE n'est plus décidée ici : pour un email, c'est le régulateur qui
 * choisit le créneau (cf. `regulator.ts`) et le ticker n'appelle cette fonction
 * que lorsque l'heure retenue est atteinte. Les étapes manuelles, elles, ne
 * passent pas par la file : elles créent une tâche tout de suite.
 */
export async function processSequenceEnrollment(enrollment: SequenceEnrollment): Promise<void> {
  const sb = getServiceClient()
  const { data: autoRow } = await sb.from('automations').select('*').eq('id', enrollment.automation_id).maybeSingle()
  const automation = autoRow as Automation | null
  if (!automation || automation.status !== 'on') {
    // La séquence est en pause : on gèle l'inscription sans rien perdre, et on
    // dit pourquoi — la file l'affiche au lieu de la faire disparaître.
    await sb
      .from('sequence_enrollments')
      .update({ send_at: null, hold_reason: automation ? 'sequence_paused' : null })
      .eq('id', enrollment.id)
    return
  }
  const def = (automation.definition as SequenceDefinition) || { steps: [] }
  const steps = Array.isArray(def.steps) ? def.steps : []
  const idx = enrollment.current_step

  if (idx >= steps.length) {
    await sb
      .from('sequence_enrollments')
      .update({ status: 'finished', next_run_at: null, finished_at: new Date().toISOString() })
      .eq('id', enrollment.id)
    return
  }

  // Étape annulée à la main depuis la vue semaine : on la franchit sans rien
  // envoyer. L'inscription continue sa route — annuler un envoi n'a jamais
  // voulu dire sortir le prospect de la séquence.
  if (readSkippedSteps(enrollment.vars).includes(idx)) {
    await avancerApres(sb, enrollment, steps, idx)
    return
  }

  const step = steps[idx]

  // Une étape d'attente ne s'adresse à personne : elle n'a besoin ni du contact,
  // ni de l'audit, ni du site démo. La traiter en premier évite une demi-douzaine
  // de requêtes par tick — et depuis que les séquences WhatsApp comptent deux
  // attentes chacune, ce n'est plus un cas marginal.
  if (step.kind === 'wait') {
    await processWaitStep(sb, enrollment, steps, idx, step)
    return
  }

  const ctx: RunContext = {
    contact_id: enrollment.contact_id,
    opportunite_id: enrollment.opportunite_id,
    entreprise_id: enrollment.entreprise_id,
  }
  const ent = await resolveEntities(sb, ctx)

  // La version épinglée sur la ligne du pipeline commercial, quand quelqu'un en
  // a choisi une. C'est le seul moyen de la faire respecter par un e-mail : il
  // part tout seul, par le régulateur, sans personne devant l'écran.
  const forced = readVariant(enrollment.vars)

  // Le message promet l'audit, l'entreprise n'a rien à montrer : on GÈLE au lieu
  // d'envoyer un lien vers une page générique à son nom. Vaut pour l'e-mail
  // comme pour les tâches manuelles — la séquence WhatsApp cite le rapport elle
  // aussi, et un lien creux se paie plus cher encore dans une conversation.
  if (await etapePromettUnAuditAbsent(sb, step, ent.entrepriseId, ent.vars, forced)) {
    await holdForMissingAuditLink(sb, enrollment.id)
    return
  }

  // Même règle pour la démo : `company.demo_url` s'interpolait en vide pour les
  // 295 entreprises, aucun site du parc n'étant publié.
  if (await etapePromettUneDemoAbsente(sb, step, ent.vars, forced)) {
    await holdForMissingDemo(sb, enrollment.id)
    return
  }

  if (step.kind === 'email') {
    // Aucun destinataire : l'étape ne s'exécute PAS et la séquence n'avance pas.
    // Avant, l'inscription franchissait l'étape email en silence — le prospect
    // « passait » un email qui n'était jamais parti. Elle attend désormais qu'on
    // saisisse l'adresse ou qu'on saute l'étape depuis le pipeline commercial.
    if (!ent.contactEmail) {
      await holdForMissingEmail(sb, enrollment.id)
      return
    }

    // Déjà retenue : on ne prépare plus rien tant que le motif tient. La
    // première tentative a préparé l'envoi et l'a journalisé — on veut pouvoir
    // lire ce qui SERAIT parti — mais la re-journaliser à chaque tick noierait
    // le journal.
    if (HELD_REASONS.has(enrollment.hold_reason ?? '')) {
      const verdict = await allowRecipient(sb, ent.contactEmail)
      if (!verdict.allowed) return
    }

    let sentAt: string | null = null
    if (ent.contactEmail && step.template) {
      const tpl = await renderStepMessage(sb, step, ent.vars, forced)
      if (tpl.source !== null || tpl.body) {
        const text = tpl.body
        const result = await sendEngineEmail(sb, {
          to: ent.contactEmail,
          toName: ent.contactName,
          subject: tpl.subject ?? '',
          text,
          contactId: ent.contactId,
          entrepriseId: ent.entrepriseId,
          opportuniteId: enrollment.opportunite_id,
          type: 'sequence',
          automationId: automation.id,
          enrollmentId: enrollment.id,
          attachmentUrls:
            // `auditPdfUrl`, jamais `auditUrl` : depuis que ce dernier peut
            // porter le rapport web, les confondre attacherait une page HTML
            // sous le nom `audit.pdf`.
            //
            // ⚠️ `audits.pdf_url` n'est écrit par AUCUN code du dépôt :
            // `savePdfUrl` (`src/utils/auditApi.ts`) n'a pas d'appelant, et
            // l'export PDF de l'éditeur passe par l'impression du navigateur
            // sans rien téléverser. Une étape « joindre l'audit » part donc
            // aujourd'hui SANS pièce jointe. Le message reste utile — il porte
            // `{{lien_audit}}`, qui pointe le rapport web —, mais l'opérateur
            // doit l'apprendre autrement que par le silence : voir la trace
            // ci-dessous.
            step.attachAudit && ent.auditPdfUrl
              ? [{ filename: 'audit.pdf', url: ent.auditPdfUrl }]
              : undefined,
        })
        // Retenu par un garde : l'inscription est GELÉE, pas franchie. Sur un
        // vrai prospect, avancer d'une étape sans avoir rien envoyé lui ferait
        // perdre un email pour de bon — et sa carte changerait de colonne dans
        // le pipeline commercial sans qu'il se soit rien passé.
        if (result.blocked) {
          if (result.error === 'email_invalid' || result.error === 'email_suppressed') {
            await holdForInvalidEmail(sb, enrollment.id)
          } else if (result.error === 'email_unverified') {
            await holdForPendingVerification(sb, enrollment.id)
          } else {
            await holdForTestPhase(sb, enrollment.id)
          }
          return
        }
        if (result.ok) sentAt = new Date().toISOString()

        // Une pièce jointe demandée et absente ne doit pas passer inaperçue.
        // Le message est parti — il porte le lien du rapport, il reste utile —
        // mais l'opérateur qui a coché « joindre l'audit » croit avoir joint
        // quelque chose. Un envoi silencieusement amputé se découvre en
        // rendez-vous, ce qui est le pire moment.
        if (result.ok && step.attachAudit && !ent.auditPdfUrl) {
          console.warn(
            `[automations] audit non joint (aucun PDF pour l'entreprise ${ent.entrepriseId}) — ` +
              `le message part avec le lien du rapport seul.`,
          )
        }
      }
    }
    await sb
      .from('sequence_enrollments')
      .update({ send_at: null, hold_reason: null, ...(sentAt ? { last_email_at: sentAt } : {}) })
      .eq('id', enrollment.id)
    await avancerApres(sb, enrollment, steps, idx)
  } else if (stepIsManual(step)) {
    // Le corps d'un script d'appel ne passait PAS par `interpolate` : l'agent
    // lisait « Bonjour, je suis bien avec {{company.name}} ? » à l'écran, en
    // clair. `renderStepMessage` traite les trois canaux de la même façon, et
    // c'est le même code que l'aperçu du builder — les deux ne peuvent plus
    // diverger.
    const rendu = await renderStepMessage(sb, step, ent.vars, forced)
    const message = rendu.body
    // UNE ÉTAPE SANS MESSAGE NE POSE PAS DE TÂCHE.
    // `renderStepMessage` retombe sur `interpolate(step.message)`, qui vaut `''`
    // quand l'étape n'a ni modèle ni texte. Le builder laisse enregistrer ça, et
    // c'est arrivé : la branche « sans réponse » de « WhatsApp seul — site
    // direct » porte une étape WhatsApp vide — c'est-à-dire précisément le
    // chemin qu'emprunte la majorité des prospects. Poser la tâche quand même
    // mettrait l'agent devant un écran blanc au moment d'ouvrir WhatsApp, et ce
    // silence se lirait comme une panne de l'application plutôt que comme un
    // modèle oublié. On gèle : l'inscription attend qu'on écrive le message et
    // repart d'elle-même à la relecture suivante.
    if (!message.trim()) {
      await holdForEmptyMessage(sb, enrollment.id)
      return
    }
    const scriptName = rendu.source ?? undefined
    // À qui revient la tâche : propriétaire du contact, celui qui a lancé la
    // séquence, puis l'admin — selon la règle d'attribution du régulateur.
    const routing = await assignManualTask(sb, {
      entrepriseId: ent.entrepriseId,
      opportuniteId: enrollment.opportunite_id,
      createdBy: enrollment.created_by ?? null,
    })
    await poserTacheDEtape(sb, enrollment.id, step.id, {
      kind: step.kind === 'task' ? 'linkedin' : step.kind,
      contact_id: ent.contactId,
      entreprise_id: ent.entrepriseId,
      opportunite_id: enrollment.opportunite_id,
      automation_id: automation.id,
      enrollment_id: enrollment.id,
      step_id: step.id,
      title: `${automation.name} — étape ${idx + 1}`,
      assignee_id: routing.assigneeId,
      routing_reason: routing.reason,
      payload: {
        message,
        script: message,
        scriptName,
        phone: ent.contactPhone,
        linkedin: ent.contactLinkedin,
        audit_url: ent.auditUrl,
        demo_url: ent.demoUrl,
        // Les DEUX versions voyagent avec la tâche : la carte du pipeline
        // propose de basculer de l'une à l'autre juste avant d'ouvrir WhatsApp,
        // et c'est le seul moment où quelqu'un regarde. Les recalculer au clic
        // voudrait dire relire modèle + variables depuis le navigateur, avec le
        // risque d'afficher autre chose que ce que le moteur a préparé.
        variant: rendu.variant,
        variantAlt: rendu.other ? { variant: rendu.other.variant, message: rendu.other.body } : null,
      },
    })
    // l'inscription attend que l'humain ait fait le geste
    await sb
      .from('sequence_enrollments')
      .update({ next_run_at: null, send_at: null, hold_reason: null })
      .eq('id', enrollment.id)
  } else {
    await avancerApres(sb, enrollment, steps, idx)
  }
}

/**
 * Étape d'attente : soit on laisse courir les jours, soit on attend un humain.
 *
 * LE MODE `reply` EST LE CŒUR D'UNE SÉQUENCE WHATSAPP
 * Le premier message ne fait que vérifier qu'on parle bien à la bonne
 * entreprise. Envoyer le site sans avoir eu de réponse, c'est écrire deux fois
 * dans le vide — et sur WhatsApp, deux messages sans réponse mènent au blocage.
 * L'inscription se gare donc jusqu'à ce que quelqu'un déclare la réponse.
 */
async function processWaitStep(
  sb: SupabaseClient,
  enrollment: SequenceEnrollment,
  steps: SequenceStep[],
  idx: number,
  step: SequenceStep,
): Promise<void> {
  if (step.waitMode !== 'reply') {
    await avancerApres(sb, enrollment, steps, idx)
    return
  }

  const timeoutDays = Number(step.replyTimeoutDays) || 0
  const dejaRepondu = Boolean(readReplies(enrollment.vars)[String(idx)])
  // Déjà garée et pourtant réveillée par le ticker : le délai de relance est
  // échu et personne n'a répondu. On avance quand même — c'est exactement ce
  // que « relancer au bout de n jours » veut dire.
  const relanceEchue = enrollment.hold_reason === 'awaiting_reply' && timeoutDays > 0

  if (dejaRepondu || relanceEchue) {
    await avancerApres(sb, enrollment, steps, idx, { reanchor: true })
    return
  }

  // Sans délai de relance, `next_run_at` reste nul : l'inscription sort de la
  // file du ticker au lieu d'y revenir chaque minute pour ne rien faire, ce qui
  // affamerait les inscriptions réellement envoyables.
  await sb
    .from('sequence_enrollments')
    .update({
      send_at: null,
      hold_reason: 'awaiting_reply',
      next_run_at: timeoutDays > 0 ? new Date(Date.now() + timeoutDays * DAY_MS).toISOString() : null,
    })
    .eq('id', enrollment.id)
}

/**
 * Combien de temps une inscription bloquée faute d'adresse dort avant d'être
 * réexaminée. Sans ce report, elle resterait en tête de la file des « dues » et
 * finirait par affamer les inscriptions réellement envoyables.
 */
export const NO_EMAIL_RETRY_MS = 2 * 3_600_000

/**
 * Motifs qui gèlent une étape email. Tant que l'un d'eux tient, l'inscription
 * repasse dans le ticker sans qu'on prépare quoi que ce soit.
 */
const HELD_REASONS: ReadonlySet<string> = new Set([
  'test_hold',
  'email_invalid',
  'email_pending',
])

/**
 * Gèle l'étape email pendant la phase de test, sans faire avancer l'inscription.
 *
 * `next_run_at` n'est PAS repoussé : l'inscription reste due, donc visible dans
 * le régulateur et dans le pipeline commercial avec son motif. Couper la phase
 * de test — ou ajouter l'adresse à la liste — la fait repartir au tick suivant,
 * sans réveil manuel.
 */
export async function holdForTestPhase(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  await sb
    .from('sequence_enrollments')
    .update({ send_at: null, hold_reason: 'test_hold' })
    .eq('id', enrollmentId)
}

/** Gèle l'étape email d'une inscription faute de destinataire, sans la faire avancer. */
export async function holdForMissingEmail(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  await sb
    .from('sequence_enrollments')
    .update({
      send_at: null,
      hold_reason: 'no_email',
      next_run_at: new Date(Date.now() + NO_EMAIL_RETRY_MS).toISOString(),
    })
    .eq('id', enrollmentId)
}

/**
 * Gèle l'étape dont le message promet un audit que l'entreprise n'a pas.
 *
 * Même mécanique que « sans email » : l'inscription n'est pas perdue, elle
 * attend un geste — lancer l'audit du site, ou retirer la variable du modèle.
 * `next_run_at` est repoussé de deux heures parce que rien ne changera d'ici là
 * sans intervention humaine, et repasser dessus à chaque minute ne ferait que
 * bruiter le journal.
 */
export async function holdForMissingAuditLink(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  await sb
    .from('sequence_enrollments')
    .update({
      send_at: null,
      hold_reason: 'lien_manquant',
      next_run_at: new Date(Date.now() + NO_EMAIL_RETRY_MS).toISOString(),
    })
    .eq('id', enrollmentId)
}

/**
 * Gèle l'étape dont le message promet une démo que l'entreprise n'a pas.
 *
 * Se lève dès que le site passe en « Prêt » au tableau du site-builder — la
 * relecture repasse toutes les deux heures, personne n'a à revenir dégeler.
 */
export async function holdForMissingDemo(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  await sb
    .from('sequence_enrollments')
    .update({
      send_at: null,
      hold_reason: 'demo_manquante',
      next_run_at: new Date(Date.now() + NO_EMAIL_RETRY_MS).toISOString(),
    })
    .eq('id', enrollmentId)
}

/**
 * Gèle l'étape manuelle dont le message est vide.
 *
 * Le geste attendu n'est pas d'attendre : c'est d'ouvrir la séquence et d'écrire
 * le message, ou d'y rattacher un modèle. On repousse `next_run_at` de deux
 * heures comme les autres gels — rien ne changera d'ici là sans qu'un humain
 * touche la séquence, et repasser chaque minute ne ferait que bruiter le journal.
 */
export async function holdForEmptyMessage(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  await sb
    .from('sequence_enrollments')
    .update({
      send_at: null,
      hold_reason: 'message_vide',
      next_run_at: new Date(Date.now() + NO_EMAIL_RETRY_MS).toISOString(),
    })
    .eq('id', enrollmentId)
}

/**
 * Gèle l'étape email quand l'adresse ne recevra pas (domaine mort, syntaxe
 * cassée, rebond dur déjà encaissé).
 *
 * Même mécanique que « sans email », et pour la même raison : l'inscription
 * n'est pas perdue, elle attend une correction. Saisir une nouvelle adresse
 * (`setProspectEmail`) la dégèle toute seule. On repousse `next_run_at` de deux
 * heures pour ne pas repasser dessus à chaque minute — rien ne changera d'ici là
 * sans intervention humaine.
 */
export async function holdForInvalidEmail(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  await sb
    .from('sequence_enrollments')
    .update({
      send_at: null,
      hold_reason: 'email_invalid',
      next_run_at: new Date(Date.now() + NO_EMAIL_RETRY_MS).toISOString(),
    })
    .eq('id', enrollmentId)
}

/**
 * Gèle l'étape email le temps que l'adresse soit vérifiée.
 *
 * Contrairement aux deux gels précédents, `next_run_at` n'est PAS repoussé : le
 * blocage est provisoire et le tick de vérification le lève tout seul en
 * quelques minutes. Repousser ferait attendre le prospect pour rien.
 */
export async function holdForPendingVerification(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  await sb
    .from('sequence_enrollments')
    .update({ send_at: null, hold_reason: 'email_pending' })
    .eq('id', enrollmentId)
}

/**
 * Annule ce qui est encore en vol pour une inscription : jobs planifiés et
 * tâches manuelles en attente.
 *
 * C'est la partie critique de « le prospect a réagi » : retirer l'entreprise de
 * la séquence ne suffit pas — sans ça un email part quand même après que le
 * prospect a pris rendez-vous.
 */
export async function cancelEnrollmentWork(
  sb: SupabaseClient,
  enrollmentId: string,
): Promise<{ jobs: number; tasks: number }> {
  const { data: jobs } = await sb
    .from('automation_jobs')
    .update({ status: 'canceled' })
    .eq('enrollment_id', enrollmentId)
    .in('status', ['pending', 'processing'])
    .select('id')
  const { data: tasks } = await sb
    .from('prospection_tasks')
    .update({ status: 'skipped' })
    .eq('enrollment_id', enrollmentId)
    .eq('status', 'pending')
    .select('id')
  return { jobs: (jobs ?? []).length, tasks: (tasks ?? []).length }
}

/**
 * Sort une inscription de sa séquence, définitivement.
 *
 * Le pendant d'`advanceEnrollmentAfterTask` : là où celle-ci enchaîne l'étape
 * suivante, celle-ci ferme la route. C'est ce qu'il faut derrière une issue qui
 * ARRÊTE (« pas intéressé », « bloqué ») ou derrière un canal qui ne mène nulle
 * part (« la personne n'est pas sur WhatsApp ») : dans les deux cas, continuer
 * à dérouler la séquence enverrait un message à quelqu'un qui a déjà dit non,
 * ou sur un canal où personne ne lira.
 *
 * `stopOutreach` fait la même chose côté pipeline commercial, mais à partir
 * d'une AFFAIRE — il ferme toutes les inscriptions vivantes de l'opportunité.
 * Ici on n'en connaît qu'une, celle de la tâche qu'on vient de traiter, et
 * c'est la seule qu'on veut fermer.
 *
 * Idempotent : une inscription déjà terminée ou déjà sortie n'est pas
 * retouchée, et son `finished_at` d'origine reste vrai.
 */
export async function sortirDeSequence(
  sb: SupabaseClient,
  enrollmentId: string,
): Promise<{ jobs: number; tasks: number }> {
  const annule = await cancelEnrollmentWork(sb, enrollmentId)
  await sb
    .from('sequence_enrollments')
    .update({
      status: 'exited',
      next_run_at: null,
      send_at: null,
      hold_reason: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)
    .in('status', ['active', 'paused'])
  return annule
}

/**
 * Fait avancer une inscription après l'étape `fromIdx`.
 *
 * L'ÉTAPE SUIVANTE N'EST PLUS `fromIdx + 1`
 * Une attente-réponse à délai ouvre deux suites (cf.
 * `src/lib/automations/branches.ts`) : celle qui parle à quelqu'un qui vient
 * d'écrire, celle qui relance un silence. `etapeSuivante` saute donc les étapes
 * de la branche qu'on n'a pas prise, en lisant l'issue dans `vars.replies` —
 * aucun état supplémentaire sur l'inscription, donc rien qui puisse diverger de
 * la définition quand celle-ci est retouchée en cours de route. Sans branche
 * déclarée nulle part, la fonction rend exactement `fromIdx + 1` : les
 * séquences existantes ne changent pas de comportement.
 *
 * `reanchor` remet le compteur des J+n à MAINTENANT, sur l'étape qu'on vient de
 * franchir. À poser chaque fois que l'inscription a attendu un humain — tâche
 * manuelle faite, réponse déclarée : sans ça, une accroche WhatsApp répondue au
 * bout d'une semaine ferait partir la démo dans la seconde, tous ses J+n étant
 * déjà dans le passé. Un envoi automatique, lui, ne réancre pas : il est parti
 * à l'heure prévue, la séquence garde son rythme.
 */
async function avancerApres(
  sb: SupabaseClient,
  enrollment: SequenceEnrollment,
  steps: SequenceStep[],
  fromIdx: number,
  opts: { reanchor?: boolean } = {},
): Promise<void> {
  const replies = readReplies(enrollment.vars)
  const nextIdx = etapeSuivante(steps, fromIdx, (i) => Boolean(replies[String(i)]))
  await scheduleStep(sb, enrollment, steps, nextIdx, { ...opts, fromIdx })
}

/** Pose l'inscription sur une étape précise et calcule sa date de départ. */
async function scheduleStep(
  sb: SupabaseClient,
  enrollment: SequenceEnrollment,
  steps: SequenceStep[],
  nextIdx: number,
  opts: { reanchor?: boolean; fromIdx?: number } = {},
): Promise<void> {
  if (nextIdx >= steps.length) {
    await sb
      .from('sequence_enrollments')
      .update({
        current_step: nextIdx,
        status: 'finished',
        next_run_at: null,
        send_at: null,
        hold_reason: null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id)
    return
  }
  const now = Date.now()
  const anchorMs = enrollment.anchor_at ? new Date(enrollment.anchor_at).getTime() : null
  // L'ancre se pose sur l'étape qu'on vient de FRANCHIR, pas sur `nextIdx - 1` :
  // avec des branches, celle-ci peut appartenir au chemin qu'on n'a pas pris, et
  // son `day` servirait alors de zéro à des J+n qui n'ont rien à voir.
  const anchor: StepAnchor = opts.reanchor
    ? { enteredMs: now, anchorMs: now, anchorStep: Math.max(0, opts.fromIdx ?? nextIdx - 1) }
    : {
        enteredMs: new Date(enrollment.entered_at).getTime(),
        anchorMs: Number.isFinite(anchorMs) ? anchorMs : null,
        anchorStep: enrollment.anchor_step ?? null,
      }
  // Décalage posé à la main depuis la vue semaine : « cette relance, pas demain,
  // après-demain ». Il s'applique à l'étape, pas à toute la suite.
  const shift = readStepShifts(enrollment.vars)[String(nextIdx)] ?? 0
  let runAt = stepStartMs(steps, nextIdx, anchor, shift)
  if (runAt < now) runAt = now
  // `next_run_at` reste « pas avant cette date » ; le créneau exact d'un email
  // sera reposé par le régulateur au tick suivant.
  await sb
    .from('sequence_enrollments')
    .update({
      current_step: nextIdx,
      next_run_at: new Date(runAt).toISOString(),
      send_at: null,
      hold_reason: null,
      ...(opts.reanchor
        ? { anchor_at: new Date(now).toISOString(), anchor_step: anchor.anchorStep }
        : {}),
    })
    .eq('id', enrollment.id)
}

/**
 * Appelé quand une tâche de démarchage liée à une séquence est complétée.
 *
 * Réancre : le WhatsApp est parti maintenant, pas au jour où le builder l'avait
 * prévu. L'étape suivante compte ses jours depuis ce geste.
 */
export async function advanceEnrollmentAfterTask(enrollmentId: string): Promise<void> {
  const sb = getServiceClient()
  const { data: enr } = await sb.from('sequence_enrollments').select('*').eq('id', enrollmentId).maybeSingle()
  const enrollment = enr as SequenceEnrollment | null
  if (!enrollment || enrollment.status !== 'active') return
  const { data: autoRow } = await sb.from('automations').select('definition').eq('id', enrollment.automation_id).maybeSingle()
  const def = (autoRow?.definition as SequenceDefinition) || { steps: [] }
  const steps = Array.isArray(def.steps) ? def.steps : []
  await avancerApres(sb, enrollment, steps, enrollment.current_step, { reanchor: true })
  // Best-effort : l'avancement lui-même a réussi, quoi qu'il arrive ici. Rater
  // le traitement immédiat ne doit jamais se lire comme un échec de la
  // déclaration qui l'a déclenché — le prochain tick reprendra la main.
  await traiterEtapeCourante(sb, enrollmentId).catch(() => {})
}

/**
 * Traite tout de suite l'étape sur laquelle on vient de poser l'inscription,
 * plutôt que d'attendre le prochain passage du ticker.
 *
 * `avancerApres`/`scheduleStep` ne font que POSITIONNER l'inscription — poser
 * `current_step` et calculer une date. Ce qui se passe une fois arrivé (créer
 * la tâche WhatsApp, garer l'inscription sur une attente-réponse avec son
 * `hold_reason`) attendait jusqu'ici le prochain tick cron : une latence
 * invisible tant que personne ne regarde, mais bien réelle. Cliquer
 * « il a répondu » dans la seconde qui suit un « Fait » retombait sur une
 * attente dont le `hold_reason` n'était pas encore posé, et `declarerReponse`
 * refusait — « on n'attendait rien à cette étape » — alors que si, le moteur
 * n'était simplement pas encore passé.
 *
 * Un e-mail fait exception : il reste TOUJOURS du ressort du régulateur, jamais
 * synchrone ici — sans quoi mettre 30 prospects en séquence d'un coup ferait
 * partir 30 e-mails à la seconde du clic (cf. la même réserve dans les routes
 * d'inscription agent/admin).
 */
async function traiterEtapeCourante(sb: SupabaseClient, enrollmentId: string): Promise<void> {
  const { data: enr } = await sb.from('sequence_enrollments').select('*').eq('id', enrollmentId).maybeSingle()
  const enrollment = enr as SequenceEnrollment | null
  if (!enrollment || enrollment.status !== 'active') return
  const { data: autoRow } = await sb.from('automations').select('definition').eq('id', enrollment.automation_id).maybeSingle()
  const def = (autoRow?.definition as SequenceDefinition) || { steps: [] }
  const steps = Array.isArray(def.steps) ? def.steps : []
  if (steps[enrollment.current_step]?.kind === 'email') return
  await processSequenceEnrollment(enrollment)
}

/**
 * Libère une inscription garée sur une attente-réponse (cf. `declarerReponse`).
 *
 * Identique à l'avancement après tâche — même réancrage, pour la même raison :
 * la suite se compte depuis le geste, pas depuis l'inscription. Séparée pour
 * que `reply.ts` n'ait pas à connaître la mécanique des étapes.
 */
export async function advanceEnrollmentAfterReply(enrollmentId: string): Promise<void> {
  await advanceEnrollmentAfterTask(enrollmentId)
}

/**
 * Repose une inscription au DÉBUT de la branche « il a répondu ».
 *
 * Le demi-tour de `declarerReponse` quand la relance est déjà partie : on ne
 * peut pas se contenter d'avancer, il faut revenir en arrière dans le tableau
 * d'étapes — la branche réponse précède la branche silence.
 *
 * L'ancre se pose sur l'ATTENTE et non sur l'étape qu'on quitte : les J+n de la
 * branche réponse ont été écrits en partant de là, et les compter depuis une
 * relance qui n'aurait pas dû partir décalerait toute la suite.
 */
export async function reprendreSurLaBrancheReponse(
  enrollmentId: string,
  cible: number,
  waitIdx: number,
): Promise<void> {
  const sb = getServiceClient()
  const { data: enr } = await sb.from('sequence_enrollments').select('*').eq('id', enrollmentId).maybeSingle()
  const enrollment = enr as SequenceEnrollment | null
  if (!enrollment || enrollment.status !== 'active') return
  const { data: autoRow } = await sb
    .from('automations')
    .select('definition')
    .eq('id', enrollment.automation_id)
    .maybeSingle()
  const def = (autoRow?.definition as SequenceDefinition) || { steps: [] }
  const steps = Array.isArray(def.steps) ? def.steps : []
  // Les tâches encore ouvertes de la relance n'ont plus lieu d'être : les
  // laisser ferait rappeler quelqu'un qui vient d'écrire.
  await cancelEnrollmentWork(sb, enrollmentId)
  await scheduleStep(sb, enrollment, steps, cible, { reanchor: true, fromIdx: waitIdx })
  // Best-effort, même raison qu'au-dessus.
  await traiterEtapeCourante(sb, enrollmentId).catch(() => {})
}
