-- Mode test des envois : adresses email personnelles + flag is_test sur les
-- opportunités. Une opportunité de test est reliée à une entreprise/contact
-- fictifs dont l'email est une des adresses de test — les séquences et envois
-- aboutissent donc dans la boîte du user, sans routage spécial.
-- Appliqué via Supabase MCP.

alter table public.opportunites
  add column if not exists is_test boolean not null default false;

create table if not exists public.test_email_addresses (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  email text not null unique,
  created_at timestamptz not null default now()
);

-- RLS : même convention que les tables de référence des automatisations
-- (cf. sql/20260522_automations_v2.sql).
alter table public.test_email_addresses enable row level security;
drop policy if exists au_all_authenticated on public.test_email_addresses;
create policy au_all_authenticated on public.test_email_addresses
  for all to public
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
