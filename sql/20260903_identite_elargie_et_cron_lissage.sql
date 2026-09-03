-- L'identité qui se tranche seule, élargie — et la file qui tourne sans personne.
--
-- LA DEMANDE, mot pour mot (03/09/2026) : « choisis toi-même pour moi les
-- siret […] quand il y a un seul choix avec un siret inattendu ça peut être une
-- erreur lors de la création si c'est le même nom la même adresse et tout […]
-- quand y en a 2 dont un qui est plus probable on choisit le plus probable, en
-- général c'est le premier présenté », puis : « crée les règles pour que ça se
-- fasse automatiquement la prochaine fois qu'on n'ait ni à le faire toi ou moi ».
--
-- ⚠️ CE FICHIER NE CRÉE AUCUNE FONCTION SQL. La règle vit dans
-- `src/lib/lissage/choix-siret.ts` (`identiteProbable`), à côté de la règle
-- stricte qu'elle complète, et `outils-serveur.ts` l'appelle dans le même
-- outil `identite-evidente`. La mettre en base en ferait une SECONDE définition
-- à tenir d'accord avec la première — c'est la leçon de `vue_opportunites_suivi`
-- et de `chaine_du_lot`, qui rendent des faits et jamais des verdicts.
--
-- Ce fichier ne porte donc que le CRON, qui est la moitié « automatiquement ».
--
-- ── CE QUE LA RÈGLE ÉLARGIE PREND, MESURÉ LE 03/09/2026 ────────────────────
-- Sur 159 fiches en attente du portefeuille Bilal + Matteo, `identiteEvidente`
-- (un seul SIREN + les quatre critères) avait déjà pris tout ce qu'elle pouvait.
-- La règle élargie en a tranché 59 de plus :
--   · 43 — un seul SIREN, trois critères sur quatre. Le manquant était le
--     MÉTIER dans 33 cas : un artisan immatriculé en négoce (46.74B), en
--     électricité (43.21A) ou en réparation (33.12Z) reste le même artisan.
--     Dans 8 cas c'était le NOM — l'adresse prime sur le nom, et une enseigne
--     diffère couramment de la raison sociale.
--   · 2 — un seul SIREN, nom + adresse concordants.
--   · 13 — plusieurs SIREN, écart de score >= ECART_SERRE (8).
--   · 1 — écart serré, mais les critères concordants séparent les deux.
-- 58 écrits, 1 refusé (`siret_deja_attribue_a_une_autre_fiche`).
--
-- ── CE QU'ELLE REFUSE, ET C'EST LÀ QU'EST LA SÛRETÉ ────────────────────────
--   · 10 fiches à écart serré ET critères ÉGAUX — le piège « KM Dépannage » :
--     deux SIREN, même adresse, même patronyme, l'un chauffagiste l'autre taxi.
--   · 56 à écart serré et moins de trois critères ; 29 à un SIREN et moins de
--     trois critères. Elles restent à l'écran « Choix du SIRET ».
--
-- ⚠️ LE GARDE-FOU DU REGISTRE N'EST PAS DÉCORATIF. `validerCandidat`
-- réinterroge l'annuaire avant d'écrire, quelle que soit la voie. Sur les 59
-- tranchées, il a rendu HUIT « entreprise cessée » que la ligne candidate
-- disait actives — elle avait été notée avant la cessation. Ces huit fiches ont
-- été archivées (`entreprises_cessees_20260903`) : une société morte n'est pas
-- un prospect, et lui fabriquer une démo est du travail perdu.

-- ═══════════════════════════════════════════════════════════════════════════
-- Le cron du lissage
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ C'EST LE **GET** QUI PORTE LE CRON, pas le POST. `/api/lissage/tick`
-- réserve son POST au bouton d'un admin (`withAuth role: 'admin'`) et n'expose
-- le secret partagé que sur son GET. Un `net.http_post` rendrait 401 — en
-- silence, puisque pg_cron ne lit pas la réponse.
--
-- Quinze minutes : le tick prend vingt lignes et s'arrête à son budget. Plus
-- souvent ne servirait à rien (il rend « plus rien à prendre » dès que la file
-- serveur est vide) ; moins souvent laisserait dormir une passe fraîchement
-- créée.
--
-- Le secret est un PLACEHOLDER ici, comme dans les migrations cron suivant
-- celle du 08/08 — la valeur réelle se lit dans `cron.job`.
select cron.unschedule('lissage-tick')
 where exists (select 1 from cron.job where jobname = 'lissage-tick');

select cron.schedule('lissage-tick', '*/15 * * * *', $$
  select net.http_get(
    url        := 'https://www.samadigitalstudio.fr/api/lissage/tick?taille=20',
    headers    := '{"x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
$$);

-- Contrôles à relire après application :
--   select jobname, schedule, active from cron.job where jobname = 'lissage-tick';
--   select status, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname='lissage-tick')
--    order by start_time desc limit 3;
--   -- et l'effet, qui est le seul qui compte :
--   select source, count(*) from entreprise_siret_candidats
--    where statut = 'valide' group by 1;
--   -- `resolution_auto` = les quatre critères ; `resolution_elargie` = la
--   -- seconde porte. Les deux ne se relisent pas avec la même confiance.
