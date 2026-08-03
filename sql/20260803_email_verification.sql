-- ═══════════════════════════════════════════════════════════════════════════
-- Vérificateur d'adresses email & garde de délivrabilité
--
-- Jusqu'ici, la seule validation d'une adresse était un regex de trois lignes
-- (`cleanEmail`, src/lib/automations/regulator-db.ts). Les adresses viennent
-- pourtant d'un scraping puis d'une extraction LLM : domaines fermés, fautes de
-- frappe, adresses inventées. Chaque rebond abîme la réputation du domaine
-- expéditeur, et rien ne le mesurait — `email_logs.resend_id` était écrit puis
-- jamais relu, faute de webhook.
--
-- Quatre tables, et une idée : séparer ce qui se prouve AVANT l'envoi de ce qui
-- ne se prouve QUE par l'envoi.
--
--   · ce qui se prouve avant  → `email_verifications` + `email_domain_cache`
--     (syntaxe, domaine inexistant, aucun MX, domaine jetable) : gratuit,
--     instantané, certain ;
--   · ce qui ne se prouve que par l'envoi → `email_events` (webhooks Resend) :
--     un rebond dur dit que la boîte n'existe pas, une livraison dit qu'elle
--     existe. C'est la seule preuve réelle, et elle RENOUVELLE la fraîcheur
--     sans jamais rien retester : une adresse qui reçoit reste valide.
--   · `email_suppressions` est au-dessus de tout : une adresse qui s'y trouve
--     ne repart jamais, même jugée valide ailleurs.
--
-- Idempotent : rejouable sans effet de bord.
-- Appliqué via Supabase MCP.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Le verdict, une ligne par adresse ──────────────────────────────────
--
-- La clé est l'ADRESSE, pas le contact : la même adresse sert souvent de
-- contact et de repli d'entreprise (`entreprises.email`), et deux contacts
-- peuvent la partager. La vérifier deux fois serait du travail perdu.
create table if not exists public.email_verifications (
  -- Adresse normalisée : minuscules, sans espaces, sans artefact de scraping.
  email text primary key,
  domain text not null,

  -- valid   : RIEN À SIGNALER. Pas « boîte prouvée » — cette preuve-là n'existe
  --           qu'après une livraison. Envoi normal.
  -- risky   : un SIGNAL NÉGATIF concret (rebond dur sur le même domaine
  --           d'entreprise, domaine sans MX, rebonds doux répétés, parking).
  --           Envoi au compte-gouttes, sous `risky_daily_share`.
  -- invalid : PREUVE de mort — aucun envoi, jamais.
  -- unknown : impossible de trancher (DNS muet). On n'envoie pas, on retente.
  -- pending : jamais vérifiée, en file.
  --
  -- Le catch-all n'est PAS un signal négatif : chez les mutualisés français,
  -- c'est l'état normal de la moitié des prospects.
  status text not null default 'pending'
    check (status in ('valid', 'risky', 'invalid', 'unknown', 'pending')),

  -- Pourquoi ce statut, en un mot : syntaxe | jetable | boite_automatique |
  -- domaine_mort | sans_mx | parking | domaine_suspect | bounce_dur |
  -- bounce_doux | plainte | desabonne | dns_muet | prouvee | mx_ok.
  sub_status text,

  -- 0-100. Sert au tri et à l'affichage, jamais à décider seul.
  score int not null default 0 check (score between 0 and 100),

  -- D'où vient la dernière décision. `delivered` et `bounce` valent mieux que
  -- `auto` : ce sont des faits, pas des déductions.
  source text not null default 'auto'
    check (source in ('auto', 'bounce', 'delivered', 'manual', 'import')),

  checked_at timestamptz not null default now(),
  -- Fraîcheur. Passée cette date, l'adresse repasse par la file de
  -- vérification avant tout envoi. Le délai dépend du statut (120 jours pour
  -- une adresse valide, quelques jours pour une inconnue).
  expires_at timestamptz not null default now(),

  -- Correction proposée quand le domaine ressemble à un domaine connu
  -- (gmial.com → gmail.com). Affichée dans le pipeline, jamais appliquée seule.
  suggestion text,

  -- Preuves accumulées par les envois réels.
  sent_count int not null default 0,
  delivered_count int not null default 0,
  hard_bounce_count int not null default 0,
  soft_bounce_count int not null default 0,
  complaint_count int not null default 0,
  last_event_at timestamptz,

  -- Détail de la chaîne de contrôles : { mx: [...], provider: 'ovh',
  -- checks: { syntax: true, mx: true, disposable: false }, … }
  details jsonb not null default '{}'::jsonb,

  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- La file de vérification lit « ce qui est dû » : expiré, ou jamais vu.
create index if not exists email_verifications_due_idx
  on public.email_verifications(expires_at)
  where status <> 'pending';
create index if not exists email_verifications_pending_idx
  on public.email_verifications(created_at)
  where status = 'pending';
create index if not exists email_verifications_status_idx
  on public.email_verifications(status);
create index if not exists email_verifications_domain_idx
  on public.email_verifications(domain);

comment on table public.email_verifications is
  'Verdict de délivrabilité par adresse. `expires_at` porte la fraîcheur : au-delà, on revérifie avant d''envoyer.';
comment on column public.email_verifications.expires_at is
  'Fin de validité du verdict. Une livraison Resend la repousse gratuitement — une adresse qui reçoit n''est jamais retestée.';

-- ── 2. Cache par domaine ──────────────────────────────────────────────────
--
-- Deux cents garages partagent une douzaine de domaines (orange.fr, gmail.com,
-- wanadoo.fr…). Résoudre le DNS par adresse serait deux cents requêtes pour
-- douze réponses.
create table if not exists public.email_domain_cache (
  domain text primary key,
  has_mx boolean not null default false,
  mx_hosts text[] not null default '{}',
  -- google | microsoft | ovh | ionos | orange | free | laposte | sfr |
  -- o2switch | gandi | zoho | autre
  provider text,
  disposable boolean not null default false,
  free_provider boolean not null default false,
  -- Le provider accepte-t-il vraisemblablement TOUTES les adresses ? Un
  -- mutualisé catch-all rend l'existence de la boîte indémontrable.
  catch_all_guess boolean not null default false,

  -- Mémoire des envois réels vers ce domaine. C'est le signal négatif le plus
  -- fort dont on dispose sans rien envoyer : si `jean@garage-x.fr` a rebondi
  -- dur, `contact@garage-x.fr` est suspecte AVANT d'avoir été essayée.
  --
  -- Volontairement ignoré pour les providers grand public (`free_provider`) :
  -- un rebond sur `paul@gmail.com` ne dit rien de `marie@gmail.com`.
  sent_count int not null default 0,
  delivered_count int not null default 0,
  hard_bounce_count int not null default 0,
  -- Premier envoi vers ce domaine, quel qu'en soit le destinataire. Tant qu'il
  -- est nul et que le domaine porte plusieurs adresses, une seule part : les
  -- autres attendent le verdict. Un domaine mort gèle ses adresses AVANT
  -- qu'elles ne partent, pas après.
  first_send_at timestamptz,
  last_send_at timestamptz,

  checked_at timestamptz not null default now(),
  expires_at timestamptz not null default now(),
  last_error text
);

create index if not exists email_domain_cache_due_idx
  on public.email_domain_cache(expires_at);

comment on table public.email_domain_cache is
  'Résolution DNS mutualisée par domaine — une requête pour toutes les adresses qui le partagent, plus la mémoire des rebonds du domaine.';
comment on column public.email_domain_cache.hard_bounce_count is
  'Rebonds durs encaissés sur CE domaine. Au-delà de 0 sur un domaine d''entreprise, ses autres adresses passent en « douteuses ».';

-- ── 3. Liste de suppression ───────────────────────────────────────────────
--
-- Séparée du verdict, et prioritaire sur lui. Un rebond dur, une plainte ou un
-- désabonnement retirent l'adresse définitivement : c'est une décision, pas une
-- mesure, et elle ne doit pas pouvoir être annulée par une revérification qui
-- trouverait le domaine en bonne santé. Obligation RGPD pour le désabonnement.
create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null
    check (reason in ('hard_bounce', 'complaint', 'unsubscribe', 'manual')),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.user_profiles(id) on delete set null
);

create index if not exists email_suppressions_reason_idx
  on public.email_suppressions(reason, created_at desc);

comment on table public.email_suppressions is
  'Adresses à ne plus jamais contacter. Prioritaire sur le verdict de vérification.';

-- ── 4. Journal des événements Resend ──────────────────────────────────────
--
-- `event_id` en clé primaire : c'est TOUTE l'idempotence du webhook. On insère
-- d'abord ; si l'insertion ne crée rien, l'événement a déjà été traité et on
-- s'arrête — un rejeu ne double aucun compteur.
--
-- C'est aussi ce qui permet de mesurer le taux de rebond sur fenêtre glissante,
-- donc de faire fonctionner le disjoncteur.
create table if not exists public.email_events (
  event_id text primary key,
  -- email.sent | email.delivered | email.bounced | email.complained |
  -- email.delivery_delayed | email.opened | email.clicked
  type text not null,
  email text,
  resend_id text,
  -- hard | soft — renseigné pour les rebonds seulement.
  bounce_type text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_events_created_idx
  on public.email_events(created_at desc);
create index if not exists email_events_type_created_idx
  on public.email_events(type, created_at desc);
create index if not exists email_events_email_idx
  on public.email_events(email, created_at desc);

comment on table public.email_events is
  'Journal brut des webhooks Resend. `event_id` en PK = idempotence : un rejeu n''a aucun effet.';

-- ── 5. Le journal d'envoi apprend ce qu'est devenu chaque email ───────────
-- `resend_id` était stocké et jamais relu. Il devient la jointure avec les
-- événements : l'historique d'un prospect dit enfin « livré », « rebond »,
-- « ouvert », au lieu de s'arrêter à « parti ».
alter table public.email_logs
  add column if not exists delivery_status text,
  add column if not exists bounce_type text,
  add column if not exists delivery_updated_at timestamptz;

create index if not exists email_logs_resend_id_idx
  on public.email_logs(resend_id)
  where resend_id is not null;
create index if not exists email_logs_delivery_idx
  on public.email_logs(delivery_status, sent_at desc)
  where delivery_status is not null;

comment on column public.email_logs.delivery_status is
  'Dernier état connu côté Resend : delivered | bounced | complained | deferred | opened | clicked. NULL = aucun retour.';

-- ── 6. Réglages du régulateur ─────────────────────────────────────────────
alter table public.regulator_settings
  -- Interrupteur général du garde. Coupé, on retrouve le comportement d'avant.
  add column if not exists verify_before_send boolean not null default true,
  -- Fraîcheur exigée d'une adresse valide, en jours.
  add column if not exists verify_ttl_days int not null default 120
    check (verify_ttl_days >= 1),
  -- Part du plafond quotidien réservée aux adresses « douteuses ».
  --
  -- « Douteuse » ne veut PAS dire « non prouvée » : au premier jour, aucune
  -- adresse n'a jamais reçu, donc ce découpage-là ne dirait rien. Une adresse
  -- est douteuse quand elle porte un SIGNAL NÉGATIF concret — un rebond dur sur
  -- le même domaine d'entreprise, un domaine sans MX, trois rebonds doux. Le
  -- reste part à plein régime. Ce quota empêche qu'un lot pourri parte d'un
  -- coup ; il ne bride pas le démarrage.
  add column if not exists risky_daily_share int not null default 20
    check (risky_daily_share between 0 and 100),
  -- Première touche par domaine : sur un domaine d'entreprise jamais éprouvé
  -- portant plusieurs adresses, une seule part et les autres attendent son
  -- verdict. Sans objet pour les providers grand public.
  add column if not exists domain_first_touch boolean not null default true,
  -- Disjoncteur : au-delà du seuil de rebond sur 24 h, la file se gèle seule.
  add column if not exists bounce_guard boolean not null default true,
  add column if not exists bounce_guard_threshold numeric not null default 4.0
    check (bounce_guard_threshold > 0);

comment on column public.regulator_settings.risky_daily_share is
  'Part (%) du plafond quotidien réservée aux adresses non prouvables. Les faire partir au compte-gouttes est le seul moyen de les trancher.';
comment on column public.regulator_settings.bounce_guard_threshold is
  'Taux de rebond dur (%) sur 24 h au-delà duquel le régulateur se met en pause tout seul.';

-- ── 7. Motifs de report ───────────────────────────────────────────────────
-- Le vocabulaire de `hold_reason` s'élargit ; il reste affiché tel quel dans la
-- file du régulateur et dans la colonne Email du pipeline.
comment on column public.sequence_enrollments.hold_reason is
  'Motif du report : out_of_window | next_day | company_gap | daily_cap | sequence_paused | global_pause | one_per_day | no_email | test_hold | email_invalid | email_pending | risky_cap | domain_probe.';

comment on column public.email_logs.blocked_reason is
  'Motif de non-envoi volontaire : mode_test | email_suppressed | email_invalid | email_unverified. NULL = envoi normal.';

-- ── 8. Compteurs atomiques ────────────────────────────────────────────────
--
-- Le ticker envoie, le webhook encaisse les retours : les deux touchent les
-- mêmes compteurs, parfois à la même seconde. Un « lire puis écrire » depuis
-- Node perdrait des incréments. Une fonction SQL fait les deux d'un bloc.
--
-- `security definer` parce qu'appelée par le service-role uniquement ; révoquée
-- de `anon` et `authenticated` juste après, comme le veut
-- sql/20260524_revoke_definer_rpcs_from_anon_authenticated.sql.
create or replace function public.bump_email_send_counters(
  p_email text,
  p_domain text,
  p_at timestamptz default now()
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.email_verifications (email, domain, status, expires_at, sent_count)
  values (p_email, p_domain, 'pending', to_timestamp(0), 1)
  on conflict (email) do update
    set sent_count = public.email_verifications.sent_count + 1;

  insert into public.email_domain_cache (domain, sent_count, first_send_at, last_send_at)
  values (p_domain, 1, p_at, p_at)
  on conflict (domain) do update
    set sent_count    = public.email_domain_cache.sent_count + 1,
        first_send_at = coalesce(public.email_domain_cache.first_send_at, p_at),
        last_send_at  = p_at;
$$;

-- Retour d'un envoi : livraison, rebond, plainte. Même raison d'être — le
-- webhook peut traiter plusieurs événements en parallèle.
--
-- `p_kind` : delivered | hard_bounce | soft_bounce | complaint
create or replace function public.bump_email_event_counters(
  p_email text,
  p_domain text,
  p_kind text,
  p_at timestamptz default now()
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.email_verifications (email, domain, status, expires_at)
  values (p_email, p_domain, 'pending', to_timestamp(0))
  on conflict (email) do nothing;

  update public.email_verifications set
    delivered_count   = delivered_count   + (case when p_kind = 'delivered'   then 1 else 0 end),
    hard_bounce_count = hard_bounce_count + (case when p_kind = 'hard_bounce' then 1 else 0 end),
    soft_bounce_count = soft_bounce_count + (case when p_kind = 'soft_bounce' then 1 else 0 end),
    complaint_count   = complaint_count   + (case when p_kind = 'complaint'   then 1 else 0 end),
    last_event_at     = p_at
  where email = p_email;

  insert into public.email_domain_cache (domain)
  values (p_domain)
  on conflict (domain) do nothing;

  update public.email_domain_cache set
    delivered_count   = delivered_count   + (case when p_kind = 'delivered'   then 1 else 0 end),
    hard_bounce_count = hard_bounce_count + (case when p_kind = 'hard_bounce' then 1 else 0 end)
  where domain = p_domain;
$$;

revoke all on function public.bump_email_send_counters(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bump_email_event_counters(text, text, text, timestamptz) from public, anon, authenticated;

-- ── 9. RLS ────────────────────────────────────────────────────────────────
-- Lecture pour le personnel, écriture réservée à l'admin. Le service-role des
-- routes serveur passe outre, comme partout ailleurs.
alter table public.email_verifications enable row level security;
alter table public.email_domain_cache enable row level security;
alter table public.email_suppressions enable row level security;
alter table public.email_events enable row level security;

drop policy if exists "staff read email_verifications" on public.email_verifications;
drop policy if exists "admin write email_verifications" on public.email_verifications;
create policy "staff read email_verifications" on public.email_verifications
  for select using (public.is_staff());
create policy "admin write email_verifications" on public.email_verifications
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read email_domain_cache" on public.email_domain_cache;
drop policy if exists "admin write email_domain_cache" on public.email_domain_cache;
create policy "staff read email_domain_cache" on public.email_domain_cache
  for select using (public.is_staff());
create policy "admin write email_domain_cache" on public.email_domain_cache
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read email_suppressions" on public.email_suppressions;
drop policy if exists "admin write email_suppressions" on public.email_suppressions;
create policy "staff read email_suppressions" on public.email_suppressions
  for select using (public.is_staff());
create policy "admin write email_suppressions" on public.email_suppressions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read email_events" on public.email_events;
drop policy if exists "admin write email_events" on public.email_events;
create policy "staff read email_events" on public.email_events
  for select using (public.is_staff());
create policy "admin write email_events" on public.email_events
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 10. Amorçage : toutes les adresses connues entrent en file ─────────────
-- `status = 'pending'` et rien d'autre : le tick de vérification s'en occupe,
-- domaine par domaine, sans bloquer cette migration. Tant qu'une adresse est
-- `pending`, aucune séquence ne part vers elle — c'est voulu, et c'est
-- exactement ce qu'on veut le premier jour.
insert into public.email_verifications (email, domain, status)
select distinct
  lower(trim(src.email)),
  split_part(lower(trim(src.email)), '@', 2)
from (
  select email from public.contacts where email is not null and email like '%@%'
  union
  select email from public.entreprises where email is not null and email like '%@%'
) src
where trim(src.email) <> ''
  and split_part(lower(trim(src.email)), '@', 2) <> ''
on conflict (email) do nothing;

commit;

-- ── 11. Le tick de vérification, toutes les 5 minutes ─────────────────────
-- Hors transaction : `cron.schedule` ne se rejoue pas proprement dedans.
--
-- Le <PG_CRON_SECRET> ci-dessous DOIT être remplacé par la valeur passée au
-- runtime Next.js — la route accepte la requête quand l'en-tête
-- `x-pg-cron-secret` correspond. Le job réellement appliqué (via Supabase MCP)
-- porte le vrai secret ; ce fichier garde le marqueur pour qu'aucun secret ne
-- vive dans le dépôt. Même dispositif que `automations-tick`.
--
-- Pour rejouer : select cron.unschedule('email-verify-tick'); puis ce bloc.
select cron.schedule(
  'email-verify-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url        := 'https://crm-vercel.vercel.app/api/email/verify/tick',
    headers    := '{"content-type":"application/json","x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $$
);
