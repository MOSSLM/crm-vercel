-- 20260820 — Trois séquences conditionnelles, à la place des six linéaires.
--
-- ⚠️ CE FICHIER DÉCRIT L'ÉTAT FINAL. Il a été appliqué en deux temps le
-- 20/08/2026 : une première version aiguillait à l'entrée sur UN canal, Matteo
-- l'a relue et a demandé une ÉCHELLE. C'est la seconde qui est en base, et
-- c'est elle qui est écrite ici.
--
-- CE QUI A CHANGÉ ENTRE LES DEUX, ET POURQUOI
-- Aiguiller à l'entrée enferme : un prospect qui a un mobile ET une adresse
-- partait sur WhatsApp, et s'il ne répondait jamais, plus rien. « Tant qu'on a
-- WhatsApp on WhatsApp, sinon on e-mail, puis appel » n'est pas un aiguillage,
-- c'est une ÉCHELLE — on descend d'un barreau quand le précédent n'a rien
-- donné. Le tronc de S1 est cette échelle : chaque barreau est une question
-- « a-t-il ce canal ? » dont la voie « oui » contient le cycle complet. Qui
-- n'a pas le canal traverse une voie vide et tombe au barreau suivant ; qui
-- réagit sort par un passage de relais et ne descend jamais.
--
-- LES DÉLAIS NE SONT PAS DANS LES `day`, ILS SONT DANS LES ATTENTES.
-- Tous les `day` de S1 valent 0, et ce n'est pas un oubli. `stepStartMs` compte
-- à partir du `day` de l'étape d'ANCRAGE, et l'ancre se repose à chaque geste
-- humain et à chaque attente qui se libère. Des `day` croissants auraient fait
-- attendre sept jours à un prospect sans mobile avant son premier e-mail — le
-- barreau qu'il saute ne repose pas l'ancre. Avec des `day` à 0, chaque étape
-- part dès que la précédente rend la main, et le rythme vient des
-- `replyTimeoutDays`, qui est l'endroit honnête pour l'écrire.
--
-- Ce que ça donne, mesuré par `cheminSuppose` avant écriture :
--   mobile, jamais de réponse : J0 accroche · J3 relance+démo · J7 e-mail démo
--                               · J11 relance · J14 appel · J21 appel 2 · S3
--   mobile, répond            : accroche · démo WhatsApp · S2
--   e-mail seul               : J0 e-mail démo · J4 relance · J7 appel · J14 appel 2 · S3
--   fixe seul, décroche       : J0 appel · S2
--
-- ⚠️ LES TROIS SONT EN `draft`. Rien ne partira tant que personne ne les aura
-- activées : une séquence qui n'est pas `on` gèle ses inscriptions avec un
-- motif visible au lieu de les faire avancer.

begin;

create table if not exists archive_sequences_20260820b as
select id, name, status, description, definition, settings, updated_at, now() as archive_le
from automations where kind = 'sequence';

create table if not exists archive_inscriptions_20260820b as
select id, automation_id, entreprise_id, contact_id, opportunite_id, current_step, status,
       hold_reason, next_run_at, anchor_at, anchor_step, vars, entered_at, updated_at,
       now() as archive_le
from sequence_enrollments;

create table if not exists archive_taches_20260820b as
select * from prospection_tasks
where automation_id in (select id from automations where kind = 'sequence');

-- ── Les modèles que S2 utilise ───────────────────────────────────────────
-- La plaquette répond à « combien ça coûte ». C'est pour ça qu'elle n'est PAS
-- dans S1 : envoyée au premier contact, elle répond à une question que personne
-- n'a posée, et elle alourdit un message qui porte déjà un lien de démo.
insert into whatsapp_templates (id, name, body, body_contact) values
('0e7a1f10-0000-4000-8000-000000000005','Plaquette — ce que ça coûte', '…', '…')
on conflict (id) do nothing;
insert into email_templates (id, name, type, subject, body, subject_contact, body_contact) values
('0e7a1f12-0000-4000-8000-000000000004','Plaquette — ce que ça coûte','prospection',
 '{{company.name}} — ce que ça coûte, en une page', '…', '{{company.name}} — ce que ça coûte, en une page', '…')
on conflict (id) do nothing;
insert into call_scripts (id, name, duration, body, body_contact) values
('0e7a1f11-0000-4000-8000-000000000004','Il a ouvert la plaquette','5 min', '…', '…')
on conflict (id) do nothing;
-- (les corps réels sont en base ; ils se relisent et se corrigent dans
--  Prospection → Modèles, pas dans un fichier de migration)

