-- Template d'origine d'un site de démo.
--
-- Contexte : le marketing pipeline crée les démos en clonant un template, mais
-- rien ne gardait trace du modèle utilisé. Impossible, en regardant une ligne,
-- de dire depuis quel template son site a été fait — donc impossible de repérer
-- les démos parties sur le mauvais modèle, ni de proposer « refaire ce site
-- avec le template sélectionné » en sachant ce qu'on remplace.
--
-- La colonne est renseignée par `cloneTemplateSite` (création) et par la
-- reconstruction depuis un autre template. `on delete set null` : supprimer un
-- template ne doit pas emporter les démos qui en sont issues.
--
-- Idempotent, et le code fonctionne sans (il retente son écriture sans la
-- colonne quand la migration n'est pas appliquée).

begin;

alter table public.sites
  add column if not exists source_template_id uuid references public.sites(id) on delete set null;

create index if not exists idx_sites_source_template
  on public.sites(source_template_id)
  where source_template_id is not null;

comment on column public.sites.source_template_id is
  'Template (sites.is_template) dont ce site est le clone — posé à la création et à chaque reconstruction.';

commit;
