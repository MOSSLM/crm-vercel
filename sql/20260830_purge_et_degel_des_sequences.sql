-- Purger, puis dégeler — remettre le flux de démarchage en marche.
--
-- LE CONSTAT, mesuré le 30/08/2026 sur les 712 inscriptions `active` :
--   S1 · sequence_paused ..... 524   next_run_at NUL      dont 93 mis de côté
--   S1 · aucun motif ..........  88   next_run_at NUL      dont  2
--   S1 · test_hold ............  44   échu le 28/08        dont  2
--   S2 · aucun motif ..........  40   next_run_at NUL
--   S2 · awaiting_reply .......  11   date posée
--   S1 · awaiting_reply .......   4   date posée
--   S4 · aucun motif ..........   1   date posée
--
-- ⚠️ 652 ONT `next_run_at` NUL, PAS 696. Les 44 `test_hold` portent une date —
-- le 28/08, donc ÉCHUE : elles ne dorment pas, elles sont en tête de la file du
-- régulateur et repartiront au prochain tick. Les compter avec les gelées
-- inverserait l'urgence : ce sont les seules qui bougent encore.
--
-- CE QUI TUE LE FLUX. `regulator-db.ts` ne lit que les inscriptions dont la
-- date est posée (`.not('next_run_at','is',null)`). Une inscription `active` à
-- `next_run_at` nul n'est donc reprise par AUCUN tick, jamais — et rien ne le
-- signale, parce que « active » se lit comme « vivante » sur tous les écrans.
--
-- ⚠️ MAIS `next_run_at` NUL A DEUX SENS OPPOSÉS, ET LES CONFONDRE EST LA FAUTE
-- QUE CE FICHIER EXISTE POUR ÉVITER.
--   · `hold_reason` NUL avec `next_run_at` NUL, c'est la signature d'une étape
--     MANUELLE en cours : `engine.ts` pose la tâche puis gare l'inscription en
--     écrivant exactement `{ next_run_at: null, send_at: null, hold_reason:
--     null }`, et attend que l'humain fasse le geste. L'inscription n'est pas
--     morte, elle attend quelqu'un.
--   · `hold_reason = 'sequence_paused'` avec `next_run_at` NUL, c'est du gel
--     sans réveil.
-- La mesure le confirme sans ambiguïté : les 126 « sans motif » portent TOUTES
-- une tâche vivante née de leur propre inscription (`enrollment_id`), 115 ont
-- déjà reçu un e-mail, et aucune n'est à l'étape 0. Les 431 `sequence_paused`,
-- elles, sont toutes à `current_step = 0`, entrées le 20/08, mises à jour le
-- 21/08, avec ZÉRO tâche et ZÉRO e-mail. On dégèle donc les secondes et on ne
-- touche pas aux premières : les réveiller relancerait une étape dont la tâche
-- est encore ouverte, et fabriquerait le doublon de travail qu'on vient de
-- passer un mois à retirer.
--
-- L'ORDRE N'EST PAS UN DÉTAIL : ON PURGE AVANT DE DÉGELER. 97 inscriptions
-- actives portent un métier mis de côté (isolation, menuiserie). Elles ont
-- perdu leur `qualifie` avec `20260829_metiers_mis_de_cote.sql`, mais personne
-- ne les a sorties des séquences. Dégeler d'abord enverrait 97 accroches
-- WhatsApp à des poseurs d'isolation à qui on a décidé de ne pas vendre — et le
-- message serait parti avant qu'on s'en aperçoive.
--
-- CE QUE ÇA DÉBLOQUE, ET QU'ON NE VOIT PAS DEPUIS L'ATTRIBUTION. 191 des 315
-- fiches figées dans les lots « Semaine 36 » portent déjà une de ces
-- inscriptions gelées. `enrollInSequence` refuse d'inscrire deux fois : la
-- route d'attribution les verra `deja_inscrit`, ne créera aucune tâche, et
-- elles resteront invisibles. **Attribuer ne suffit pas — c'est ce dégel qui
-- les fait apparaître.**

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. L'état d'avant, archivé AVANT toute écriture
-- ═══════════════════════════════════════════════════════════════════════════
-- `sequence_enrollments` porte un trigger `updated_at` : sans cette table, plus
-- rien ne dirait ni ce que valait `next_run_at`, ni depuis quand. Et c'est elle
-- qui rend le rollback possible ligne par ligne, plutôt qu'en bloc.
create table if not exists public.archive_sequences_20260830 (
  enrollment_id   uuid primary key references public.sequence_enrollments(id) on delete cascade,
  entreprise_id   bigint,
  automation_id   uuid,
  statut_avant    text,
  motif_avant     text,
  next_run_avant  timestamptz,
  send_at_avant   timestamptz,
  etape_avant     integer,
  -- Ce qu'on a décidé d'en faire : 'sortie_metier', 'sortie_test', 'degel'.
  -- Sans cette colonne, le rollback devrait refaire le tri, donc refaire le
  -- raisonnement — et un rollback qui raisonne n'est pas un rollback.
  geste           text not null,
  archive_le      timestamptz not null default now()
);

