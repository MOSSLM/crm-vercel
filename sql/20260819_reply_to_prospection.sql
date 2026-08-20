-- Reply-To sur les envois de prospection.
--
-- CE QUE ÇA CORRIGE
-- `sendEngineEmail` partait sans `Reply-To`, sans en-têtes et sans étiquettes.
-- Deux conséquences, dont une irrattrapable :
--   1. la réponse d'un prospect arrivait dans la boîte de l'expéditeur, où le
--      CRM ne la voit pas ;
--   2. rien dans le message ne disait à quelle inscription elle répondait — et
--      un email DÉJÀ PARTI ne pourra jamais être apparié après coup, quoi qu'on
--      construise plus tard. C'est ce qui a rendu ce réglage urgent.
--
-- CE QUI EST POSÉ
--   reply_to                  l'adresse de retour, toujours utilisée
--   reply_to_sous_adressage   'oui' pour écrire `contact+<inscription>@…`
--
-- LE SOUS-ADRESSAGE A ÉTÉ ÉPROUVÉ AVANT D'ÊTRE ALLUMÉ
-- La messagerie du domaine est chez LWS (MX `mail.samadigitalstudio.com`,
-- reverse `mail84.lwspanel.com`, SPF `a:mailphp.lws-hosting.com`) : un
-- mutualisé dont la prise en charge du `+` n'est garantie nulle part. Un
-- serveur qui ne la connaît pas REJETTE la réponse du prospect — on perdrait la
-- réponse elle-même pour gagner son appariement. Mauvais échange, donc le
-- réglage est né à 'non'.
--
-- Épreuve faite le 19/08/2026 par Matteo : un message envoyé à
-- `contact+test@samadigitalstudio.com` est bien arrivé dans la boîte
-- `contact@`. LWS accepte le `+`. Réglage passé à 'oui' dans la foulée —
-- l'appariement des réponses est désormais exact, sans heuristique sur le
-- sujet ni sur l'adresse d'origine.
--
-- Si un jour la messagerie déménage, REFAIRE L'ÉPREUVE avant de supposer que
-- le nouvel hébergeur fait pareil.
--
-- Le code : src/lib/email/adresse-reponse.ts (module pur, testé) et
-- src/lib/automations/engine.ts (sendEngineEmail).
--
-- Appliquée en production le 19/08/2026 via execute_sql. Idempotente.

update public.automation_connections
set config = coalesce(config, '{}'::jsonb)
  || jsonb_build_object(
       'reply_to', 'contact@samadigitalstudio.com',
       'reply_to_sous_adressage', 'oui'
     )
where id = 'resend';

-- Contrôle à relire après application : doit rendre une ligne, avec l'adresse.
--   select id, config->>'reply_to', config->>'reply_to_sous_adressage'
--   from public.automation_connections where id = 'resend';
