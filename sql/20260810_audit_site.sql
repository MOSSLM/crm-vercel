-- =====================================================================
-- Analyse du site actuel des prospects — `entreprises_audit_site`
-- =====================================================================
-- POURQUOI
-- L'« audit » du CRM produisait une proposition commerciale de 6 pages,
-- entièrement rédactionnelle : aucune mesure. `src/data/auditIssues.ts`
-- annonçait des clés « pré-cochées par l'edge function » — fichier qui
-- n'a jamais existé. Personne n'écrivait `audit_detected_issues`, que
-- `AuditWorkspace` lit pourtant depuis toujours.
--
-- Cette table porte des chiffres qu'on peut montrer au prospect : temps de
-- réponse, poids, HTTPS, viewport, balises SEO, JSON-LD, `tel:`,
-- formulaire, mentions légales. Chacun avec la mesure ET le seuil qui le
-- juge (colonne `detail`), parce qu'une note nue ne se défend pas en
-- rendez-vous.
--
-- DISCIPLINE : table 1:1 POSSÉDÉE PAR L'API, comme
-- `entreprises_donnees_publiques` (sql/20260808_donnees_publiques_siret.sql).
-- Rien d'humain n'y écrit, rien n'y est saisi. Elle peut être vidée et
-- reconstruite sans perte.
--
-- AUCUNE COLONNE N'EST AJOUTÉE À `entreprises` : la table la plus centrale
-- du CRM est lue par `site-resolver` sur le chemin de rendu de TOUS les
-- sites publiés. Une colonne de plus y serait un risque pour zéro gain.
--
-- DÉGRADATION : si cette migration n'est pas appliquée, tout ce qui en
-- dépend s'éteint proprement — le badge CRM se cache, le rapport public
-- répond « analyse indisponible ». Rien d'autre ne bouge.
-- =====================================================================

begin;

create table if not exists public.entreprises_audit_site (
  entreprise_id   bigint primary key references public.entreprises(id) on delete cascade,

  -- Ce qu'on a analysé, et ce qui a répondu
  url_analysee    text,
  url_finale      text,
  http_status     int,
  -- Le serveur a répondu, mais nous a refusés (anti-robot). C'est une DONNÉE
  -- d'audit, pas une panne : un site qui bloque les robots bloque aussi Google.
  bloque          boolean not null default false,
  injoignable     boolean not null default false,

  -- Notes /100
  note_globale    int,
  note_vitesse    int,
  note_seo        int,
  note_mobile     int,
  note_conversion int,

  -- La décomposition : une entrée par signal, avec sa valeur et son seuil.
  -- C'est ce qui rend une note basse opposable — et c'est la raison pour
  -- laquelle une entrée sans valeur mesurée n'est jamais affichée.
  detail          jsonb,
  -- Confiance par axe. Un site en SPA renvoie un HTML quasi vide : on baisse
  -- la confiance plutôt que d'affirmer « pas de contenu SEO ».
  confiance       jsonb,
  alertes         jsonb,
  signaux         jsonb,
  issue_keys      text[] not null default '{}',

  -- Mesures brutes, conservées pour pouvoir les citer telles quelles
  ttfb_ms         int,
  chargement_ms   int,
  poids_octets    bigint,

  -- Capture 390 px du site actuel : à la fois le seul signal de rendu mobile
  -- réel dont on dispose sans navigateur, et l'image « avant » du rapport.
  capture_url     text,
  capture_le      timestamptz,

  -- La comparaison : le MÊME analyseur, les MÊMES seuils, sur le démo qu'on
  -- a construit pour ce prospect. C'est l'argument de vente en une image, et
  -- il est indiscutable puisque la mesure est identique des deux côtés.
  note_globale_demo int,
  notes_demo        jsonb,
  demo_site_id      uuid,
  demo_analyse_le   timestamptz,

  -- PageSpeed Insights, à la demande seulement (jamais en masse)
  psi_performance      int,
  psi_seo              int,
  psi_accessibilite    int,
  psi_bonnes_pratiques int,
  psi_lcp_ms           int,
  psi_cls              numeric,
  psi_tbt_ms           int,
  psi_strategie        text,
  psi_recupere_le      timestamptz,

  analyse_le      timestamptz,
  expire_le       timestamptz,
  tentatives      int not null default 0,
  derniere_erreur text,
  cree_le         timestamptz not null default now(),
  maj_le          timestamptz not null default now()
);

