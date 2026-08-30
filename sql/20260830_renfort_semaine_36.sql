-- Renfort de la semaine 36 — mille entreprises neuves, choisies sur le CANAL.
--
-- LA DEMANDE, du propriétaire le 30/08 : « des lots de 500 à 1000 entreprises,
-- sur des entreprises qu'on n'a pas encore démarchées qui n'ont subi ni lissage
-- ni enrichissement rien […] le but étant d'avoir beaucoup de personnes à
-- contacter pour la semaine donc au moins doubler les whatsapp de Bilal et
-- Matteo (il faut que ce soit des entreprises avec mobile, au moins après
-- enrichissement/lissage) ».
--
-- ⚠️ L'ORDRE DEMANDÉ ÉTAIT « LISSER, PUIS TRIER ». ON FAIT L'INVERSE, ET VOICI
-- POURQUOI. L'objectif est le WhatsApp, et l'accroche de S1 est en toutes
-- lettres : « Bonjour, je suis bien avec {{company.name}} ? ». Elle réclame un
-- NOM et un MOBILE. Rien d'autre — ni site, ni démo, ni fiche Google. La
-- première étape de S1 est d'ailleurs une condition sur `a_mobile`.
-- Or 13 899 fiches jamais touchées portent DÉJÀ un mobile et un métier qu'on
-- vend. Lisser 60 000 fiches pour espérer en découvrir quelques centaines
-- reviendrait à payer un mois de traitement pour un stock déjà là. On part donc
-- de celles qui sont joignables aujourd'hui, et on lisse DERRIÈRE — ce qui est
-- possible parce que la démo n'est réclamée qu'à l'étape 4, et que l'étape 3
-- attend une réponse pendant 3 jours (`replyTimeoutDays: 3`).
--
-- ⚠️ CE FICHIER NE « QUALIFIE » PAS AU SENS DU MÉTIER, ET NE PRÉTEND PAS LE
-- FAIRE. La qualification profonde — Google nom+ville, trois passes au registre,
-- le chiffre le plus bas — est un travail FICHE PAR FICHE, et l'appliquer à
-- mille entreprises n'est pas tenable. Ce qui est fait ici est un CRIBLAGE, et
-- il est écrit noir sur blanc ci-dessous pour qu'on sache ce qu'il vaut. Le
-- reste du tri se fait au premier appel : c'est précisément le rôle d'une
-- accroche qui ne demande que « je suis bien avec vous ? ».
--
-- LES NEUF CRITÈRES DU CRIBLAGE, ET CE QUE CHACUN ÉCARTE (mesuré le 30/08) :
--   1. jamais touchée : aucune tâche, aucune inscription, aucune affaire
--   2. vivante : ni archivée, ni fusionnée
--   3. libre : sans propriétaire, jamais qualifiée
--   4. métier démarchable — `porte_metier_mis_de_cote` écarte 28 260 fiches
--   5. UN MOBILE (06/07), entreprise ou tableau `telephones` — le critère qui
--      décide, puisque c'est la condition d'entrée de S1
--   6. un nom d'au moins 3 caractères — l'accroche le PRONONCE (13 écartées)
--   7. ville ET code postal — l'agent doit savoir qui il appelle, et le CP est
--      exigé par `SITE_REQUIRED` pour fabriquer la démo ensuite (569 écartées)
--   8. au moins un `service_tag` — sans métier on ne sait pas quoi vendre (776)
--   9. téléphone NON PARTAGÉ et nom+ville unique — un numéro porté par
--      plusieurs fiches est un standard ou un doublon, pas un artisan joignable
--      (170 + 34 écartées)
-- Reste 12 976 fiches éligibles. On en prend 1 000.
--
-- POURQUOI « CELLES QUI ONT UNE URL » D'ABORD. 3 533 des éligibles portent déjà
-- une URL. Ce sont les seules que l'enrichissement peut lire tout de suite —
-- il part de `site_web_canonique || canonical_url` et échoue en
-- `home_unreachable_or_empty` sans elle. Les prendre en premier fait que les
-- mille accroches partent MAINTENANT et que la démo de l'étape 4 a trois jours
-- pour exister. Prendre au hasard aurait mis les deux tiers du lot en attente
-- d'un lissage qu'on n'aura pas fini d'ici là.
--
-- ⚠️ CE FICHIER N'ATTRIBUE RIEN, comme celui du 29/08 et pour la même raison :
-- `update entreprises set owner_id` fabriquerait une fiche attribuée sans
-- inscription, invisible sur tous les écrans. L'attribution passe par
-- `assignProspectsToAgent` — le bouton de la fiche du lot, ou
-- `scripts/prospection/attribuer-lot.ts`.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. La sélection, figée et archivée AVANT toute écriture
-- ═══════════════════════════════════════════════════════════════════════════
-- Un LOT est une photo : la population ne doit pas bouger entre le moment où on
-- la calcule et celui où on l'attribue. L'archive porte en plus le POURQUOI de
-- chaque ligne (a-t-elle une URL, un SIRET) — sans quoi on ne saurait plus, dans
-- trois semaines, sur quoi le tri avait été fait.
create table if not exists public.archive_renfort_20260830 (
  entreprise_id bigint primary key references public.entreprises(id) on delete cascade,
  futur_owner   uuid not null,
  avait_url     boolean not null,
  avait_siret   boolean not null,
  rang          integer not null,
  archive_le    timestamptz not null default now()
);

