-- « Combien sont prêtes pour une démo ? » — et le clivage du logo.
--
-- ── LA QUESTION QUE LA COUVERTURE NE POSE PAS ────────────────────────────
-- `couverture_des_lots()` compte des PIÈCES : SIRET, données publiques,
-- constat, démo, audit… Elle répond à « qu'est-ce qui manque au lot ». Elle ne
-- répond pas à « combien puis-je lancer en fabrication MAINTENANT », parce que
-- ce n'est pas la même question : une fiche peut avoir son SIRET et ses données
-- publiques et rester impossible à mettre en site faute de code postal.
--
-- ⚠️ LA DÉFINITION DE « PRÊTE » N'EST PAS INVENTÉE ICI.
-- Elle recopie `missingForSite` (`src/app/api/marketing-pipeline/_board.ts`) et
-- `SITE_REQUIRED` (`src/components/marketing-pipeline/required-fields.ts`), qui
-- sont déjà tenues alignées l'une sur l'autre par `missing-for-site.test.ts`.
-- Trois définitions au lieu de deux, c'est une occasion de plus de diverger —
-- mais l'alternative (lire 60 000 fiches en Node pour appliquer les règles
-- TypeScript) fait des milliers d'allers-retours pour rendre un compteur.
--
-- Le test `pretes-pour-demo.test.ts` fige donc la liste des règles côté
-- TypeScript, et ce fichier porte la même liste. Si l'une bouge, l'autre doit
-- bouger : le commentaire de chaque règle ci-dessous cite sa jumelle.
--
-- ── CE QUI N'EST PAS EXIGÉ, ET POURQUOI C'EST IMPORTANT ──────────────────
-- LE LOGO N'EST PAS UNE CONDITION. Mesuré sur le parc vivant : 738 fiches sur
-- 60 445 en ont un — 1,2 %. Un artisan sans logo n'a pas oublié de le
-- renseigner, il n'a jamais payé de graphiste. Depuis `hydrate-logo`,
-- l'en-tête compose le nom dans la police du design : le rendu est correct sans.
-- L'exiger ne produirait pas 59 000 logos, seulement 59 000 fiches rouges.
--
-- LA NOTE GOOGLE N'EST EXIGÉE QUE SI DES AVIS SONT ANNONCÉS. Annoncer N avis
-- sans note afficherait un bloc noté vide ; sans avis, il n'y a rien à noter.
--
-- ── LE CLIVAGE DU LOGO EST LE VRAI APPORT DE CETTE FONCTION ──────────────
-- « Combien ont un logo » seul ne sert à rien : la réponse est « presque
-- aucune », partout, tout le temps. Ce qui se travaille, c'est la distinction
-- entre un logo INTROUVABLE et un logo QU'ON N'A PAS ENCORE PRIS :
--
--     sans logo, avec un vrai site      22 690   il est sur leur site
--     sans logo, page sociale seulement    156   il est sur la page
--     sans logo, aucune URL             32 334   il n'existe nulle part
--
-- Les deux premières lignes sont du travail possible ; la troisième est un fait.
-- Les afficher ensemble ferait passer 32 334 impossibilités pour du retard.
begin;

create or replace function public.pretes_pour_demo_des_lots()
returns table(
  lot_id            bigint,
  total             bigint,
  pretes            bigint,
  -- Ce qui manque aux autres, par cause. Un décompte par CAUSE et non un total :
  -- « 400 pas prêtes » n'indique aucun geste, « 380 sans téléphone » si.
  sans_ville        bigint,
  sans_code_postal  bigint,
  sans_telephone    bigint,
  sans_service_tags bigint,
  note_incoherente  bigint,
  -- Le logo, hors condition de préparation : il ne bloque rien mais il se
  -- travaille. Compté sur les fiches PRÊTES seulement — chercher le logo d'une
  -- fiche à qui il manque le téléphone, c'est travailler dans le désordre.
  avec_logo         bigint,
  logo_sur_le_site  bigint,
  logo_sur_reseau   bigint,
  logo_introuvable  bigint
)
language sql
stable
-- `search_path` épinglé : même motif que les fonctions voisines.
set search_path to 'public', 'extensions'
as $function$
  with membre as (
    select e.*, le.lot_id
      from public.lots_entreprises le
      join public.entreprises e on e.id = le.entreprise_id
     where e.merged_into_id is null
       and e.archived_at is null
  ),
  juge as (
    select
      m.lot_id,
      -- Chaque prédicat cite sa jumelle TypeScript.
      (nullif(btrim(m.ville), '')       is not null) as a_ville,          -- « Ville »
      (nullif(btrim(m.code_postal), '') is not null) as a_code_postal,    -- « Code postal »
      (nullif(btrim(m.telephone), '')   is not null) as a_telephone,      -- « Téléphone »
      (m.service_tags is not null
        and jsonb_typeof(m.service_tags) = 'array'
        and jsonb_array_length(m.service_tags) > 0)  as a_service_tags,   -- « Service tags »
      -- « Note moyenne » : exigée UNIQUEMENT si des avis sont annoncés.
      (coalesce(m.nombre_avis, 0) <= 0
        or coalesce(m.note_moyenne, 0) > 0)          as note_coherente,
      (nullif(btrim(m.logo_url), '')    is not null) as a_logo,
      public.host_key(coalesce(m.site_web_canonique, m.canonical_url)) as hote
    from membre m
  ),
  classe as (
    select
      j.*,
      (j.a_ville and j.a_code_postal and j.a_telephone
        and j.a_service_tags and j.note_coherente) as prete,
      -- `host_est_generique` est la MÊME fonction que celle du filtre
      -- « sans site » de `chercher_entreprises` : un logo est sur « le site »
      -- exactement quand ce filtre ne le compte pas comme sans site.
      (j.hote is not null and not public.host_est_generique(j.hote)) as vrai_site,
      (j.hote is not null
        and j.hote ~ '(^|\.)(facebook|fb|instagram|linkedin)\.')     as reseau_social
    from juge j
  )
  select
    c.lot_id,
    count(*),
    count(*) filter (where c.prete),
    count(*) filter (where not c.a_ville),
    count(*) filter (where not c.a_code_postal),
    count(*) filter (where not c.a_telephone),
    count(*) filter (where not c.a_service_tags),
    count(*) filter (where not c.note_coherente),
    count(*) filter (where c.prete and c.a_logo),
    count(*) filter (where c.prete and not c.a_logo and c.vrai_site),
    count(*) filter (where c.prete and not c.a_logo and not c.vrai_site and c.reseau_social),
    count(*) filter (where c.prete and not c.a_logo and not c.vrai_site and not c.reseau_social)
  from classe c
  group by c.lot_id;
$function$;

comment on function public.pretes_pour_demo_des_lots is
  'Par lot : combien de fiches passent les règles de missingForSite (niveau entreprise), ce qui manque aux autres par cause, et le clivage du logo — trouvable sur un site, sur une page sociale, ou nulle part.';

revoke all on function public.pretes_pour_demo_des_lots from public, anon;
grant execute on function public.pretes_pour_demo_des_lots to service_role;

commit;
