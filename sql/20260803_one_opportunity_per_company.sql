-- Une entreprise = une affaire, garanti par la base.
--
-- À APPLIQUER APRÈS `sql/20260803_merge_duplicate_opportunites.sql` et après
-- avoir réellement lancé la fusion :
--
--   select * from public.merge_duplicate_opportunites();                  -- simulation
--   select * from public.merge_duplicate_opportunites(p_dry_run => false); -- écriture
--
-- L'index ÉCHOUE tant qu'il reste une entreprise avec deux affaires
-- (`ERROR: 23505 … Key (entreprise_id)=(2204) is duplicated`). C'est voulu :
-- mieux vaut refuser l'index que perdre des données en douce — même garde-fou
-- que `sql/20260731_one_lead_magnet_project_per_company.sql`.
--
-- Pour voir quelles entreprises bloquent, sans rien modifier :
--
--   select entreprise_id, count(*) as affaires, array_agg(id) as opportunite_ids
--     from public.opportunites
--    where entreprise_id is not null and coalesce(is_test, false) = false
--    group by entreprise_id
--   having count(*) > 1
--    order by count(*) desc;
--
-- POURQUOI UN INDEX ET PAS SEULEMENT DU CODE
-- Le code applicatif a déjà été corrigé (`assignProspectToAgent` réutilise
-- l'affaire existante ; `AppDataContext.addOpportunity` refuse une seconde
-- affaire). Mais il existe plusieurs chemins de création — attribution admin,
-- qualification d'entreprise, fiche entreprise, fiche contact — et il en
-- apparaîtra d'autres. Seule la base peut tenir l'invariant pour tous.
--
-- `is_test` est exclu : `/api/test-opportunities` crée son entreprise fictive à
-- chaque appel, donc l'unicité y est déjà vraie, mais l'exclure explicitement
-- immunise le jour où une affaire de test viserait une vraie entreprise
-- (`is_test` fait partie des colonnes écrivables depuis l'UI).

create unique index if not exists opportunites_entreprise_unique
  on public.opportunites (entreprise_id)
  where entreprise_id is not null and coalesce(is_test, false) = false;

comment on index public.opportunites_entreprise_unique is
  'Une entreprise = une affaire. Les doublons naissaient de l''attribution d''un '
  'prospect à un agent, qui ouvrait une seconde affaire dans le pipeline Agent SAMA '
  'quand l''entreprise n''en avait que dans un autre pipeline.';
