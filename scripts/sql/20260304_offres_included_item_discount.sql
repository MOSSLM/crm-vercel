begin;

alter table public.offres_included_items
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,2);

alter table public.offres_included_items
  drop constraint if exists offres_included_items_discount_type_check;

alter table public.offres_included_items
  add constraint offres_included_items_discount_type_check
  check (
    discount_type is null
    or discount_type in ('percent', 'fixed')
  );

alter table public.offres_included_items
  drop constraint if exists offres_included_items_discount_value_check;

alter table public.offres_included_items
  add constraint offres_included_items_discount_value_check
  check (
    discount_value is null
    or discount_value >= 0
  );

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
      'notes', i.notes,
      'discount_type', i.discount_type,
      'discount_value', i.discount_value
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
