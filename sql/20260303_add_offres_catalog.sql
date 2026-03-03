-- CRM Offres / Services / Packages
-- Compatible PostgreSQL (Supabase)

begin;

-- 1) Enum for catalog item type
create type public.offer_item_type as enum ('service', 'package');

-- 2) Main catalog table: one row = service or package
create table if not exists public.offres (
  id uuid primary key default gen_random_uuid(),
  type public.offer_item_type not null,
  code text unique,
  nom text not null,
  description text,
  prix_ht numeric(12,2),
  devise text not null default 'EUR',
  billing_period text, -- one_shot, monthly, yearly...
  actif boolean not null default true,

  -- Control visibility in qualification UI
  visible_in_qualification boolean not null default true,
  qualification_order int not null default 100,

  -- Optional metadata for front/export
  slug text unique,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint offres_nom_not_empty check (length(trim(nom)) > 0)
);

create index if not exists offres_visible_idx
  on public.offres (visible_in_qualification, qualification_order, nom);

create index if not exists offres_type_idx
  on public.offres (type, actif);

-- 3) Sub-services included in a package (or composite service)
create table if not exists public.offres_included_items (
  id uuid primary key default gen_random_uuid(),
  parent_offre_id uuid not null references public.offres(id) on delete cascade,
  included_offre_id uuid not null references public.offres(id) on delete restrict,
  quantite numeric(12,2) not null default 1,
  is_optional boolean not null default false,
  sort_order int not null default 100,
  notes text,
  created_at timestamptz not null default now(),

  constraint offres_included_items_no_self_ref
    check (parent_offre_id <> included_offre_id),
  constraint offres_included_items_unique
    unique (parent_offre_id, included_offre_id)
);

create index if not exists offres_included_parent_idx
  on public.offres_included_items (parent_offre_id, sort_order);

-- 4) Link opportunities to selected offer/service/package
alter table public.opportunites
  add column if not exists offre_id uuid null references public.offres(id) on delete set null,
  add column if not exists offre_nom_snapshot text,
  add column if not exists offre_prix_ht_snapshot numeric(12,2),
  add column if not exists offre_devise_snapshot text;

create index if not exists opportunites_offre_id_idx
  on public.opportunites (offre_id);

-- 5) Trigger function to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_offres_set_updated_at on public.offres;
create trigger trg_offres_set_updated_at
before update on public.offres
for each row execute function public.set_updated_at();

-- 6) Optional helper view for qualification lists
create or replace view public.v_offres_qualification as
select
  o.id,
  o.type,
  o.nom,
  o.description,
  o.prix_ht,
  o.devise,
  o.billing_period,
  o.qualification_order,
  o.tags,
  o.metadata,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'included_offre_id', i.included_offre_id,
      'nom', oi.nom,
      'type', oi.type,
      'quantite', i.quantite,
      'is_optional', i.is_optional,
      'sort_order', i.sort_order,
      'notes', i.notes
    ) order by i.sort_order, oi.nom), '[]'::jsonb)
    from public.offres_included_items i
    join public.offres oi on oi.id = i.included_offre_id
    where i.parent_offre_id = o.id
  ) as included_items
from public.offres o
where o.actif = true
  and o.visible_in_qualification = true
order by o.qualification_order, o.nom;

commit;
