-- Les candidats SIRET qui n'attendent rien — et pourquoi ils ne sont pas tous
-- des rejets.
--
-- LE PROBLÈME
-- `entreprise_siret_candidats` porte 823 lignes au statut `propose`, dont **458
-- sur des fiches qui ONT DÉJÀ leur SIRET** (172 fiches). Leur SIRET vient d'un
-- versement antérieur — `proeco_registre_auto`, `api_gouv`,
-- `proeco_site_mentions_legales` — qui n'est jamais passé par `validerCandidat`
-- et n'a donc rejeté aucun concurrent. L'écran de choix les filtre déjà
-- (`siret is null`), mais la table ment à qui la lit, et
-- `GET /api/donnees-publiques/resolution` les rend encore.
--
-- ── LES 458 NE SONT PAS UN BLOC, ET LES REJETER TOUS SERAIT FAUX ─────────
-- Mesuré le 20/08/2026 :
--
--     7   proposent EXACTEMENT le SIRET déjà posé      → ils le CONFIRMENT
--    96   même SIREN, autre établissement              → même entreprise
--   355   un autre SIREN                               → une autre entreprise
--
-- Écrire « rejeté » sur les 7 dirait que le SIRET de la fiche a été écarté,
-- alors qu'ils disent l'inverse. Et écrire « rejeté » sans distinguer les 96
-- des 355 effacerait la seule information qui compte quand on rouvrira la
-- fiche : ces 96 ne sont pas des erreurs de rapprochement, ce sont les autres
-- établissements de la bonne entreprise.
--
-- ⚠️ ARCHIVER AVANT. C'est une écriture de masse, et `decide_le` /
-- `commentaire` ne reviendront pas une fois écrasés.
--
-- ⚠️ `decide_par` RESTE NULL. Y mettre un uuid ferait croire dans six mois
-- qu'un humain a regardé ces 458 lignes. Personne ne les a regardées : c'est
-- une déduction, et le commentaire le dit.
begin;

-- ── 1. L'archive, avant tout ─────────────────────────────────────────────
create table if not exists public.archive_candidats_siret_20260820 as
select c.*, e.siret as siret_de_la_fiche, e.siren as siren_de_la_fiche, now() as archive_le
from public.entreprise_siret_candidats c
join public.entreprises e on e.id = c.entreprise_id
where c.statut = 'propose' and e.siret is not null;

comment on table public.archive_candidats_siret_20260820 is
  'Les 458 candidats « propose » sur des fiches déjà siretées, tels qu''ils étaient avant la régularisation du 20/08/2026. Porte aussi le SIRET et le SIREN de la fiche, pour pouvoir refaire le tri sans rejouer la jointure.';

-- ── 2. Les 7 qui confirment ──────────────────────────────────────────────
update public.entreprise_siret_candidats c
   set statut = 'valide',
       decide_le = now(),
       commentaire = 'Régularisation du 20/08/2026 : ce candidat propose exactement le SIRET déjà posé sur la fiche. Il le confirme — il n''a jamais été soumis à validerCandidat parce que le SIRET venait d''un versement antérieur.'
  from public.entreprises e
 where e.id = c.entreprise_id
   and c.statut = 'propose'
   and e.siret is not null
   and c.siret = e.siret;

-- ── 3. Les 96 autres établissements du même SIREN ────────────────────────
update public.entreprise_siret_candidats c
   set statut = 'rejete',
       decide_le = now(),
       commentaire = 'Régularisation du 20/08/2026 : même SIREN que la fiche, autre établissement. Ce n''est PAS un mauvais rapprochement — c''est la même entreprise à une autre adresse. Le choix d''établissement ne change ni la raison sociale, ni les dirigeants, ni les finances, ni le RGE (interrogé sur siret:<SIREN>*) : seule l''adresse en dépend.'
  from public.entreprises e
 where e.id = c.entreprise_id
   and c.statut = 'propose'
   and e.siret is not null
   and c.siret <> e.siret
   and c.siren = e.siren;

-- ── 4. Les 355 qui désignent une autre entreprise ────────────────────────
update public.entreprise_siret_candidats c
   set statut = 'rejete',
       decide_le = now(),
       commentaire = 'Régularisation du 20/08/2026 : la fiche portait déjà un SIRET d''un autre SIREN, issu d''un versement antérieur qui n''est jamais passé par validerCandidat. Aucun humain n''a comparé les deux — si le SIRET de la fiche s''avère faux un jour, ce candidat est à rouvrir depuis archive_candidats_siret_20260820.'
  from public.entreprises e
 where e.id = c.entreprise_id
   and c.statut = 'propose'
   and e.siret is not null
   and c.siren is distinct from e.siren;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) from public.archive_candidats_siret_20260820;        -- 458
-- select c.statut, count(*) from public.entreprise_siret_candidats c
--   join public.entreprises e on e.id = c.entreprise_id
--  where e.siret is not null group by 1;
--   attendu : plus AUCUN 'propose' sur une fiche déjà siretée
-- select count(*) from public.entreprise_siret_candidats where statut='propose';
--   attendu : 823 − 458 = 365, sur 138 fiches, toutes sans SIRET
-- select statut, count(*), count(*) filter (where decide_par is not null)
--   from public.entreprise_siret_candidats
--  where id in (select id from public.archive_candidats_siret_20260820)
--  group by 1;
--   attendu : rejete 451 · valide 7 · AUCUN décideur — personne n'a regardé,
--   et la colonne doit continuer à le dire.
