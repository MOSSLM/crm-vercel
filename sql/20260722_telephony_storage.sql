-- Téléphonie — bucket privé de stockage des enregistrements d'appel.
-- À exécuter manuellement dans l'éditeur SQL Supabase.
--
-- Les liens d'enregistrement du fournisseur expirent (rétention ~180j, quota
-- gratuit faible) : le cron `telephony/cron/pull-recordings` rapatrie l'audio
-- ici. L'accès se fait par URL signée générée côté serveur après contrôle
-- d'autorisation, donc le bucket reste privé (public = false).

insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;
