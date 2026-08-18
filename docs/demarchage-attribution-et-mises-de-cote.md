# Démarchage : la file de gauche, refondue

Ce que le poste de travail ne savait pas faire, et ce qui le remplace.

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

**Le correctif qui rend le geste vrai.** Le plan de file répartissait les tâches
à la cadence quotidienne et ne lisait `due_at` que pour les **ordonner**. Une
tâche repoussée à trois semaines revenait donc dans la file du jour dès qu'il
restait une place au quota — la mise de côté ne mettait rien de côté. La ligne
va désormais droit à sa case de calendrier (§ 4), et **même un signal GA4 chaud
ne l'en sort pas** : une décision humaine explicite passe devant une mesure,
sinon il faudrait ranger le même prospect chaque matin.

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

## 4. La barre de gauche : deux files, des filtres cumulables, un objectif

**Le manque.** La file de gauche mélangeait tout dans une seule liste, répartie
sur les jours à venir à concurrence d'un quota par canal. Quatre défauts, tous
liés :

- **un lead ne pouvait porter qu'un seul état.** La pastille « Chauds » ne
  comptait pas les prospects chauds *déjà en discussion* : le code ne gardait
  que le signal le plus prioritaire, si bien qu'un prospect disparaissait de
  « Chauds » au moment précis où il devenait intéressant — quand il répondait.
  Et il fallait *choisir* entre « chaud », « WhatsApp » et « attente », alors
  qu'un même prospect est souvent les trois ;
- **le quota cachait le travail.** Vingt WhatsApp par jour n'était pas un
  objectif mais un mur : ce qui dépassait était déplacé au lendemain, donc
  invisible. Cent premiers contacts s'affichaient comme vingt ;
- **aujourd'hui prenait toute la place.** Un compteur géant, cinq tuiles et deux
  paragraphes de cadence occupaient la moitié de la hauteur du rail ; la liste
  commençait sous la ligne de flottaison ;
- **rien ne permettait de dire « je préfère l'appeler »**, sinon boucler la
  tâche comme faite (ce qui est faux) ou la laisser traîner.

**Ce qui le remplace.**

### Deux files, en onglets

- **Premiers contacts** — des entreprises que personne n'a jamais abordées.
  C'est un *stock* : rien ne les date. L'objectif du jour s'affiche par canal
  (« 12 / 20 »), il ne cache rien : **on peut le dépasser**, la barre passe au
  vert et les cent lignes restent cent.
- **Relances & discussions** — des gens déjà touchés. C'est un *calendrier* :
  **la semaine qui vient est toujours affichée**, jours vides compris (sinon ce
  n'est plus un calendrier mais une liste, et on ne voit pas qu'il n'y a rien
  jeudi), plus les journées lointaines qui portent quelque chose — une mise de
  côté à trois mois garde sa case. Chaque ligne à la date où elle est réellement
  due, l'échu replié sur aujourd'hui. **Aucun plafond** : répondre à quelqu'un
  qui a réagi ne se rationne pas.

La frontière n'est pas une heuristique : `entreprises.premiere_touche_le`, posé
une seule fois par la première tâche bouclée — la même colonne qui sert à
comparer les cohortes. Le compteur d'objectif lit la même chose : il compte les
entreprises *abordées aujourd'hui*, jamais les relances.

### Des filtres qui se cumulent

Canal, signal, cohorte et étape sont quatre dimensions, chacune avec sa barre.
Cocher « Chauds » ne fait plus perdre le canal. Et la ligne porte **tous** ses
signaux : un prospect peut afficher « a répondu » *et* « chaud ».

### « Appeler plutôt »

Sur chaque ligne (icône téléphone au survol) et sur la carte d'action au centre :
un clic et la tâche devient un appel. La bascule change le canal et rien d'autre
— même prospect, même étape, même séquence, même identifiant. Le texte préparé
par le moteur reste : l'accroche WhatsApp écrite pour ce prospect est très
exactement ce qu'on a à lui dire de vive voix. Sans numéro connu, la bascule
refuse plutôt que d'envoyer la fiche dans une file d'appels où elle serait
injoignable.

Une carte de tête a existé dans le rail, qui reprenait le prospect en cours en
grand. Elle a été retirée : le centre de l'écran affiche déjà ce prospect-là, en
plus complet, à trois centimètres de distance — elle ne disait rien de neuf et
mangeait la place de la liste, la seule chose que le rail sache faire mieux que
le reste de l'écran.

## Migration

`sql/20260821_agent_sattribue_ses_prospects.sql` — ajoute
`agent_settings.can_self_assign` (défaut `false`). Aucun agent existant ne gagne
quoi que ce soit : il faut une décision explicite depuis la page Agents.
