-- 20260829 — « S4 — Il a rappelé » : ce qu'on fait quand le prospect sort du
-- scénario par le haut.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE CAS QUI L'A FAIT ÉCRIRE
-- ─────────────────────────────────────────────────────────────────────────────
-- Azur Climat Froid (fiche 151), le 29/08/2026. L'accroche WhatsApp part à
-- 11h37. Le gérant RAPPELLE dans la foulée — il croit avoir affaire à un
-- client. Bilal lui explique, il répond qu'il refait déjà son site avec
-- quelqu'un mais qu'on peut lui envoyer la démo. Bilal envoie la démo ET la
-- plaquette. Le compteur de la plaquette passe à 1.
--
-- Le CRM n'a vu qu'un message sortant. Ni l'appel, ni les deux envois, ni
-- l'objection. Et à 13h22, la tâche d'accroche bouclée, le moteur a pris la
-- seule voie qu'il connaissait — celle du SILENCE — et posé dans la file la
-- relance « je me permets de revenir vers vous […] si ce n'est pas le bon
-- moment, dites-le moi et je n'insiste pas ». À un homme qui venait d'appeler.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI UNE QUATRIÈME SÉQUENCE ET PAS UNE ISSUE DE PLUS
-- ─────────────────────────────────────────────────────────────────────────────
-- `STEP_OUTCOMES` dit ce que le prospect a RÉPONDU sur le canal où l'on
-- écrivait. Ici la réponse est arrivée par un AUTRE canal, avant que l'attente
-- existe, et accompagnée d'envois qui ne venaient d'aucune étape. « A répondu »
-- aurait fait demi-tour vers la branche réponse de S1 — donc reposé une tâche
-- « envoyer la démo » déjà faite à la main.
--
-- S1 à S3 poussent : elles écrivent, elles attendent, elles relancent. Elles
-- sont écrites pour un prospect qui SUBIT le démarchage. Celui qui décroche son
-- téléphone inverse le rapport. Il lui faut sa propre suite.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE S4 NE FAIT PAS, ET C'EST LE PLUS IMPORTANT
-- ─────────────────────────────────────────────────────────────────────────────
-- Elle n'envoie NI démo NI plaquette : il les a déjà, c'est la condition même
-- de son entrée. Elle ne relance pas non plus « pour prendre des nouvelles » —
-- un prospect qui a appelé n'a pas besoin qu'on le réveille, il a besoin d'une
-- réponse à ce qu'il a dit.
--
-- Elle pose donc UN appel, avec le script qui correspond à ce qu'on sait de
-- lui, et laisse les issues de la carte décider du reste : « Mettre de côté »
-- avec sa date, « RDV calé », « Pas intéressé ». C'est ce que veut dire « la
-- suite est libre » — la séquence tient la main, elle ne la force pas.
--
-- ⚠️ ELLE EST EN `on`, contrairement au fichier du 20/08 qui posait les trois
-- autres en `draft`. La raison est mécanique et pas philosophique : cette
-- séquence n'est atteignable que par un geste humain explicite (le bouton
-- « Il m'a rappelé »), donc l'activer n'expose personne à un envoi surprise.
-- Et en `draft`, l'inscription se gèlerait sur `sequence_paused` au moment
-- précis où le prospect vient de nous parler.

begin;

create table if not exists archive_sequences_20260829 as
select id, name, status, description, definition, settings, updated_at, now() as archive_le
from automations where kind = 'sequence';