-- ── 1a. Ce qui sort parce que le métier est mis de côté ─────────────────────
insert into public.archive_sequences_20260830
       (enrollment_id, entreprise_id, automation_id, statut_avant, motif_avant,
        next_run_avant, send_at_avant, etape_avant, geste)
select se.id, se.entreprise_id, se.automation_id, se.status, se.hold_reason,
       se.next_run_at, se.send_at, se.current_step, 'sortie_metier'
  from public.sequence_enrollments se
  join public.entreprises e on e.id = se.entreprise_id
 where se.status = 'active'
   and public.porte_metier_mis_de_cote(e.service_tags)
on conflict (enrollment_id) do nothing;

-- ── 1b. Ce qui sort parce que c'est du déchet de test ───────────────────────
insert into public.archive_sequences_20260830
       (enrollment_id, entreprise_id, automation_id, statut_avant, motif_avant,
        next_run_avant, send_at_avant, etape_avant, geste)
select se.id, se.entreprise_id, se.automation_id, se.status, se.hold_reason,
       se.next_run_at, se.send_at, se.current_step, 'sortie_test'
  from public.sequence_enrollments se
 where se.status = 'active'
   and se.hold_reason = 'test_hold'
on conflict (enrollment_id) do nothing;   -- les 2 déjà prises en 1a y restent

-- ── 1c. Ce qui se dégèle ────────────────────────────────────────────────────
insert into public.archive_sequences_20260830
       (enrollment_id, entreprise_id, automation_id, statut_avant, motif_avant,
        next_run_avant, send_at_avant, etape_avant, geste)
select se.id, se.entreprise_id, se.automation_id, se.status, se.hold_reason,
       se.next_run_at, se.send_at, se.current_step, 'degel'
  from public.sequence_enrollments se
 where se.status = 'active'
   and se.hold_reason = 'sequence_paused'
   and se.next_run_at is null
on conflict (enrollment_id) do nothing;   -- les 93 déjà prises en 1a y restent

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PURGER — les métiers mis de côté sortent des séquences
-- ═══════════════════════════════════════════════════════════════════════════
-- La forme est celle de `exitEnrollment` (`engine.ts`), recopiée exactement :
-- une sortie qui laisserait `hold_reason` ou `send_at` derrière elle se lirait
-- encore comme une attente sur les écrans qui affichent le motif.

-- Les travaux en attente d'abord, l'inscription ensuite : dans l'autre sens, un
-- tick glissé entre les deux verrait une inscription sortie et une tâche
-- vivante, c'est-à-dire l'orphelin qu'on cherche à ne pas fabriquer.
update public.automation_jobs j
   set status = 'canceled'
  from public.archive_sequences_20260830 a
 where j.enrollment_id = a.enrollment_id
   and a.geste in ('sortie_metier', 'sortie_test')
   and j.status in ('pending', 'processing');

-- ⚠️ ON ÉCARTE AUSSI LES `snoozed`, ET C'EST UNE EXCEPTION ASSUMÉE.
-- La règle du projet est « `pending` seulement » (cf. `_assign.ts`) : une tâche
-- reportée porte une mise de côté datée, et la toucher ferait ressortir
-- aujourd'hui les prospects les plus chauds du parc. Cette règle protège d'une
-- RÉATTRIBUTION ; ici la décision est « on ne vend pas à ce métier », et elle
-- vaut à toutes les dates. Laisser le report en place rendrait à un agent, le
-- jour dit, un poseur d'isolation sans séquence derrière — une tâche orpheline,
-- exactement l'état invisible dont ce fichier sort. Au 30/08 : 2 lignes, toutes
-- deux `snoozed`, aucune `pending`. Elles sont nommées dans les contrôles.
update public.prospection_tasks p
   set status = 'skipped'
  from public.archive_sequences_20260830 a
 where p.enrollment_id = a.enrollment_id
   and a.geste in ('sortie_metier', 'sortie_test')
   and p.status in ('pending', 'snoozed');

