-- ── Trois séquences de démarchage, une par canal joignable ──────────────────
--
-- Mesuré sur les 275 entreprises qualifiées non archivées, canaux lus sur le
-- prospect entier (fiche entreprise ET contacts) :
--
--     sans e-mail, un mobile   →   20 fiches   →  WhatsApp seul
--     e-mail, un fixe          →  122 fiches   →  e-mail + appel
--     e-mail, un mobile        →  114 fiches   →  e-mail + WhatsApp + appel
--
-- Restent 17 fiches joignables par le fixe seul, qu'aucune des trois ne prend :
-- elles ne peuvent qu'être appelées, et cette séquence-là n'existe pas encore.
--
-- CE QUE LES SÉQUENCES DÉCLARENT
-- Chacune porte son PUBLIC en canaux (`requireCanaux` / `excludeCanaux`), jamais
-- en préfixes téléphoniques : « il me faut un mobile », pas « 06 ou 07 ». La
-- règle de numérotation vit dans `src/lib/prospects/canal.ts` et nulle part
-- ailleurs. Le tableau s'en sert pour SUGGÉRER la bonne séquence à chaque ligne,
-- sans qu'aucun rapprochement soit codé en dur.
--
-- ELLES ARRIVENT EN BROUILLON (`status = 'draft'`)
-- Rien ne part tant que personne ne les a relues et activées. Les textes sont
-- rédigés pour être ajustés — c'est la structure qui est le livrable.

-- ── 1. Les modèles de messages ──────────────────────────────────────────────
-- Les deux WhatsApp sont partagés par la séquence « WhatsApp seul » et la
-- séquence mixte : c'est précisément pourquoi ils vivent dans des modèles
-- plutôt que recopiés dans chaque étape.

insert into public.whatsapp_templates (id, name, body) values
  (
    '0e7a1f10-0000-4000-8000-000000000001',
    'Accroche — je suis bien avec ?',
    -- Court, et une seule question. Le but n'est pas de vendre : c'est
    -- d'obtenir une réponse, donc d'ouvrir la conversation. Un message
    -- d'ouverture qui contient déjà un lien se lit comme du démarchage de masse
    -- et reste sans réponse.
    'Bonjour, je suis bien avec {{company.name}} ?'
  ),
  (
    '0e7a1f10-0000-4000-8000-000000000002',
    'Envoi du site démo',
    -- Envoyé UNIQUEMENT après une réponse. On montre, on ne raconte pas : le
    -- site existe déjà, à leur nom, et se regarde en dix secondes sur un
    -- téléphone.
    E'Merci {{contact.first_name}} !\n\n'
    E'Je vous écris parce qu''on a refait la présentation en ligne de plusieurs {{company.city}}, et j''ai préparé une version de site pour {{company.name}} — vous pouvez la regarder telle quelle :\n\n'
    E'{{company.demo_url}}\n\n'
    E'C''est une démo, rien n''est en ligne. Dites-moi juste ce que vous en pensez.'
  )
on conflict (id) do nothing;

insert into public.call_scripts (id, name, duration, body) values
  (
    '0e7a1f11-0000-4000-8000-000000000001',
    'Relance après audit envoyé',
    '3 min',
    E'OBJECTIF : obtenir un rendez-vous, pas vendre au téléphone.\n\n'
    E'« Bonjour, je suis bien avec {{company.name}} ? {{owner.first_name}} à l''appareil.\n'
    E'Je vous ai envoyé un e-mail il y a quelques jours avec l''analyse de votre site — vous avez pu y jeter un œil ? »\n\n'
    E'SI NON : « Pas de souci. En deux mots : on a mesuré votre site actuel, et il y a deux ou trois points qui vous coûtent des appels. Je vous renvoie le lien, vous regardez quand vous avez cinq minutes ? »\n'
    E'  → renvoyer {{company.audit_url}}\n\n'
    E'SI OUI : « Qu''est-ce qui vous a le plus parlé ? »\n'
    E'  → écouter, puis : « On peut en parler vingt minutes cette semaine ? »\n'
    E'  → {{calendar_link}}\n\n'
    E'SI PAS INTÉRESSÉ : noter le motif dans le CRM et ne pas insister.'
  ),
  (
    '0e7a1f11-0000-4000-8000-000000000002',
    'Relance après échange WhatsApp',
    '3 min',
    E'CONTEXTE : {{company.name}} a déjà répondu sur WhatsApp et vu le site démo.\n'
    E'On appelle donc quelqu''un qui SAIT qui on est. Pas de re-présentation longue.\n\n'
    E'« Bonjour, {{owner.first_name}}, on a échangé sur WhatsApp au sujet du site que j''avais préparé pour {{company.name}}.\n'
    E'Vous avez eu le temps de le regarder ? »\n\n'
    E'→ écouter. Puis : « Ce que je propose, c''est vingt minutes pour voir si ça vaut le coup pour vous. »\n'
    E'→ {{calendar_link}}\n\n'
    E'SI HÉSITANT : « Qu''est-ce qui vous retient ? » — et écouter jusqu''au bout avant de répondre.'
  )
