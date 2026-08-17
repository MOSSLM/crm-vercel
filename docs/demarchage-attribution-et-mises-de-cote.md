# Démarchage : se constituer sa file, et les deux sorties qui ne sont ni oui ni non

Trois manques du poste de travail Démarchage, et ce qui les remplace.

## 1. S'attribuer des entreprises soi-même

**Le manque.** La file ne montre que les entreprises dont l'agent est
propriétaire (`entreprises.owner_id`). Un agent sans attribution ouvre donc un
écran vide — pas « rien à faire aujourd'hui », mais « rien à faire, jamais ».
Le seul chemin existant, `/api/agent/claim`, ouvre une *demande* que l'admin
valide depuis Relations › Agents : le bon défaut quand plusieurs agents se
partagent un pool commun, un aller-retour inutile quand celui qui démarche est
aussi celui qui décide.

**Ce qui a été ajouté.** Un droit, accordé agent par agent :

> Relations › Agents › Permissions › **S'attribuer des prospects tout seul**
> (`agent_settings.can_self_assign`, défaut **faux**)

Avec ce droit, le rail de Démarchage affiche « M'attribuer des entreprises »
avec le nombre encore disponible. Le panneau liste le **pool** — qualifiées,
non attribuées, ni archivées ni fusionnées — avec ce qu'il faut pour choisir un
lot : ville, numéro, « avec site » / « sans site » (c'est la distinction des
deux cohortes, donc l'accroche et le document), nombre d'avis Google. On coche,
on s'attribue, les entreprises arrivent dans la file avec leur tâche « Appel à
froid ».

**Ce que le droit ne permet pas.** Prendre une entreprise qui appartient déjà à
quelqu'un. Le pool, c'est `owner_id is null` : une fiche attribuée ne figure ni
dans la liste, ni dans ce que l'attribution accepte — et la vérification est
refaite au moment du clic, pas déduite de la liste affichée, qui a pu vieillir
dans un onglet resté ouvert.

L'attribution elle-même passe par `assignProspectsToAgent`, exactement comme le
bouton admin : l'affaire existante est réutilisée (jamais dupliquée), la fiche
est qualifiée, la tâche d'appel est semée une seule fois.

## 2. Mettre un prospect de côté

**Le manque.** Un prospect en congés, en plein chantier ou hors saison n'est ni
perdu ni convaincu. Les deux seules sorties disponibles étaient « Fait » (on
enregistre un contact qui n'a rien donné) et « Pas intéressé » (on ferme un
prospect qui n'a jamais dit non).

**Ce qui a été ajouté.** Un bouton **Mettre de côté** sur la carte d'action, avec
quatre délais d'un clic (1 semaine, 2 semaines, 1 mois, 3 mois), une date libre,
et un motif facultatif. La tâche est **replanifiée** (`status = 'snoozed'`,
`due_at` déplacé), jamais fermée : elle ressort d'elle-même le jour dit, avec son
motif affiché sur la carte — « il est en congés jusqu'au 8 » se relit sans
dérouler l'historique.

Rien ne part entre-temps : une inscription garée sur une étape manuelle attend
sa tâche, elle ne déroule pas la suite.

**Le correctif qui rend le geste vrai.** `planTasks` répartissait les tâches à la
cadence quotidienne et ne lisait `due_at` que pour les **ordonner**. Une tâche
repoussée à trois semaines revenait donc dans la file du jour dès qu'il restait
une place au quota — la mise de côté ne mettait rien de côté. Désormais, une
tâche `snoozed` dont la date n'est pas arrivée va droit à sa journée de retour,
sans consommer de cadence, et **même un signal GA4 chaud ne l'en sort pas** :
une décision humaine explicite passe devant une mesure, sinon il faudrait ranger
le même prospect chaque matin.

La règle ne vaut que pour les mises de côté explicites : les relances de séquence
naissent avec l'échéance du jour où elles sont créées, et ce sont bien elles que
la cadence doit continuer d'étaler.

## 3. « Cette personne n'est pas sur WhatsApp »

**Le manque.** On ouvre la carte WhatsApp, le numéro n'a pas de compte WhatsApp.
Rien n'est parti, personne n'a rien dit : ce n'est ni un « fait », ni une issue
d'échange. Faute de sortie, la séquence continuait — relance J+3 sur WhatsApp,
relance J+7 sur WhatsApp, chez quelqu'un qui n'y sera jamais.

**Ce qui a été ajouté.** Un bouton **Pas sur WhatsApp** (et son équivalent
LinkedIn) sur les cartes message. Il :

- annule la tâche (`skipped`) — le geste n'a pas eu lieu, il ne gonfle pas le
  compteur du jour ;
- **sort l'inscription de la séquence** et annule ce qui était encore en vol ;
- écrit la raison dans le fil des échanges ;
- **sème un appel à la place** (coché par défaut, décochable) — un prospect
  parfaitement joignable au téléphone ne doit pas disparaître de la file au seul
  motif qu'il n'a pas WhatsApp.

Ce n'est volontairement **pas** une issue de plus dans `STEP_OUTCOMES` : ce
vocabulaire décrit ce que le prospect a *répondu*, il est partagé avec le
pipeline commercial, et chaque issue qui y arrête déclenche une réaction
commerciale (perdu, blacklist). Or l'affaire n'est pas perdue : c'est le canal
qui ne va pas.

**Au passage, un bug corrigé.** Les issues qui annoncent « plus rien ne part »
(« Pas intéressé », « Bloqué ») ne faisaient rien de tel depuis la file de
démarchage : la tâche se fermait avec son issue, puis l'inscription était
avancée comme après n'importe quel geste. Un prospect qui venait de dire non
recevait donc la relance suivante. Une issue `flow: 'stop'` ferme désormais
l'inscription au lieu de l'enchaîner.

## Migration

`sql/20260821_agent_sattribue_ses_prospects.sql` — ajoute
`agent_settings.can_self_assign` (défaut `false`). Aucun agent existant ne gagne
quoi que ce soit : il faut une décision explicite depuis la page Agents.
