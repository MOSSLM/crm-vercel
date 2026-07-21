-- email_logs becomes a multi-channel exchange log. WhatsApp sends (wa.me) are now
-- recorded here too (channel='whatsapp') so the contact history shows email AND
-- WhatsApp outreach — including exchanges made before a company was assigned to an
-- agent. Existing rows are email by default.

begin;

alter table public.email_logs
  add column if not exists channel text not null default 'email';

create index if not exists email_logs_channel_idx on public.email_logs using btree (channel);

commit;
