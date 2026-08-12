-- ── Deux variations par modèle : à l'entreprise, ou à un contact ────────────
--
-- LE DÉFAUT QUE ÇA CORRIGE
-- Un modèle ne portait qu'un texte, donc il fallait trancher une fois pour tout
-- le parc. Mesuré sur les 275 entreprises qualifiées non archivées : 70 n'ont
-- AUCUNE ligne `contacts`. Un modèle qui écrit « je suis bien avec
-- {{contact.first_name}} de {{company.name}} ? » leur partait amputé —
-- « je suis bien avec  de Toiture Martin ? » —, puisque `interpolate` remplace
-- par du vide toute clé sans valeur. L'alternative était de ne nommer personne,
-- jamais, y compris pour les 205 fiches dont on a le nom du gérant.
--
-- CE QUE LES COLONNES SIGNIFIENT
--   `body` / `subject`                  la version ENTREPRISE — celle qui fait
--                                       foi, la seule que portent les modèles
--                                       écrits avant cette migration.
--   `body_contact` / `subject_contact`  la version CONTACT, facultative. Vide,
--                                       c'est la version entreprise qui part.
--
-- Aucun texte existant n'est réécrit : sans version contact, le comportement
-- est exactement celui d'avant. La règle de choix vit dans `pickVariant`
-- (`src/lib/automations/variables.ts`) et nulle part ailleurs — la version
-- contact n'est retenue que si TOUTES les variables du contact qu'elle cite ont
-- une valeur, sinon on retombe sur l'entreprise plutôt que d'envoyer un trou.
--
-- ORDRE D'EXÉCUTION : après `20260813_sequences_multicanal.sql`, qui sème les
-- modèles mis à jour plus bas. Lancée avant, les `update` ne trouvent rien et
-- ne font rien — relancer ce fichier après suffit à rattraper.

alter table public.whatsapp_templates add column if not exists body_contact text;
alter table public.call_scripts      add column if not exists body_contact text;
alter table public.email_templates   add column if not exists body_contact text;
alter table public.email_templates   add column if not exists subject_contact text;

comment on column public.whatsapp_templates.body_contact is
  'Version envoyée quand on connaît le contact. Vide = on envoie `body`.';
comment on column public.call_scripts.body_contact is
  'Version lue par l''agent quand la fiche porte un contact nommé. Vide = `body`.';
comment on column public.email_templates.body_contact is
  'Version envoyée quand on connaît le contact. Vide = on envoie `body`.';
comment on column public.email_templates.subject_contact is
  'Objet de la version contact. Vide = l''objet `subject` est repris tel quel.';

-- ── Les variations des modèles semés avec les séquences multicanal ──────────
--
-- Écrites en `update` et non dans les `insert` de la migration précédente :
-- celle-ci s'exécute avant l'ajout des colonnes, elle ne peut pas les remplir.

-- Accroche WhatsApp. La version contact demande la personne au lieu de
-- l'enseigne : c'est la seule question qui ouvre une conversation quand on sait
-- qui décroche. Sans prénom en base, `pickVariant` renvoie sur la version
-- entreprise — la question reste posée, sans nom.
update public.whatsapp_templates set body_contact =
  'Bonjour, je suis bien avec {{contact.first_name}} de {{company.name}} ?'
where id = '0e7a1f10-0000-4000-8000-000000000001';

-- Envoi du site démo. La version entreprise ne peut pas remercier quelqu'un
-- par son prénom ; elle dit la même chose sans nommer personne.
update public.whatsapp_templates set body_contact =
  E'Merci {{contact.first_name}} !\n\n'
  E'Je vous écris parce qu''on a refait la présentation en ligne de plusieurs artisans de {{company.city}}, et j''ai préparé une version de site pour {{company.name}} — vous pouvez la regarder telle quelle :\n\n'
  E'{{company.demo_url}}\n\n'
  E'C''est une démo, rien n''est en ligne. Dites-moi juste ce que vous en pensez.'
