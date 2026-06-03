-- Prospect assignment & claim-approval workflow.
--
-- Until now a freelance agent could self-claim a pool company instantly
-- (api/agent/claim set owner_id directly). The business rule is: the ADMIN
-- owns assignment. Agents may *request* a prospect; the admin confirms or
-- refuses. The admin can also assign a prospect to an agent directly.
--
-- This migration adds the request table; the owner_id columns + per-agent RLS
-- on entreprises/opportunites already exist (20260603_agent_portal_ownership).

create table if not exists public.prospect_claim_requests (
  id           uuid primary key default gen_random_uuid(),
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,
  agent_id     uuid not null references public.user_profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','approved','refused')),
  note         text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.user_profiles(id) on delete set null
);

create index if not exists idx_claim_requests_status on public.prospect_claim_requests(status);
create index if not exists idx_claim_requests_agent  on public.prospect_claim_requests(agent_id);
create index if not exists idx_claim_requests_entreprise on public.prospect_claim_requests(entreprise_id);

-- At most one *pending* request per (entreprise, agent) — re-requesting is a no-op.
create unique index if not exists uniq_pending_claim_request
  on public.prospect_claim_requests(entreprise_id, agent_id)
  where status = 'pending';

alter table public.prospect_claim_requests enable row level security;

-- Admin manages everything; an agent may create and read only their own requests.
-- (The API approves/assigns with the service role, so these policies just guard
-- direct browser-client access.)
drop policy if exists "admin all claim requests" on public.prospect_claim_requests;
drop policy if exists "freelance read own claim requests" on public.prospect_claim_requests;
drop policy if exists "freelance insert own claim requests" on public.prospect_claim_requests;

create policy "admin all claim requests" on public.prospect_claim_requests
  for all using (is_admin()) with check (is_admin());

create policy "freelance read own claim requests" on public.prospect_claim_requests
  for select using (is_freelance() and agent_id = (select auth.uid()));

create policy "freelance insert own claim requests" on public.prospect_claim_requests
  for insert with check (is_freelance() and agent_id = (select auth.uid()));