-- ── Le script d'appel de la voie « il n'a pas (encore) ouvert » ──────────
--
-- Le script existant « Il a ouvert la plaquette » sert l'autre voie et il est
-- juste pour elle : quelqu'un qui a lu les prix n'a plus besoin du pitch. Ici,
-- on ne sait pas s'il a regardé — et surtout, il a DÉJÀ DONNÉ SON OBJECTION au
-- téléphone. Le script ne commence donc pas par se présenter : il commence par
-- rappeler d'aller la relire.
insert into call_scripts (id, name, duration, body, body_contact) values (
  '0e7a1f11-0000-4000-8000-000000000005',
  'Il a rappelé de lui-même',
  '5 min',
  E'CONTEXTE : {{company.name}} a pris contact DE LUI-MÊME. On lui a expliqué, on\nlui a envoyé ce qu''on avait. Ce n''est pas un cold call : il sait qui on est, et\nil a déjà dit ce qui le retenait.\n\n⚠️ RELIRE SON OBJECTION AVANT DE COMPOSER. Elle est dans le fil, à la date de\nson appel. L''appeler sans elle, c''est lui refaire un pitch auquel il a déjà\nrépondu.\n\nOBJECTIF : savoir si ce qui le retenait tient toujours. Pas re-vendre.\n\n« Bonjour, {{owner.first_name | "Sama"}} de Sama. On s''est eu au téléphone\nl''autre jour, je vous avais envoyé le site et la plaquette. Je ne vais pas vous\nrefaire le laïus — vous avez eu le temps d''y jeter un œil ? »\n\nS''IL A DÉJÀ QUELQU''UN SUR LE COUP → ne pas attaquer le prestataire, ça ferme la\nporte. Demander OÙ ÇA EN EST et QUAND ça doit être en ligne. Une date qui glisse\nest une porte ; un site déjà livré n''en est pas une. Poser la mise de côté sur\nsa date à lui.\nS''IL N''A PAS REGARDÉ → ne pas insister sur le lien. Demander ce qui compte pour\nlui sur un site, et proposer 15 minutes. {{calendar_link}}\nS''IL A REGARDÉ ET NE DIT RIEN → « qu''est-ce qui vous a arrêté ? », puis se taire.\nSI C''EST NON → issue « Pas intéressé » avec le motif. Plus rien ne repartira.',
  E'CONTEXTE : {{contact.first_name}} ({{company.name}}) a pris contact DE LUI-MÊME.\nIl sait qui on est et il a déjà dit ce qui le retenait — RELIRE SON OBJECTION\ndans le fil avant de composer.\n\n« Bonjour {{contact.first_name}}, {{owner.first_name | "Sama"}} de Sama. On s''est\neu au téléphone — je vous avais envoyé le site et la plaquette. Vous avez eu le\ntemps d''y jeter un œil ? »\n\nS''IL A DÉJÀ QUELQU''UN → où ça en est, et quand ça doit être en ligne. Mise de\ncôté sur SA date.\nS''IL N''A PAS REGARDÉ → ce qui compte pour lui, puis 15 minutes. {{calendar_link}}\nSI C''EST NON → issue « Pas intéressé » avec le motif.'
) on conflict (id) do update set name = excluded.name, duration = excluded.duration,
  body = excluded.body, body_contact = excluded.body_contact;

-- ── Le dernier message, et il ne renvoie AUCUN lien ──────────────────────
--
-- Il a déjà tout reçu. Renvoyer la démo une troisième fois dirait qu'on n'a pas
-- écouté. Ce message ne sert qu'à laisser une porte ouverte sans la pousser —
-- c'est le seul cas où « je n'insiste pas » est vrai, parce qu'après lui il n'y
-- a plus rien avant trente jours.
insert into whatsapp_templates (id, name, body, body_contact) values (
  '0e7a1f10-0000-4000-8000-000000000006',
  'Après son appel — la porte reste ouverte',
  E'Bonjour, {{owner.first_name | "Sama"}} de Sama — on s''est eu au téléphone.\nJe vous laisse avec ce que je vous ai envoyé, je n''insiste pas.\nSi votre projet bouge ou si vous voulez juste un avis, un message suffit.',
  E'Bonjour {{contact.first_name}}, {{owner.first_name | "Sama"}} de Sama — on s''est eu au téléphone.\nJe vous laisse avec ce que je vous ai envoyé, je n''insiste pas.\nSi votre projet bouge ou si vous voulez juste un avis, un message suffit.'
) on conflict (id) do update set name = excluded.name, body = excluded.body,
  body_contact = excluded.body_contact;