update public.sequence_enrollments se
   set status      = 'exited',
       next_run_at = null,
       send_at     = null,
       hold_reason = null,
       exit_reason = case a.geste when 'sortie_metier' then 'metier_mis_de_cote' else 'test' end,
       finished_at = now()
  from public.archive_sequences_20260830 a
 where se.id = a.enrollment_id
   and a.geste in ('sortie_metier', 'sortie_test')
   and se.status = 'active';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DÉGELER — les 431 d'un coup, décision du propriétaire le 30/08
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ CE QUE ÇA PRODUIT, POUR QUE PERSONNE NE LE DÉCOUVRE : 431 tâches WhatsApp
-- naissent dans les minutes qui suivent (S1 : condition → WhatsApp manuel), et
-- le régulateur ne les retient pas — son plafond quotidien ne gouverne que
-- l'e-mail. Les deux files s'ouvrent donc sur 431 lignes d'un coup là où
-- l'objectif de la semaine est de 50 par jour.
--
-- L'étalement à 50/jour a été proposé et ÉCARTÉ : le propriétaire veut le stock
-- ouvert, quitte à ce que la file soit plus longue que la journée. C'est un
-- arbitrage, pas un oubli — la file se trie par `due_at`, donc ce qui dépasse
-- la journée est simplement ce qu'on ne fera pas aujourd'hui.
--
-- Si le mur devient ingérable, l'étalement se repose sans rollback, sur les
-- seules inscriptions encore à l'étape 0 :
--   update public.sequence_enrollments se
--      set next_run_at = now() + (d.jour * interval '1 day')
--     from (select a.enrollment_id,
--                  (row_number() over (order by a.entreprise_id) - 1) / 50 as jour
--             from public.archive_sequences_20260830 a
--             join public.sequence_enrollments s on s.id = a.enrollment_id
--            where a.geste = 'degel' and s.status = 'active' and s.current_step = 0) d
--    where se.id = d.enrollment_id;
update public.sequence_enrollments se
   set next_run_at = now(),
       -- `sequence_paused` était vrai le 20/08 : S1 n'était pas encore en
       -- service. Elle l'est. Garder le motif afficherait « séquence en pause »
       -- sur des inscriptions qui repartent — et on chercherait la panne dans
       -- une séquence qui tourne.
       hold_reason = null,
       send_at     = null
  from public.archive_sequences_20260830 a
 where se.id = a.enrollment_id
   and a.geste = 'degel'
   and se.status = 'active';          -- pas celles que la purge vient de sortir

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- Contrôles — à relire après application
-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIQUÉ EN PRODUCTION LE 30/08/2026. Relevé juste après, sur les 712
-- inscriptions `active` d'avant :
--   sortie_metier ....  97      sortie_test ....  42      degel ....  431
--   intactes ........ 142  (126 étapes manuelles en cours + 16 dates posées)
--   actives restantes  573      dont dues maintenant  431
--   métier mis de côté encore actif ... 0      tâche orpheline ... 0
--   gelées restantes : 126, toutes `hold_reason` NUL — c'est-à-dire les seules
--   qui doivent l'être.
--
-- 1. Ce que l'archive a retenu — doit rendre 97 / 42 / 431.
-- select geste, count(*) from public.archive_sequences_20260830 group by 1 order by 1;
--
-- 2. PLUS UNE SEULE INSCRIPTION VIVANTE SUR UN MÉTIER MIS DE CÔTÉ. Doit rendre 0.
-- select count(*) from public.sequence_enrollments se
--   join public.entreprises e on e.id = se.entreprise_id
--  where se.status = 'active' and public.porte_metier_mis_de_cote(e.service_tags);
--
-- 3. PLUS UNE SEULE TÂCHE ORPHELINE derrière une inscription sortie. Doit rendre 0.
--    (Au 30/08, 2 lignes `snoozed` ont été écartées ici — voir l'exception du §2.)
-- select count(*) from public.prospection_tasks p
--   join public.sequence_enrollments se on se.id = p.enrollment_id
--  where se.status = 'exited' and p.status in ('pending', 'snoozed');
--
-- 4. LE CONTRÔLE QUI COMPTE : plus aucune inscription gelée sans raison. Doit
--    ne rendre que des lignes `hold_reason` NUL — les étapes manuelles en cours,
--    qui attendent un humain et non un tick.
-- select coalesce(hold_reason,'(aucun — étape manuelle en cours)') as motif, count(*)
--   from public.sequence_enrollments
--  where status = 'active' and next_run_at is null group by 1 order by 2 desc;
--
-- 5. Le dégel a bien pris : 431 lignes dues, toutes sans motif.
-- select count(*) filter (where next_run_at <= now()) as dues,
--        count(*) filter (where hold_reason is not null) as motif_restant
--   from public.sequence_enrollments se
--   join public.archive_sequences_20260830 a on a.enrollment_id = se.id
--  where a.geste = 'degel';
--
-- 6. Ce que le prochain tick va produire — à regarder DANS L'HEURE qui suit.
--    Les tâches n'apparaissent pas à l'application : elles naissent au tick.
-- select kind, status, count(*) from public.prospection_tasks
--  where created_at > now() - interval '1 hour' group by 1,2 order by 3 desc;
--
-- ROLLBACK — rend à chaque inscription son état d'avant, geste par geste.
-- Les tâches et les jobs, eux, ne se rendent pas : `skipped` et `canceled` sont
-- des états terminaux que le moteur relit sans dommage, et ressusciter une
-- tâche `pending` ferait repartir un travail que personne n'a redemandé.
/*
update public.sequence_enrollments se
   set status      = a.statut_avant,
       hold_reason = a.motif_avant,
       next_run_at = a.next_run_avant,
       send_at     = a.send_at_avant,
       exit_reason = null,
       finished_at = null
  from public.archive_sequences_20260830 a
 where se.id = a.enrollment_id;
*/
