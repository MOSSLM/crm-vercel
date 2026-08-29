-- Partager le stock de démarchage entre les deux agents — semaine du 31/08/2026.
--
-- LA DEMANDE, du propriétaire le 29/08 : « 50 personnes par jour minimum en
-- nouveaux, partagées entre Matteo et Bilal », et « bien sûr ceux déjà en cours
-- de démarchage on les déplace pas ».
--
-- CE QUE LA MESURE A TROUVÉ, ET QUI CHANGE LE GESTE
-- Sur 778 fiches qualifiées vivantes : 140 déjà démarchées, 13 entamées, et
-- **625 jamais touchées**. Elles ne sont pas réparties, elles sont EMPILÉES :
--   Sallami (Matteo) ... 440   dont 431 gelées en `sequence_paused`
--   Cacan   (Bilal) ....  65
--   sans propriétaire .. 120
-- Les 431 gelées sont attribuées, inscrites en séquence, et invisibles : leur
-- `next_run_at` est nul, et `regulator-db.ts` ne lit que les inscriptions dont
-- la date est posée (`.not('next_run_at','is',null)`). Aucun tick ne les
-- reprendra. C'est la cause du flux mort depuis le 20/08, pas un manque de
-- matière — le réservoir libre démarchable compte 30 852 fiches.
--
-- ⚠️ LE CANAL DÉCIDE, PAS LA NOTE D'AUDIT. Le démarchage se fait en WhatsApp et
-- en appel : ce qui compte est d'avoir un MOBILE, pas un site à refaire. Sur
-- les 625 jamais touchées, 187 ont un 06/07 et 427 une ligne fixe. Un partage
-- qui ignorerait le canal donnerait tout le WhatsApp à l'un et tout le
-- téléphone à l'autre — d'où la répartition par (cohorte × canal) ci-dessous.
--
-- CE QUI NE BOUGE PAS, ET POURQUOI
--   · toute fiche portant une tâche `done`, `pending` ou `snoozed` — c'est du
--     démarchage en cours, on ne le passe pas d'une main à l'autre ;
--   · les 53 qui ont déjà reçu un e-mail : elles restent chez leur
--     propriétaire, mais comptent dans son total pour que l'équilibre soit vrai ;
--   · les fiches portant un métier mis de côté (isolation, menuiserie) — elles
--     sont déjà sorties par `20260829_metiers_mis_de_cote.sql`.
-- Les 478 qui portent une tâche `skipped` sont en revanche DÉPLAÇABLES : ce
-- sont les appels abandonnés en masse quand le canal téléphone a été laissé de
-- côté, pas du travail en cours. `prospection_tasks.status = 'skipped'` ne dit
-- pas qui a écarté ni pourquoi — les traiter comme du démarchage vivant
-- gèlerait les trois quarts du stock.
--
-- ⚠️ CE FICHIER NE FAIT PAS L'ATTRIBUTION, ET C'EST DÉLIBÉRÉ.
-- `update entreprises set owner_id` fabriquerait exactement l'état dont on
-- sort : une fiche attribuée sans tâche et sans inscription vivante n'apparaît
-- sur AUCUN écran, et rien ne le signale. L'attribution passe par
-- `assignProspectToAgent` (`src/app/api/admin/_assign.ts`), qui pose le
-- propriétaire, réutilise l'affaire existante plutôt que d'en ouvrir une
-- seconde, qualifie, et sème la tâche « Appel à froid » — c'est cette tâche-là
-- qui fait apparaître le prospect dans la file. Ce fichier PRÉPARE : il fige la
-- répartition dans deux lots, que l'écran attribue ensuite en un geste.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. L'état d'avant, archivé AVANT toute écriture
-- ═══════════════════════════════════════════════════════════════════════════
-- `entreprises` n'a pas de trigger `updated_at` (vérifié le 29/08 : 72 triggers
-- de ce genre dans la base, aucun sur cette table), donc `updated_at` ne trahit
-- pas une réattribution. Raison de plus pour archiver : sans cette table, rien
-- ne dirait à qui la fiche appartenait avant.
create table if not exists public.archive_repartition_20260829 (
  entreprise_id   bigint primary key references public.entreprises(id) on delete cascade,
  owner_avant     uuid,
  cohorte         text,
  canal           text,
  deja_mailee     boolean not null,
  futur_owner     uuid not null,
  archive_le      timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. La répartition — déterministe, rejouable, équilibrée sur deux axes
-- ═══════════════════════════════════════════════════════════════════════════
-- L'ordre de service dans chaque groupe (cohorte × canal) : ce que Bilal a
-- déjà, puis ce qui n'appartient à personne, puis ce qu'il faut prendre chez
-- Matteo. C'est ce qui MINIMISE les mouvements — un partage au hasard
-- déplacerait des fiches pour rien.
with base as (
  select e.id, e.owner_id,
         coalesce(e.cohorte_demarchage, 'hors_cohorte') as cohorte,
         case
           when regexp_replace(coalesce(e.telephone,''), '[^0-9]', '', 'g') ~ '^(0[67]|33[67])'    then 'mobile'
           when regexp_replace(coalesce(e.telephone,''), '[^0-9]', '', 'g') ~ '^(0[1-59]|33[1-59])' then 'fixe'
           else 'sans_num'
         end as canal,
         exists (select 1 from public.email_logs el where el.entreprise_id::bigint = e.id) as deja_mailee
    from public.entreprises e
   where coalesce(e.qualifie, false)
     and e.archived_at is null
     and not public.porte_metier_mis_de_cote(e.service_tags)
     -- Jamais touchée : ni faite, ni en attente, ni reportée. `skipped` ne
     -- compte pas — voir l'en-tête.
     and not exists (select 1 from public.prospection_tasks p
                      where p.entreprise_id = e.id
                        and p.status in ('done', 'pending', 'snoozed'))
), groupes as (
  select b.*,
         count(*) over (partition by b.cohorte, b.canal) as taille,
         -- Les fiches figées chez Bilal comptent dans sa moitié : sans ça, il
         -- recevrait deux fois sa part sur les groupes où il en a déjà.
         count(*) filter (where b.deja_mailee and b.owner_id = '76353de0-ac50-4645-9530-8be2db55c7a3')
           over (partition by b.cohorte, b.canal) as figees_bilal
    from base b
), rangs as (
  select g.*,
         case when g.deja_mailee then null else
           row_number() over (
             partition by g.cohorte, g.canal, g.deja_mailee
             order by case when g.owner_id = '76353de0-ac50-4645-9530-8be2db55c7a3' then 0
                           when g.owner_id is null                                  then 1
                           else 2 end,
                      g.id)
         end as rang
    from groupes g
)
insert into public.archive_repartition_20260829
       (entreprise_id, owner_avant, cohorte, canal, deja_mailee, futur_owner)
select r.id, r.owner_id, r.cohorte, r.canal, r.deja_mailee,
       case
         when r.deja_mailee then r.owner_id
         when r.rang <= greatest(0, ceil(r.taille / 2.0)::int - r.figees_bilal)
           then '76353de0-ac50-4645-9530-8be2db55c7a3'::uuid   -- Cacan  = Bilal
         else '66ee3ab7-0ec4-4f4c-995b-d33f58cab585'::uuid      -- Sallami = Matteo
       end
  from rangs r
 where not (r.deja_mailee and r.owner_id is null)   -- rien à décider sans propriétaire ni canal
on conflict (entreprise_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Les deux lots — la porte par laquelle l'écran attribuera
-- ═══════════════════════════════════════════════════════════════════════════
-- Un LOT est une photo figée (voir docs/VISION-crm-segments-et-lots.md), et
-- c'est exactement ce qu'il faut ici : la population ne doit pas bouger entre
-- le moment où on la calcule et celui où on l'attribue.
insert into public.lots (nom, note)
values ('Semaine 36 — Bilal',  'Répartition du 29/08 : moitié du stock jamais touché, équilibrée par cohorte et par canal.'),
       ('Semaine 36 — Matteo', 'Répartition du 29/08 : moitié du stock jamais touché, équilibrée par cohorte et par canal.')
on conflict (lower(btrim(nom))) do nothing;

insert into public.lots_entreprises (lot_id, entreprise_id)
select l.id, a.entreprise_id
  from public.archive_repartition_20260829 a
  join public.lots l
    on l.nom = case when a.futur_owner = '76353de0-ac50-4645-9530-8be2db55c7a3'
                    then 'Semaine 36 — Bilal' else 'Semaine 36 — Matteo' end
 where a.owner_avant is distinct from a.futur_owner   -- seules celles qui bougent
on conflict do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- Contrôles — à relire avant d'attribuer
-- ═══════════════════════════════════════════════════════════════════════════
-- Attendu au 29/08/2026 : Bilal 314 fiches (94 mobiles), Matteo 311 (93).
-- select case when futur_owner = '76353de0-ac50-4645-9530-8be2db55c7a3' then 'Bilal' else 'Matteo' end as pour,
--        count(*) as total,
--        count(*) filter (where canal = 'mobile') as mobile,
--        count(*) filter (where cohorte = 'A_site_faible') as coh_a,
--        count(*) filter (where cohorte = 'B_sans_site')   as coh_b,
--        count(*) filter (where owner_avant is distinct from futur_owner) as a_attribuer
--   from public.archive_repartition_20260829 group by 1;
--
-- Aucune fiche en cours de démarchage n'est dans le lot : doit rendre 0.
-- select count(*) from public.lots_entreprises le
--   join public.prospection_tasks p on p.entreprise_id = le.entreprise_id
--  where p.status in ('done','pending','snoozed');
--
-- ROLLBACK — rend chaque fiche à son propriétaire d'avant, et retire les lots.
-- À ne jouer QU'APRÈS l'attribution, si elle s'est mal passée.
/*
update public.entreprises e
   set owner_id = a.owner_avant
  from public.archive_repartition_20260829 a
 where e.id = a.entreprise_id and e.owner_id is distinct from a.owner_avant;

delete from public.lots where nom in ('Semaine 36 — Bilal', 'Semaine 36 — Matteo');
*/
