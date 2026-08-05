-- ═══════════════════════════════════════════════════════════════════════════
-- Visites des sites démo — une ligne par SESSION, pas par page vue.
--
-- Le cockpit d'appel doit pouvoir dire « démo ouverte 3 fois, 4 min au total,
-- a vu la page Tarifs ». Compter ça sur une table de pages vues obligerait à
-- regrouper à chaque lecture, avec une définition de « visite » cachée dans le
-- SQL de chaque appelant. On stocke donc directement la session : le client
-- tire un `session_id` aléatoire par onglet, et chaque battement de la balise
-- fait un upsert sur cette clé — le compteur de visites est alors un COUNT(*),
-- et la durée une simple somme.
--
-- Pourquoi une balise client et pas un log dans la route serveur : les pages de
-- site sont en ISR (`export const revalidate = 60` dans (public)/site/**), donc
-- le composant serveur ne s'exécute PAS sur la majorité des visites — elles
-- sont servies depuis le cache. Un log posé là ne verrait qu'une visite sur N,
-- et ne pourrait de toute façon pas mesurer une durée.
--
-- Idempotent : rejouable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── Jeton de visite par contact ───────────────────────────────────────────
-- Le lien de démo inséré dans les séquences ({{company.demo_url}}) le porte en
-- `?k=`. Sans lui on sait « Ecotherme a ouvert » ; avec lui on sait « Jean, le
-- gérant, a ouvert » — ce qui n'est pas le même appel.
--
-- Opaque et sans privilège : il ne donne accès à rien (le site de démo est
-- public de toute façon), il ne fait qu'attribuer une visite. `gen_random_uuid`
-- est disponible en natif depuis PG13, pas besoin de pgcrypto.
alter table public.contacts
  add column if not exists visit_token text
  default replace(gen_random_uuid()::text, '-', '');

update public.contacts
  set visit_token = replace(gen_random_uuid()::text, '-', '')
  where visit_token is null;

create unique index if not exists contacts_visit_token_key
  on public.contacts(visit_token)
  where visit_token is not null;

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),

  -- Rattachement. `site_id` peut être null (aperçu d'un template sans site
  -- publié), `entreprise_id` est ce qui compte côté commercial et vient de
  -- `sites.enterprise_id` au moment de l'ingestion — on le fige plutôt que de
  -- le joindre à la lecture, pour que l'historique survive à une republication
  -- qui déplacerait le site vers une autre fiche.
  site_id uuid references public.sites(id) on delete set null,
  entreprise_id bigint references public.entreprises(id) on delete cascade,

  -- Renseigné quand le lien envoyé portait un jeton `?k=` : on sait alors QUI a
  -- ouvert, pas seulement quelle entreprise. Null pour une visite directe.
  contact_id uuid references public.contacts(id) on delete set null,

  -- Identifiant de session tiré côté client (sessionStorage), opaque et sans
  -- valeur d'identification hors de cette table. Clé d'upsert de la balise.
  session_id text not null,

  host text not null,
  -- Première page de la session, et la liste dédupliquée de toutes les pages
  -- vues — c'est `paths` qui permet le signal « a regardé les tarifs ».
  entry_path text not null default '/',
  paths text[] not null default '{}',
  page_views int not null default 1 check (page_views >= 0),

  referrer text,
  -- 'mobile' | 'desktop' — dérivé du user-agent à l'ingestion, sans stocker
  -- l'UA brut (aucun besoin métier, et c'est une donnée identifiante de plus).
  device text,

  -- Temps réellement passé onglet au premier plan, cumulé sur la session.
  duration_ms int not null default 0 check (duration_ms >= 0),

  -- Visite de l'équipe (relecture d'une maquette avant envoi). Conservée mais
  -- exclue de tous les compteurs — sans ça, l'essentiel des alertes serait vous.
  is_internal boolean not null default false,

  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Un upsert par battement de balise : la clé de conflit doit être unique.
create unique index if not exists site_visits_session_key
  on public.site_visits(session_id);

-- Lecture du cockpit : « les visites de cette entreprise, plus récentes d'abord ».
create index if not exists site_visits_entreprise_idx
  on public.site_visits(entreprise_id, started_at desc)
  where is_internal = false;

create index if not exists site_visits_site_idx
  on public.site_visits(site_id, started_at desc);

create index if not exists site_visits_contact_idx
  on public.site_visits(contact_id, started_at desc)
  where contact_id is not null;

-- ── Agrégat par entreprise ────────────────────────────────────────────────
-- Le cockpit affiche le détail des sessions ET un résumé. Le résumé vit ici
-- plutôt que dans la route API pour que la file d'appel puisse trier dessus
-- sans rapatrier toutes les sessions de toutes les entreprises.
create or replace view public.site_visit_summary as
select
  v.entreprise_id,
  count(*)::int                                      as visits,
  sum(v.duration_ms)::bigint                         as total_duration_ms,
  max(v.last_seen_at)                                as last_visit_at,
  min(v.started_at)                                  as first_visit_at,
  -- Deux sessions le même jour restent une seule « journée de retour » : c'est
  -- le retour un AUTRE jour qui est le signal fort, pas le rechargement.
  count(distinct date_trunc('day', v.started_at))::int as distinct_days,
  count(distinct v.contact_id)
    filter (where v.contact_id is not null)::int     as distinct_contacts,
  coalesce(bool_or(
    exists (
      select 1 from unnest(v.paths) p
      where p ~* '(tarif|prix|pricing|contact|devis)'
    )
  ), false)                                          as saw_intent_page
from public.site_visits v
where v.is_internal = false
group by v.entreprise_id;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Écriture : service-role uniquement (la balise passe par une route serveur,
-- jamais par le client Supabase — sinon n'importe qui pourrait fabriquer des
-- visites). Aucune policy d'insertion n'est donc définie : le service-role
-- contourne RLS, tout le reste est refusé.
alter table public.site_visits enable row level security;

-- Lecture : admin partout, freelance sur les entreprises de ses opportunités —
-- même règle que `sales_pipeline_state` (cf. 20260801).
drop policy if exists "admin read site visits" on public.site_visits;
drop policy if exists "freelance read own site visits" on public.site_visits;

create policy "admin read site visits" on public.site_visits
  for select using (public.is_admin());

create policy "freelance read own site visits" on public.site_visits
  for select using (
    public.is_freelance()
    and exists (
      select 1 from public.opportunites o
      where o.entreprise_id = site_visits.entreprise_id
        and o.owner_id = auth.uid()
    )
  );

commit;
