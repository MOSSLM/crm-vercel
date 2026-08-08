import { z } from "zod";
import { jsonError } from "./respond";

/**
 * Centralized Zod schemas for /api/* request bodies and query strings.
 *
 * Each route imports the schema it needs and runs `parseJson` / `parseQuery`
 * at the top of its handler. Validation failures return a typed 400 with
 * Zod's flattened issues so the client can surface field-level errors.
 */

export const stripeCheckoutSchema = z.object({
  offre_id: z.string().uuid({ message: "offre_id must be a UUID" }),
});
export type StripeCheckoutPayload = z.infer<typeof stripeCheckoutSchema>;

/** Public demo-site purchase: an anonymous visitor buys the demo they're viewing. */
export const stripeCheckoutDemoSchema = z.object({
  site_id: z.string().uuid({ message: "site_id must be a UUID" }),
});
export type StripeCheckoutDemoPayload = z.infer<typeof stripeCheckoutDemoSchema>;

export const sendEmailSchema = z.object({
  to_email: z.string().email({ message: "to_email must be a valid email" }),
  to_name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(998),
  body_html: z.string().min(1),
  body_text: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  opportunite_id: z.string().uuid().optional(),
  lead_magnet_project_id: z.string().uuid().optional(),
  audit_pdf_url: z.string().url().optional(),
  type: z.enum(["lead_magnet", "relance", "premier_contact", "autre"]).optional(),
});
export type SendEmailPayload = z.infer<typeof sendEmailSchema>;

export const createTestOpportunitySchema = z.object({
  test_address_id: z.string().uuid({ message: "test_address_id must be a UUID" }),
  pipeline_id: z.string().uuid({ message: "pipeline_id must be a UUID" }),
  stage_id: z.coerce.number().int(),
  name: z.string().min(1).max(200).optional(),
});
export type CreateTestOpportunityPayload = z.infer<typeof createTestOpportunitySchema>;

