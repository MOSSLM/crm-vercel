-- Téléphonie — SVI/Standard (scénarios + nœuds) et suivi de portabilité.
-- À exécuter manuellement dans l'éditeur SQL Supabase. Admin uniquement (RLS).

begin;

-- SVI / Standard : scénarios d'accueil et arbre de nœuds ----------------------
create table if not exists public.ivr_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number_id uuid references public.phone_numbers(id) on delete set null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ivr_nodes (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.ivr_scenarios(id) on delete cascade,
  parent_id uuid references public.ivr_nodes(id) on delete cascade,
  kind text not null
    check (kind in ('say','play','menu','wait_dtmf','redirect','voicemail','hangup')),
  config jsonb not null default '{}'::jsonb,   -- {text, dtmf, target, tts_voice, ...}
  position integer not null default 100,
  created_at timestamptz not null default now()
);
create index if not exists ivr_nodes_scenario_idx on public.ivr_nodes (scenario_id, position);

-- Suivi de portabilité (le portage réel est manuel/KYC au panneau) ------------
create table if not exists public.number_portings (
  id uuid primary key default gen_random_uuid(),
  e164 text not null,
  operator text,
  line_type text not null default 'fixe' check (line_type in ('mobile','fixe','tollfree')),
  status text not null default 'brouillon'
    check (status in ('brouillon','soumis','en_cours','bloque','termine')),
  rio text,
  notes text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['ivr_scenarios','number_portings'] loop
    execute format('drop trigger if exists trg_%1$s_set_updated_at on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_set_updated_at before update on public.%1$s '
      'for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- RLS : admin gère tout ------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ivr_scenarios','ivr_nodes','number_portings'] loop
    execute format('alter table public.%1$s enable row level security;', t);
    execute format('drop policy if exists "admin all %1$s" on public.%1$s;', t);
    execute format(
      'create policy "admin all %1$s" on public.%1$s '
      'for all using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

commit;