on conflict (id) do nothing;

-- Les modèles d'e-mail portent des politiques RLS par utilisateur
-- (`user_id = auth.uid()`). Semés ici en `is_default = true`, ils restent
-- lisibles par tout le monde et modifiables depuis l'écran Modèles.
insert into public.email_templates (id, user_id, name, type, subject, body, is_default, sort_order) values
  (
    '0e7a1f12-0000-4000-8000-000000000001',
    null,
    'Audit du site — premier contact',
    'sequence',
    'Votre site, vu par un client de {{company.city}}',
    E'Bonjour,\n\n'
    E'Je m''appelle {{owner.first_name}}. J''ai regardé le site de {{company.name}} comme le ferait quelqu''un qui cherche un artisan à {{company.city}} : depuis un téléphone, sans savoir qui vous êtes.\n\n'
    E'J''ai noté ce qui marche et ce qui fait partir. C''est ici, rien à télécharger :\n\n'
    E'{{company.audit_url}}\n\n'
    E'C''est gratuit et sans engagement — si ça ne vous intéresse pas, ignorez ce message, je n''insisterai pas.\n\n'
    E'{{owner.first_name}}',
    true,
    100
  ),
  (
    '0e7a1f12-0000-4000-8000-000000000002',
    null,
    'Audit — relance',
    'sequence',
    'Je vous relance une fois, puis j''arrête',
    E'Bonjour,\n\n'
    E'Je vous ai envoyé l''analyse du site de {{company.name}} la semaine dernière. Sans nouvelles, je me dis que soit le message est passé à la trappe, soit le sujet n''est pas d''actualité.\n\n'
    E'Le lien, si vous voulez y jeter un œil : {{company.audit_url}}\n\n'
    E'Si ce n''est pas le moment, répondez-moi juste « non » — je ne vous relancerai plus.\n\n'
    E'{{owner.first_name}}',
    true,
    101
  ),
  (
    '0e7a1f12-0000-4000-8000-000000000003',
    null,
    'Premier contact — site démo',
    'sequence',
    '{{company.name}} — j''ai préparé quelque chose pour vous',
    E'Bonjour,\n\n'
    E'Je m''appelle {{owner.first_name}}. Plutôt que de vous expliquer ce qu''on fait, j''ai préparé une version de site pour {{company.name}} — vous la regardez, et vous voyez tout de suite :\n\n'
    E'{{company.demo_url}}\n\n'
    E'C''est une démo, rien n''est en ligne, et ça ne vous engage à rien. Je vous envoie aussi un mot sur WhatsApp au cas où l''e-mail se perde.\n\n'
    E'{{owner.first_name}}',
    true,
    102
  )
on conflict (id) do nothing;

-- ── 2. Les trois séquences ──────────────────────────────────────────────────
--
-- RAPPEL SUR LES JOURS : `day` est un J+n compté depuis le dernier point de
-- reprise réel de l'inscription (cf. `sql/20260813_sequence_ancrage.sql`). Après
-- une attente-réponse, les jours suivants repartent du clic — écrire « J+3 »
-- veut donc bien dire « trois jours après », pas « trois jours après
-- l'inscription ».

insert into public.automations
  (id, kind, name, description, status, trigger_type, definition, settings)