where id = '0e7a1f10-0000-4000-8000-000000000002';

-- Le corps `body` de ce modèle citait `{{contact.first_name}}` : c'était le
-- texte unique, donc il partait tel quel aux 70 fiches sans contact, sur
-- « Merci  ! ». Il devient la version entreprise, sans le prénom.
update public.whatsapp_templates set body =
  E'Bonjour,\n\n'
  E'Je vous écris parce qu''on a refait la présentation en ligne de plusieurs artisans de {{company.city}}, et j''ai préparé une version de site pour {{company.name}} — vous pouvez la regarder telle quelle :\n\n'
  E'{{company.demo_url}}\n\n'
  E'C''est une démo, rien n''est en ligne. Dites-moi juste ce que vous en pensez.'
where id = '0e7a1f10-0000-4000-8000-000000000002';

-- Scripts d'appel : l'agent a le script sous les yeux pendant qu'il compose.
-- Demander la personne quand on a son nom lui évite de passer le standard.
update public.call_scripts set body_contact = replace(
  body,
  'je suis bien avec {{company.name}} ?',
  'je suis bien avec {{contact.first_name}} de {{company.name}} ?'
)
where id = '0e7a1f11-0000-4000-8000-000000000001';

update public.call_scripts set body_contact = replace(
  body,
  '« Bonjour, {{owner.first_name}}, on a échangé',
  '« Bonjour {{contact.first_name}}, {{owner.first_name}}, on a échangé'
)
where id = '0e7a1f11-0000-4000-8000-000000000002';

-- E-mails. Les trois s'ouvrent sur « Bonjour, » faute de savoir qui lit : la
-- version contact les nomme, l'objet compris pour celui où ça change le taux
-- d'ouverture.
update public.email_templates set body_contact =
  E'Bonjour {{contact.first_name}},\n\n'
  E'Je m''appelle {{owner.first_name}}. J''ai regardé le site de {{company.name}} comme le ferait quelqu''un qui cherche un artisan à {{company.city}} : depuis un téléphone, sans savoir qui vous êtes.\n\n'
  E'J''ai noté ce qui marche et ce qui fait partir. C''est ici, rien à télécharger :\n\n'
  E'{{company.audit_url}}\n\n'
  E'C''est gratuit et sans engagement — si ça ne vous intéresse pas, ignorez ce message, je n''insisterai pas.\n\n'
  E'{{owner.first_name}}'
where id = '0e7a1f12-0000-4000-8000-000000000001';

update public.email_templates set
  subject_contact = '{{contact.first_name}}, votre site vu par un client de {{company.city}}',
  body_contact =
    E'Bonjour {{contact.first_name}},\n\n'
    E'Je vous ai envoyé l''analyse du site de {{company.name}} la semaine dernière. Sans nouvelles, je me dis que soit le message est passé à la trappe, soit le sujet n''est pas d''actualité.\n\n'
    E'Le lien, si vous voulez y jeter un œil : {{company.audit_url}}\n\n'
    E'Si ce n''est pas le moment, répondez-moi juste « non » — je ne vous relancerai plus.\n\n'
    E'{{owner.first_name}}'
where id = '0e7a1f12-0000-4000-8000-000000000002';

update public.email_templates set body_contact =
  E'Bonjour {{contact.first_name}},\n\n'
  E'Je m''appelle {{owner.first_name}}. Plutôt que de vous expliquer ce qu''on fait, j''ai préparé une version de site pour {{company.name}} — vous la regardez, et vous voyez tout de suite :\n\n'
  E'{{company.demo_url}}\n\n'
  E'C''est une démo, rien n''est en ligne, et ça ne vous engage à rien. Je vous envoie aussi un mot sur WhatsApp au cas où l''e-mail se perde.\n\n'
  E'{{owner.first_name}}'
where id = '0e7a1f12-0000-4000-8000-000000000003';