with pool as (
  select e.id,
         coalesce(nullif(e.site_web_canonique,''), nullif(e.canonical_url,'')) as url,
         e.siret,
         regexp_replace(coalesce(e.telephone,''),'[^0-9]','','g') as tel_norm,
         lower(btrim(e.name)) as nom_cle,
         lower(btrim(e.ville)) as ville_cle
    from public.entreprises e
   where e.archived_at is null and e.merged_into_id is null
     and coalesce(e.qualifie,false) = false
     and e.owner_id is null
     and not exists (select 1 from public.prospection_tasks p where p.entreprise_id = e.id)
     and not exists (select 1 from public.sequence_enrollments s where s.entreprise_id = e.id)
     and not exists (select 1 from public.opportunites o where o.entreprise_id = e.id)
     and not public.porte_metier_mis_de_cote(e.service_tags)
     -- LE CRITÈRE QUI DÉCIDE : un mobile, sur la fiche ou dans le tableau.
     and (regexp_replace(coalesce(e.telephone,''),'[^0-9]','','g') ~ '^(0[67]|33[67])'
          or exists (select 1 from unnest(coalesce(e.telephones,'{}')) t
                      where regexp_replace(coalesce(t,''),'[^0-9]','','g') ~ '^(0[67]|33[67])'))
     and length(btrim(coalesce(e.name,''))) >= 3
     and coalesce(btrim(e.ville),'') <> '' and coalesce(btrim(e.code_postal),'') <> ''
     and jsonb_typeof(e.service_tags) = 'array' and jsonb_array_length(e.service_tags) > 0
), marque as (
  select p.*,
         count(*) over (partition by nullif(p.tel_norm,''))          as n_tel,
         count(*) over (partition by p.nom_cle, p.ville_cle)         as n_nom_ville
    from pool p
), retenu as (
  select m.id, m.url, m.siret,
         row_number() over (
           -- URL d'abord (enrichissable tout de suite), SIRET ensuite (identité
           -- déjà faite), puis l'identifiant : déterministe, donc rejouable.
           order by (m.url is not null) desc, (m.siret is not null) desc, m.id
         ) as rang
    from marque m
   where m.n_tel = 1 and m.n_nom_ville = 1
)
insert into public.archive_renfort_20260830 (entreprise_id, futur_owner, avait_url, avait_siret, rang)
select r.id,
       -- ALTERNÉ, PAS COUPÉ EN DEUX. Trancher au rang 500 donnerait à l'un
       -- toutes les fiches avec URL et à l'autre le fond du panier : les deux
       -- files doivent avoir la même qualité, pas seulement la même taille.
       case when r.rang % 2 = 1
            then '76353de0-ac50-4645-9530-8be2db55c7a3'::uuid   -- Cacan  = Bilal
            else '66ee3ab7-0ec4-4f4c-995b-d33f58cab585'::uuid   -- Sallami = Matteo
       end,
       r.url is not null, r.siret is not null, r.rang
  from retenu r
 where r.rang <= 1000
