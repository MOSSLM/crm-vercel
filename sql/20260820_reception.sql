-- Recevoir vraiment — les cinq colonnes qui manquent à `email_logs`.
--
-- CE QUI EST DÉJÀ LÀ, ET QU'ON NE REFAIT PAS
-- `20260820_conversation.sql` a posé `direction` et `auteur_id` : le fil sait
-- déjà porter un message entrant. Ce qui manquait, c'est de pouvoir en RECEVOIR
-- un sans le recopier — donc de quoi ne pas l'écrire deux fois, de quoi le
-- rattacher à l'envoi auquel il répond, et de quoi dire s'il a été lu.
--
-- POURQUOI PAS UNE TABLE `messages`
-- Le projet a tranché deux fois et l'a écrit (`20260815_notes_de_demarchage.sql`,
-- puis `20260820_conversation.sql`) : « une table séparée aurait obligé chacun
-- de ces écrans à fusionner deux sources dans le bon ordre — trois occasions de
-- diverger ». Un entrant n'a même pas besoin de contourner `to_email not null` :
-- le destinataire, c'est nous.
--
-- ── `message_id` EST LA CLÉ D'IDEMPOTENCE, ET C'EST TOUT LE SUJET ─────────
-- Un webhook rejoue ce qu'il croit perdu ; une relève IMAP relit une boîte
-- entière si son curseur est reparti à zéro. Sans unicité, le même message du
-- prospect entrerait deux fois dans le fil — et surtout `declarerReponse`
-- serait appelée deux fois, ce qui fait AVANCER la séquence d'une étape de
-- trop. C'est la même parade que le webhook Resend : on insère, et c'est le
-- conflit de clé qui dit « déjà vu », pas une lecture préalable qui pourrait
-- s'intercaler entre deux livraisons simultanées.
--
-- L'index est PARTIEL parce que 210 lignes existantes n'ont pas de
-- `message_id`, et qu'aucune n'en aura jamais : un index unique ordinaire
-- traiterait leurs `NULL` comme distincts (donc passerait), mais l'index
-- partiel le DIT plutôt que de le laisser deviner.
begin;

alter table public.email_logs add column if not exists message_id  text;
alter table public.email_logs add column if not exists in_reply_to text;
alter table public.email_logs add column if not exists recu_le     timestamptz;
alter table public.email_logs add column if not exists lu_le       timestamptz;
alter table public.email_logs add column if not exists assignee_id uuid;

create unique index if not exists email_logs_message_id_uniq
  on public.email_logs (message_id)
  where message_id is not null;

-- Retrouver ce qui n'a pas encore été lu, sans balayer le journal.
create index if not exists email_logs_non_lus_idx
  on public.email_logs (recu_le desc)
  where direction = 'entrant' and lu_le is null;

-- Remonter d'une réponse vers l'envoi qui l'a provoquée.
create index if not exists email_logs_in_reply_to_idx
  on public.email_logs (in_reply_to)
  where in_reply_to is not null;

comment on column public.email_logs.message_id is
  'Le `Message-ID` du message, tel que le serveur l''a écrit. Unique quand il est présent : c''est la clé d''idempotence de la réception. NULL sur les 210 lignes d''avant le 20/08/2026 et sur tout envoi dont Resend ne nous rend pas l''en-tête.';

comment on column public.email_logs.in_reply_to is
  'Le `In-Reply-To` (ou le dernier `References`) d''un message reçu. Sert d''appariement de repli quand le sous-adressage n''a pas survécu au client de messagerie.';

comment on column public.email_logs.recu_le is
  'Quand le message est ARRIVÉ. Distinct de `sent_at`, qui dit quand il a été écrit : un serveur peut retenir un message plusieurs heures, et le fil se lit dans l''ordre de l''écriture, pas de la remise.';

comment on column public.email_logs.lu_le is
  'Quand un humain du CRM a ouvert ce message entrant. NULL = non lu. Ne s''applique qu''aux entrants ; un sortant est lu par définition.';

comment on column public.email_logs.assignee_id is
  'À qui ce fil est confié (user_profiles.id). NULL = à personne en particulier — ce qui n''est PAS la même chose que « à tout le monde » : la boîte partagée est le défaut, l''attribution est le geste.';

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name='email_logs'
--    and column_name in ('message_id','in_reply_to','recu_le','lu_le','assignee_id');
--   attendu : 5 lignes
-- select indexname from pg_indexes where tablename='email_logs' and indexname like '%message_id%';
--   attendu : email_logs_message_id_uniq
-- select count(*) from email_logs where message_id is not null;   -- 0 au départ
