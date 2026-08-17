-- Les dossiers web reportés dans le CRM — volet Google, cohorte B.
--
-- CE QUI A ÉTÉ FAIT
-- `scripts/prospection/dossier-web.mjs` a monté un dossier pour les 297 fiches
-- de la cohorte B (« sans site »). `appliquer-dossiers.mjs --volet google` en a
-- reporté la partie qui ne demande aucun jugement :
--   google_place_id · note_moyenne · nombre_avis
-- Résultat : 205 fiches mises à jour, 6 refusées par la contrainte unique.
--
-- LE VOLET « SITE » N'EST PAS APPLIQUÉ. Les URL attendent une relecture — voir
-- plus bas pourquoi.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI LE place_id VAUT LE DÉTOUR
-- ─────────────────────────────────────────────────────────────────────────────
-- La fonction déployée `enrich-lead-magnet` le re-cherche sinon par requête
-- texte, et son propre commentaire le dit : « cette recherche est FACTURÉE —
-- c'est le chiffre à surveiller sur un gros lot ». L'écrire une fois l'économise
-- à chaque enrichissement, pour toujours.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE LE LOT A RÉVÉLÉ, ET QUI COMPTE PLUS QUE L'ÉCRITURE
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. UN RAPPROCHEMENT SUR LE CODE POSTAL NE VAUT RIEN.
--    La première version acceptait la fiche Google dont le code postal tombait
--    juste. L'entreprise 3 porte une ville en 69560 et une adresse en 44700 —
--    deux données qui se contredisent chez elle — et a donc reçu la fiche
--    d'« Air Pr'eau », un autre commerce de la commune. Le 409 d'une contrainte
--    unique l'a signalé par hasard ; les autres seraient passées en silence.
--    Depuis, l'écriture exige un accord sur le téléphone, le nom hors
--    vocabulaire de métier, ou le numéro + la voie. 277 fiches sur 289 le
--    passent ; les 12 autres sont marquées dans leur dossier, pas écrites.
--
-- 2. LES MOTS DU MÉTIER NE SONT PAS UNE IDENTITÉ.
--    « Pac Access » s'accordait avec « PAC GLASS - Remplacement pare-brise » sur
--    le seul mot « pac » ; « Metche Co / Climatisation » avec « STME L'Union /
--    Climatisation » sur « climatisation ». Deux chauffagistes de la même ville
--    partagent tout leur vocabulaire : c'est ce qui les rend indistinguables.
--
-- 3. LA CONTRAINTE UNIQUE SUR google_place_id EST UN DÉTECTEUR DE DOUBLONS.
--    Les 6 refus sont tous deux fiches du CRM pour une seule entreprise Google :
--      628 « JP Climatisation »  ↔ 2823 « J P Climatisation »   (même ville)
--      989 « 2amr Conseils »     ↔ 2236 « 2amr Conseils »
--      583 « HIP Services »      ↔  587 « Hip-Services »
--      879 « CCL »               ↔  923 « CCL Home »
--    et deux rapprochements douteux, à trancher à la main :
--      267 « Groupe Verlaine »   ↔ 2881 « EDS HABITAT »
--      695 « SAS CHAMPAC »       ↔  664 « Reims Climatisation »
--
-- 4. LA COHORTE B NE DÉCRIT PAS CE QU'ELLE DIT.
--    Sur 297 fiches « sans site » : 289 ont une fiche Google, 281 ont un nombre
--    d'avis connu, et 133 avaient déjà une URL dans le CRM. Elles n'étaient pas
--    sans site — elles étaient sans site EXPLOITABLE, ce qui n'est pas la même
--    campagne. À rebâtir avant tout démarchage.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÉCRITURES DÉJÀ APPLIQUÉES le 17/08 par le script. Consigné pour la trace.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.journal_dossiers_web_20260817 (
  entreprise_id bigint primary key,
  canonical_url_avant text,
  site_web_canonique_avant text,
  google_place_id_avant text,
  note_moyenne_avant numeric,
  nombre_avis_avant int,
  url_appliquee text,
  confiance text,
  motif text,
  archive_le timestamptz not null default now()
);
grant select, insert on public.journal_dossiers_web_20260817 to service_role;

-- Les UPDATE eux-mêmes sont passés par PostgREST, fiche par fiche, pour que
-- l'échec de l'une n'emporte pas les 204 autres. Équivalent SQL :
--   update public.entreprises e
--      set google_place_id = <celui du dossier>,
--          note_moyenne    = <celle du dossier>,
--          nombre_avis     = <celui du dossier>
--    where e.id = <id> and e.google_place_id is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) filter (where google_place_id is not null) as avec_place_id,
--        count(*) filter (where nombre_avis is not null)     as avec_avis,
--        count(*) filter (where coalesce(site_web_canonique,'') <> ''
--                            or coalesce(canonical_url,'') <> '') as enrichissable
--   from public.entreprises
--  where cohorte_demarchage = 'B_sans_site' and archived_at is null;
-- Au 17/08 après application : 271 · 281 · 133.
--
-- ROLLBACK :
-- update public.entreprises e
--    set google_place_id = j.google_place_id_avant,
--        note_moyenne    = j.note_moyenne_avant,
--        nombre_avis     = j.nombre_avis_avant
--   from public.journal_dossiers_web_20260817 j
--  where e.id = j.entreprise_id;
