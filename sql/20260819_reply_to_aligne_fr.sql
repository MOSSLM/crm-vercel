-- Aligner l'adresse de réponse sur l'expéditeur.
--
-- CE QUI CHANGE
-- Le CRM envoyait depuis `contact@samadigitalstudio.fr` et faisait répondre sur
-- `contact@samadigitalstudio.com`. Ça marchait — mais un `Reply-To` sur un
-- AUTRE domaine que le `From` est le motif exact de l'hameçonnage (« De : votre
-- banque, Répondre à : ailleurs »), et plusieurs filtres le comptent contre
-- l'expéditeur. C'était le prix à payer tant que `contact@samadigitalstudio.fr`
-- n'était la boîte de personne.
--
-- CE QUI L'A RENDU POSSIBLE, le 19/08/2026
-- Matteo a créé la boîte `contact@samadigitalstudio.fr` chez LWS, et le MX du
-- `.fr` a été publié chez Vercel (`10 mail.samadigitalstudio.com`, qui résout
-- sur 83.229.19.109). Le `From` est désormais une vraie boîte.
--
-- L'ÉPREUVE A ÉTÉ REFAITE, comme l'exige `20260819_reply_to_prospection.sql`.
-- Ce fichier disait : « si un jour la messagerie déménage, REFAIRE L'ÉPREUVE
-- avant de supposer que le nouvel hébergeur fait pareil. » Une nouvelle boîte
-- est un déménagement. Épreuve du 19/08 à 21 h 53 : un message de
-- matteo1slm@gmail.com vers `contact+test@samadigitalstudio.fr` est relevé
-- « délivré » dans le suivi LWS, score SPAM −0,25. Le `+` passe sur le `.fr`
-- comme il passait sur le `.com`.
--
-- CE QUI NE CHANGE PAS
-- Le sous-adressage reste allumé : c'est lui qui apparie une réponse à son
-- inscription sans heuristique sur le sujet.
--
-- Le code : src/lib/email/adresse-reponse.ts, src/lib/automations/engine.ts.
--
-- Appliquée en production le 19/08/2026 via execute_sql. Idempotente.

update public.automation_connections
set config = coalesce(config, '{}'::jsonb)
  || jsonb_build_object(
       'reply_to', 'contact@samadigitalstudio.fr',
       'reply_to_sous_adressage', 'oui'
     )
where id = 'resend';

-- Contrôle à relire après application : le domaine du `reply_to` doit être
-- celui de l'expéditeur, `samadigitalstudio.fr`.
--   select config->>'reply_to', config->>'reply_to_sous_adressage'
--   from public.automation_connections where id = 'resend';
