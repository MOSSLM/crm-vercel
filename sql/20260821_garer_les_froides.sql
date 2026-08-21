-- Garer les 524 froides de S1 — elles attendent que leurs démos existent.
--
-- POURQUOI ELLES NE PEUVENT PAS PARTIR. Elles sont à l'étape 0 de S1, toutes
-- attribuées à Matteo, toutes déjà dans la liste de campagne, et aucune n'a de
-- site — pas même un brouillon. L'accroche `wa1` ne promet rien et pourrait
-- partir ; mais `wa2`, trois jours plus tard, annonce « j'ai préparé un site
-- pour vous : {{company.demo_url}} ». Le garde `etapePromettUneDemoAbsente`
-- gèlerait alors les 172 WhatsApp sur `demo_manquante` — après que l'agent a
-- déjà dépensé 172 gestes.
--
-- CE QU'ON FAIT : `next_run_at` à NULL. Le régulateur ne lit que les
-- inscriptions dont `next_run_at` est passé (`.lte(...)`, regulator-db.ts) et
-- une comparaison sur NULL n'est jamais vraie : elles sortent de la file du
-- ticker sans changer d'état ni perdre leur position dans la séquence.
--
-- CE QU'ON NE FAIT PAS : les sortir de la séquence, les désinscrire, ou les
-- retirer de la liste de campagne. Elles restent à l'étape 0, prêtes à repartir
-- exactement là où elles sont. Le dénominateur de la campagne ne bouge pas —
-- une liste qui rétrécit fausserait tous les taux.
--
-- LES RELÂCHER, plus tard, par paquets de 30 à 50 dont la démo est publiée :
--
--   update sequence_enrollments e set next_run_at = now()
--   where e.next_run_at is null
--     and e.vars ? 'gare_20260821'
--     and exists (select 1 from sites s
--                  where s.enterprise_id = e.entreprise_id and s.is_published)
--   and e.id in (select id from sequence_enrollments
--                where next_run_at is null and vars ? 'gare_20260821' limit 40);

begin;

-- Archiver AVANT d'écrire : le trigger `updated_at` détruit la preuve de ce
-- qui était là, et une fois écrasée elle ne revient pas.
create table if not exists archive_inscriptions_garees_20260821 as
select *, now() as archive_le
from sequence_enrollments
where automation_id = '0e7a1f30-0000-4000-8000-000000000001'
  and status in ('active','paused')
  and current_step = 0;

update sequence_enrollments e
set next_run_at = null,
    vars = coalesce(e.vars, '{}'::jsonb) || jsonb_build_object(
      'gare_20260821', jsonb_build_object(
        'motif', 'demo_manquante',
        'relacher_quand', 'le site de l''entreprise est publié',
        'le', to_char(now(), 'YYYY-MM-DD')))
where e.automation_id = '0e7a1f30-0000-4000-8000-000000000001'
  and e.status in ('active','paused')
  and e.current_step = 0
  and e.next_run_at is not null;

commit;
