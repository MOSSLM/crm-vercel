-- 20260820_canal_sms.sql — le SMS devient une nature de tâche.
--
-- POURQUOI CETTE MIGRATION EXISTE
-- `prospection_tasks.kind` n'acceptait que call | whatsapp | linkedin | email.
-- Une étape SMS ne pouvait donc pas poser de tâche : la contrainte rejetait la
-- ligne, et le moteur aurait fait échouer l'avancement de l'inscription — pas
-- l'étape seule, l'inscription entière.
--
-- POURQUOI LE SMS EST MANUEL, COMME WHATSAPP
-- L'adaptateur Zadarma porte bien un `sendSms`, mais il n'a JAMAIS envoyé un
-- message : `sms_messages` compte zéro ligne, et le code lui-même porte un
-- « CONFIRM: param names against live spec ». Brancher un envoi payant et non
-- éprouvé dans une boucle automatique, c'est découvrir que les paramètres
-- étaient faux deux cents SMS plus tard.
--
-- Le modèle de WhatsApp est le bon, et le plan le dit : le CRM prépare, l'humain
-- envoie. Un lien `sms:` ouvre l'application du téléphone avec le texte déjà
-- écrit — gratuit, immédiat, et sans dépendre d'un fournisseur.
--
-- Le jour où l'envoi par le CRM sera éprouvé contre le vrai fournisseur, il
-- s'ajoutera comme un MODE de cette même étape. Rien ici n'a besoin de bouger.

alter table public.prospection_tasks
  drop constraint if exists prospection_tasks_kind_check;

alter table public.prospection_tasks
  add constraint prospection_tasks_kind_check
  check (kind = any (array['call'::text, 'whatsapp'::text, 'linkedin'::text, 'email'::text, 'sms'::text]));

-- ── À relire APRÈS application ─────────────────────────────────────────────
-- Le dépôt n'est pas la vérité sur Supabase : ces deux contrôles se relisent en
-- base, ils ne se déduisent pas du fichier.
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.prospection_tasks'::regclass
--     and conname = 'prospection_tasks_kind_check';
--   -- doit citer 'sms'
--
--   select kind, count(*) from public.prospection_tasks group by 1 order by 2 desc;
--   -- aucune ligne existante ne change : la contrainte s'élargit, elle ne se
--   -- resserre jamais.
