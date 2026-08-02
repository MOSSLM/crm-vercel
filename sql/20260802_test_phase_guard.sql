-- ═══════════════════════════════════════════════════════════════════════════
-- Phase de test : aucun email ne part vers un vrai prospect
--
-- Le « mode test » existant (sql/20260611_test_mode.sql) se contentait de créer
-- des opportunités factices reliées à une adresse perso. Il n'empêchait rien :
-- une séquence lancée sur de vrais prospects envoyait pour de vrai.
--
-- Ici on ajoute un INTERRUPTEUR GLOBAL. Quand il est actif, seules les adresses
-- de `test_email_addresses` reçoivent réellement ; tout autre destinataire est
-- bloqué, journalisé avec son motif, et la séquence avance quand même — c'est
-- ce qui permet de voir le régulateur tourner de bout en bout sans qu'un seul
-- email ne sorte.
--
-- Idempotent : rejouable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. L'interrupteur, sur les réglages du régulateur ─────────────────────
alter table public.regulator_settings
  add column if not exists test_mode boolean not null default false;

comment on column public.regulator_settings.test_mode is
  'Phase de test : seules les adresses de test_email_addresses reçoivent réellement.';

-- ── 2. Motif de blocage sur le journal d'envoi ────────────────────────────
-- `status = 'failed'` disait « ça n'est pas parti » sans dire pourquoi. Un
-- envoi retenu par la phase de test n'est pas une panne : il doit se distinguer
-- d'un rejet Resend.
alter table public.email_logs
  add column if not exists blocked_reason text;

create index if not exists email_logs_blocked_idx
  on public.email_logs(blocked_reason, sent_at desc)
  where blocked_reason is not null;

comment on column public.email_logs.blocked_reason is
  'Motif de non-envoi volontaire (mode_test…). NULL = envoi normal.';

-- ── 3. Les adresses de la phase de test ───────────────────────────────────
insert into public.test_email_addresses (label, email) values
  ('Matteo (perso)',     'matteo1slm@gmail.com'),
  ('Coding Mos',         'codingmos@gmail.com'),
  ('Matteo Sallami',     'matteo.sallami@gmail.com'),
  ('Ikres',              'ikres.ms@gmail.com'),
  ('Matteo (SAMA)',      'matteos@samadigitalstudio.com'),
  ('Contact SAMA',       'contact@samadigitalstudio.com')
on conflict (email) do nothing;

-- ── 4. Remise à zéro de l'état du pipeline commercial ─────────────────────
-- Les colonnes ne sont plus des identifiants figés ('seq', 'email', 'wa'…) :
-- elles viennent désormais des étapes de la séquence choisie puis des étapes
-- du pipeline, et la position est DÉRIVÉE (inscription en cours, sinon
-- `opportunites.stage_id`). Les anciennes valeurs n'ont plus de sens.
-- La fonctionnalité n'a pas encore servi en production : rien à préserver.
update public.sales_pipeline_state
set reached = 'seq',
    passed = '{}',
    skipped = '{}'
where reached <> 'seq' or passed <> '{}' or skipped <> '{}';

commit;