-- ── S1 — PREMIER CONTACT : l'échelle des canaux ──────────────────────────
insert into automations (id, kind, name, description, status, definition, settings) values (
  '0e7a1f30-0000-4000-8000-000000000001', 'sequence', 'S1 — Premier contact',
  'L''échelle des canaux : WhatsApp d''abord tant qu''il y a un mobile, et seulement s''il n''a rien dit, l''e-mail avec la démo, puis l''appel. Le site démo part dans S1, sur le canal qu''on utilise. Qui réagit passe à « S2 — Après la démo ».',
  'draft', '{"steps":[{"id":"waQ","kind":"condition","day":0,"branch":null,"condition":{"champ":"a_mobile","operateur":"vrai"}},{"id":"wa1","kind":"whatsapp","mode":"manual","day":0,"template":"0e7a1f10-0000-4000-8000-000000000001","branch":{"waitId":"waQ","on":"reply"}},{"id":"waW","kind":"wait","day":0,"waitMode":"reply","replyTimeoutDays":3,"branch":{"waitId":"waQ","on":"reply"}},{"id":"waDemo","kind":"whatsapp","mode":"manual","day":0,"template":"0e7a1f10-0000-4000-8000-000000000002","branch":{"waitId":"waW","on":"reply"}},{"id":"waGo","kind":"transition","day":0,"branch":{"waitId":"waW","on":"reply"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000002"}},{"id":"wa2","kind":"whatsapp","mode":"manual","day":0,"template":"0e7a1f10-0000-4000-8000-000000000004","branch":{"waitId":"waW","on":"timeout"}},{"id":"waW2","kind":"wait","day":0,"waitMode":"reply","replyTimeoutDays":4,"branch":{"waitId":"waW","on":"timeout"}},{"id":"waGo2","kind":"transition","day":0,"branch":{"waitId":"waW2","on":"reply"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000002"}},{"id":"mlQ","kind":"condition","day":0,"branch":null,"condition":{"champ":"a_email","operateur":"vrai"}},{"id":"ml1","kind":"email","mode":"auto","day":0,"template":"0e7a1f12-0000-4000-8000-000000000003","branch":{"waitId":"mlQ","on":"reply"}},{"id":"mlW","kind":"wait","day":0,"waitMode":"reply","replyTimeoutDays":4,"branch":{"waitId":"mlQ","on":"reply"}},{"id":"mlGo","kind":"transition","day":0,"branch":{"waitId":"mlW","on":"reply"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000002"}},{"id":"ml2","kind":"email","mode":"auto","day":0,"template":"0e7a1f12-0000-4000-8000-000000000002","branch":{"waitId":"mlW","on":"timeout"}},{"id":"mlW2","kind":"wait","day":0,"waitMode":"reply","replyTimeoutDays":3,"branch":{"waitId":"mlW","on":"timeout"}},{"id":"mlGo2","kind":"transition","day":0,"branch":{"waitId":"mlW2","on":"reply"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000002"}},{"id":"ap1","kind":"call","mode":"manual","day":0,"duration":"3 min","script":"cc1793f6-7da7-4db3-b508-657c114b85b1","branch":null},{"id":"issQ","kind":"condition","day":0,"branch":null,"condition":{"champ":"issue_dernier_appel","operateur":"est","valeurs":["answered","lukewarm"]}},{"id":"issGo","kind":"transition","day":0,"branch":{"waitId":"issQ","on":"reply"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000002"}},{"id":"ap2","kind":"call","mode":"manual","day":7,"duration":"2 min","script":"cc1793f6-7da7-4db3-b508-657c114b85b1","branch":{"waitId":"issQ","on":"timeout"}},{"id":"issQ2","kind":"condition","day":7,"branch":{"waitId":"issQ","on":"timeout"},"condition":{"champ":"issue_dernier_appel","operateur":"est","valeurs":["answered","lukewarm"]}},{"id":"issGo2","kind":"transition","day":7,"branch":{"waitId":"issQ2","on":"reply"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000002"}},{"id":"issS3","kind":"transition","day":7,"branch":{"waitId":"issQ2","on":"timeout"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000003"}}]}'::jsonb,
  '{"timezone":"Europe/Paris","oncePerDay":true,"exitOnReply":false,"queuePriority":1}'::jsonb
) on conflict (id) do update set name = excluded.name, description = excluded.description,
  definition = excluded.definition, settings = excluded.settings;

