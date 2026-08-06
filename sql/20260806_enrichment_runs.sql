-- Journal des enrichissements : une ligne par projet, à chaque passage.
--
-- POURQUOI
-- L'edge function `enrich-lead-magnet` scrape un site, interroge Google Places,
-- appelle un LLM et écrit une trentaine de champs — sans laisser de trace
-- exploitable. Les seules colonnes de mesure existantes
-- (`lead_magnet_projects.enrichment_model` + les deux compteurs de tokens, cf.
-- 20260805_enrichment_token_usage.sql) ne sont écrites QU'EN CAS DE SUCCÈS et
-- sont ÉCRASÉES au run suivant : les échecs n'ont jamais de modèle, et un projet
-- réenrichi perd l'historique du run précédent. Tout le reste — site atteint ou
-- non, pages scrapées, Google touché ou non, champs trouvés vs laissés à null,
-- durée, nombre de tentatives LLM — partait dans `console.log` et disparaissait
-- avec les logs de la plateforme.
--
-- Impossible, dans ces conditions, de répondre aux deux questions qui comptent :
-- l'edge function fait-elle bien son travail, et quel modèle est le plus
-- rentable à qualité mesurée.
--
-- CE QU'ON N'ENREGISTRE PAS : aucun contenu brut (ni le markdown scrapé, ni le
-- JSON du modèle). Des dizaines de Ko par run pour un usage de diagnostic
-- ponctuel — les métadonnées suffisent à situer un mauvais run, et le rejouer
-- reste possible.
--
-- APPLICATION : à la main dans l'éditeur SQL Supabase, AVANT de redéployer
-- l'edge function. Idempotent, rejouable. L'edge function tolère l'absence de
-- ces objets (insert best-effort) : elle n'échoue pas si la migration n'est pas
-- passée, elle ne mesure simplement rien.

begin;

-- ---------------------------------------------------------------------------
-- 1. Table de journal
-- ---------------------------------------------------------------------------
create table if not exists public.enrichment_runs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Cibles. `on delete set null` partout : la suppression d'un projet ne doit
  -- pas effacer la mesure du run qui l'a traité — c'est précisément l'historique
  -- qu'on cherche à conserver.
  project_id      uuid   references public.lead_magnet_projects(id) on delete set null,
  entreprise_id   bigint references public.entreprises(id)          on delete set null,
  opportunite_id  uuid   references public.opportunites(id)         on delete set null,

  -- Qui a déclenché : 'db_trigger' | 'crm_manual' | 'reenrich' | 'agent' | 'unknown'.
  source          text not null default 'unknown',

  -- Issue du run, identique aux statuts rendus par l'edge function.
  status          text not null,
  -- Raison courte et agrégeable (`no_website: home_unreachable_or_empty`,
  -- `lock_not_acquired`, `llm_extraction_failed`…). `error_message` porte le
  -- détail brut, qui lui ne s'agrège pas.
  outcome_reason  text,
  error_message   text,
  duration_ms     integer,

  -- ── Scraping ──────────────────────────────────────────────────────────────
  site_url_input     text,
  site_url_final     text,
  -- L'URL stockée était morte et le site répond ailleurs (www, http→https,
  -- redirection) : l'edge function corrige la fiche, on trace combien de fois.
  site_url_corrected boolean not null default false,
  site_reached       boolean not null default false,
  scrape_error       text,
  scrape_pages       integer,
  scrape_paths       text[],
  scrape_chars       integer,
  scrape_ms          integer,
  -- 'jina' | 'direct' | 'mixed' : sans clé Jina le scraper bascule en direct,
  -- ce qui change la qualité du markdown envoyé au modèle.
  scrape_via         text,
  jina_rate_limited  boolean not null default false,

  -- ── Google Places ─────────────────────────────────────────────────────────
  google_attempted        boolean not null default false,
  -- 'stored' (place_id de la fiche) | 'searched' (recherche texte, FACTURÉE) |
  -- 'none'. C'est la colonne qui dit si l'on repaie des recherches.
  google_place_id_source  text,
  google_ok               boolean,
  google_rating           numeric,
  google_reviews_total    integer,
  google_reviews_inserted integer,
  google_ms               integer,

  -- ── Appel LLM ─────────────────────────────────────────────────────────────
  llm_provider           text,
  llm_model              text,
  llm_attempts           integer,
  -- Statut HTTP de la dernière tentative (0 = réseau/expiration).
  llm_last_status        integer,
  llm_tokens_prompt      integer,
  -- Inclut les tokens de raisonnement : c'est ce qui est facturé en sortie.
  llm_tokens_completion  integer,
  -- Part de raisonnement dans la sortie, quand le provider la détaille. Sert à
  -- comprendre pourquoi un modèle de raisonnement coûte dix fois un modèle nano.
  llm_tokens_reasoning   integer,
  llm_ms                 integer,

  -- ── Qualité de l'extraction ───────────────────────────────────────────────
  -- {"email": true, "logo_url": false, …} : ce que le modèle a TROUVÉ, champ par
  -- champ. C'est la mesure de qualité, indépendante de ce qui a fini écrit —
  -- l'application est volontairement non destructive, un champ déjà rempli sur
  -- la fiche n'est jamais réécrit.
  fields_found       jsonb not null default '{}'::jsonb,
  fields_found_count integer,
  fields_total       integer,
  -- Ce qui a réellement changé en base (`updated_fields` de `applyExtraction`).
  fields_written     text[],
  service_tags_count integer,
  -- 'override' | 'paris_region' | 'geo' | 'llm' | 'entreprise' : qui a décidé de
  -- la ville SEO. Mesure la part réellement due au modèle.
  ville_seo_source   text
);

