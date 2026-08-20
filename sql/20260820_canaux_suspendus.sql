-- Suspendre un canal — lancer une séquence sans qu'il en parte quoi que ce soit.
--
-- LE BESOIN, EN UNE PHRASE : les boîtes d'envoi ne sont pas encore chaudes.
-- L'e-mail existe dans les séquences, il est écrit, il est relu — mais le faire
-- partir aujourd'hui abîmerait la réputation qu'on est justement en train de
-- construire. Il ne faut pas retirer les étapes e-mail des séquences pour
-- autant : les remettre plus tard, c'est réécrire ce qui a été relu, et
-- réintroduire les défauts qu'on vient de corriger.
--
-- POURQUOI PAS `paused`, POURQUOI PAS LA PHASE DE TEST. Les deux existent déjà
-- et arrêtent tout : `paused` gèle le régulateur entier, la phase de test gèle
-- chaque prospect hors liste à son étape. Or ici on ne veut pas geler — on veut
-- que la séquence CONTINUE par un autre canal. Un artisan sans mobile doit être
-- appelé, pas mis en attente pendant six semaines.
--
-- CE QUE LA COLONNE FAIT, DEUX EFFETS DE NATURES DIFFÉRENTES :
--
--   1. L'AIGUILLAGE — `a_email` répond « non » tant que l'e-mail est suspendu.
--      L'échelle de S1 (« a-t-il un mobile ? » → « a-t-il une adresse ? » →
--      appel) route alors d'elle-même autour du canal : personne ne s'arrête,
--      tout le monde descend d'un barreau. Rien à modifier dans les séquences.
--
--   2. LA CEINTURE — une étape sur un canal suspendu N'ENVOIE RIEN et ne pose
--      aucune tâche : elle retient l'inscription avec le motif `canal_suspendu`,
--      lisible dans le régulateur. C'est le filet pour les étapes qu'un
--      aiguillage n'aura pas évitées (la plaquette e-mail de S2, par exemple,
--      qui est la voie « sinon » d'une question sur le mobile).
--
-- SEUL `a_email` EST MASQUÉ, ET C'EST VOULU. `a_mobile` sert à la fois à
-- WhatsApp et à l'appel : le masquer parce que WhatsApp est suspendu couperait
-- aussi le téléphone. L'e-mail est le seul canal qui corresponde exactement à
-- un fait du prospect.
--
-- Les valeurs sont des GENRES D'ÉTAPE (`email`, `whatsapp`, `sms`, `call`,
-- `linkedin`), pas des canaux de contact : c'est l'étape qu'on suspend.

alter table public.regulator_settings
  add column if not exists canaux_suspendus text[] not null default '{}'::text[];

comment on column public.regulator_settings.canaux_suspendus is
  'Genres d''étape suspendus (email, whatsapp, sms, call, linkedin). Une étape '
  'd''un genre suspendu n''envoie rien et ne pose aucune tâche : elle retient '
  'l''inscription avec le motif « canal_suspendu ». En prime, « a_email » '
  'répond non tant que l''e-mail y figure, pour que les aiguillages de canal '
  'contournent l''étape au lieu de s''y arrêter.';

-- ── Contrôles à relire APRÈS application ───────────────────────────────────
-- Le dépôt n'est pas la vérité sur Supabase : on vérifie, on ne suppose pas.
--
--   select canaux_suspendus from public.regulator_settings where id = 'global';
--   -- attendu : {} — la colonne existe et ne suspend rien tant qu'on n'a pas
--   -- basculé l'interrupteur depuis Pilotage › Régulateur.
