-- ── La même cible, l'accroche en moins : de quoi comparer deux façons d'ouvrir ─
--
-- CE QUE ÇA AJOUTE
-- Une quatrième séquence, jumelle de « WhatsApp seul — sans e-mail » sur tout
-- sauf un point : elle SAUTE le « Bonjour, je suis bien avec … ? » et envoie le
-- site dès le premier message.
--
-- POURQUOI DEUX SÉQUENCES PLUTÔT QU'UN RÉGLAGE
-- Les deux manières d'ouvrir ne se départagent pas au raisonnement, elles se
-- mesurent. Or le tableau commercial compte ses colonnes PAR séquence
-- (`partCounts`, cf. `src/app/api/sales-pipeline/_board.ts`) : deux séquences,
-- c'est deux colonnes de chiffres qu'on peut lire côte à côte — combien
-- répondent, combien vont jusqu'à l'appel. Un interrupteur dans une seule
-- séquence aurait tout mélangé dans le même compteur.
--
-- CE QUE CHACUNE PARIE
--   « sans e-mail »  : un message court sans lien obtient une réponse, et c'est
--                      la réponse qui autorise le second message. Deux messages
--                      non lus de suite mènent au signalement du numéro.
--   « site direct »  : le lien vaut mieux qu'une question — on montre tout de
--                      suite, quitte à n'avoir qu'une seule cartouche.
--
-- ELLES VISENT LE MÊME PUBLIC, ET C'EST VOULU
-- Mêmes `requireCanaux` / `excludeCanaux` : sans quoi on comparerait deux
-- populations différentes, et l'écart mesuré ne dirait rien de l'accroche.
-- Conséquence à connaître : à public égal, la séquence SUGGÉRÉE dans le tableau
-- marketing est celle qui est activée (cf. `sequenceSuggeree`) — activer les
-- deux rend la suggestion arbitraire, alors on inscrit à la main, lot par lot.
-- C'est de toute façon ce que demande un test : décider qui reçoit quoi.
--
-- ELLE ARRIVE EN BROUILLON (`status = 'draft'`)
-- Comme ses trois sœurs. Rien ne part tant que personne n'a relu les textes et
-- ne l'a activée depuis Automatisations › Séquences.

-- ── 1. Le message qui n'attend pas de réponse pour montrer ──────────────────
--
-- Il porte ce que les deux messages de l'autre séquence disent en deux temps :
-- qui écrit, pourquoi, et le lien. Plus long que l'accroche, forcément — c'est
-- le prix de ne poser aucune question avant de donner quelque chose à regarder.
--
-- Il ne remercie personne : « Merci {{contact.first_name}} ! » n'a de sens
-- qu'après une réponse, et c'est précisément l'étape qu'on saute ici. Recopier
-- le modèle « Envoi du site démo » tel quel aurait remercié quelqu'un qui n'a
-- encore rien dit.

insert into public.whatsapp_templates (id, name, body, body_contact) values
  (
    '0e7a1f10-0000-4000-8000-000000000003',
    'Accroche directe — le site tout de suite',
    E'Bonjour, je m''appelle {{owner.first_name}}.\n\n'
    || E'On a refait la présentation en ligne de plusieurs artisans de {{company.city}}. J''ai préparé une version de site pour {{company.name}} — vous pouvez la regarder telle quelle :\n\n'
    || E'{{company.demo_url}}\n\n'
    || E'C''est une démo, rien n''est en ligne, et ça ne vous engage à rien. Dites-moi juste ce que vous en pensez.',
    -- Version contact : on nomme la personne, sinon rien ne change. `pickVariant`
    -- ne la retient que si le prénom est réellement en base — à défaut, c'est la
    -- version ci-dessus qui part, entière.
    E'Bonjour {{contact.first_name}}, je m''appelle {{owner.first_name}}.\n\n'
    || E'On a refait la présentation en ligne de plusieurs artisans de {{company.city}}. J''ai préparé une version de site pour {{company.name}} — vous pouvez la regarder telle quelle :\n\n'
    || E'{{company.demo_url}}\n\n'
    || E'C''est une démo, rien n''est en ligne, et ça ne vous engage à rien. Dites-moi juste ce que vous en pensez.'
  )
on conflict (id) do nothing;

-- ── 2. L'appel qui suit, sans supposer une réponse ──────────────────────────
--
-- Le script « Relance après échange WhatsApp » ne convient pas ici : il ouvre
-- sur « on a échangé sur WhatsApp », vrai dans l'autre séquence — où l'attente
-- de réponse ne se débloque jamais toute seule — mais faux dans celle-ci, dont
-- l'attente repart au bout de trois jours, réponse ou pas. L'agent aurait donc
-- affirmé un échange qui n'a pas eu lieu, à quelqu'un qui s'en souviendrait.