-- ── S4 — IL A RAPPELÉ ────────────────────────────────────────────────────
--
-- SIX ÉTAPES, ET LA PREMIÈRE EST UNE QUESTION SUR LUI, PAS SUR NOS CANAUX.
-- S1 commence par « a-t-il un mobile ? » parce qu'elle doit choisir par où
-- écrire. S4 n'a rien à choisir : on lui a parlé. La seule question qui reste
-- est « a-t-il regardé ce qu'on lui a laissé ? », et elle change le script.
--
--   vuQ  ── oui ──→ apChaud (J+1)  « Il a ouvert la plaquette »
--        ── non ──→ apSuite (J+3)  « Il a rappelé de lui-même »
--   issQ ── oui ──→ (fin)          il a donné quelque chose : c'est du pipeline
--        ── non ──→ relance (J+5) puis S3 — Reprise à distance
--
-- `siInconnu: 'non'` est délibéré et il compte : la plaquette n'est mesurée que
-- si un jeton par prospect existe. Sans jeton, on ne sait pas — et « on ne sait
-- pas » doit envoyer sur le script long, pas sur celui qui suppose qu'il
-- connaît déjà les prix. La trace `vars.conditions` gardera `non_mesure`, donc
-- on pourra compter après coup combien sont partis dans une voie devinée.
--
-- LA VOIE « OUI » DE `issQ` EST VIDE, ET C'EST VOULU — même motif que `iss2`
-- dans S2. Un prospect qui a donné quelque chose au téléphone n'est plus un
-- prospect de démarchage : il est dans le pipeline commercial, et la séquence
-- se termine plutôt que de continuer à lui parler par-dessus l'épaule de
-- l'agent qui le suit.
insert into automations (id, kind, name, description, status, definition, settings) values (
  '0e7a1f30-0000-4000-8000-000000000004', 'sequence', 'S4 — Il a rappelé',
  'Le repli pour ceux qui sortent du scénario par le haut : ils ont pris contact d''eux-mêmes, on leur a déjà envoyé ce qu''on avait. Elle n''envoie donc rien de plus — un appel, avec le script qui correspond à ce qu''on sait d''eux, et la suite se décide aux issues. Entrée par le bouton « Il m''a rappelé », jamais automatiquement.',
  'on',
  '{"steps":[{"id":"vuQ","kind":"condition","day":0,"branch":null,"condition":{"champ":"plaquette_vue","operateur":"vrai","siInconnu":"non"}},{"id":"apChaud","kind":"call","mode":"manual","day":1,"duration":"5 min","script":"0e7a1f11-0000-4000-8000-000000000004","branch":{"waitId":"vuQ","on":"reply"}},{"id":"apSuite","kind":"call","mode":"manual","day":3,"duration":"5 min","script":"0e7a1f11-0000-4000-8000-000000000005","branch":{"waitId":"vuQ","on":"timeout"}},{"id":"issQ","kind":"condition","day":3,"branch":null,"condition":{"champ":"issue_dernier_appel","operateur":"est","valeurs":["answered","lukewarm"]}},{"id":"relance","kind":"whatsapp","mode":"manual","day":5,"template":"0e7a1f10-0000-4000-8000-000000000006","branch":{"waitId":"issQ","on":"timeout"}},{"id":"s3","kind":"transition","day":5,"branch":{"waitId":"issQ","on":"timeout"},"transition":{"automationId":"0e7a1f30-0000-4000-8000-000000000003"}}]}'::jsonb,
  '{"timezone":"Europe/Paris","oncePerDay":true,"exitOnReply":false,"queuePriority":1}'::jsonb
) on conflict (id) do update set name = excluded.name, description = excluded.description,
  status = excluded.status, definition = excluded.definition, settings = excluded.settings;

commit;

-- ── Contrôle, à relire après application ─────────────────────────────────
--
-- 1. La séquence est là, active, et ses six étapes sont bien formées :
--
--    select name, status, jsonb_array_length(definition->'steps') as etapes
--    from automations where id = '0e7a1f30-0000-4000-8000-000000000004';
--
-- 2. Aucune voie n'est orpheline — chaque `branch.waitId` désigne une étape
--    qui existe, et chaque fourche a au moins une voie peuplée :
--
--    select s->>'id' as etape, s->'branch'->>'waitId' as fourche,
--           s->'branch'->>'on' as voie
--    from automations a, jsonb_array_elements(a.definition->'steps') s
--    where a.id = '0e7a1f30-0000-4000-8000-000000000004';
--
-- 3. Les deux modèles cités existent (sinon l'étape gèle sur un message vide) :
--
--    select id, name from call_scripts
--     where id in ('0e7a1f11-0000-4000-8000-000000000004','0e7a1f11-0000-4000-8000-000000000005');
--    select id, name from whatsapp_templates
--     where id = '0e7a1f10-0000-4000-8000-000000000006';
