-- Ajoute des tags de services structurés pour les entreprises
alter table public.entreprises
  add column if not exists service_tags jsonb not null default '[]'::jsonb;

-- Garantit que la colonne contient toujours un tableau JSON
alter table public.entreprises
  drop constraint if exists entreprises_service_tags_is_array;

alter table public.entreprises
  add constraint entreprises_service_tags_is_array
  check (jsonb_typeof(service_tags) = 'array');

-- Migration des anciens tags texte vers le nouveau format JSONB
update public.entreprises
set service_tags = to_jsonb(
  array_remove(
    regexp_split_to_array(coalesce(premiers_tags, ''), '\s*,\s*'),
    ''
  )
)
where (service_tags = '[]'::jsonb or service_tags is null)
  and coalesce(trim(premiers_tags), '') <> '';

-- Index GIN utile pour les filtres/contains sur tags de service
create index if not exists entreprises_service_tags_gin_idx
  on public.entreprises
  using gin (service_tags jsonb_path_ops);
