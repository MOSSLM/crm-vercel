-- chaine_du_lot() — les FAITS de chaque fiche d'un lot, jamais le verdict.
--
-- POURQUOI DES FAITS ET PAS DES GROUPES. Le classement vit dans
-- `src/lib/chaine/groupes.ts`, et il doit y rester : un seuil de production
-- change, et il ne doit pas coûter une migration. C'est la même règle que
-- `vue_opportunites_suivi`, qui rend des durées et jamais un verdict de
-- pourrissement. Classer ici obligerait à tenir deux définitions d'accord — et
-- l'écran et la chaîne de nuit divergeraient au premier ajustement.
--
-- POURQUOI LES CHAMPS REQUIS SORTENT BRUTS. `missingForSite` (TypeScript) est
-- la définition de « fiche complète », et elle est déjà recopiée une fois en
-- SQL dans `pretes_pour_demo_des_lots()`. Une troisième copie ici la ferait
-- diverger pour de bon. On rend donc `nom`, `ville`, `code_postal`,
-- `telephone`, `service_tags`, les avis et les stats du dossier TELS QU'ILS
-- SONT : l'appelant passe la ligne à la fonction qui existe déjà.
--
-- UN SEUL ALLER-RETOUR, comme `contenu_du_lot` dont ceci reprend l'idiome :
-- l'écran est fait pour être ouvert en 4G, et un tableau qui s'assemble en
-- quatre requêtes donne quatre états intermédiaires où l'on ne peut rien faire.
--
-- `garee` EST DÉRIVÉ, jamais stocké : inscription active, sans échéance. C'est
-- exactement ce que le sélecteur du régulateur ignore (`.lte('next_run_at')`
-- ne retient jamais un NULL) — 524 inscriptions vivaient ainsi sans que rien
-- ne le dise.
--
-- ⚠️ LA VUE NE REND JAMAIS `null` — et c'est le piège que le contrôle ci-dessous
-- a attrapé. `v_entreprises_presence_site` fusionne le constat et la colonne :
-- quand elle n'a NI l'un NI l'autre, elle rend `statut_site = 'inconnu'` avec
-- `origine_statut = 'aucune'`. Lire le seul `statut_site` confondrait donc
-- « personne n'a regardé » (206 fiches du lot 2) avec « un outil a cherché et
-- n'a pas tranché » (13) — les deux populations que `constats_presence` existe
-- précisément pour séparer. On rend donc L'ORIGINE avec le statut, et c'est
-- elle qui décide de `a_lisser`.
--
-- Corollaire à connaître : `origine_statut = 'colonne'` (279 fiches du lot 2)
-- veut dire « le CRM porte une URL que personne n'a vérifiée ». On la laisse
-- passer à l'enrichissement — l'edge function n'a besoin que d'une URL, et elle
-- DIT quand l'hôte ne répond pas. Mais un constat explicite l'emporte toujours :
-- 67 fiches de la base portent une URL en colonne ET un constat « absent ».
--
-- `demarchee` NE SE LIT PAS QUE DANS LA DATE. `premiere_touche_le` manque sur
-- 3 fiches de toute la base (mesuré le 28/08/2026 : 3 lignes sur 204 tâches
-- terminées) alors qu'un WhatsApp est bien parti le 18/08. La tâche terminée,
-- elle, ne ment pas — on prend l'un OU l'autre, sinon l'écran renverrait au
-- stock un prospect déjà accroché.
--
-- Contrôles à relire après application :
--   select count(*) from chaine_du_lot(<id>, 20000, 0);
--   -- doit égaler le `total` que `couverture_des_lots()` annonce pour ce lot.
--   select origine_statut, count(*) from chaine_du_lot(<id>, 20000, 0) group by 1;
--   -- la somme doit faire le total ; les quatre origines sont exhaustives.
--
-- ⚠️ NE PAS ATTENDRE QUE `origine_statut = 'constat'` ÉGALE `avec_constat` DE LA
-- COUVERTURE. Les deux ne comptent pas la même chose, et l'écart est large :
-- mesuré sur le lot 2 le 29/08/2026, `couverture_des_lots()` annonce 318
-- (constats TOUS SUJETS confondus — il y en a trois), la vue n'en voit que 278
-- sur `site_web`, et l'origine n'en retient que 194. Les 84 restants ont bien un
-- constat, mais la vue lui préfère une autre origine : `hote_sans_site` quand
-- l'URL du CRM est un hôte générique (51 fiches — une page Facebook n'est pas un
-- site), et `colonne` quand le constat vaut « inconnu » alors qu'une URL existe.
-- Chercher l'égalité ici ferait conclure à un bug là où il y a deux définitions.

