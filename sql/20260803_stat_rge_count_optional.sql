-- Les chiffres clés d'un lead magnet sont facultatifs — les qualifications RGE
-- en particulier.
--
-- SYMPTÔME CORRIGÉ
-- Ouvrir la fiche d'une opportunité depuis le pipeline, laisser
-- « Qualifications (RGE) » vide (ou à 0) et enregistrer échouait tout entier :
--
--   null value in column "stat_rge_count" of relation "lead_magnet_projects"
--   violates not-null constraint
--
-- Toute la saisie était perdue pour un chiffre que beaucoup d'entreprises n'ont
-- tout simplement pas : `missingForSite` (src/app/api/marketing-pipeline/_board.ts)
-- ne le réclame pas, et le bloc « chiffres clés » du site se contente alors de
-- trois colonnes.
--
-- La table `lead_magnet_projects` a été créée hors des migrations du dépôt :
-- selon les bases, ces colonnes portent un `NOT NULL DEFAULT ''` et parfois un
-- `CHECK` qui refuse 0. Ce script enlève les deux.
--
-- APPLICATION : à la main dans l'éditeur SQL Supabase. Idempotent, rejouable.
--
-- L'application sait déjà se passer de la colonne quand la base la refuse
-- (voir `src/app/api/marketing-pipeline/_project-write.ts`) : cette migration
-- supprime la cause, elle n'est pas un prérequis au correctif.

do $$
declare
  stat_col  text;
  con       record;
  dropped   int := 0;
begin
  if to_regclass('public.lead_magnet_projects') is null then
    raise notice 'lead_magnet_projects absente : rien à faire.';
    return;
  end if;

  -- 1. NOT NULL — « pas de chiffre » doit pouvoir s'écrire NULL.
  foreach stat_col in array array[
    'stat_years_experience',
    'stat_satisfied_clients',
    'stat_installations_completed',
    'stat_rge_count'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'lead_magnet_projects'
        and column_name = stat_col
        and is_nullable = 'NO'
    ) then
      execute format(
        'alter table public.lead_magnet_projects alter column %I drop not null',
        stat_col
      );
      dropped := dropped + 1;
      raise notice 'lead_magnet_projects.% : NOT NULL supprimé', stat_col;
    end if;
  end loop;

  -- 2. CHECK portant sur ces colonnes — un 0 est une valeur légitime, et une
  --    entreprise sans qualification RGE ne doit pas avoir à inventer un
  --    chiffre pour que sa fiche s'enregistre.
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'lead_magnet_projects'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~
          'stat_(years_experience|satisfied_clients|installations_completed|rge_count)'
  loop
    execute format(
      'alter table public.lead_magnet_projects drop constraint %I',
      con.conname
    );
    dropped := dropped + 1;
    raise notice 'lead_magnet_projects : contrainte % supprimée', con.conname;
  end loop;

  if dropped = 0 then
    raise notice 'Aucune contrainte bloquante sur les chiffres clés : base déjà saine.';
  end if;
end $$;

comment on column public.lead_magnet_projects.stat_rge_count is
  'Nombre de qualifications (RGE, Qualibat…). FACULTATIF : NULL ou vide quand '
  'l''entreprise n''en affiche aucune — le bloc « chiffres clés » du site se '
  'limite alors à trois colonnes. Ne jamais rendre cette colonne obligatoire.';
