-- Le réchauffeur d'adresses — les cinq tables.
--
-- PORTÉ DE `/Users/matt/Code/email-warmup/sql/001_schema.sql`, avec trois
-- différences de fond. Chacune vient d'une mesure, pas d'une préférence.
--
-- ── 1. IL N'Y A PLUS DE « POOL DE BOÎTES », IL Y A DES EXPÉDITEURS ET DES
--       TÉMOINS, ET ILS NE SE MÉLANGENT PLUS.
-- L'original faisait s'écrire ses boîtes entre elles : chacune était à la fois
-- expéditrice et destinataire. Chez nous l'expéditeur part par Resend depuis
-- `@samadigitalstudio.fr` — un domaine qui n'a AUCUN MX et ne peut donc rien
-- recevoir. Un envoi de nous vers nous n'existe pas. Les deux rôles se séparent
-- en deux tables, et les contraintes « un seul expéditeur / un seul
-- destinataire » de l'original disparaissent avec le cas qu'elles gardaient.
--
-- ── 2. LA RLS. L'original n'en avait aucune — il tournait sur un Postgres à
-- lui, derrière une seule application. Ici, une table `public` SANS RLS est
-- exposée telle quelle par PostgREST : `rechauffe_temoins.secret_enc`
-- deviendrait lisible par quiconque possède la clé publiable, c'est-à-dire par
-- n'importe quel visiteur du site. C'EST LE DANGER PRINCIPAL DE CE PORTAGE, et
-- il ne se rattrape pas : un secret lu une fois est lu pour toujours.
-- Les secrets sont donc réservés à l'admin ; le personnel lit la mesure, pas
-- les identifiants.
--
-- ── 3. PAS DE TABLE DE VERROU. `engine_locks` réinventait
-- `pg_advisory_lock` avec un TTL à surveiller — et son `releaseLock` ne
-- vérifiait pas qui détenait le verrou, si bien qu'un tick en retard pouvait
-- libérer celui d'un autre. Le verrou consultatif de Postgres tombe tout seul
-- à la fin de la session : rien à surveiller, rien à libérer de travers.
-- Pas de table `oauth_states` non plus : les témoins se branchent en IMAP avec
-- un mot de passe d'application, il n'y a pas de danse OAuth.
--
-- Le code : `src/lib/rechauffeur/` (courbe, sante, contenu, appariement).
-- La décision d'architecture : `docs/lemlist/08-rechauffeur.md`.
--
-- Idempotente. À appliquer via execute_sql, puis relire les contrôles en fin de
-- fichier — le dépôt n'est pas la vérité sur Supabase.

-- ── 1. Les expéditeurs — nos adresses de prospection, chauffées par Resend ──
--
-- Une ligne par adresse d'envoi. `plafond_prospection` est ce qui manquait au
-- CRM : `regulator_settings.daily_cap` est unique pour tout le monde (120), ce
-- qui rend toute rotation d'expéditeurs contradictoire — deux boîtes se
-- partageraient un plafond au lieu d'en avoir chacune un.
create table if not exists public.rechauffe_expediteurs (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  nom           text not null default '',
  -- Le domaine qui SIGNE (`d=`), pas celui de l'adresse : c'est lui que le
  -- filtre indexe. Chez nous les deux coïncident, mais l'un ne vaut pas l'autre
  -- et le jour où l'enveloppe changera, la colonne dira laquelle est vraie.
  domaine_signant text not null,
  statut        text not null default 'en_pause'
    check (statut in ('en_pause','chauffe','entretien','erreur','dns_bloquant')),
  demarre_le    date,
  cible_jour    int  not null default 40 check (cible_jour > 0),
  plafond_prospection int not null default 50 check (plafond_prospection >= 0),
  fuseau        text not null default 'Europe/Paris',
  fenetre_de    int  not null default 8  check (fenetre_de between 0 and 23),
  fenetre_a     int  not null default 19 check (fenetre_a between 1 and 24),
  derniere_erreur text,
  dns_controle_le timestamptz,
  dns_rapport   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint rechauffe_expediteurs_fenetre check (fenetre_a > fenetre_de)
);

