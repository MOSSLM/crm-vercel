-- ── L'agent se sert lui-même dans le pool ──────────────────────────────────
--
-- CE QUE ÇA RÉSOUT
-- La file de démarchage ne montre que les entreprises dont l'agent est
-- propriétaire (`entreprises.owner_id`). Un agent sans attribution ouvre donc
-- un écran définitivement vide — pas « rien à faire aujourd'hui », mais « rien
-- à faire, jamais ». Le seul chemin existant, `/api/agent/claim`, ouvre une
-- DEMANDE que l'admin valide ensuite depuis la page Agents : le bon défaut
-- quand plusieurs agents se partagent un pool commun, un aller-retour inutile
-- quand celui qui démarche est aussi celui qui décide.
--
-- CE QUE LA COLONNE DIT
-- « Cet agent-là choisit seul qui il démarche. » Elle ne donne accès qu'au
-- POOL — `owner_id is null` : une entreprise déjà attribuée reste hors de
-- portée, quel que soit ce droit. On ne se sert jamais chez le voisin.
--
-- DÉFAUT = REFUS, comme les deux autres capacités de cette table. Un agent
-- existant ne gagne rien à cette migration : il faut une décision explicite,
-- prise depuis Relations › Agents › Permissions.

alter table public.agent_settings
  add column if not exists can_self_assign boolean not null default false;

comment on column public.agent_settings.can_self_assign is
  'L''agent peut s''attribuer lui-même des entreprises du pool (owner_id null) '
  'depuis Démarchage, sans passer par une demande validée par l''admin. '
  'Défaut faux : le pool est commun.';