comment on table public.enrichment_runs is
  'Journal append-only des runs de l''edge function enrich-lead-magnet : une '
  'ligne par projet et par passage, y compris les runs ignorés et échoués. '
  'Alimente les métriques Paramètres → Enrichissement.';

-- Index calés sur les trois lectures réelles : la page « derniers runs », la
-- fiche d'un projet, et le comparatif par modèle.
create index if not exists idx_enrichment_runs_created
  on public.enrichment_runs(created_at desc);
create index if not exists idx_enrichment_runs_project
  on public.enrichment_runs(project_id, created_at desc);
create index if not exists idx_enrichment_runs_model
  on public.enrichment_runs(llm_model, created_at desc);
create index if not exists idx_enrichment_runs_status
  on public.enrichment_runs(status, created_at desc);
-- Clés étrangères non couvertes par les index ci-dessus (cf.
-- 20260524_add_indexes_for_unindexed_foreign_keys.sql).
create index if not exists idx_enrichment_runs_entreprise
  on public.enrichment_runs(entreprise_id);
create index if not exists idx_enrichment_runs_opportunite
  on public.enrichment_runs(opportunite_id);

alter table public.enrichment_runs enable row level security;

-- Lecture réservée aux admins : la table porte des coûts. L'edge function écrit
-- en service_role, qui contourne la RLS — aucune policy d'écriture n'est donc
-- nécessaire, et n'en poser aucune ferme la porte au reste.
drop policy if exists "admin read enrichment_runs" on public.enrichment_runs;
create policy "admin read enrichment_runs" on public.enrichment_runs
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Tarifs par modèle
-- ---------------------------------------------------------------------------
-- Le coût vit dans une VUE, pas dans les lignes de journal : corriger un tarif
-- recalcule tout l'historique par un simple UPDATE, sans redéployer l'edge
-- function ni réécrire des milliers de lignes.
--
-- Semé à 0 volontairement : les tarifs publics des providers changent trop
-- souvent pour être figés ici, et un chiffre inventé serait pire que pas de
-- chiffre du tout. Tant qu'une ligne vaut 0, le panneau Paramètres affiche
-- « tarif non renseigné » au lieu d'un faux coût.
create table if not exists public.enrichment_llm_pricing (
  model                 text primary key,
  provider              text not null,
  -- En CENTIMES d'euro par MILLION de tokens (l'unité d'affichage des
  -- providers), avec 4 décimales pour les modèles nano.
  input_cents_per_mtok  numeric(12,4) not null default 0,
  output_cents_per_mtok numeric(12,4) not null default 0,
  updated_at            timestamptz not null default now()
);

comment on table public.enrichment_llm_pricing is
  'Tarifs par modèle, en centimes d''euro par million de tokens. Édités à la '
  'main ; le coût des runs est recalculé par les vues, jamais figé dans le '
  'journal.';

-- Les modèles proposés dans les Paramètres (cf. src/lib/enrichment/llm-options.ts).
insert into public.enrichment_llm_pricing (model, provider) values
  ('gpt-5',             'openai'),
  ('gpt-5-nano',        'openai'),
  ('gpt-4.1-nano',      'openai'),
  ('gpt-4o-2024-08-06', 'openai'),
  ('deepseek-v4-flash', 'deepseek'),
  ('deepseek-v4-pro',   'deepseek')
on conflict (model) do nothing;

alter table public.enrichment_llm_pricing enable row level security;