insert into public.call_scripts (id, name, duration, body, body_contact) values
  (
    '0e7a1f11-0000-4000-8000-000000000003',
    'Relance après site envoyé sur WhatsApp',
    '3 min',
    E'CONTEXTE : on a envoyé un site démo sur WhatsApp il y a trois jours. Il a\n'
    || E'peut-être répondu, peut-être pas — la première question sert à le savoir.\n\n'
    || E'« Bonjour, {{owner.first_name}} à l''appareil. Je vous ai envoyé un message sur WhatsApp avec un site que j''avais préparé pour {{company.name}} — vous avez pu le regarder ? »\n\n'
    || E'SI OUI : « Qu''est-ce que vous en avez pensé ? »\n'
    || E'  → écouter jusqu''au bout, puis : « On peut en parler vingt minutes cette semaine ? »\n'
    || E'  → {{calendar_link}}\n\n'
    || E'SI NON / PAS VU : « Pas de souci, c''est un lien, ça se regarde en dix secondes depuis le téléphone. Je vous le renvoie, vous me dites ? »\n'
    || E'  → renvoyer {{company.demo_url}}\n\n'
    || E'SI PAS INTÉRESSÉ : noter le motif dans le CRM et ne pas insister.',
    E'CONTEXTE : on a envoyé un site démo sur WhatsApp il y a trois jours. Il a\n'
    || E'peut-être répondu, peut-être pas — la première question sert à le savoir.\n\n'
    || E'« Bonjour {{contact.first_name}}, {{owner.first_name}} à l''appareil. Je vous ai envoyé un message sur WhatsApp avec un site que j''avais préparé pour {{company.name}} — vous avez pu le regarder ? »\n\n'
    || E'SI OUI : « Qu''est-ce que vous en avez pensé ? »\n'
    || E'  → écouter jusqu''au bout, puis : « On peut en parler vingt minutes cette semaine ? »\n'
    || E'  → {{calendar_link}}\n\n'
    || E'SI NON / PAS VU : « Pas de souci, c''est un lien, ça se regarde en dix secondes depuis le téléphone. Je vous le renvoie, vous me dites ? »\n'
    || E'  → renvoyer {{company.demo_url}}\n\n'
    || E'SI PAS INTÉRESSÉ : noter le motif dans le CRM et ne pas insister.'
  )
on conflict (id) do nothing;

-- ── 3. La séquence ──────────────────────────────────────────────────────────
--
-- Trois étapes contre cinq. Ce qui disparaît, c'est l'accroche ET l'attente
-- indéfinie qui la suivait : ici le premier message a déjà tout donné, donc
-- l'attente peut expirer et rendre la main à l'appel.
--
-- `replyTimeoutDays = 3`, la même valeur que l'attente d'après-démo de l'autre
-- séquence : les deux appellent donc trois jours après avoir montré le site.
-- C'est ce qui rend les deux colonnes comparables — seule l'ouverture diffère.

insert into public.automations
  (id, kind, name, description, status, trigger_type, definition, settings)
values
  (
    '0e7a1f20-0000-4000-8000-000000000004',
    'sequence',
    -- Nommée pour se ranger JUSTE APRÈS « WhatsApp seul — sans e-mail » dans la
    -- liste triée par nom : à public et à statut égaux, c'est l'ordre
    -- d'affichage qui départage la séquence suggérée, et l'aînée doit garder
    -- la main tant qu'on n'a pas tranché.
    'WhatsApp seul — site direct',
    'Même public que « WhatsApp seul », sans l''accroche : le site part dès le premier message. Sert à mesurer laquelle des deux ouvertures obtient le plus de réponses.',
    'draft',
    'sequence_entry',
    jsonb_build_object('steps', jsonb_build_array(
      jsonb_build_object(
        'id', 's1', 'kind', 'whatsapp', 'mode', 'manual', 'day', 0,
        'template', '0e7a1f10-0000-4000-8000-000000000003'
      ),
      -- Une seule cartouche a été tirée : on peut laisser l''attente expirer
      -- sans risquer le second message non lu qui fait signaler le numéro.
      jsonb_build_object(
        'id', 's2', 'kind', 'wait', 'day', 0,
        'waitMode', 'reply', 'replyTimeoutDays', 3
      ),
      jsonb_build_object(
        'id', 's3', 'kind', 'call', 'mode', 'manual', 'day', 3,
        'script', '0e7a1f11-0000-4000-8000-000000000003', 'duration', '3 min'
      )
    )),
    jsonb_build_object(
      'timezone', 'Europe/Paris',
      -- `false`, comme sa jumelle : une réponse OUVRE la conversation ici, elle
      -- ne la clôt pas. Ce sont les issues « le prospect a réagi » qui arrêtent.
      'exitOnReply', false,
      'oncePerDay', true,
      'queuePriority', 2,
      'requireCanaux', jsonb_build_array('mobile'),
      'excludeCanaux', jsonb_build_array('email')
    )
  )
on conflict (id) do nothing;
