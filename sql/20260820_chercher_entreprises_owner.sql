-- 20260820_chercher_entreprises_owner.sql — filtrer par propriétaire.
--
-- CE QUE ÇA RÉSOUT
-- Une passe de lissage se choisit par les filtres de l'explorateur, et par rien
-- d'autre — c'est ce qui évite une deuxième définition de « vivantes » ou de
-- « sans site ». Mais l'explorateur ne savait pas filtrer par ATTRIBUTION, et
-- c'est précisément le découpage dont on a besoin pour travailler : relevé le
-- 20/08/2026, `entreprises.owner_id` porte 908 fiches vivantes, réparties entre
-- deux personnes — Matteo 562 (dont 239 sans SIRET), Bilal 346 (dont 154).
--
-- Sans ce paramètre, « valider les données de MES fiches d'abord » n'était pas
-- exprimable : il fallait lisser tout le parc et espérer tomber dessus.
--
-- ── POURQUOI UN `DROP` ET PAS UN SIMPLE `CREATE OR REPLACE` ───────────────
-- Ajouter un paramètre CHANGE la signature. `create or replace` ne remplace
-- alors rien : il crée une SURCHARGE, et deux fonctions du même nom coexistent.
-- PostgREST, qui résout par noms d'arguments, ne sait plus laquelle choisir et
-- répond « Could not choose the best candidate function » — c'est-à-dire que
-- l'explorateur ENTIER tombe, pas seulement le lissage. Le `drop` est donc
-- obligatoire, et les deux ordres tiennent dans une transaction pour qu'aucune
-- requête ne passe entre les deux.
--
-- Le paramètre est en DERNIÈRE position avec un défaut `null` : tous les
-- appelants existants continuent de fonctionner sans être touchés.

begin;

drop function if exists public.chercher_entreprises(text, text[], text[], integer, integer);

create or replace function public.chercher_entreprises(
  p_recherche text default null::text,
  p_flags text[] default '{}'::text[],
  p_sources text[] default '{}'::text[],
  p_limite integer default 50,
  p_offset integer default 0,
  p_owner uuid default null
)
returns table(
  id bigint, name text, adresse text, ville text, code_postal text,
  telephone text, email text, site text, siret text, siren text,
  sources text[], google_place_id text, lat double precision, lng double precision,
  qualifie boolean, masquee boolean, archivee boolean, archive_reason text,
  fusionnee_vers bigint, motifs_qualite text[], created_at timestamp with time zone,
  total bigint
)
language sql
stable
as $function$
  with q as (
    select
      nullif(btrim(coalesce(p_recherche, '')), '')                       as brut,
      public.normalize_key_text(p_recherche)                             as cle,
      nullif(regexp_replace(coalesce(p_recherche, ''), '[^0-9]', '', 'g'), '') as chiffres
  ),
  base as (
    select
      e.*,
      coalesce(
        (select array_agg(m) from jsonb_array_elements_text(e.qualite->'motifs') m),
        '{}'::text[]
      ) as motifs
    from public.entreprises e
  ),
  filtre as (
    select b.*
    from base b, q
    where
      (q.brut is null
        or public.normalize_key_text(b.name) like '%' || q.cle || '%'
        or public.normalize_key_text(b.ville) like '%' || q.cle || '%'
        or b.code_postal like q.brut || '%'
        or (q.chiffres is not null and length(q.chiffres) >= 9 and (
              b.siret like q.chiffres || '%'
           or b.siren = left(q.chiffres, 9)
           or exists (
                select 1
                from unnest(coalesce(b.telephones, '{}'::text[]) || array[b.telephone]) t
                where public.phone_key_fr(t) = right(q.chiffres, 9)
              )
        ))
        or lower(coalesce(b.email, '')) like '%' || lower(q.brut) || '%'
        or public.host_key(coalesce(b.site_web_canonique, b.canonical_url)) like '%' || lower(q.brut) || '%'
      )
      and (cardinality(p_sources) = 0 or b.sources && p_sources)

      -- LE PROPRIÉTAIRE SE CUMULE avec le reste, il ne s'y substitue pas :
      -- « mes fiches » ET « sans SIRET » veut dire les deux à la fois. Même
      -- nature que les drapeaux de MANQUE, et surtout pas celle des états.
      and (p_owner is null or b.owner_id = p_owner)

      -- DEUX NATURES DE DRAPEAU, ET ELLES NE SE COMBINENT PAS PAREIL.
      --
      -- L'ÉTAT d'une fiche (vivante, archivée, masquée, fusionnée) s'additionne :
      -- cocher deux états, c'est vouloir voir les deux. C'est l'usage d'origine,
      -- écrit pour l'arbitrage des doublons — on y veut « archivée OU fusionnée ».
      --
      -- Ce qui MANQUE à une fiche (site, fiche Google, SIRET, qualité) se
      -- cumule au contraire : « sans site » puis « sans fiche Google » veut dire
      -- les deux à la fois, jamais l'un ou l'autre. Tout en OU, l'explorateur
      -- rendait 60 698 fiches là où il devait en rendre 34 699 — et affichait
      -- des entreprises avec un vrai site sous le filtre « sans site ».
      and (
        not (p_flags && array['vivantes','archivee','masquee','fusionnee'])
        or ('vivantes'  = any(p_flags) and b.merged_into_id is null and b.archived_at is null)
        or ('archivee'  = any(p_flags) and b.archived_at is not null)
        or ('masquee'   = any(p_flags) and coalesce(b.hidden_in_qualification, false))
        or ('fusionnee' = any(p_flags) and b.merged_into_id is not null)
      )
      -- SANS SITE = aucune URL, ou une URL qui n'est pas un site à elle. Une
      -- page Facebook ou Google Sites signale une entreprise SANS site, et
      -- offre en prime une page où lire des informations sur elle.
      and (not ('sans_site'   = any(p_flags)) or public.host_est_generique(public.host_key(coalesce(b.site_web_canonique, b.canonical_url))))
      and (not ('sans_google' = any(p_flags)) or b.google_place_id is null)
      and (not ('sans_siret'  = any(p_flags)) or b.siret is null)
      and (not ('qualite'     = any(p_flags)) or b.qualite <> '{}'::jsonb)
  ),
  compte as (select count(*) as n from filtre)
  select
    f.id, f.name, f.adresse, f.ville, f.code_postal,
    f.telephone, f.email,
    coalesce(f.site_web_canonique, f.canonical_url) as site,
    f.siret, f.siren, f.sources, f.google_place_id, f.lat, f.lng,
    coalesce(f.qualifie, false)                as qualifie,
    coalesce(f.hidden_in_qualification, false) as masquee,
    f.archived_at is not null                  as archivee,
    f.archive_reason,
    f.merged_into_id                           as fusionnee_vers,
    f.motifs                                   as motifs_qualite,
    f.created_at,
    compte.n                                   as total
  from filtre f, compte
  order by (f.merged_into_id is not null), (f.archived_at is not null), f.name
  limit greatest(p_limite, 1) offset greatest(p_offset, 0);
$function$;

commit;

-- ── À relire APRÈS application ────────────────────────────────────────────
-- Le dépôt n'est pas la vérité sur Supabase.
--
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='chercher_entreprises';
--   -- doit valoir 1, PAS 2 : deux surcharges = explorateur en panne
--
--   select count(*) from public.chercher_entreprises(
--     p_flags => array['vivantes','sans_siret'],
--     p_owner => '<uuid>', p_limite => 200);
--   -- doit être inférieur au même appel sans p_owner