export const emailLogsQuerySchema = z.object({
  contact_id: z.string().uuid().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  opportunite_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type EmailLogsQuery = z.infer<typeof emailLogsQuerySchema>;

/**
 * Records an outreach message in email_logs. Used to log WhatsApp sends (wa.me
 * has no send API) so they appear in the contact exchange history next to emails.
 * `to_email` is repurposed to hold the phone number for whatsapp rows.
 */
export const messageLogSchema = z.object({
  channel: z.enum(["email", "whatsapp"]).default("whatsapp"),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
  opportunite_id: z.string().uuid().optional().nullable(),
  to_name: z.string().max(200).optional().nullable(),
  to_email: z.string().max(320).optional().nullable(),
  subject: z.string().max(998).optional().nullable(),
  body_text: z.string().max(8000).optional().nullable(),
});
export type MessageLogPayload = z.infer<typeof messageLogSchema>;

export const enrichLeadMagnetSchema = z.object({
  project_id: z.string().uuid(),
});
export type EnrichLeadMagnetPayload = z.infer<typeof enrichLeadMagnetSchema>;

/**
 * Telephony — click-to-call via the provider callback (bridges two legs, no
 * WebRTC). Optional CRM ids let us seed the resulting `calls` row so the record
 * links are present before the provider's webhooks arrive.
 */
export const telephonyCallbackSchema = z.object({
  to: z.string().min(3).max(32),
  from: z.string().min(2).max(32).optional(),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
  opportunite_id: z.string().uuid().optional().nullable(),
});
export type TelephonyCallbackPayload = z.infer<typeof telephonyCallbackSchema>;

/** Telephony — send an SMS (optionally linked to a record). */
export const telephonySmsSendSchema = z.object({
  to: z.string().min(3).max(32),
  text: z.string().min(1).max(1000),
  from: z.string().min(2).max(32).optional(),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
});
export type TelephonySmsSendPayload = z.infer<typeof telephonySmsSendSchema>;

/** Telephony — SMS messages/threads listing filters. */
export const telephonySmsQuerySchema = z.object({
  contact_id: z.string().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  counterpart: z.string().optional(),
  thread_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type TelephonySmsQuery = z.infer<typeof telephonySmsQuerySchema>;

/** Telephony — the caller sets their own softphone extension (self-service). */
export const telephonyMyExtensionSchema = z.object({
  sip: z.string().min(2).max(64),
  extension: z.string().max(32).optional(),
  call_mode: z.enum(["browser", "callback"]).optional(),
});
export type TelephonyMyExtensionPayload = z.infer<typeof telephonyMyExtensionSchema>;

/** Telephony — register a domain for the in-browser WebRTC widget. */
export const telephonyWebrtcDomainSchema = z.object({
  domain: z.string().min(3).max(255),
});
export type TelephonyWebrtcDomainPayload = z.infer<typeof telephonyWebrtcDomainSchema>;

/** Telephony — log a cockpit call outcome (disposition + note) on a deal. */
export const cockpitOutcomeSchema = z.object({
  opportunite_id: z.string().min(1),
  disposition: z.string().min(1).max(40),
  note: z.string().max(4000).optional().nullable(),
});
export type CockpitOutcomePayload = z.infer<typeof cockpitOutcomeSchema>;

/** Telephony — book an appointment, assignable to the agent or to admin. */
export const telephonyAppointmentSchema = z.object({
  title: z.string().min(1).max(200),
  start_at: z.string().min(10),
  duration_min: z.coerce.number().int().min(5).max(600).default(30),
  for_admin: z.boolean().optional().default(false),
  contact_id: z.string().optional().nullable(),
  entreprise_id: z.coerce.number().int().positive().optional().nullable(),
  opportunite_id: z.string().uuid().optional().nullable(),
  call_id: z.string().uuid().optional().nullable(),
});
export type TelephonyAppointmentPayload = z.infer<typeof telephonyAppointmentSchema>;

/** Telephony — call journal / history listing filters. */
export const telephonyCallsQuerySchema = z.object({
  contact_id: z.string().optional(),
  entreprise_id: z.coerce.number().int().positive().optional(),
  opportunite_id: z.string().uuid().optional(),
  direction: z.enum(["inbound", "outbound", "internal"]).optional(),
  agent_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TelephonyCallsQuery = z.infer<typeof telephonyCallsQuerySchema>;

/**
 * Prepares one or more opportunities for (re)enrichment on the Marketing & Web
 * pipeline: ensures each has a `lead_magnet_projects` row and resets it to a
 * re-runnable state. `overwrite` additionally clears the enrichment-derived
 * columns so the next run repopulates them from scratch.
 */
export const marketingEnrichPrepareSchema = z.object({
  opportunity_ids: z.array(z.string().uuid()).min(1).max(50),
  overwrite: z.boolean().optional().default(false),
});
export type MarketingEnrichPreparePayload = z.infer<typeof marketingEnrichPrepareSchema>;

/**
 * Validation humaine des données enrichies (étape 2 du marketing pipeline) :
 * les projets lead magnet passent en `enrichment_validated`, ce qui débloque la
 * création du site démo.
 */
export const marketingValidateEnrichmentSchema = z.object({
  project_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type MarketingValidateEnrichmentPayload = z.infer<typeof marketingValidateEnrichmentSchema>;

/**
 * Ré-enrichissement en masse des projets déjà enrichis (voir
 * /api/marketing-pipeline/reenrich).
 *
 * Un appel ne traite que ce qu'il peut dans son budget de temps et renvoie
 * `next_after_id` : le client rappelle avec ce curseur jusqu'à `done`. C'est ce
 * qui permet de balayer tout le parc sans qu'aucune requête ne dépasse son
 * temps d'exécution.
 */
export const marketingReenrichSchema = z.object({
  /**
   * `enriched` : les anciens enrichissements (statut framer/ready/published).
   * `failed` : les runs en échec. `all` : tout projet lié à une entreprise.
   * `ids` : une liste explicite.
   */
  scope: z.enum(["enriched", "failed", "all", "ids"]).optional().default("enriched"),
  project_ids: z.array(z.string().uuid()).max(2000).optional(),
  /** Vide les colonnes issues de l'enrichissement avant de relancer. */
  overwrite: z.boolean().optional().default(true),
  /** Curseur keyset : ne traite que les projets d'id supérieur. */
  after_id: z.string().uuid().optional(),
  /** Compte seulement, n'écrit rien et n'appelle pas l'edge function. */
  dry_run: z.boolean().optional().default(false),
});
export type MarketingReenrichPayload = z.infer<typeof marketingReenrichSchema>;

/**
 * Chargement du référentiel des communes, un département à la fois (voir
 * /api/settings/communes-fr). Le code est celui de geo.api.gouv.fr : deux
 * chiffres en métropole, trois en outre-mer, "2A"/"2B" pour la Corse.
 */
export const communesFrSeedSchema = z.object({
  departement: z.string().regex(/^(2[AB]|\d{2,3})$/, "code de département invalide"),
});
export type CommunesFrSeedPayload = z.infer<typeof communesFrSeedSchema>;

/**
 * Seuils de l'arbitrage de la ville SEO. Les deux invariants sont aussi des
 * CHECK en base : l'edge function n'a jamais à se méfier de ce qu'elle relit.
 */
export const villeSeoSettingsSchema = z
  .object({
    metro_population: z.number().int().min(1),
    metro_radius_km: z.number().int().min(1).max(300),
    big_city_population: z.number().int().min(1),
    preferred_radius_km: z.number().int().min(1).max(300),
    max_radius_km: z.number().int().min(1).max(300),
  })
  .refine((s) => s.max_radius_km >= s.preferred_radius_km, {
    message: "le rayon maximal doit être au moins égal au rayon confortable",
    path: ["max_radius_km"],
  })
  .refine((s) => s.metro_population >= s.big_city_population, {
    message: "le seuil métropole doit être au moins égal au seuil grande ville",
    path: ["metro_population"],
  });
export type VilleSeoSettingsPayload = z.infer<typeof villeSeoSettingsSchema>;

/** Correction manuelle : `commune` vide = règle par défaut du code postal. */
export const villeSeoOverrideSchema = z.object({
  code_postal: z.string().regex(/^\d{5}$/, "code postal invalide"),
  commune: z.string().nullable().optional(),
  ville_seo: z.string().trim().min(1).max(120),
  note: z.string().nullable().optional(),
});
export type VilleSeoOverridePayload = z.infer<typeof villeSeoOverrideSchema>;

/** Recalcul de la ville SEO. Sans `project_ids`, porte sur tout le parc. */
export const villeSeoRecomputeSchema = z.object({
  project_ids: z.array(z.string().uuid()).max(2000).optional(),
  /** Curseur keyset : ne recalcule que les projets d'id supérieur (reprise). */
  after_id: z.string().uuid().optional(),
});
export type VilleSeoRecomputePayload = z.infer<typeof villeSeoRecomputeSchema>;

/**
 * Fusion de service tags : toutes les entités portant l'un des `sources`
 * reçoivent `target` à la place.
 *
 * `dry_run` par défaut à `true` — l'opération réécrit tout le parc sans
 * annulation possible, donc le seul appel qu'on puisse faire par accident doit
 * être celui qui ne touche rien.
 */
export const serviceTagMergeSchema = z.object({
  sources: z.array(z.string().trim().min(1)).min(1).max(200),
  target: z.string().trim().min(1).max(120),
  dry_run: z.boolean().default(true),
  /**
   * Fusionner vers un tag bloqué déplace tout le parc sur un tag que
   * l'enrichissement refuse : refusé sauf confirmation explicite.
   */
  allow_blocked_target: z.boolean().default(false),
  /**
   * Idem pour une cible hors taxonomie : aucune page ne la reconnaît, la fusion
   * remplacerait un tag cassé par un autre.
   */
  allow_unknown_target: z.boolean().default(false),
});
export type ServiceTagMergePayload = z.infer<typeof serviceTagMergeSchema>;

/**
 * Rattrapage de la note et du nombre d'avis depuis Google Places.
 *
 * Sans `entreprise_ids`, porte sur toutes les fiches candidates — celles qui ont
 * une page Google mais dont la note ou le compte d'avis manque.
 */
export const googleStatsRefreshSchema = z.object({
  entreprise_ids: z.array(z.number().int().positive()).max(2000).optional(),
  /** Curseur keyset : ne traite que les entreprises d'id supérieur (reprise). */
  after_id: z.number().int().nonnegative().optional(),
});
export type GoogleStatsRefreshPayload = z.infer<typeof googleStatsRefreshSchema>;

/**
 * Moves a batch of opportunities to another CRM pipeline from the Marketing &
 * Web board (e.g. "Entreprises sans site web", "Streak mars/avril", "Général").
 */
export const marketingMovePipelineSchema = z.object({
  opportunity_ids: z.array(z.string().uuid()).min(1).max(200),
  pipeline_id: z.string().uuid(),
});
export type MarketingMovePipelinePayload = z.infer<typeof marketingMovePipelineSchema>;

/**
 * Full payload for the Marketing & Web edit modal's manual save. Persisted
 * server-side with the service client (see company-details/route.ts) so RLS on
 * the browser client can no longer reject saves for pool / other-owned
 * companies — the cause of the intermittent "erreur d'enregistrement".
 */
const nullableStr = z.string().nullable().optional();
const strArray = z.array(z.string()).optional().default([]);

export const marketingCompanyDetailsSchema = z.object({
  entreprise_id: z.coerce.number().int().positive(),
  project_id: z.string().uuid().nullable().optional(),
  /**
   * Opportunité d'où la fiche est ouverte. Sert à CRÉER le dossier lead magnet
   * quand il n'existe pas encore : sans lui, une entreprise dont
   * l'enrichissement automatique n'a jamais abouti n'a nulle part où recevoir
   * la ville SEO, le logo et les chiffres clés saisis à la main.
   */
  opportunite_id: z.string().uuid().nullable().optional(),
  enrichment_id: z.string().uuid().nullable().optional(),
  company: z.object({
    name: nullableStr,
    ville: nullableStr,
    code_postal: nullableStr,
    adresse: nullableStr,
    telephone: nullableStr,
    email: nullableStr,
    site_web_canonique: nullableStr,
    linkedin_url: nullableStr,
    service_tags: strArray,
    note_moyenne: z.number().nullable().optional(),
    nombre_avis: z.number().nullable().optional(),
    horaires: nullableStr,
  }),
  enrichment: z
    .object({
      website_url: nullableStr,
      emails: strArray,
      phones: strArray,
      services_list: strArray,
      contact_page_url: nullableStr,
      site_summary: nullableStr,
    })
    .nullable()
    .optional(),
  project: z
    .object({
      override_entreprise_name: nullableStr,
      override_city: nullableStr,
      override_location: nullableStr,
      override_phone: nullableStr,
      override_email: nullableStr,
      override_address: nullableStr,
      logo_url: nullableStr,
      service_tags_snapshot: strArray,
      stat_years_experience: nullableStr,
      stat_satisfied_clients: nullableStr,
      stat_installations_completed: nullableStr,
      stat_rge_count: nullableStr,
      // Chiffres confirmés par le client : prioritaires à l'affichage sur les
      // estimations ci-dessus, et jamais touchés par l'enrichissement.
      stat_years_experience_official: nullableStr,
      stat_satisfied_clients_official: nullableStr,
      stat_installations_completed_official: nullableStr,
      stat_rge_count_official: nullableStr,
      variables: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .nullable()
    .optional(),
  reviews: z
    .object({
      deleted_ids: z.array(z.string().uuid()).optional().default([]),
      rows: z
        .array(
          z.object({
            id: z.string().uuid().nullable().optional(),
            author_name: z.string(),
            review_text: z.string(),
            rating: z.number(),
            is_active: z.boolean(),
            display_order: z.number(),
          }),
        )
        .optional()
        .default([]),
    })
    .nullable()
    .optional(),
});
export type MarketingCompanyDetailsPayload = z.infer<typeof marketingCompanyDetailsSchema>;

/**
 * Complétion en masse des variables manquantes, depuis la grille du board.
 *
 * À l'inverse du schéma ci-dessus, TOUTES les clés sont optionnelles et rien
 * n'a de valeur par défaut : la grille n'envoie que ce qui a été modifié, et
 * ici **une clé absente n'est pas une clé à vider** (cf. `_missing-data.ts`).
 * Un `.default([])` sur les service tags, par exemple, viderait les tags de
 * toute ligne dont on n'a corrigé que le téléphone.
 */
export const marketingMissingDataSchema = z.object({
  rows: z
    .array(
      z.object({
        opportunite_id: z.string().uuid(),
        entreprise_id: z.coerce.number().int().positive(),
        project_id: z.string().uuid().nullable().optional(),
        company: z
          .object({
            name: nullableStr,
            ville: nullableStr,
            code_postal: nullableStr,
            telephone: nullableStr,
            service_tags: z.array(z.string()).optional(),
            note_moyenne: z.number().nullable().optional(),
          })
          .optional(),
        project: z
          .object({
            override_city: nullableStr,
            logo_url: nullableStr,
            stat_years_experience: nullableStr,
            stat_satisfied_clients: nullableStr,
            stat_installations_completed: nullableStr,
          })
          .optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type MarketingMissingDataPayload = z.infer<typeof marketingMissingDataSchema>;

/**
 * Aspirer une image distante dans la médiathèque. Sert au champ logo (une URL
 * collée doit devenir une URL à nous) et à l'enrichissement, qui trouve des
 * logos sur les sites des clients.
 */
export const mediaFromUrlSchema = z.object({
  url: z.string().url({ message: "url doit être une URL http(s)" }),
  entreprise_id: z.coerce.number().int().positive().nullable().optional(),
  image_type: z.enum(["stock", "ai_generated", "personal", "company"]).optional(),
  tags: z.array(z.string()).max(20).optional(),
  alt_text: nullableStr,
  file_name: nullableStr,
});
export type MediaFromUrlPayload = z.infer<typeof mediaFromUrlSchema>;

/**
 * Reprise : rapatrier les logos restés chez le client. `dry_run` liste ce qui
 * serait fait sans rien écrire — on regarde avant de toucher cent fiches.
 */
export const mediaRehostLogosSchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  dry_run: z.boolean().optional(),
  entreprise_ids: z.array(z.coerce.number().int().positive()).max(500).optional(),
  /** Curseur keyset : l'id de la dernière entreprise traitée à l'appel précédent. */
  after_id: z.coerce.number().int().nonnegative().optional(),
});
export type MediaRehostLogosPayload = z.infer<typeof mediaRehostLogosSchema>;

const channelEnum = z.enum(["email", "sms", "whatsapp", "linkedin", "telephone", "pas_defini"]);
const directionEnum = z.enum(["entrant", "sortant"]);
const outcomeEnum = z.enum(["positif", "neutre", "negatif", "inconnu"]);

const journalCommonFields = {
  opportunite_id: z.string().min(1).optional().nullable(),
  entreprise_id: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  channel: channelEnum.optional(),
  direction: directionEnum.optional(),
  outcome: outcomeEnum.optional(),
  details: z.string().optional().nullable(),
  skipTouchpoint: z.boolean().optional(),
};

export const journalEventSchema = z.object({
  type_evenement: z.string().min(1),
  description: z.string().optional().nullable(),
  opportunite_id: z.string().min(1).optional().nullable(),
  entreprise_id: z.number().int().positive().optional().nullable(),
});

export const journalTouchpointSchema = z.object({
  opportunite_id: z.string().min(1).optional().nullable(),
  entreprise_id: z.number().int().positive().optional().nullable(),
  step_kind: z.string().min(1),
  channel: channelEnum,
  direction: directionEnum.optional(),
  outcome: outcomeEnum.optional(),
  details: z.string().optional().nullable(),
});

export const journalLogSchema = z.object(journalCommonFields);

export const agentSequenceEnrollSchema = z.object({
  automation_id: z.string().uuid({ message: "automation_id must be a UUID" }),
  items: z
    .array(
      z.object({
        entreprise_id: z.coerce.number().int().positive(),
        contact_id: z.string().uuid({ message: "contact_id must be a UUID" }),
      }),
    )
    .min(1)
    .max(50),
});
export type AgentSequenceEnrollPayload = z.infer<typeof agentSequenceEnrollSchema>;

/* ── Espace agent : qualification déléguée + capacités ────────────────────── */

/**
 * File de qualification de l'agent. Pagination par curseur (`after_id`) et non
 * par offset : la file se vide au fur et à mesure que les agents la traitent,
 * un offset sauterait des entreprises.
 */
export const agentQualificationQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(30),
  after_id: z.coerce.number().int().min(0).optional(),
  /** Sources séparées par des virgules (`google_search,google_maps`). Vide = toutes. */
  sources: z.string().trim().max(200).optional(),
  /** Par défaut `with-url` : sans site, il n'y a rien à auditer ni à refondre. */
  url_filter: z.enum(["all", "with-url", "without-url"]).default("with-url"),
});
export type AgentQualificationQuery = z.infer<typeof agentQualificationQuerySchema>;

/**
 * Décision de pré-tri d'un agent : « qualifier » ou « masquer ». N'écrit rien
 * sur `entreprises` — l'admin valide ou corrige ensuite (cf.
 * sql/20260727_agent_qualification_and_pipeline.sql).
 */
export const agentQualificationDecisionSchema = z.object({
  entreprise_id: z.coerce.number().int().positive(),
  decision: z.enum(["qualify", "skip"]),
  note: z.string().trim().max(500).optional(),
});
export type AgentQualificationDecisionPayload = z.infer<typeof agentQualificationDecisionSchema>;

/** Verdict de l'admin sur une décision d'agent. */
export const adminAgentReviewSchema = z.object({
  decision_id: z.string().uuid(),
  action: z.enum(["qualify", "blacklist", "hide", "requeue", "delete"]),
  /** Pour `blacklist` : bloquer le domaine entier plutôt que l'URL exacte. */
  blacklist_scope: z.enum(["exact_url", "domain"]).optional().default("domain"),
});
export type AdminAgentReviewPayload = z.infer<typeof adminAgentReviewSchema>;

/** Capacités + plafond de dépense accordés à un agent. */
export const adminAgentSettingsSchema = z.object({
  agent_id: z.string().uuid(),
  can_qualify: z.boolean(),
  can_use_marketing_pipeline: z.boolean(),
  /** null = pas de plafond. En centimes. */
  enrichment_budget_cents: z.coerce.number().int().min(0).nullable().optional(),
  budget_period: z.enum(["month", "total"]).optional().default("month"),
});
export type AdminAgentSettingsPayload = z.infer<typeof adminAgentSettingsSchema>;

/** Validation d'une étape du marketing pipeline exécutée par un agent. */
export const agentPipelineStepSchema = z.object({
  entreprise_id: z.coerce.number().int().positive(),
  opportunite_id: z.string().uuid().optional(),
});
export type AgentPipelineStepPayload = z.infer<typeof agentPipelineStepSchema>;

/* ── Régulateur d'envoi ──────────────────────────────────────────────────── */

/** Une plage d'envoi : [début, fin] en minutes depuis minuit. */
const sendWindowSchema = z.tuple([
  z.coerce.number().int().min(0).max(1440),
  z.coerce.number().int().min(0).max(1440),
]);

/**
 * Réglages globaux du régulateur. Tout est optionnel : l'interface envoie
 * seulement ce que l'utilisateur vient de changer.
 */
export const regulatorSettingsSchema = z
  .object({
    gap_min_minutes: z.coerce.number().int().min(1).max(600).optional(),
    gap_max_minutes: z.coerce.number().int().min(1).max(600).optional(),
    daily_cap: z.coerce.number().int().min(0).max(10000).optional(),
    company_gap_minutes: z.coerce.number().int().min(0).max(1440).optional(),
    paused: z.boolean().optional(),
    count_all_sequences: z.boolean().optional(),
    one_per_day_per_contact: z.boolean().optional(),
    exit_on_reply: z.boolean().optional(),
    business_days_only: z.boolean().optional(),
    default_windows: z.array(sendWindowSchema).max(8).optional(),
    timezone: z.string().min(1).max(64).optional(),
    task_routing_mode: z.enum(["pref", "strict", "admin"]).optional(),
    task_max_per_agent: z.coerce.number().int().min(1).max(200).optional(),
    admin_user_id: z.string().uuid().nullable().optional(),
    /** Phase de test : seules les adresses de test_email_addresses reçoivent. */
    test_mode: z.boolean().optional(),

    // ── Vérification des adresses ──────────────────────────────────────────
    /** Aucun email de prospection vers une adresse sans verdict frais. */
    verify_before_send: z.boolean().optional(),
    /** Fraîcheur exigée d'une adresse vérifiée, en jours (120 par défaut). */
    verify_ttl_days: z.coerce.number().int().min(1).max(3650).optional(),
    /** Part (%) du plafond quotidien réservée aux adresses à signal négatif. */
    risky_daily_share: z.coerce.number().int().min(0).max(100).optional(),
    /** Première touche par domaine d'entreprise : une adresse à la fois. */
    domain_first_touch: z.boolean().optional(),
    /** Disjoncteur : pause automatique quand le rebond dérape. */
    bounce_guard: z.boolean().optional(),
    /** Seuil du disjoncteur, en % de rebonds durs sur 24 h. */
    bounce_guard_threshold: z.coerce.number().min(0.1).max(100).optional(),
  })
  .strict();
export type RegulatorSettingsPayload = z.infer<typeof regulatorSettingsSchema>;

/**
 * Réattribution d'une tâche manuelle. `null` = personne : la tâche reste dans
 * la file « sans destinataire », visible mais non distribuée.
 */
export const prospectionAssignSchema = z
  .object({ assignee_id: z.string().uuid().nullable() })
  .strict();
export type ProspectionAssignPayload = z.infer<typeof prospectionAssignSchema>;

/** Surcharges d'une séquence : ses plages, sa priorité de file, son plafond. */
export const sequenceRegulatorSchema = z
  .object({
    automation_id: z.string().uuid(),
    send_windows: z.array(sendWindowSchema).max(8).optional(),
    queue_priority: z.coerce.number().int().min(1).max(9).optional(),
    daily_cap: z.coerce.number().int().min(0).max(10000).nullable().optional(),
    status: z.enum(["on", "paused"]).optional(),
  })
  .strict();
export type SequenceRegulatorPayload = z.infer<typeof sequenceRegulatorSchema>;

/* ── Pipeline commercial ─────────────────────────────────────────────────── */

/**
 * Identifiant de colonne du pipeline commercial. Les colonnes ne sont plus une
 * liste figée : elles viennent des étapes de la séquence choisie (`step:<id>`)
 * puis des étapes du pipeline (`stage:<id>`). On valide donc la FORME, pas une
 * énumération — sinon ajouter une étape à une séquence casserait l'API.
 */
const salesColumnId = z
  .string()
  .regex(/^(entry|step|stage):.+$/, "stage doit être de la forme entry:, step:<id> ou stage:<id>")
  .max(120);

/**
 * Les cinq issues du bouton « le prospect a réagi ». C'est le seul endroit où
 * l'utilisateur court-circuite le pipeline, donc le seul endroit où l'on annule
 * des envois déjà planifiés.
 */
export const salesReactionSchema = z.object({
  opportunite_id: z.string().uuid(),
  reaction: z.enum(["rdv", "reply", "later", "no", "bad"]),
  reason: z.string().trim().max(500).optional(),
  /** Date de relance, obligatoire côté UI pour « intéressé, mais plus tard ». */
  nurture_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "nurture_at doit être une date YYYY-MM-DD")
    .optional(),
  /**
   * Colonnes que le raccourci fait sauter. C'est le client qui les connaît :
   * il a les colonnes affichées sous les yeux, le serveur ne les devine pas.
   */
  skip_columns: z.array(salesColumnId).max(40).optional(),
});
export type SalesReactionPayload = z.infer<typeof salesReactionSchema>;

/** Validation manuelle d'une étape du pipeline commercial. */
export const salesAdvanceSchema = z.object({
  opportunite_id: z.string().uuid(),
  stage: salesColumnId,
  /** Montant saisi sur la carte Proposition. */
  amount: z.coerce.number().min(0).max(100_000_000).optional(),
  objection: z.string().trim().max(500).optional(),
  rdv_at: z.string().datetime().optional(),
});
export type SalesAdvancePayload = z.infer<typeof salesAdvanceSchema>;

/** Réouverture d'une étape sautée, ou réactivation d'une ligne close. */
export const salesReviveSchema = z.object({
  opportunite_id: z.string().uuid(),
  /** Absent = réactiver la ligne entière ; sinon, rouvrir cette étape. */
  stage: salesColumnId.optional(),
});
export type SalesRevivePayload = z.infer<typeof salesReviveSchema>;

/** Mise en séquence depuis le pipeline commercial (lot possible). */
export const salesEnrollSchema = z.object({
  automation_id: z.string().uuid(),
  opportunite_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type SalesEnrollPayload = z.infer<typeof salesEnrollSchema>;

/**
 * Sauter l'étape email et enchaîner sur le canal suivant (WhatsApp en
 * pratique). Le serveur retrouve seul les étapes email de l'inscription ;
 * `skip_columns` sert aux colonnes que seul le client connaît (séquence
 * affichée non encore lancée).
 */
export const salesSkipEmailSchema = z.object({
  opportunite_id: z.string().uuid(),
  skip_columns: z.array(salesColumnId).max(40).optional(),
});
export type SalesSkipEmailPayload = z.infer<typeof salesSkipEmailSchema>;

/**
 * Saisie manuelle de l'adresse d'un prospect, depuis le pipeline commercial
 * (qui raisonne en opportunités) ou depuis les séquences (qui raisonnent en
 * entreprises). L'un ou l'autre suffit — l'adresse finit au même endroit.
 */
export const salesSetEmailSchema = z
  .object({
    opportunite_id: z.string().uuid().optional(),
    entreprise_id: z.coerce.number().int().positive().optional(),
    email: z.string().trim().email("email invalide").max(200),
  })
  .refine((v) => v.opportunite_id != null || v.entreprise_id != null, {
    message: "opportunite_id ou entreprise_id est requis",
    path: ["opportunite_id"],
  });
export type SalesSetEmailPayload = z.infer<typeof salesSetEmailSchema>;

/**
 * Reads JSON from the request and validates it.
 *
 * Returns `{ ok: true, data }` on success; on parse or validation failure,
 * returns `{ ok: false, response }` where the response is a 400 ready to
 * return — caller merges any CORS headers via the `extraHeaders` arg.
 */
export const parseJson = async <T>(
  req: Request,
  schema: z.ZodType<T>,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError("invalid_json", 400, {}, extraHeaders) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError("invalid_body", 400, { issues: parsed.error.flatten() }, extraHeaders),
    };
  }
  return { ok: true, data: parsed.data };
};

/** Validates URLSearchParams against a schema. Records nest into objects via `Object.fromEntries`. */
export const parseQuery = <T>(
  url: URL,
  schema: z.ZodType<T>,
  extraHeaders: Record<string, string> = {},
): { ok: true; data: T } | { ok: false; response: Response } => {
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError("invalid_query", 400, { issues: parsed.error.flatten() }, extraHeaders),
    };
  }
  return { ok: true, data: parsed.data };
};
