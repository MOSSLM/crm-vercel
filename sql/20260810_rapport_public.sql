-- =====================================================================
-- Rapport d'audit public — `entreprises_rapport_public`
-- =====================================================================
-- POURQUOI UNE TABLE 1:1 SUR L'ENTREPRISE, et pas un jeton sur `audits`.
--
-- `audits.opportunite_id` est `TEXT UNIQUE` : un audit EXIGE une
-- opportunité. Or on veut pouvoir envoyer un rapport avant qu'une
-- opportunité existe — c'est même le cas le plus fréquent en démarchage
-- froid. Ancrer le jeton sur l'entreprise lève cette contrainte.
--
-- POURQUOI PAS UNE COLONNE SUR `entreprises`. Le compteur de vues s'écrit
-- à CHAQUE affichage de la page. `entreprises` est lue par `site-resolver`
-- sur le chemin de rendu de tous les sites publiés : y ajouter une
-- écriture chaude serait un mauvais échange. Même discipline que
-- `entreprises_donnees_publiques` et `entreprises_audit_site` — une table
-- satellite, possédée par l'API.
--
-- Précédent maison pour le jeton lui-même : `entreprises.client_portal_token`
-- (sql/20260505_site_builder_v2.sql), généré par défaut, non devinable.
--
-- LE COMPTEUR DE VUES EST UN SIGNAL COMMERCIAL : « il a ouvert le rapport
-- trois fois » vaut une relance, et ne coûte rien à collecter.
--
-- RÉVOCABILITÉ : `actif` existe parce qu'une page publique qui note une
-- entreprise nommée doit pouvoir être coupée d'un geste. C'est la
-- différence entre un actif commercial et un passif.
-- =====================================================================

begin;

create table if not exists public.entreprises_rapport_public (
  entreprise_id bigint primary key references public.entreprises(id) on delete cascade,
  -- 32 caractères hexadécimaux : non devinable, court à lire au téléphone.
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  actif         boolean not null default true,
  -- Le démo à mettre en avant. Nullable : le rapport vaut sans lui.
  site_id       uuid,
  vues          int not null default 0,
  vu_le         timestamptz,
  cree_le       timestamptz not null default now(),
  cree_par      uuid
);

comment on table public.entreprises_rapport_public is
  'Jeton de partage du rapport d''audit public. Un par entreprise, régénérable et révocable.';
comment on column public.entreprises_rapport_public.actif is
  'Faux ⇒ la page répond 404. Permet de couper un rapport sans le supprimer.';

create index if not exists idx_rapport_public_token
  on public.entreprises_rapport_public (token) where actif;

-- Incrément du compteur de vues, atomique.
-- En SQL plutôt qu'en lecture-modification-écriture depuis la route : deux
-- ouvertures simultanées perdraient sinon une vue, et le chiffre sert à
-- décider d'une relance.
create or replace function public.rapport_public_vu(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.entreprises_rapport_public
     set vues = vues + 1, vu_le = now()
   where token = p_token and actif;
$$;

alter table public.entreprises_rapport_public enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entreprises_rapport_public'
      and policyname = 'rapport_public_authenticated'
  ) then
    -- La page publique passe par la clé de service (route serveur), pas par
    -- RLS : cette politique ne sert qu'au CRM.
    create policy rapport_public_authenticated on public.entreprises_rapport_public
      for all using (auth.role() = 'authenticated');
  end if;
end $$;

commit;
