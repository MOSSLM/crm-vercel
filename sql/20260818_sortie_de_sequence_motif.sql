-- Pourquoi une inscription est sortie de sa séquence.
--
-- LE PROBLÈME. `status = 'exited'` écrivait de la même façon deux situations
-- opposées : « le numéro n'a pas de compte WhatsApp » (personne n'a rien reçu,
-- le prospect est intact) et « pas intéressé / bloqué » (quelqu'un a répondu
-- non). Le tableau ne pouvait donc pas rendre les premiers au stock à démarcher
-- sans y renvoyer aussi les seconds.
--
-- La règle de lecture vit dans `src/lib/automations/sortie-sequence.ts` — cette
-- colonne ne fait que la porter.

alter table public.sequence_enrollments
  add column if not exists exit_reason text;

comment on column public.sequence_enrollments.exit_reason is
  'Pourquoi la sortie : hors_canal | stop | reattribution | archive. '
  'NULL = fermée avant que la colonne existe. Cf. src/lib/automations/sortie-sequence.ts';

-- ── Rattraper l''existant ────────────────────────────────────────────────
-- Les sorties déjà en base ne sont pas nombreuses et leur cause est écrite noir
-- sur blanc dans le fil : la route « hors canal » sème une note
-- `email_logs` intitulée « Pas sur WhatsApp » / « Pas sur LinkedIn » sur
-- l''entreprise, à la seconde où elle ferme l''inscription. On rapproche par
-- l''entreprise et par le temps — deux minutes suffisent, les deux écritures se
-- suivent dans la même requête HTTP.
--
-- Rien n''est écrasé : la colonne vient de naître, elle est vide partout.
update public.sequence_enrollments se
   set exit_reason = 'hors_canal'
 where se.status = 'exited'
   and se.exit_reason is null
   and exists (
     select 1
       from public.email_logs l
      where l.entreprise_id = se.entreprise_id
        and l.channel = 'note'
        and l.subject in ('Pas sur WhatsApp', 'Pas sur LinkedIn')
        and l.created_at between coalesce(se.finished_at, se.updated_at) - interval '2 minutes'
                             and coalesce(se.finished_at, se.updated_at) + interval '2 minutes'
   );

-- Le reste des sorties déjà en base vient d''une issue qui ARRÊTE (« pas
-- intéressé », « bloqué / mauvais numéro ») ou d''une réaction commerciale :
-- dans les deux cas quelqu''un a répondu, et on ne les relance pas.
update public.sequence_enrollments
   set exit_reason = 'stop'
 where status = 'exited'
   and exit_reason is null;