create or replace function chaine_du_lot(
  p_lot_id bigint,
  p_limite int default 2000,
  p_decalage int default 0
)
returns table (
  entreprise_id bigint,
  nom text,
  ville text,
  code_postal text,
  telephone text,
  service_tags jsonb,
  nombre_avis int,
  note_moyenne numeric,
  logo_url text,
  -- Trouver
  statut_site text,
  origine_statut text,
  -- Fabriquer
  projet_id uuid,
  enrichie boolean,
  override_city text,
  stat_years_experience text,
  stat_years_experience_official text,
  stat_satisfied_clients text,
  stat_satisfied_clients_official text,
  stat_installations_completed text,
  stat_installations_completed_official text,
  site_existe boolean,
  site_pret boolean,
  a_vignette boolean,
  a_plaquette boolean,
  -- Démarcher
  a_proprietaire boolean,
  proprietaire text,
  en_sequence boolean,
  garee boolean,
  demarchee boolean
)
language sql stable security definer set search_path = public as $$
  select
    e.id,
    e.name,
    e.ville,
    e.code_postal,
    e.telephone,
    e.service_tags,
    e.nombre_avis,
    e.note_moyenne,
    e.logo_url,
    v.statut_site,
    v.origine_statut,
    p.id,
    coalesce(p.enrichment_validated, p.pret_pour_lm, false),
    p.override_city,
    p.stat_years_experience,
    p.stat_years_experience_official,
    p.stat_satisfied_clients,
    p.stat_satisfied_clients_official,
    p.stat_installations_completed,
    p.stat_installations_completed_official,
    s.id is not null,
    coalesce(s.is_published, false) or s.build_stage = 'pret',
    -- La vignette du site RETENU. Une carte posée sur un autre site de la même
    -- entreprise ne sert pas le lien qu'on enverra.
    coalesce(nullif(trim(s.og_image_url), ''), null) is not null,
    coalesce(nullif(trim(rp.plaquette_token), ''), null) is not null,
    e.owner_id is not null,
    coalesce(up.full_name, up.email),
    en.id is not null,
    en.id is not null and en.next_run_at is null and en.status = 'active',
    e.premiere_touche_le is not null or td.x is not null
  from lots_entreprises le
  join entreprises e on e.id = le.entreprise_id
  left join user_profiles up on up.id = e.owner_id
  left join v_entreprises_presence_site v on v.entreprise_id = e.id
  -- UN DOSSIER PAR ENTREPRISE, le plus avancé. Une entreprise porte un dossier
  -- par opportunité ; prendre le premier venu ferait clignoter l'état d'une
  -- exécution à l'autre. Même règle que `bestProjectIdByEnterprise`.
  left join lateral (
    select y.* from lead_magnet_projects y
    where y.entreprise_id = e.id
    order by (y.enrichment_validated is true) desc, (y.pret_pour_lm is true) desc, y.id
    limit 1
  ) p on true
  -- LE MEILLEUR SITE : publié d'abord, prêt ensuite. C'est le classement de
  -- `rank()` dans le pipeline marketing, et le gabarit n'en est jamais un.
  left join lateral (
    select y.* from sites y
    where y.enterprise_id = e.id and coalesce(y.is_template, false) = false
    order by (y.is_published is true) desc, (y.build_stage = 'pret') desc, y.updated_at desc
    limit 1
  ) s on true
  left join lateral (
    select y.plaquette_token from entreprises_rapport_public y
    where y.entreprise_id = e.id limit 1
  ) rp on true
  -- L'inscription la plus récemment touchée : une entreprise peut porter S1
  -- close et S2 en cours, et c'est la position courante qu'on veut.
  left join lateral (
    select y.* from sequence_enrollments y
    where y.entreprise_id = e.id and y.status in ('active', 'paused')
    order by y.updated_at desc limit 1
  ) en on true
  left join lateral (
    select 1 as x from prospection_tasks y
    where y.entreprise_id = e.id and y.status = 'done' limit 1
  ) td on true
  where le.lot_id = p_lot_id
  order by e.name
  limit p_limite offset p_decalage;
$$;

grant execute on function chaine_du_lot(bigint, int, int) to authenticated, service_role;