comment on table public.entreprises_audit_site is
  'Analyse automatisée du site actuel du prospect. Possédée par l''API : aucune saisie humaine.';
comment on column public.entreprises_audit_site.detail is
  'Preuves par axe : {cle, libelle, valeur, seuil, poids, verdict}. Une entrée sans valeur ne s''affiche pas.';
comment on column public.entreprises_audit_site.confiance is
  'Confiance par axe (haute/moyenne/faible). Un axe en confiance faible n''est pas publié.';

create index if not exists idx_audit_site_note on public.entreprises_audit_site (note_globale);
create index if not exists idx_audit_site_expire on public.entreprises_audit_site (expire_le);

-- ---------------------------------------------------------------------
-- Réglages, modifiables sans redéploiement (même motif que le régulateur)
-- ---------------------------------------------------------------------
create table if not exists public.audit_site_settings (
  id       text primary key default 'global',
  lot_max  int     not null default 30,
  actif    boolean not null default true,
  -- Durée de validité d'une analyse. Un site d'artisan ne change pas toutes
  -- les semaines ; réanalyser trop souvent dépense un budget de fonction
  -- pour un résultat identique.
  ttl_jours int    not null default 30
);
insert into public.audit_site_settings (id) values ('global') on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- La règle de péremption, EN SQL et à un seul endroit
-- ---------------------------------------------------------------------
-- Portée par une vue plutôt que dupliquée dans le TS (même choix que
-- `v_donnees_publiques_a_rafraichir`). L'ordre de service compte : les
-- entreprises jamais analysées passent AVANT les analyses périmées, sinon
-- une fiche neuve resterait gelée derrière la revérification du parc entier.
create or replace view public.v_audit_site_a_rafraichir as
select
  e.id as entreprise_id,
  e.site_web_canonique as url,
  e.nombre_avis,
  e.telephone,
  a.analyse_le,
  a.tentatives,
  case when a.entreprise_id is null then 0 else 1 end as ordre
from public.entreprises e
left join public.entreprises_audit_site a on a.entreprise_id = e.id
where
  coalesce(nullif(trim(e.site_web_canonique), ''), null) is not null
  and (
    a.entreprise_id is null
    or a.expire_le is null
    or a.expire_le < now()
    -- L'URL a changé depuis l'analyse : le résultat porte sur un autre site.
    or a.url_analysee is distinct from e.site_web_canonique
  )
  -- Cinq échecs consécutifs : le site est mort pour de bon, on cesse de
  -- consommer un budget de fonction à chaque tick pour le redécouvrir.
  and coalesce(a.tentatives, 0) < 5
order by ordre, a.analyse_le nulls first, e.id;

comment on view public.v_audit_site_a_rafraichir is
  'File d''analyse : jamais analysées d''abord, puis périmées. Règle de péremption unique.';

-- ---------------------------------------------------------------------
-- RLS — comme les tables voisines
-- ---------------------------------------------------------------------
alter table public.entreprises_audit_site enable row level security;
alter table public.audit_site_settings   enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entreprises_audit_site'
      and policyname = 'audit_site_authenticated'
  ) then
    create policy audit_site_authenticated on public.entreprises_audit_site
      for all using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_site_settings'
      and policyname = 'audit_site_settings_authenticated'
  ) then
    create policy audit_site_settings_authenticated on public.audit_site_settings
      for all using (auth.role() = 'authenticated');
  end if;
end $$;

commit;
