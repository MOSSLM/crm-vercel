-- Production lead magnets + templates

create table if not exists public.production_templates (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  nom_template_framer text,
  niche_tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_templates_niche_tags_is_array
    check (jsonb_typeof(niche_tags) = 'array')
);

create index if not exists production_templates_created_at_idx
  on public.production_templates (created_at desc);

create table if not exists public.production_template_checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.production_templates(id) on delete cascade,
  titre text not null,
  description text,
  position integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_template_checklist_items_template_idx
  on public.production_template_checklist_items (template_id, position asc, created_at asc);

create table if not exists public.production_lead_magnets (
  id uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references public.opportunites(id) on delete cascade,
  template_id uuid not null references public.production_templates(id) on delete restrict,
  nom text,
  statut text not null default 'a_faire',
  lien_livraison text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_lead_magnets_opportunite_unique unique (opportunite_id),
  constraint production_lead_magnets_statut_check check (statut = any (array['a_faire'::text, 'en_cours'::text, 'pret'::text]))
);

create index if not exists production_lead_magnets_statut_idx
  on public.production_lead_magnets (statut, created_at desc);

create index if not exists production_lead_magnets_template_idx
  on public.production_lead_magnets (template_id);

create table if not exists public.production_lead_magnet_todos (
  id uuid primary key default gen_random_uuid(),
  lead_magnet_id uuid not null references public.production_lead_magnets(id) on delete cascade,
  template_checklist_item_id uuid references public.production_template_checklist_items(id) on delete set null,
  titre text not null,
  description text,
  is_done boolean not null default false,
  position integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_lead_magnet_todos_lm_idx
  on public.production_lead_magnet_todos (lead_magnet_id, position asc, created_at asc);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_production_templates_updated_at
before update on public.production_templates
for each row
execute function public.set_row_updated_at();

create trigger trg_production_template_checklist_items_updated_at
before update on public.production_template_checklist_items
for each row
execute function public.set_row_updated_at();

create trigger trg_production_lead_magnets_updated_at
before update on public.production_lead_magnets
for each row
execute function public.set_row_updated_at();

create trigger trg_production_lead_magnet_todos_updated_at
before update on public.production_lead_magnet_todos
for each row
execute function public.set_row_updated_at();

create or replace function public.seed_lead_magnet_todos_from_template()
returns trigger
language plpgsql
as $$
begin
  insert into public.production_lead_magnet_todos (
    lead_magnet_id,
    template_checklist_item_id,
    titre,
    description,
    is_done,
    position
  )
  select
    new.id,
    item.id,
    item.titre,
    item.description,
    false,
    item.position
  from public.production_template_checklist_items item
  where item.template_id = new.template_id
  order by item.position asc, item.created_at asc;

  return new;
end;
$$;

create trigger trg_seed_lead_magnet_todos_from_template
after insert on public.production_lead_magnets
for each row
execute function public.seed_lead_magnet_todos_from_template();
