-- `v_entreprises_presence_site` : dire ce qu'on sait, pas moins.
--
-- CE QUI A ÉTÉ MESURÉ LE 20/08/2026, ET CE QUE ÇA CORRIGE DANS MES PROPRES NOTES
-- La note de `passe-db.ts` disait que cette vue « fait l'inverse : la colonne
-- d'abord », et qu'elle appellerait « présent » des entreprises constatées
-- absentes. **C'est faux, et la base l'a dit** :
--
--   select count(*) from v_entreprises_presence_site
--    where etat = 'absent' and statut_site = 'present';   →  0
--
-- La première branche du CASE ne peut rendre que 'absent' : elle ne peut donc
-- pas écraser un constat vers 'présent'. Le constat gagne déjà.
--
-- LE VRAI DÉFAUT EST L'INVERSE, ET IL EST BIEN PLUS GROS
--
--   select count(*) from v_entreprises_presence_site
--    where url_crm is not null and etat is null;          →  25 291
--
-- Vingt-cinq mille entreprises portent une URL en colonne, n'ont aucun constat,
-- et la vue les déclare **inconnu**. Or « inconnu » veut dire « personne n'a
-- regardé » — alors qu'on a une adresse de site. C'est exactement l'erreur que
-- ce projet corrige partout ailleurs, prise à l'envers : ici on efface une
-- mesure au lieu d'en inventer une.
--
-- LA HIÉRARCHIE, ÉCRITE UNE FOIS
--   1. une URL sur un hôte qui n'est pas un site (Facebook, PagesJaunes…)  → absent
--   2. un constat 'present' dont la valeur est un tel hôte                 → absent
--   3. un constat 'present' ou 'absent'                                    → il gagne
--   4. une URL en colonne                                                  → present, confiance HAUTE
--   5. un constat 'inconnu'                                                → inconnu
--   6. rien                                                                → inconnu
--
-- L'ordre 3 avant 4 est la règle du CRM et elle ne bouge pas : 67 entreprises
-- portent un constat `absent` ET une URL, et le constat a raison à chaque fois
-- (NXDOMAIN, ou l'URL de quelqu'un d'autre). L'ordre 4 avant 5, en revanche,
-- est neuf : une URL vaut mieux qu'un « j'ai regardé sans conclure ».
--
-- ⚠️ UNE URL EN COLONNE N'EST JAMAIS UNE CERTITUDE. D'où les deux colonnes
-- ajoutées : `origine_statut` dit d'où vient le verdict, `confiance_statut` ce
-- qu'il vaut. Sans elles, un lecteur ne pourrait pas distinguer les 95 fiches
-- vérifiées des 25 291 déduites — et les traiterait pareil.
--
-- Les colonnes existantes ne bougent NI de nom, NI d'ordre : les deux nouvelles
-- sont ajoutées à la fin, seule forme qu'un `create or replace view` accepte.
begin;

create or replace view public.v_entreprises_presence_site as
with base as (
  select
    e.id as entreprise_id,
    e.name,
    e.ville,
    e.cohorte_demarchage,
    coalesce(nullif(btrim(e.site_web_canonique), ''), nullif(btrim(e.canonical_url), '')) as url_crm,
    c.etat,
    c.valeur as url_constatee,
    c.confiance,
    c.source,
    c.constate_le
  from public.entreprises e
  left join public.v_presence_actuelle c
    on c.entreprise_id = e.id and c.sujet = 'site_web'
  where e.archived_at is null
)
select
  b.entreprise_id,
  b.name,
  b.ville,
  b.cohorte_demarchage,
  b.url_crm,
  b.etat,
  b.url_constatee,
  b.confiance,
  b.source,
  b.constate_le,
  (select d.categorie
     from public.domaines_classes d
    where lower(host_key(b.url_crm)) = d.domaine
       or lower(host_key(b.url_crm)) like ('%.' || d.domaine)
    limit 1) as nature_hote,
  case
    when b.url_crm is not null and host_sans_site(host_key(b.url_crm))            then 'absent'
    when b.etat = 'present' and b.url_constatee is not null
     and host_sans_site(host_key(b.url_constatee))                                then 'absent'
    when b.etat in ('present', 'absent')                                          then b.etat
    when b.url_crm is not null                                                    then 'present'
    when b.etat is not null                                                       then b.etat
    else 'inconnu'
  end as statut_site,
  case
    when b.url_crm is not null and host_sans_site(host_key(b.url_crm))            then 'hote_sans_site'
    when b.etat = 'present' and b.url_constatee is not null
     and host_sans_site(host_key(b.url_constatee))                                then 'hote_sans_site'
    when b.etat in ('present', 'absent')                                          then 'constat'
    when b.url_crm is not null                                                    then 'colonne'
    when b.etat is not null                                                       then 'constat'
    else 'aucune'
  end as origine_statut,
  case
    when b.url_crm is not null and host_sans_site(host_key(b.url_crm))            then 'haute'
    when b.etat = 'present' and b.url_constatee is not null
     and host_sans_site(host_key(b.url_constatee))                                then 'haute'
    when b.etat in ('present', 'absent')                                          then b.confiance
    when b.url_crm is not null                                                    then 'haute'
    else null
  end as confiance_statut
from base b;

comment on view public.v_entreprises_presence_site is
  'Présence d''un site, par entreprise vivante. Le constat l''emporte sur la colonne pour « présent » et « absent » ; la colonne l''emporte sur un constat « inconnu ». `origine_statut` dit d''où vient le verdict et `confiance_statut` ce qu''il vaut : une URL en colonne est HAUTE, jamais CERTAINE.';

grant select on public.v_entreprises_presence_site to service_role, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select statut_site, origine_statut, count(*) from v_entreprises_presence_site
--  group by 1,2 order by 1,2;
--   attendu : plus aucune ligne (statut_site='inconnu', origine_statut='colonne')
--   et les ~25 291 « colonne » passent de inconnu à present.
-- select count(*) from v_entreprises_presence_site
--  where etat = 'absent' and statut_site <> 'absent';         -- doit rester 0
-- select count(*) from v_entreprises_presence_site
--  where origine_statut = 'colonne' and confiance_statut <> 'haute';  -- 0
