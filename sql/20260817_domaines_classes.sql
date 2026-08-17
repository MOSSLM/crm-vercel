-- Ce qu'un domaine EST — la connaissance en base, plus dans le code.
--
-- LA DEMANDE, 17/08 :
--   « On pourrait lister les annuaires dans Supabase chaque fois que t'en
--     détectes un, ça évite au robot de les enregistrer à chaque fois. Ça
--     éviterait d'avoir un agent, ça pourrait juste être algorithmique. »
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PAS DANS `url_blacklist`, ET C'ÉTAIT UN PIÈGE
-- ─────────────────────────────────────────────────────────────────────────────
-- `url_blacklist` porte `trg_blacklist_cleanup`, qui appelle
-- `_delete_blacklisted_rows_for_rule` : un DELETE SEC sur `entreprises` et
-- `entreprises_raw` dès qu'une entrée passe `active = true`. Y verser 145
-- annuaires aurait supprimé toutes les fiches qui les portent — l'inverse exact
-- de « masquer, jamais supprimer ». Le lot n'est pas passé uniquement parce que
-- le trigger a dépassé le délai maximal et que la transaction a été annulée en
-- entier. Contrôle après coup : 60 726 entreprises, 579 cohortes, 882
-- opportunités — rien perdu.
--
-- `domaines_classes` ne fait que CLASSER. Elle ne supprime rien, ne masque rien.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- TROIS RÈGLES, DONT DEUX QUI SE CALCULENT
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le domaine est classé, ou l'URL en est un SOUS-DOMAINE.
--    C'est ce qui attrape `fauglas-et-fils.chauffagiste-viessmann.fr` et
--    `gressard-philippe.artizo.fr` : le sous-domaine porte le nom de l'artisan,
--    le domaine appartient à l'agence.
-- 2. Le nom de domaine contient « annuaire ».
-- 3. `host_est_generique` conclut (wix, google sites, réseaux sociaux…).
--
-- La détection, elle, n'a besoin d'aucun modèle : UN DOMAINE VU SUR PLUSIEURS
-- ENTREPRISES N'EST LE SITE DE PERSONNE. Il suffit de compter. Passée sur les
-- 60 000 fiches, la règle des sous-domaines a rendu d'un coup :
--   artetfenetres.com ......... 22 entreprises, 22 sous-domaines
--   solaireclimchauffage.fr ... 22 entreprises, 10 sous-domaines
--   soliha.fr ................. 14      maclem.fr ......... 10
--   chauffage.fr ..............  8      turbofonte.com ....  6
--   plomberie.fr / menuiserie.fr / couverture.com / electricite.fr / cheminees.fr
-- `dossier-web.mjs` propose désormais ses trouvailles en `a_confirmer = true` :
-- un réseau de franchise et un annuaire se comptent pareil, seule une lecture
-- les sépare.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA CATÉGORIE `plateforme` N'EST PAS UNE EXCLUSION, C'EST UN VIVIER
-- ─────────────────────────────────────────────────────────────────────────────
-- Arbitrage du propriétaire sur Artizo :
--   « Je voulais blacklister, mais c'est une agence qui fait des sites nuls pour
--     à peu près 60 € par an. Faudrait les récupérer pour les démarcher : site
--     nul et paiement annuel, alors que nous on peut les rendre PROPRIÉTAIRES de
--     leur site, quitte à offrir l'hébergement. »
--
-- Une vitrine de plateforme ne compte donc pas comme un site (`statut_site` =
-- absent), mais SON URL RESTE dans la preuve du constat — c'est l'argument de
-- vente, pas un déchet. Le vivier, mesuré : wixsite 90 · site-solocal 47 ·
-- business.site 42 · free.fr 18 · wordpress 18 · jimdo 12 · e-monsite 11 ·
-- artizo 8 · chauffage.fr 8 · viessmann 6 — plus de 300 entreprises qui LOUENT
-- déjà leur vitrine.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÉCRITURES DÉJÀ APPLIQUÉES le 17/08 via execute_sql. Consigné pour la trace.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.domaines_classes (
  domaine text primary key,
  categorie text not null check (categorie in
    ('annuaire','apporteur','social','hebergeur','plateforme','reseau','certificateur','fabricant','moteur','autre')),
  motif text,
  -- Le signal de détection : un vrai site d'artisan n'apparaît que sur une fiche.
  vu_sur_entreprises int not null default 0,
  a_confirmer boolean not null default false,
  cree_le timestamptz not null default now(),
  cree_par text not null default 'systeme',
  confirme_le timestamptz,
  confirme_par text
);

create index if not exists domaines_classes_categorie_idx on public.domaines_classes (categorie);
create index if not exists domaines_classes_a_confirmer_idx on public.domaines_classes (a_confirmer) where a_confirmer;

grant select, insert, update on public.domaines_classes to service_role;
grant select on public.domaines_classes to authenticated;
alter table public.domaines_classes enable row level security;
create policy domaines_classes_lecture on public.domaines_classes for select to authenticated using (true);

/** Le domaine porte-t-il un site à l'artisan, ou à quelqu'un d'autre ? */
create or replace function public.host_sans_site(p_host text)
returns boolean
language sql stable
set search_path = pg_catalog, public, extensions, pg_temp
as $$
  select case
    when p_host is null or btrim(p_host) = '' then true
    when p_host ilike '%annuaire%' then true
    when exists (
      select 1 from public.domaines_classes d
       where d.categorie in ('annuaire','apporteur','social','hebergeur','plateforme',
                             'reseau','certificateur','fabricant','moteur')
         and (lower(p_host) = d.domaine or lower(p_host) like ('%.' || d.domaine))
    ) then true
    else public.host_est_generique(p_host)
  end;
$$;

-- `v_entreprises_presence_site` s'appuie dessus : voir
-- sql/20260817_constats_presence_trois_etats.sql pour la définition à jour.

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles
-- ─────────────────────────────────────────────────────────────────────────────
-- select public.host_sans_site('gressard-philippe.artizo.fr');        -- t
-- select public.host_sans_site('fauglas-et-fils.chauffagiste-viessmann.fr'); -- t
-- select public.host_sans_site('confort.mitsubishielectric.fr');      -- t
-- select public.host_sans_site('annuaire-entreprises-rge.fr');        -- t
-- select public.host_sans_site('itsi-liard-chauffage.fr');            -- f
--
-- Sur le parc : 662 URL qui ne sont pas un site, 25 458 plausibles, 34 338 sans URL.
-- Cohorte B : 71 présent · 71 absent · 155 inconnu.
--
-- Ce qui attend une relecture :
-- select * from public.domaines_classes where a_confirmer order by vu_sur_entreprises desc;