drop trigger if exists rechauffe_expediteurs_touch on public.rechauffe_expediteurs;
create trigger rechauffe_expediteurs_touch
  before update on public.rechauffe_expediteurs
  for each row execute function public.tg_au_updated_at();

-- ── 2. Les témoins — les boîtes qui reçoivent, mesurent et répondent ───────
--
-- `secret_enc` est un mot de passe d'application chiffré en AES-256-GCM, la
-- clé vivant dans l'environnement. Sans lecture IMAP (`peut_lire = false`) on
-- envoie à l'aveugle : le message part, mais on ne saura jamais s'il est
-- arrivé en boîte ou en spam. Un témoin muet ne vaut donc presque rien —
-- l'écran doit le dire plutôt que de le compter comme les autres.
create table if not exists public.rechauffe_temoins (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  nom           text not null default '',
  -- Les familles servent à la DIVERSITÉ, pas à brider l'expéditeur. Orange et
  -- Free y figurent parce qu'ils règnent chez les artisans français et
  -- qu'aucun réseau de chauffe américain ne les couvre.
  famille       text not null default 'autre'
    check (famille in ('google','microsoft','yahoo','orange','free','autre')),
  secret_enc    text,
  config        jsonb not null default '{}'::jsonb,  -- hôte/port IMAP
  peut_lire     boolean not null default false,
  repond        boolean not null default true,
  taux_reponse  numeric not null default 0.40 check (taux_reponse between 0 and 1),
  plafond_jour  int not null default 8 check (plafond_jour >= 0),
  actif         boolean not null default true,
  verifie_le    timestamptz,
  derniere_erreur text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists rechauffe_temoins_touch on public.rechauffe_temoins;
create trigger rechauffe_temoins_touch
  before update on public.rechauffe_temoins
  for each row execute function public.tg_au_updated_at();

-- ── 3. Les messages ───────────────────────────────────────────────────────
--
-- `reference` est le jeton unique qui voyage en en-tête `X-Sama-Ref` et qu'on
-- retrouve dans la boîte témoin. L'original appariait sur l'objet — or les
-- objets viennent d'un corpus de quatorze : deux messages du même jour
-- peuvent porter le même, et on aurait déclaré « en spam » le mauvais.
create table if not exists public.rechauffe_messages (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  expediteur_id uuid not null references public.rechauffe_expediteurs(id) on delete cascade,
  temoin_id     uuid not null references public.rechauffe_temoins(id) on delete cascade,
  -- Le sens : 'sortant' = nous vers le témoin, 'reponse' = le témoin vers nous.
  -- C'est la réponse qui porte le signal le plus fort, et elle part de la boîte
  -- du témoin par son propre SMTP — jamais par Resend.
  sens          text not null default 'sortant' check (sens in ('sortant','reponse')),
  fil_id        uuid references public.rechauffe_messages(id) on delete cascade,
  objet         text not null,
  -- Le texte est ÉCRIT À LA PLANIFICATION et conservé. Deux raisons : une
  -- reprise après échec renverrait sinon un autre texte sous la même
  -- référence, et surtout l'écran doit pouvoir montrer ce que l'outil écrit
  -- au nom de son propriétaire. Un réchauffeur qu'on ne peut pas relire est
  -- un réchauffeur qu'on n'ose pas laisser tourner.
  texte         text not null default '',
  rfc_message_id text,
  resend_id     text,
  prevu_le      timestamptz not null,
  envoye_le     timestamptz,
  erreur        text,
  tentatives    int not null default 0,
  placement     text not null default 'attente'
    check (placement in ('attente','boite','spam','introuvable')),
  placement_le  timestamptz,
  sorti_du_spam_le timestamptz,
  reponse_due_le timestamptz,
  repondu_le    timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.rechauffe_messages
  add column if not exists texte text not null default '';

create index if not exists rechauffe_messages_a_envoyer_idx
  on public.rechauffe_messages(prevu_le) where envoye_le is null;
create index if not exists rechauffe_messages_a_repondre_idx
  on public.rechauffe_messages(reponse_due_le)
  where repondu_le is null and reponse_due_le is not null;
create index if not exists rechauffe_messages_a_mesurer_idx
  on public.rechauffe_messages(envoye_le) where placement = 'attente';
create index if not exists rechauffe_messages_paire_idx
  on public.rechauffe_messages(expediteur_id, temoin_id, prevu_le desc);

-- ── 4. Le journal — append-only, c'est la mémoire de l'outil ───────────────
create table if not exists public.rechauffe_journal (
  id            bigserial primary key,
  au            timestamptz not null default now(),
  expediteur_id uuid references public.rechauffe_expediteurs(id) on delete cascade,
  message_id    uuid references public.rechauffe_messages(id) on delete cascade,
  genre         text not null,
  detail        jsonb not null default '{}'::jsonb
);
create index if not exists rechauffe_journal_expediteur_idx
  on public.rechauffe_journal(expediteur_id, au desc);

-- ── 5. L'agrégat du jour — ce que lit l'écran ─────────────────────────────
--
-- `capacite_prospection` est le seul chiffre que le réchauffeur RENDE au reste
-- du CRM. Il ne demande pas de créneau au régulateur et ne passe pas dans sa
-- file : il pose un nombre, le régulateur en fait ce qu'il veut.
create table if not exists public.rechauffe_jours (
  expediteur_id uuid not null references public.rechauffe_expediteurs(id) on delete cascade,
  jour          date not null,
  jour_de_chauffe int not null default 0,
  prevus        int not null default 0,
  envoyes       int not null default 0,
  en_boite      int not null default 0,
  en_spam       int not null default 0,
  introuvables  int not null default 0,
  sortis_du_spam int not null default 0,
  reponses      int not null default 0,
  echecs        int not null default 0,
  taux_placement numeric,
  score_sante   int,
  capacite_prospection int not null default 0,
  par_famille   jsonb not null default '{}'::jsonb,
  primary key (expediteur_id, jour)
);

-- ── 6. RLS — le point qui manquait entièrement à l'original ───────────────
--
-- Le service-role d'abord, pour la raison écrite en toutes lettres dans
-- `20260803_email_verification.sql` : les politiques `is_staff()` / `is_admin()`
-- lisent le profil d'`auth.uid()`, vide côté serveur. Sans cette politique, le
-- moteur ne verrait AUCUNE ligne — sans la moindre erreur : la file paraîtrait
-- vide et la chauffe serait à l'arrêt sans que rien ne le signale.
alter table public.rechauffe_expediteurs enable row level security;
alter table public.rechauffe_temoins     enable row level security;
alter table public.rechauffe_messages    enable row level security;
alter table public.rechauffe_journal     enable row level security;
alter table public.rechauffe_jours       enable row level security;

drop policy if exists "service_role all rechauffe_expediteurs" on public.rechauffe_expediteurs;
drop policy if exists "service_role all rechauffe_temoins"     on public.rechauffe_temoins;
drop policy if exists "service_role all rechauffe_messages"    on public.rechauffe_messages;
drop policy if exists "service_role all rechauffe_journal"     on public.rechauffe_journal;
drop policy if exists "service_role all rechauffe_jours"       on public.rechauffe_jours;

create policy "service_role all rechauffe_expediteurs" on public.rechauffe_expediteurs
  for all to service_role using (true) with check (true);
create policy "service_role all rechauffe_temoins" on public.rechauffe_temoins
  for all to service_role using (true) with check (true);
create policy "service_role all rechauffe_messages" on public.rechauffe_messages
  for all to service_role using (true) with check (true);
create policy "service_role all rechauffe_journal" on public.rechauffe_journal
  for all to service_role using (true) with check (true);
create policy "service_role all rechauffe_jours" on public.rechauffe_jours
  for all to service_role using (true) with check (true);

-- La mesure se lit par le personnel ; les réglages s'écrivent par l'admin.
drop policy if exists "staff read rechauffe_expediteurs" on public.rechauffe_expediteurs;
drop policy if exists "admin write rechauffe_expediteurs" on public.rechauffe_expediteurs;
create policy "staff read rechauffe_expediteurs" on public.rechauffe_expediteurs
  for select using (public.is_staff());
create policy "admin write rechauffe_expediteurs" on public.rechauffe_expediteurs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read rechauffe_messages" on public.rechauffe_messages;
drop policy if exists "admin write rechauffe_messages" on public.rechauffe_messages;
create policy "staff read rechauffe_messages" on public.rechauffe_messages
  for select using (public.is_staff());
create policy "admin write rechauffe_messages" on public.rechauffe_messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read rechauffe_journal" on public.rechauffe_journal;
drop policy if exists "admin write rechauffe_journal" on public.rechauffe_journal;
create policy "staff read rechauffe_journal" on public.rechauffe_journal
  for select using (public.is_staff());
create policy "admin write rechauffe_journal" on public.rechauffe_journal
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read rechauffe_jours" on public.rechauffe_jours;
drop policy if exists "admin write rechauffe_jours" on public.rechauffe_jours;
create policy "staff read rechauffe_jours" on public.rechauffe_jours
  for select using (public.is_staff());
create policy "admin write rechauffe_jours" on public.rechauffe_jours
  for all using (public.is_admin()) with check (public.is_admin());

-- LES TÉMOINS N'ONT PAS DE POLITIQUE DE LECTURE POUR LE PERSONNEL.
-- Cette table porte `secret_enc`. Le chiffrement AES-256-GCM rend la colonne
-- inexploitable sans la clé, mais un identifiant de boîte ne se distribue pas
-- « au cas où » : le personnel n'a rien à y faire, et la vue ci-dessous lui
-- donne tout ce dont il a besoin — sans le secret.
drop policy if exists "admin all rechauffe_temoins" on public.rechauffe_temoins;
create policy "admin all rechauffe_temoins" on public.rechauffe_temoins
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 7. La vue du maillage, sans un seul secret ────────────────────────────
create or replace view public.v_rechauffe_maillage
with (security_invoker = true) as
select
  t.id, t.email, t.nom, t.famille, t.peut_lire, t.repond,
  t.taux_reponse, t.plafond_jour, t.actif, t.verifie_le,
  (t.secret_enc is not null)                      as branche,
  coalesce(j.recus_aujourdhui, 0)::int            as recus_aujourdhui
from public.rechauffe_temoins t
left join lateral (
  select count(*) as recus_aujourdhui
  from public.rechauffe_messages m
  where m.temoin_id = t.id
    and m.sens = 'sortant'
    and m.prevu_le >= date_trunc('day', now())
) j on true;

-- ── Contrôles à relire APRÈS application ──────────────────────────────────
--
-- 1. Les cinq tables portent bien la RLS — aucune ligne ne doit ressortir :
--   select relname from pg_class
--   where relname like 'rechauffe\_%' and relkind = 'r' and not relrowsecurity;
--
-- 2. Les témoins ne sont lisibles QUE par l'admin et le service-role —
--    doit rendre exactement 2 lignes, aucune avec roles = {authenticated} :
--   select policyname, roles, cmd from pg_policies
--   where tablename = 'rechauffe_temoins';
--
-- 3. Le secret ne fuit pas par la vue — doit rendre 0 ligne :
--   select column_name from information_schema.columns
--   where table_name = 'v_rechauffe_maillage' and column_name = 'secret_enc';
