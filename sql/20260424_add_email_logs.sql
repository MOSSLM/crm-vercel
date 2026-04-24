-- Email logs table for tracking emails sent via Resend
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  resend_id text,
  contact_id uuid references public.contacts(id) on delete set null,
  entreprise_id integer references public.entreprises(id) on delete set null,
  opportunite_id uuid references public.opportunites(id) on delete set null,
  lead_magnet_project_id uuid,
  to_email text not null,
  to_name text,
  from_email text,
  subject text not null,
  body_html text,
  body_text text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'pending')),
  error_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists email_logs_contact_id_idx on public.email_logs using btree (contact_id);
create index if not exists email_logs_entreprise_id_idx on public.email_logs using btree (entreprise_id);
create index if not exists email_logs_opportunite_id_idx on public.email_logs using btree (opportunite_id);
create index if not exists email_logs_sent_at_idx on public.email_logs using btree (sent_at desc);

alter table public.email_logs enable row level security;
create policy "auth users can manage email_logs" on public.email_logs
  for all using (auth.role() = 'authenticated');