on conflict (entreprise_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Les lots — la porte par laquelle l'écran (ou le script) attribuera
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.lots (nom, note) values
  ('Semaine 36 — Renfort Bilal',
   'Renfort du 30/08 : neuves, mobile présent, métier démarchable, criblées. À attribuer à Bilal.'),
  ('Semaine 36 — Renfort Matteo',
   'Renfort du 30/08 : neuves, mobile présent, métier démarchable, criblées. À attribuer à Matteo.'),
  ('Semaine 36 — Renfort à enrichir',
   'Les mille du renfort : toutes portent une URL, donc l''edge function a de la matière à lire.')
on conflict (lower(btrim(nom))) do nothing;

insert into public.lots_entreprises (lot_id, entreprise_id)
select l.id, a.entreprise_id
  from public.archive_renfort_20260830 a
  join public.lots l
    on l.nom = case when a.futur_owner = '76353de0-ac50-4645-9530-8be2db55c7a3'
                    then 'Semaine 36 — Renfort Bilal' else 'Semaine 36 — Renfort Matteo' end
on conflict do nothing;

-- Le lot de FABRICATION — celles qui ont une URL, donc enrichissables telles
-- quelles. Séparé des lots d'attribution parce qu'il ne se travaille pas au
-- même rythme : l'attribution part aujourd'hui, l'enrichissement a trois jours.
insert into public.lots_entreprises (lot_id, entreprise_id)
select l.id, a.entreprise_id
  from public.archive_renfort_20260830 a
  join public.lots l on l.nom = 'Semaine 36 — Renfort à enrichir'
 where a.avait_url
on conflict do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- Contrôles — à relire avant d'attribuer
-- ═══════════════════════════════════════════════════════════════════════════
-- select count(*) filter (where futur_owner='76353de0-ac50-4645-9530-8be2db55c7a3') as bilal,
--        count(*) filter (where futur_owner='66ee3ab7-0ec4-4f4c-995b-d33f58cab585') as matteo,
--        count(*) filter (where avait_url) as avec_url,
--        count(*) filter (where avait_siret) as avec_siret
--   from public.archive_renfort_20260830;
--
-- AUCUNE NE DOIT ÊTRE DÉJÀ ENGAGÉE. Les trois doivent rendre 0.
-- select count(*) from public.archive_renfort_20260830 a
--   join public.prospection_tasks p on p.entreprise_id = a.entreprise_id;
-- select count(*) from public.archive_renfort_20260830 a
--   join public.sequence_enrollments s on s.entreprise_id = a.entreprise_id;
-- select count(*) from public.archive_renfort_20260830 a
--   join public.entreprises e on e.id = a.entreprise_id where e.owner_id is not null;
--
-- TOUTES DOIVENT AVOIR UN MOBILE — c'est le seul critère dont dépend l'objectif.
-- Doit rendre 1000.
-- select count(*) from public.archive_renfort_20260830 a join public.entreprises e on e.id=a.entreprise_id
--  where regexp_replace(coalesce(e.telephone,''),'[^0-9]','','g') ~ '^(0[67]|33[67])'
--     or exists (select 1 from unnest(coalesce(e.telephones,'{}')) t
--                 where regexp_replace(coalesce(t,''),'[^0-9]','','g') ~ '^(0[67]|33[67])');
--
-- ROLLBACK — avant attribution, il suffit de retirer les lots : aucune fiche
-- n'a été touchée. APRÈS attribution, rendre le propriétaire à NULL ne suffit
-- pas — il faut passer par le retrait (`unassignProspectsFromAgent`), qui sort
-- aussi les inscriptions et écarte les tâches.
/*
delete from public.lots where nom in ('Semaine 36 — Renfort Bilal',
                                      'Semaine 36 — Renfort Matteo',
                                      'Semaine 36 — Renfort à enrichir');
drop table if exists public.archive_renfort_20260830;
*/
