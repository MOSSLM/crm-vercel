-- Un témoin qu'on ne peut pas lire n'est pas un rejet silencieux.
--
-- CE QUE ÇA CORRIGE. `marquerIntrouvables` balayait TOUS les messages restés
-- « en attente » plus de six heures et les estampillait `introuvable` — un
-- statut dont le code dit lui-même qu'il est « le pire des trois : on ne sait
-- même pas quoi corriger ». Or un message part aussi vers des témoins dont on
-- n'a pas les identifiants : ceux-là ne seront JAMAIS retrouvés, non parce
-- qu'ils ont été rejetés, mais parce que personne n'est allé voir.
--
-- LE CAS QUI L'A RÉVÉLÉ, ET IL N'EST PAS THÉORIQUE. Outlook.com n'accepte plus
-- que OAuth2 sur IMAP — la page de Microsoft l'écrit noir sur blanc. Une boîte
-- témoin Microsoft ne peut donc PAS être branchée par mot de passe, et
--`matteo.sallami2@outlook.fr` est enregistrée « à l'aveugle » exprès. Sans ce
-- correctif, ses huit messages par jour seraient comptés comme huit rejets
-- silencieux, et le score de l'expéditeur baisserait à cause d'une boîte qui
-- se comporte peut-être parfaitement.
--
-- C'est mot pour mot la règle que ce CRM applique partout ailleurs : un zéro
-- et une absence de mesure ne sont pas la même chose. `non_mesure` la rend
-- lisible en base, au lieu de la laisser se déguiser en échec.
--
-- CE QUE `non_mesure` NE FAIT PAS : il n'entre dans aucun taux. Ni dans les
-- mesures (`boite` + `spam`), ni au numérateur des introuvables. Le message
-- est parti — il construit de l'historique chez Microsoft, ce qui est le but —
-- et il n'apprend rien de plus, ce que l'écran dit déjà par « envoi à
-- l'aveugle ».
--
-- Le code : src/lib/rechauffeur/rechauffeur-db.ts (`marquerIntrouvables`).

alter table public.rechauffe_messages
  drop constraint if exists rechauffe_messages_placement_check;

alter table public.rechauffe_messages
  add constraint rechauffe_messages_placement_check
  check (placement in ('attente', 'boite', 'spam', 'introuvable', 'non_mesure'));

-- Rattrapage : ce qui a déjà été estampillé `introuvable` alors que son témoin
-- n'était pas lisible n'a jamais été un rejet. Idempotent, et sans effet tant
-- que le journal est vide.
update public.rechauffe_messages m
set placement = 'non_mesure'
from public.rechauffe_temoins t
where t.id = m.temoin_id
  and m.placement = 'introuvable'
  and t.peut_lire is not true;

-- Contrôle à relire après application : doit rendre les cinq valeurs.
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'rechauffe_messages_placement_check';
