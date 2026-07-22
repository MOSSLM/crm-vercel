-- Téléphonie — préférence d'appel par agent : softphone navigateur (widget
-- WebRTC) OU callback serveur (fait sonner le téléphone puis le client).
-- À exécuter manuellement dans l'éditeur SQL Supabase.

begin;

alter table public.phone_extensions
  add column if not exists call_mode text not null default 'browser'
    check (call_mode in ('browser', 'callback'));

commit;
