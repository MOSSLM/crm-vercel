-- Le métier d'une fiche dont le site est illisible.
--
-- ── LE PROBLÈME, MESURÉ LE 03/09/2026 ──────────────────────────────────────
-- 40 fiches vivantes du portefeuille Bilal + Matteo n'ont AUCUN `service_tags`,
-- et ce n'est pas un oubli : leur enrichissement a échoué 1 à 3 fois avec
-- `home_unreachable_or_empty`, `no_content` ou `generic_placeholder`. Le tag
-- vient de la lecture du site du prospect ; quand le site ne répond pas, il ne
-- viendra jamais. Or sans tag, `create-demo` refuse — le design filtre ses pages
-- sur le métier, et la démo sortirait au menu « Nos services » vide.
--
-- Ces fiches sont pourtant EXACTEMENT la cible : « pas de site, ou un site
-- inutilisable ». Les laisser sans démo revient à écarter les meilleurs
-- prospects faute de pouvoir lire un site qui n'existe pas.
--
-- ── CE QUE CETTE TABLE FAIT, ET CE QU'ELLE NE FAIT PAS ─────────────────────
-- Le NAF du registre est la seule preuve de métier qui reste. Il ne remplace
-- PAS l'enrichissement : il ne sert QUE les fiches à zéro tag.
--
-- ⚠️ TROIS CODES, ET PAS UN DE PLUS. 43.29B « autres travaux d'installation »,
-- 41.20B « construction d'autres bâtiments » ou 35.30Z couvrent trop de choses.
-- Un tag faux met des pages de climatisation sur le site d'un artisan qui n'en
-- fait pas, et c'est LE PROSPECT qui le découvre, en rendez-vous.
--
-- Corollaire utile : les NAF absents de cette table disent aussi quelque chose.
-- 46.74B, 46.69B (commerce de gros), 33.12Z (réparation), 68.20B (SCI), 70.22Z
-- (conseil) ne sont pas des artisans — ce sont des grossistes, des fabricants et
-- des holdings tombés dans le fichier. Ils n'ont pas de démo à recevoir.
create table if not exists public.correspondance_naf_gabarit (
  naf         text primary key,
  tags_gabarit text[] not null,
  libelle_naf text not null
);

insert into public.correspondance_naf_gabarit (naf, tags_gabarit, libelle_naf) values
  ('43.22A', array['plomberie','chauffage'],
   'Travaux d''installation d''eau et de gaz en tous locaux'),
  ('43.22B', array['climatisation','chauffage','pompe à chaleur'],
   'Travaux d''installation d''équipements thermiques et de climatisation'),
  ('43.21A', array['electricité'],
   'Travaux d''installation électrique dans tous locaux')
on conflict (naf) do update set tags_gabarit = excluded.tags_gabarit;

-- ⚠️ `electricité` SANS ACCENT sur le premier « e » : c'est l'orthographe de
-- `SERVICE_TAGS_TAXONOMY`, et `enrichment_tag_settings` porte cette forme-là.
-- `serviceTagKey()` dépouille les accents, donc les deux se rejoignent au
-- rendu — mais une jointure SQL sur le libellé, elle, ne pardonne pas.

-- Contrôle à relire après application :
--   select n.naf, n.tags_gabarit, count(e.id)
--     from public.correspondance_naf_gabarit n
--     left join public.entreprises_donnees_publiques d on d.naf_code = n.naf
--     left join public.entreprises e on e.id = d.entreprise_id
--      and e.archived_at is null and not (jsonb_typeof(e.service_tags)='array'
--                                         and jsonb_array_length(e.service_tags) > 0)
--    group by 1,2;
--   -- et que chaque tag posé est bien AUTORISÉ, sinon create-demo refusera :
--   select unnest(tags_gabarit) as tag from public.correspondance_naf_gabarit
--   except select tag from public.enrichment_tag_settings where allowed is true;
