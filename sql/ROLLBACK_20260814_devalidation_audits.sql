-- Retour arrière du 14/08/2026 — dévalidation de masse des audits.
--
-- CE QUI A ÉTÉ FAIT, ET POURQUOI. 68 audits portaient le statut « ready », alors
-- que deux seulement avaient été réellement préparés : un `page3.avant_apres`
-- non vide, une mesure PageSpeed, des observations relevées. Les 66 autres
-- n'étaient que le contenu par défaut, validés à la main sans qu'aucun constat
-- n'ait été rédigé. Un audit validé est un audit envoyable ; ceux-là ne
-- l'étaient pas.
--
-- Deux écritures ont eu lieu :
--   1. 67 audits repassés en « draft » — tous sauf Solvac (31d649d4…), le seul
--      audit validé qui soit vraiment préparé : mesure Google du 10/08,
--      3 constats fondés, 4 observations.
--   2. Les 37 jetons de rapport public désactivés (`actif = false`). On masque,
--      on n'efface pas : les jetons existent toujours et les liens déjà
--      distribués redeviendront valides à la réactivation.
--
-- CE QUI N'A PAS BOUGÉ : le contenu des audits (`content`), les opportunités,
-- les étapes de pipeline, les inscriptions de séquence. Aucun e-mail n'avait
-- jamais mentionné un audit ni un rapport (33 envois depuis le 26/07, zéro
-- occurrence), et la seule automation active — « WhatsApp seul — sans e-mail »,
-- 34 inscrits — ne lit pas le statut d'audit.
--
-- L'EMPREINTE D'AVANT, qui rend ce fichier suffisant à lui seul : avant
-- l'écriture, exactement deux audits étaient en brouillon, et les 37 jetons
-- étaient tous actifs. Les deux brouillons d'origine sont donc nommés ci-dessous
-- et exclus du retour arrière ; tout autre brouillon a été créé par l'écriture.
--
-- CE QUE L'ÉCRITURE A EFFACÉ, ET QU'AUCUN RETOUR ARRIÈRE NE RENDRA. Le trigger
-- `update_audits_updated_at` (sql/20260424_audits.sql:113-124) est un BEFORE
-- UPDATE inconditionnel : il a écrasé les `updated_at`. Or 67 des 68 audits
-- validés partageaient EXACTEMENT `2026-08-12 12:03:35.002765+00` — la signature
-- d'une validation en lot jouée 7 à 10 secondes après leur création. C'était la
-- preuve chiffrée qu'aucune relecture individuelle n'avait eu lieu, et elle
-- aurait dû être archivée dans une table avant d'écrire. Elle ne l'a pas été.
--
-- CE QUI SURVIT, et qui suffit à établir le même fait : les `created_at` n'ont
-- pas de trigger. 61 des 70 audits ont été créés entre 12:03:23 et 12:03:28 le
-- 12/08 — six secondes pour soixante et un dossiers.
--
-- LEÇON POUR LA PROCHAINE ÉCRITURE DE MASSE : archiver d'abord.
--   create table public.audits_statut_sauvegarde_<date> as
--     select id, opportunite_id, statut, created_at, updated_at, now() as sauvegarde_le
--     from public.audits;

-- 1. Rendre leur validation aux 67 audits.
update audits
   set statut = 'ready'
 where statut = 'draft'
   and id not in (
     '4b0c9220-94ca-4a0b-9e59-4414218faf9a',  -- brouillon d'origine, 28/07
     '4684bba6-a6b3-4b9d-8c11-9d374e5968b9'   -- CVC green, préparé mais jamais validé
   );

-- 2. Réactiver les 37 liens de rapport public.
update entreprises_rapport_public
   set actif = true
 where actif = false;

-- Vérification attendue après retour arrière :
--   select statut, count(*) from audits group by statut;
--     ready 68 · draft 2
--   select count(*) filter (where actif) from entreprises_rapport_public;
--     37
