-- Ajout de flags structurés pour mieux prioriser les opportunités
alter table public.opportunites
  add column if not exists flags text[] not null default '{}';

comment on column public.opportunites.flags is
  'Flags de qualification/priorisation (ex: site_merdique, site_tres_ancien, a_revoir_plus_tard).';

create index if not exists opportunites_flags_gin_idx
  on public.opportunites
  using gin (flags);