-- ── S2 — APRÈS LA DÉMO : la plaquette, puis l'appel ──────────────────────
-- Elle n'envoie PAS la démo : S1 s'en est déjà chargé, sur le canal qui a
-- servi. Ce qu'il reste à faire, c'est rassurer sur le prix et rappeler.
-- Les trois voies d'appel — il a réagi, il a ouvert la plaquette, il n'a rien
-- fait — se rejoignent sur la même décision. La première y arrive par un
-- RENVOI (`suite.aller_a`), les deux autres par la reprise du tronc.
insert into automations (id, kind, name, description, status, definition, settings) values (
  '0e7a1f30-0000-4000-8000-000000000002', 'sequence', 'S2 — Après la démo',
  'Il a reçu la démo et il a réagi. On envoie la plaquette pour le rassurer sur le prix, puis on rappelle — avec un script différent selon qu''il l''a ouverte ou non. Les trois voies d''appel se rejoignent sur la même décision.',
  'draft', '{"steps":[{"id":"plqQ","kind":"condition","day":2,"branch":null,"condition":{"champ":"a_mobile","operateur":"vrai"}},{"id":"plqWa","kind":"whatsapp","mode":"manual","day":2,"template":"0e7a1f10-0000-4000-8000-000000000005","branch":{"waitId":"plqQ","on":"reply"}},{"id":"plqMl","kind":"email","mode":"auto","day":2,"template":"0e7a1f12-0000-4000-8000-000000000004","branch":{"waitId":"plqQ","on":"timeout"}},{"id":"plqW","kind":"wait","day":2,"waitMode":"reply","replyTimeoutDays":3,"branch":null},{"id":"apRep","kind":"call","mode":"manual","day":2,"duration":"5 min","script":"0e7a1f11-0000-4000-8000-000000000004","branch":{"waitId":"plqW","on":"reply"},"suite":{"type":"aller_a","cible":"iss2"}},{"id":"vueQ","kind":"condition","day":2,"branch":null,"condition":{"champ":"plaquette_vue","operateur":"vrai"}},{"id":"apChaud","kind":"call","mode":"manual","day":2,"duration":"5 min","script":"0e7a1f11-0000-4000-8000-000000000004","branch":{"waitId":"vueQ","on":"reply"}},{"id":"apStd","kind":"call","mode":"manual","day":4,"duration":"3 min","script":"0e7a1f11-0000-4000-8000-000000000003","branch":{"waitId":"vueQ","on":"timeout"}},{"id":"iss2","kind":"condition","day":2,"branch":null,"condition":{"champ":"issue_dernier_appel","operateur":"est","valeurs":["answered","lukewarm"]}},{"id":"s3","kind":"transition","day":2,"branch":{"waitId":"iss2","on":"timeout"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000003"}}]}'::jsonb,
  '{"timezone":"Europe/Paris","oncePerDay":true,"exitOnReply":false,"queuePriority":1}'::jsonb
) on conflict (id) do update set name = excluded.name, description = excluded.description,
  definition = excluded.definition, settings = excluded.settings;