values
  (
    '0e7a1f20-0000-4000-8000-000000000001',
    'sequence',
    'WhatsApp seul — sans e-mail',
    'Entreprises sans adresse mais joignables sur mobile. 100 % site, aucun audit : on montre, on n''analyse pas.',
    'draft',
    'sequence_entry',
    jsonb_build_object('steps', jsonb_build_array(
      jsonb_build_object(
        'id', 's1', 'kind', 'whatsapp', 'mode', 'manual', 'day', 0,
        'template', '0e7a1f10-0000-4000-8000-000000000001'
      ),
      -- Rien ne part tant qu''il n''a pas répondu : deux messages WhatsApp sans
      -- réponse mènent au signalement, donc au blocage du numéro.
      jsonb_build_object(
        'id', 's2', 'kind', 'wait', 'day', 0,
        'waitMode', 'reply', 'replyTimeoutDays', 0
      ),
      jsonb_build_object(
        'id', 's3', 'kind', 'whatsapp', 'mode', 'manual', 'day', 0,
        'template', '0e7a1f10-0000-4000-8000-000000000002'
      ),
      -- Après l''envoi du site, on laisse le temps de le regarder. Cette
      -- attente-là se relance toute seule : il a déjà répondu une fois, on peut
      -- décrocher son téléphone sans risque.
      jsonb_build_object(
        'id', 's4', 'kind', 'wait', 'day', 0,
        'waitMode', 'reply', 'replyTimeoutDays', 3
      ),
      jsonb_build_object(
        'id', 's5', 'kind', 'call', 'mode', 'manual', 'day', 3,
        'script', '0e7a1f11-0000-4000-8000-000000000002', 'duration', '3 min'
      )
    )),
    jsonb_build_object(
      'timezone', 'Europe/Paris',
      'exitOnReply', false,
      'oncePerDay', true,
      'queuePriority', 2,
      'requireCanaux', jsonb_build_array('mobile'),
      'excludeCanaux', jsonb_build_array('email')
    )
  ),
  (
    '0e7a1f20-0000-4000-8000-000000000002',
    'sequence',
    'E-mail + fixe',
    'Entreprises avec adresse et ligne fixe. L''audit part par e-mail, l''appel prend le relais.',
    'draft',
    'sequence_entry',
    jsonb_build_object('steps', jsonb_build_array(
      jsonb_build_object(
        'id', 's1', 'kind', 'email', 'mode', 'auto', 'day', 0,
        'template', '0e7a1f12-0000-4000-8000-000000000001',
        'trackOpens', true, 'trackClicks', true,
        -- ⚠️ `audits.pdf_url` n''est écrit par aucun code du dépôt : cocher
        -- « joindre l''audit » ferait partir un message sans pièce jointe. Le
        -- lien du rapport ({{company.audit_url}}) porte la même chose, se lit
        -- sur téléphone et compte ses vues.
        'attachAudit', false
      ),
      jsonb_build_object('id', 's2', 'kind', 'wait', 'day', 3),
      jsonb_build_object(
        'id', 's3', 'kind', 'call', 'mode', 'manual', 'day', 3,
        'script', '0e7a1f11-0000-4000-8000-000000000001', 'duration', '3 min'
      ),
      jsonb_build_object('id', 's4', 'kind', 'wait', 'day', 7),
      jsonb_build_object(
        'id', 's5', 'kind', 'email', 'mode', 'auto', 'day', 7,
        'template', '0e7a1f12-0000-4000-8000-000000000002',
        'trackOpens', true, 'trackClicks', true
      )
    )),
    jsonb_build_object(
      'timezone', 'Europe/Paris',
      'exitOnReply', true,
      'oncePerDay', true,
      'queuePriority', 2,
      'requireCanaux', jsonb_build_array('email', 'fixe')
    )
  ),
  (
    '0e7a1f20-0000-4000-8000-000000000003',
    'sequence',
    'E-mail + WhatsApp — mix',
    'Le plus gros segment. L''e-mail ouvre, WhatsApp obtient la réponse, la démo convainc, l''appel conclut.',
    'draft',
    'sequence_entry',
    jsonb_build_object('steps', jsonb_build_array(
      jsonb_build_object(
        'id', 's1', 'kind', 'email', 'mode', 'auto', 'day', 0,
        'template', '0e7a1f12-0000-4000-8000-000000000003',
        'trackOpens', true, 'trackClicks', true
      ),
      -- Le lendemain, pas le même jour : un e-mail et un WhatsApp à une heure
      -- d''intervalle se lisent comme du harcèlement automatisé.
      jsonb_build_object(
        'id', 's2', 'kind', 'whatsapp', 'mode', 'manual', 'day', 1,
        'template', '0e7a1f10-0000-4000-8000-000000000001'
      ),
      jsonb_build_object(
        'id', 's3', 'kind', 'wait', 'day', 1,
        'waitMode', 'reply', 'replyTimeoutDays', 0
      ),
      jsonb_build_object(
        'id', 's4', 'kind', 'whatsapp', 'mode', 'manual', 'day', 1,
        'template', '0e7a1f10-0000-4000-8000-000000000002'
      ),
      jsonb_build_object(
        'id', 's5', 'kind', 'wait', 'day', 1,
        'waitMode', 'reply', 'replyTimeoutDays', 3
      ),
      jsonb_build_object(
        'id', 's6', 'kind', 'call', 'mode', 'manual', 'day', 4,
        'script', '0e7a1f11-0000-4000-8000-000000000002', 'duration', '3 min'
      )
    )),
    jsonb_build_object(
      'timezone', 'Europe/Paris',
      -- `false` : sur cette séquence, « répondre » ouvre la conversation, ça ne
      -- la clôt pas. C'est le clic « Il a répondu » qui fait avancer, et les
      -- cinq issues « le prospect a réagi » qui arrêtent.
      'exitOnReply', false,
      'oncePerDay', true,
      'queuePriority', 1,
      'requireCanaux', jsonb_build_array('email', 'mobile')
    )
  )
on conflict (id) do nothing;
