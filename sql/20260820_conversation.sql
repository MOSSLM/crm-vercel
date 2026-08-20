-- La conversation : QUI a parlé, et DANS QUEL SENS.
--
-- LE GRIEF, ET CE QU'IL CACHAIT
-- Matteo : « je ne vois pas les notes de Bilal ». On a d'abord cru à un écran
-- manquant. C'est pire : `email_logs` n'a JAMAIS eu de colonne d'auteur. Les 29
-- notes existantes ne portent le nom de personne — pas parce qu'on les affiche
-- mal, parce que l'information n'a pas été écrite. Aucun écran n'aurait pu la
-- montrer.
--
-- ON NE RATTRAPE PAS LES 29, ET C'EST DÉLIBÉRÉ
-- On pourrait deviner : 10 des 29 ont une tâche bouclée sur la même étape et la
-- même entreprise, avec un seul agent possible ; et les 29 sont sur des fiches
-- qui n'ont que deux propriétaires. Mais deviner un auteur et l'écrire dans une
-- colonne, c'est fabriquer une donnée qui aura l'air relevée. La règle du CRM
-- est constante : un zéro et une absence de mesure ne sont pas la même chose.
-- Les 29 restent sans auteur, l'écran dit « auteur non enregistré », et TOUT ce
-- qui s'écrit à partir d'aujourd'hui porte le sien. 29 notes, c'est deux jours
-- de travail ; la valeur est dans les 200 qui viennent.
--
-- TROIS SENS, PAS DEUX
--   · `sortant` — nous avons écrit. C'est le défaut, et il qualifie les 210
--     lignes existantes sans en toucher une seule.
--   · `entrant`  — le prospect a parlé. C'est le geste neuf : « coller la
--     réponse ». Aujourd'hui RIEN n'entre dans ce CRM — les 177 WhatsApp
--     partent par `wa.me` ouverts à la main, et aucun mécanisme ne captera
--     jamais une réponse WhatsApp sans l'API Business. Le seul transport qui
--     existe, c'est l'agent qui recopie.
--   · `interne` — une note d'équipe. Ni envoyée ni reçue : c'est ce que les 29
--     notes sont réellement, et les y ranger n'invente rien.
--
-- POURQUOI `email_logs` ET PAS UNE TABLE `messages`
-- Le projet a déjà tranché et l'a écrit (`20260815_notes_de_demarchage.sql`) :
-- « une table séparée aurait obligé chacun de ces écrans à fusionner deux
-- sources dans le bon ordre — trois occasions de diverger ». Un message entrant
-- n'a même pas besoin de contourner `to_email not null` : le destinataire, c'est
-- nous.

begin;

alter table public.email_logs add column if not exists auteur_id uuid;
alter table public.email_logs add column if not exists direction text not null default 'sortant';

-- Vocabulaire fermé. `direction` arrive du navigateur sur le geste « coller la
-- réponse » : une valeur inventée sortirait la ligne de tous les fils sans que
-- rien ne le signale.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'email_logs_direction_chk') then
    alter table public.email_logs
      add constraint email_logs_direction_chk
      check (direction in ('sortant', 'entrant', 'interne'));
  end if;
end $$;

comment on column public.email_logs.auteur_id is
  'Qui a écrit cette ligne (user_profiles.id). NULL = le CRM lui-même (moteur, cron) ou une ligne antérieure au 20/08/2026, quand la colonne n''existait pas. NULL ne veut PAS dire « personne » : il veut dire « non enregistré ».';

comment on column public.email_logs.direction is
  'sortant (nous avons écrit) · entrant (le prospect a parlé, recopié à la main) · interne (note d''équipe). Les 210 lignes d''avant le 20/08 sont sortantes par défaut, sauf les notes, passées en interne.';

-- Les notes ne sont ni envoyées ni reçues. Un `UPDATE` de qualification, pas de
-- réécriture : `email_logs` ne porte pas de trigger `updated_at`, et aucune
-- colonne de contenu n'est touchée.
update public.email_logs set direction = 'interne'
where channel = 'note' and direction = 'sortant';

-- Lire un fil, c'est lire une entreprise dans l'ordre du temps. L'index existant
-- sur `entreprise_id` seul oblige à trier après coup ; celui-ci rend le fil déjà
-- ordonné.
create index if not exists email_logs_fil_idx
  on public.email_logs using btree (entreprise_id, sent_at desc)
  where entreprise_id is not null;

-- Retrouver ce qui attend une réponse sans balayer tout le journal.
create index if not exists email_logs_entrants_idx
  on public.email_logs using btree (sent_at desc)
  where direction = 'entrant';

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select direction, channel, count(*) from email_logs group by 1, 2 order by 1, 2;
--   attendu au 20/08 : interne/note 29 · sortant/email 4 · sortant/whatsapp 177
-- select count(*) from email_logs where auteur_id is not null;   -- 0 au départ
-- select conname from pg_constraint where conname = 'email_logs_direction_chk';
