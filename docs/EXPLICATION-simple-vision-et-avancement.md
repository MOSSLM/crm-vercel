# Le CRM expliqué simplement

> Ce document dit la même chose que `VISION-crm-segments-et-lots.md`, mais sans
> aucun mot technique. Si tu veux les détails précis (fichiers, lignes de code,
> chiffres exacts), c'est dans l'autre document. Ici, c'est l'histoire.

---

## 1. L'histoire, en une phrase

On a une immense pile de fiches sur des entreprises (des plombiers, chauffagistes,
électriciens...). On veut trouver celles qui ont un mauvais site internet — ou pas
de site du tout —, leur montrer qu'on peut leur en faire un beau, et leur vendre.

## 2. Le grand classeur mélangé

Imagine 60 000 fiches papier. Mais :

- **Beaucoup sont en double.** La même entreprise a été notée par 4 personnes
  différentes (4 façons de trouver des entreprises : Google Maps, une recherche
  Google, un réseau de pros, et un fichier officiel de l'État). Chacune a écrit
  des choses différentes sur la même fiche.
- **Certaines fiches ont des trous.** Pas de téléphone, pas de site, pas de nom
  du patron...
- **Le pire : un trou ne veut pas toujours dire la même chose.** Une case vide
  peut vouloir dire *« il n'y a vraiment rien »* ou *« on n'a jamais vérifié »*.
  Aujourd'hui, les deux se ressemblent, et ça nous a déjà trompés une fois cette
  semaine (voir plus bas).

**Le rêve :** avoir UNE fiche propre par entreprise, qui garde le meilleur de
chaque source, et qui dit toujours clairement pour chaque information : *on sait
que c'est vrai*, *on sait que c'est faux*, ou *on n'a pas encore regardé*.

## 3. Chercher et faire des paquets

Une fois les fiches propres, on veut pouvoir :

- **Chercher facilement**, par exemple : *« montre-moi tous les plombiers de
  Rennes qui n'ont pas de site et qui ont un numéro de mobile »*.
- **Faire des paquets** (qu'on appelle des « lots ») d'entreprises à contacter
  cette semaine.
- Il y a une règle très importante à ce sujet :
  - Une **recherche** est vivante : si on cherche *« sans site »* et qu'une
    entreprise se fait un site entre-temps, elle disparaît toute seule de la
    liste — normal, elle n'est plus « sans site ».
  - Un **paquet** (lot), lui, ne bouge plus une fois fait. Même si on apprend
    de nouvelles choses sur une entreprise après, elle reste dans son paquet.
    Pourquoi ? Pour pouvoir comparer deux paquets plus tard, sur la même base,
    sans que les chiffres bougent sous nos pieds pendant qu'on mesure.

## 4. Le kit à envoyer

Pour chaque entreprise du paquet, on prépare :

- **Un site de démonstration** : à quoi ressemblerait SON futur site.
- **Une brochure** (petit document) avec nos prix, nos points forts, et une
  photo de SON site de démo.

## 5. Le carnet de suivi

Pour chaque entreprise contactée, il faut voir tout de suite :

- Où elle en est (jamais contactée ? a répondu ? a demandé qu'on rappelle à
  15h ?).
- Quand la relancer.
- Il ne faut **jamais** en perdre une de vue parce qu'on a oublié.

## 6. Le tableau qui compte

On veut voir, comme un escalier :

- Combien d'entreprises au départ,
- combien arrivent à l'étape « on leur a envoyé quelque chose »,
- combien arrivent à l'étape « elles ont répondu »,
- ... jusqu'à « elles ont payé ».

Et à **chaque marche** de l'escalier, combien on en perd — pour savoir où ça
coince vraiment, plutôt que de deviner.

---

## Où on en est, sur 10

Chaque grande partie du rêve, notée sur 10 (10 = un agent peut s'en servir
aujourd'hui sans que personne ne bidouille) :

| Partie du rêve | Note |
|---|---|
| Une fiche propre par entreprise (fusionner les doublons) | **4 / 10** |
| Chercher et trier facilement | **3 / 10** |
| Faire des paquets qui ne bougent plus | **5 / 10** |
| Savoir « vrai / faux / pas-encore-regardé » sur chaque info | **4 / 10** |
| Le tableau de bord du jour (quoi faire maintenant) | **5 / 10** |
| Comment on contacte (appel, message, mail) | **6 / 10** |
| Le kit à envoyer (site démo + brochure) | **7 / 10** (a bien avancé) |
| Le tableau qui compte les pertes | **6 / 10** |

**Moyenne : un peu plus de 4,5 sur 10.** Je n'ai pas refait le calcul complet
cette fois (ça prend du temps) — cette moyenne date d'avant les dernières
retouches, sauf pour « le kit à envoyer » qui a clairement progressé depuis.

---

## Ce qu'on a construit cette semaine

### Le tableau qui compte (l'escalier)

Avant, il n'existait pas du tout : on ne savait pas où on perdait des
entreprises en cours de route. Maintenant on le voit, marche par marche.

### Les deux paquets de la campagne

On a marqué « cette entreprise fait partie du paquet A (site faible) ou du
paquet B (pas de site) », et « on l'a contactée pour la première fois tel jour ».
Ça permet de comparer les deux paquets **au même âge** (après 1 jour, après 3
jours...) plutôt qu'à une date fixe, ce qui serait injuste — un paquet démarré
plus tôt aurait toujours l'air en avance.

### Des réglages qui mentaient

- On pouvait envoyer 100 messages par jour dans la tête, mais le programme
  était bloqué à 60 sans que ça se voie. Corrigé.
- Un message à envoyer, s'il était resté vide par oubli, partait quand même
  vide. Maintenant, il s'arrête et prévient au lieu de partir vide.
- Le tableau de bord annonçait de faux chiffres à quatre endroits (par exemple
  « 500 affaires » alors qu'il y en avait 880 réellement). Corrigé.

### Le tableau de bord du jour

- On peut chercher une entreprise par son **nom** et par son **numéro de
  téléphone**.
- Les appels « à froid » (sans rendez-vous pris) entrent maintenant dans la
  liste des tâches du jour — avant, ils étaient oubliés.

### Les sites de démo pour ceux qui n'ont rien

Pour une entreprise sans logo, on écrit maintenant son nom dans une jolie
police plutôt que de ne rien montrer.

### Le plus gros morceau : le kit à envoyer

- **Avant** : la brochure ne parlait à personne en particulier — pas de nom,
  pas de photo de LEUR site. Un même document générique pour tout le monde.
- **Maintenant** : chaque entreprise peut avoir SA brochure, avec son nom et
  une photo de son futur site dedans.
- On peut aussi l'imprimer en PDF (comme quand tu imprimes n'importe quelle
  page internet et que tu choisis « Enregistrer en PDF »).
- Et on voit maintenant, dans le grand tableau des entreprises, si la brochure
  a été **envoyée** et **regardée** — avant, cette information existait déjà
  dans les coulisses mais n'était affichée nulle part, donc personne ne
  pouvait s'en servir.

---

## Ce qu'il reste à faire

Dans l'ordre d'importance :

1. **Nettoyer et fusionner les fiches en double.** C'est la base de tout, et
   ça n'a pas bougé. Tant que ce n'est pas fait, tout le reste travaille sur
   des fiches parfois sales.
2. **La recherche avancée** (« tous les plombiers sans site avec un mobile »)
   n'existe presque pas encore à l'écran, même si une bonne partie du moteur
   qui pourrait la faire tourner existe déjà, caché, sans bouton pour s'en
   servir.
3. **Sauvegarder une recherche** pour la refaire en 1 clic plus tard —
   n'existe pas du tout.
4. **Dire clairement « vérifié vide » vs « jamais vérifié »** sur beaucoup de
   cases — c'est le trou le plus dangereux : c'est exactement lui qui nous a
   fait croire, au début de la semaine, que 448 entreprises avaient un
   mauvais site, alors que pour la plupart, on n'avait simplement jamais
   réussi à regarder leur site.

## Ce qui dépend de toi, pas du code

- L'envoi automatique des messages est encore **en pause** — il faut l'activer
  quand tu es prêt.
- Personne n'a encore écrit **les textes** des emails de relance.
- Les appels doivent être marqués **« fait »**, pas « passé » — sinon rien
  n'est compté dans le tableau qui compte.
- Il faut **lancer la fabrication des sites de démo** pour les entreprises
  sans site — tu le fais toi-même, en sélectionnant les lignes dans le grand
  tableau.