drop policy if exists "admin all enrichment_llm_pricing" on public.enrichment_llm_pricing;
create policy "admin all enrichment_llm_pricing" on public.enrichment_llm_pricing
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Agrégats
-- ---------------------------------------------------------------------------
-- Fonctions paramétrées par une date de début, et vues « tout l'historique »
-- qui les appellent : le panneau Paramètres filtre sur 7/30/90 jours par la
-- fonction, l'éditeur SQL interroge la vue, et la logique n'existe qu'à un seul
-- endroit.

-- Comparatif par modèle : le tableau qui répond à « lequel est le plus rentable ».
create or replace function public.enrichment_metrics_by_model(p_since timestamptz default null)
returns table (
  provider            text,
  model               text,
  runs                integer,
  succes              integer,
  echecs              integer,
  sans_site           integer,
  ignores             integer,
  taux_succes_pct     numeric,
  taux_site_atteint_pct numeric,
  taux_champs_pct     numeric,
  duree_moy_ms        integer,
  tokens_prompt       bigint,
  tokens_completion   bigint,
  cout_total_cents    numeric,
  cout_par_run_cents  numeric,
  cout_par_succes_cents numeric,
  tarif_renseigne     boolean
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(r.llm_provider, '—')                                          as provider,
    coalesce(r.llm_model, '(aucun appel LLM)')                             as model,
    count(*)::integer                                                      as runs,
    count(*) filter (where r.status = 'success')::integer                  as succes,
    count(*) filter (where r.status = 'failed')::integer                   as echecs,
    count(*) filter (where r.status = 'no_website')::integer               as sans_site,
    count(*) filter (where r.status = 'skipped')::integer                  as ignores,
    round(100.0 * count(*) filter (where r.status = 'success') / nullif(count(*), 0), 1),
    -- Les runs ignorés (lock déjà pris, projet déjà traité) ne tentent aucun
    -- scraping : les compter ferait passer le taux de sites atteints pour
    -- mauvais alors qu'aucun site n'a été demandé.
    round(100.0 * count(*) filter (where r.site_reached)
          / nullif(count(*) filter (where r.status <> 'skipped'), 0), 1),
    round(100.0 * avg(r.fields_found_count::numeric / nullif(r.fields_total, 0))
          filter (where r.fields_total is not null), 1),
    round(avg(r.duration_ms))::integer,
    sum(coalesce(r.llm_tokens_prompt, 0))::bigint,
    sum(coalesce(r.llm_tokens_completion, 0))::bigint,
    round(sum(
      coalesce(r.llm_tokens_prompt, 0)::numeric     / 1e6 * coalesce(p.input_cents_per_mtok, 0)
      + coalesce(r.llm_tokens_completion, 0)::numeric / 1e6 * coalesce(p.output_cents_per_mtok, 0)
    ), 4),
    round(sum(
      coalesce(r.llm_tokens_prompt, 0)::numeric     / 1e6 * coalesce(p.input_cents_per_mtok, 0)
      + coalesce(r.llm_tokens_completion, 0)::numeric / 1e6 * coalesce(p.output_cents_per_mtok, 0)
    ) / nullif(count(*), 0), 4),
    -- Le chiffre qui compte vraiment : un modèle bon marché qui échoue une fois
    -- sur deux coûte deux appels par fiche réellement enrichie.
    round(sum(
      coalesce(r.llm_tokens_prompt, 0)::numeric     / 1e6 * coalesce(p.input_cents_per_mtok, 0)
      + coalesce(r.llm_tokens_completion, 0)::numeric / 1e6 * coalesce(p.output_cents_per_mtok, 0)
    ) / nullif(count(*) filter (where r.status = 'success'), 0), 4),
    bool_or(coalesce(p.input_cents_per_mtok, 0) > 0 or coalesce(p.output_cents_per_mtok, 0) > 0)
  from public.enrichment_runs r
  left join public.enrichment_llm_pricing p on p.model = r.llm_model
  where p_since is null or r.created_at >= p_since
  group by 1, 2
  order by 3 desc;
$$;

-- Taux de remplissage champ par champ : « quel modèle trouve le mieux les
-- emails, les logos, la ville SEO ». `jsonb_each` en lateral écarte d'office les
-- runs sans extraction, qui n'ont rien à dire ici.
create or replace function public.enrichment_field_fill_rate(p_since timestamptz default null)
returns table (
  model    text,
  champ    text,
  runs     integer,
  trouves  integer,
  taux_pct numeric
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(r.llm_provider || '/' || r.llm_model, '(aucun appel LLM)') as model,
    f.key                                                              as champ,
    count(*)::integer                                                  as runs,
    count(*) filter (where f.value = 'true'::jsonb)::integer           as trouves,
    round(100.0 * count(*) filter (where f.value = 'true'::jsonb) / nullif(count(*), 0), 1)
  from public.enrichment_runs r
  cross join lateral jsonb_each(r.fields_found) f
  where p_since is null or r.created_at >= p_since
  group by 1, 2
  order by 1, 2;
$$;

-- Causes d'échec, pour savoir si l'on perd des fiches sur Jina, sur un 429 ou
-- sur des sites réellement morts.
create or replace function public.enrichment_failure_reasons(p_since timestamptz default null)
returns table (
  status      text,
  raison      text,
  model       text,
  occurrences integer,
  dernier     timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    r.status,
    coalesce(r.outcome_reason, 'inconnu')                       as raison,
    coalesce(r.llm_provider || '/' || r.llm_model, '—')         as model,
    count(*)::integer                                           as occurrences,
    max(r.created_at)                                           as dernier
  from public.enrichment_runs r
  where r.status in ('failed', 'no_website')
    and (p_since is null or r.created_at >= p_since)
  group by 1, 2, 3
  order by 4 desc;
$$;

-- Les métriques portent des coûts : réservées aux admins, comme la table. Une
-- fonction du schéma public accorde EXECUTE à PUBLIC par défaut, dont anon et
-- authenticated héritent — il faut donc révoquer les trois (cf.
-- 20260524_revoke_definer_rpcs_from_anon_authenticated.sql). Le CRM les appelle
-- en service_role, que ces révocations ne concernent pas.
revoke execute on function public.enrichment_metrics_by_model(timestamptz) from public, anon, authenticated;
revoke execute on function public.enrichment_field_fill_rate(timestamptz)  from public, anon, authenticated;
revoke execute on function public.enrichment_failure_reasons(timestamptz)  from public, anon, authenticated;

-- Vues « tout l'historique » pour l'éditeur SQL.
create or replace view public.v_enrichment_runs_by_model as
  select * from public.enrichment_metrics_by_model(null);
create or replace view public.v_enrichment_field_fill_rate as
  select * from public.enrichment_field_fill_rate(null);
create or replace view public.v_enrichment_failures as
  select * from public.enrichment_failure_reasons(null);

-- Convention du projet (cf. 20260524_security_views_to_invoker.sql) : une vue
-- s'exécute par défaut avec les droits de son PROPRIÉTAIRE, ce qui contourne la
-- RLS de la table sous-jacente.
alter view public.v_enrichment_runs_by_model     set (security_invoker = on);
alter view public.v_enrichment_field_fill_rate   set (security_invoker = on);
alter view public.v_enrichment_failures          set (security_invoker = on);

commit;

-- ---------------------------------------------------------------------------
-- 4. Trigger d'enrichissement : nommer son origine
-- ---------------------------------------------------------------------------
-- Corps identique à l'existant, au `source` près. Sans lui, tous les runs
-- automatiques — l'écrasante majorité — retomberaient sur 'unknown' et on ne
-- pourrait pas distinguer un enrichissement de masse d'une relance manuelle.
create or replace function public.fn_enrich_lead_magnet_on_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
DECLARE
  v_edge_url text;
  v_service_key text;
  v_request_id bigint;
BEGIN
  IF NEW.pret_pour_lm = true
     AND (OLD.pret_pour_lm IS DISTINCT FROM true)
     AND NEW.statut = 'draft' THEN

    SELECT decrypted_secret INTO v_edge_url
      FROM vault.decrypted_secrets
      WHERE name = 'enrich_lm_edge_url'
      LIMIT 1;

    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;

    IF v_edge_url IS NULL OR v_service_key IS NULL THEN
      RAISE WARNING 'fn_enrich_lead_magnet_on_ready: secrets manquants dans Vault';
      RETURN NEW;
    END IF;

    SELECT net.http_post(
      url := v_edge_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'project_ids', jsonb_build_array(NEW.id::text),
        'source', 'db_trigger'
      )
    ) INTO v_request_id;

    RAISE NOTICE 'fn_enrich_lead_magnet_on_ready: enrichment queued for project=% (request_id=%)', NEW.id, v_request_id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- `CREATE OR REPLACE` conserve les droits existants, mais la fonction ne doit en
-- aucun cas devenir appelable depuis PostgREST : on le réaffirme.
revoke execute on function public.fn_enrich_lead_magnet_on_ready() from public, anon, authenticated;
