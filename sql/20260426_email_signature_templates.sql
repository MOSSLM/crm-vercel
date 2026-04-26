-- ============================================================
-- Email signature settings (one row per user)
-- ============================================================
create table if not exists public.email_signature_settings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  first_name   text not null default '',
  last_name    text not null default '',
  job_title    text not null default '',
  company      text not null default '',
  email        text not null default '',
  phone        text not null default '',
  website      text not null default '',
  linkedin_url text not null default '',
  accent_color text not null default '#6366f1',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id)
);

-- ============================================================
-- Email templates (user-created + global read-only defaults)
-- ============================================================
create table if not exists public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  type       text not null default 'autre',
  subject    text not null default '',
  body       text not null default '',
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_user_id_idx on public.email_templates using btree (user_id);
create index if not exists email_templates_type_idx    on public.email_templates using btree (type);

-- ============================================================
-- Seed the 3 default templates (global, user_id = NULL)
-- ============================================================
insert into public.email_templates (user_id, name, type, subject, body, is_default, sort_order)
values
  (
    null,
    'Premier contact',
    'premier_contact',
    'Développer la visibilité de {{company_name}} en ligne',
    E'Bonjour {{contact_name}},\n\nJe me permets de vous contacter car j''ai identifié plusieurs opportunités pour renforcer la présence en ligne de {{company_name}}.\n\nJe serais ravi(e) de vous présenter notre approche en quelques minutes — auriez-vous un créneau cette semaine ?\n\nCordialement,',
    true,
    1
  ),
  (
    null,
    'Relance / Suivi',
    'relance',
    'Suite à notre conversation — {{company_name}}',
    E'Bonjour {{contact_name}},\n\nJe me permets de revenir vers vous suite à notre dernier échange concernant {{company_name}}.\n\nAvez-vous eu l''occasion de réfléchir à notre proposition ? Je serais ravi(e) d''échanger avec vous pour répondre à vos éventuelles questions.\n\nDans l''attente de vous lire,',
    true,
    2
  ),
  (
    null,
    'Envoi Lead Magnet',
    'lead_magnet',
    'Votre audit gratuit est prêt — {{company_name}}',
    E'Bonjour {{contact_name}},\n\nJ''espère que vous allez bien.\n\nSuite à notre échange, j''ai le plaisir de vous partager votre audit personnalisé pour {{company_name}} :\n\n👉 {{lead_magnet_url}}\n\nCe document vous donne une vision claire de vos opportunités d''amélioration et des leviers concrets pour développer votre activité.\n\nN''hésitez pas à me faire part de vos questions — je reste disponible pour en discuter.\n\nBonne lecture,',
    true,
    3
  )
on conflict do nothing;