-- ── S3 — REPRISE À DISTANCE ──────────────────────────────────────────────
-- ⚠️ CE N'EST PAS LA VOIE DU « RAPPELEZ-MOI LE 12 ».
--
-- Un prospect qui donne une date n'entre nulle part : l'agent note l'issue
-- « Mettre de côté » avec sa date, la tâche est REPLANIFIÉE à cette date, et
-- `PATCH /api/agent/tasks` n'avance pas l'inscription sur un `snoozed`
-- (`status !== "snoozed"`). La séquence reste donc exactement où elle en
-- était, et elle repart le jour dit, à l'étape où elle s'était arrêtée. Lui
-- imposer un J+21 écrirait par-dessus la seule date qui compte : la sienne.
--
-- S3 est pour l'autre cas, celui qu'on n'a JAMAIS réussi à joindre — tous
-- canaux épuisés, pas un mot. Trente jours, une relance, un appel, une fin
-- écrite. Jamais une attente sans limite.
insert into automations (id, kind, name, description, status, definition, settings) values (
  '0e7a1f30-0000-4000-8000-000000000003', 'sequence', 'S3 — Reprise à distance',
  'Pour ceux qu''on n''a jamais réussi à joindre, tous canaux épuisés. Trente jours de silence, une relance sur leur canal, un appel, puis une fin écrite. Ce n''est PAS la voie du « rappelez-moi le 12 » : celui-là reste où il est, sa tâche revient à sa date.',
  'draft', '{"steps":[{"id":"pause","kind":"wait","day":0,"waitMode":"days","branch":null},{"id":"repQ","kind":"condition","day":30,"branch":null,"condition":{"champ":"a_mobile","operateur":"vrai"}},{"id":"repWa","kind":"whatsapp","mode":"manual","day":30,"template":"0e7a1f10-0000-4000-8000-000000000004","branch":{"waitId":"repQ","on":"reply"}},{"id":"repMl","kind":"email","mode":"auto","day":30,"template":"82cb9925-fb46-49e8-a598-edf67acb6fc8","branch":{"waitId":"repQ","on":"timeout"}},{"id":"repW","kind":"wait","day":30,"waitMode":"reply","replyTimeoutDays":5,"branch":null},{"id":"repAp","kind":"call","mode":"manual","day":30,"duration":"3 min","script":"cc1793f6-7da7-4db3-b508-657c114b85b1","branch":null,"suite":{"type":"fin","motif":"reprise épuisée — à reprendre à la main"}}]}'::jsonb,
  '{"timezone":"Europe/Paris","oncePerDay":true,"exitOnReply":false,"queuePriority":3}'::jsonb
) on conflict (id) do update set name = excluded.name, description = excluded.description,
  definition = excluded.definition, settings = excluded.settings;

commit;

-- ── Où vont les 132 inscriptions vivantes ────────────────────────────────
--
-- ON REPOINTE, ON NE RECRÉE PAS : l'historique, les tâches déjà faites, la
-- liste de campagne et le lien avec les 640 appels restent accrochés.
--
-- ET ON CLASSE SUR CE QUI EST RÉELLEMENT PARTI, pas sur le rang qu'affichait la
-- carte. Pendant l'opération, un agent envoyait les accroches WhatsApp — quinze
-- tâches faites en quinze minutes. Se fier au `current_step` aurait replacé ces
-- quinze-là au début, et ils auraient reçu l'accroche une seconde fois.
--
--   tâche d'accroche encore ouverte   → S1 · wa1     (elle reste dans sa file)
--   tâche de démo encore ouverte      → S1 · waDemo
--   accroche partie, pas de réponse   → S1 · waW     (l'attente, comme les 59)
--   rien n'est parti                  → S1 · waQ     (l'aiguillage, il rejoue)
--   a réagi, appel déjà en file       → S2 · apStd
--   a réagi                           → S2 · plqQ    (la plaquette est la suite)
--
-- L'ancre repart de maintenant : sans ça les J+n se compteraient depuis le
-- 13 août et les treize appels tomberaient le même jour dans la file d'un agent
-- qui a un quota de 60. Et la voie prise est écrite (`vars.conditions`) : une
-- inscription posée sur l'attente WhatsApp n'est atteignable que si la question
-- « a un mobile ? » a rendu « oui ».
--
-- Relu après application, le 20/08 :
--   S1  wa1 1 · waW 75 · waDemo 2      S2  plqQ 40 · apStd 13      S3  0
--   chaque inscription est sur une carte dont l'identifiant est celui de sa
--   tâche ouverte, et aucune voie n'est orpheline.
--
--   select a.name, e.current_step, a.definition->'steps'->e.current_step->>'id',
--          (select string_agg(distinct t.step_id||':'||t.status,',') from prospection_tasks t
--            where t.enrollment_id=e.id and t.status in ('pending','snoozed')), count(*)
--   from sequence_enrollments e join automations a on a.id=e.automation_id
--   where e.status in ('active','paused') group by 1,2,3,4 order by 1,2;

-- Les six anciennes sont ARCHIVÉES, pas supprimées : leurs 21 inscriptions
-- closes portent l'histoire de ce qui est parti, et le moteur n'avance rien
-- qui ne soit pas `on`.
update automations set status = 'archived'
where kind = 'sequence' and id not in (
  '0e7a1f30-0000-4000-8000-000000000001',
  '0e7a1f30-0000-4000-8000-000000000002',
  '0e7a1f30-0000-4000-8000-000000000003');
