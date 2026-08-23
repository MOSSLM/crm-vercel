-- Annuler un geste : revenir à la tâche précédente, à l'étape précédente.
--
-- LE BESOIN, DIT PAR MATTEO LE 23/08/2026 : « il se peut qu'on ait fait des
-- erreurs en appuyant sur le fait que le message a été envoyé, ou en sautant
-- une étape sans faire exprès, et il n'y a pas de retour en arrière ». Ce n'est
-- pas un Ctrl-Z à faire dans la seconde : c'est un bouton, disponible plus
-- tard, quand on s'aperçoit de la bêtise.
--
-- POURQUOI UN JOURNAL ET PAS UN CALCUL INVERSE. Un « Fait » touche cinq choses
-- d'un coup : la tâche, l'inscription (étape courante, dates, ancre, sacs de
-- variables, motif de blocage), `entreprises.premiere_touche_le`, l'étape de
-- l'affaire, et la tâche fille que l'avancement vient de créer. Recalculer
-- l'état d'avant à partir de l'état d'après, c'est deviner : `avancerApres`
-- incrémente des compteurs de tours, réancre les délais, et lit des sacs qu'il
-- réécrit. La seule façon EXACTE de revenir en arrière est d'avoir gardé le
-- « avant » — c'est la règle que ce dépôt applique déjà aux écritures de masse,
-- et le déclencheur `updated_at` détruit ici la même preuve.
--
-- CE QUE LE JOURNAL NE PROMET PAS. Il rembobine NOTRE comptabilité, il ne
-- rappelle aucun message. Un e-mail parti est parti. C'est pour ça que
-- l'annulation REFUSE quand un envoi a eu lieu depuis le geste : rembobiner
-- ferait repartir le même message une seconde fois chez un vrai artisan, et
-- deux messages identiques coûtent plus cher que l'état faux qu'on corrigeait.
--
-- ON N'ANNULE QUE LE DERNIER GESTE D'UNE INSCRIPTION. Pas par prudence : par
-- exactitude. Si deux gestes se sont succédé, restaurer le premier écraserait
-- ce que le second a écrit. On dépile, comme n'importe quelle pile d'annulation
-- — le second d'abord, le premier ensuite.
--
-- Le code : src/lib/prospection/annulation.ts (pur, testé) et
-- src/lib/prospection/gestes-db.ts.

create table if not exists public.prospection_gestes (
  id            uuid primary key default gen_random_uuid(),

  -- Ce qui a été fait, et par qui.
  geste         text not null check (geste in ('terminer', 'ignorer', 'reporter')),
  fait_le       timestamptz not null default now(),
  fait_par      uuid references auth.users(id) on delete set null,

  -- Sur quoi.
  tache_id      uuid not null references public.prospection_tasks(id) on delete cascade,
  enrollment_id uuid references public.sequence_enrollments(id) on delete cascade,
  entreprise_id bigint,
  opportunite_id uuid,

  -- L'ÉTAT D'AVANT, verbatim. Une seule colonne : ce n'est pas de la donnée
  -- qu'on interroge, c'est une photo qu'on repose telle quelle.
  avant         jsonb not null,

  -- L'annulation elle-même.
  annule_le     timestamptz,
  annule_par    uuid references auth.users(id) on delete set null,

  created_at    timestamptz not null default now()
);

-- La question posée par l'écran est toujours « quels sont les derniers gestes
-- encore annulables ? ». Cet index-là y répond ; aucun autre n'est justifié.
create index if not exists prospection_gestes_recents_idx
  on public.prospection_gestes(fait_le desc)
  where annule_le is null;

-- Et celle posée par l'annulation : « ce geste est-il le dernier de son
-- inscription ? ».
create index if not exists prospection_gestes_inscription_idx
  on public.prospection_gestes(enrollment_id, fait_le desc);

comment on table public.prospection_gestes is
  'Journal des gestes annulables sur les tâches de démarchage. `avant` porte la photo de l''état précédent : on la repose, on ne la recalcule pas.';

-- ── RLS : la même règle que partout ailleurs ───────────────────────────────
-- Une table `public` sans RLS est exposée par PostgREST. `avant` contient
-- l'état d'inscriptions de prospection — rien de secret, mais rien qui doive
-- sortir non plus.
alter table public.prospection_gestes enable row level security;

drop policy if exists prospection_gestes_staff on public.prospection_gestes;
create policy prospection_gestes_staff on public.prospection_gestes
  for all using (public.is_staff()) with check (public.is_staff());

-- Contrôles à relire après application :
--   select count(*) from public.prospection_gestes;                    -- 0
--   select relrowsecurity from pg_class where relname = 'prospection_gestes';  -- true
