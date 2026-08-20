# lemlist — l'essence, en huit points

> Ce fichier est la tête du dossier. Les autres décrivent *ce que* lemlist fait ;
> celui-ci dit *pourquoi ça marche*, et ce que chaque principe exige de nous.
> Relevé les 18 et 19 août 2026 sur lemlist.com, help.lemlist.com et l'application
> publique. Les chiffres de comparaison viennent de notre base de production, mesurée
> le 19 août 2026.

lemlist n'a pas gagné parce qu'il envoie des e-mails — tout le monde envoie des
e-mails. Il a gagné sur la **forme** : la façon dont le travail est découpé en objets,
et l'ordre dans lequel les écrans posent leurs questions.

C'est exactement ce qui nous manque. Notre moteur est bon — régulateur pur et testé,
branches, ancrage, vérificateur d'adresses, disjoncteur de rebonds, pipeline dérivé
plutôt que stocké. Ce qui manque n'est pas de la mécanique.

---

## 1. La campagne est l'unité de travail

Chez lemlist, une **campagne** contient quatre choses et se lit en quatre onglets :

```
Séquence          Liste de leads       Lancement           Performance
« ce qu'on dit »  « à qui on le dit »  « quand on le dit »  « ce que ça a donné »
```

Rien d'autre n'existe à ce niveau. On ne « crée pas une séquence » puis « on y inscrit
des gens » depuis un autre écran : on crée une campagne, et la séquence en est une
face.

**Ce que ça exige de nous.** Notre `automations` (kind=`sequence`) porte déjà la
séquence, les réglages, les plages d'envoi, le public visé, l'accès par agent. **Il n'y
manque qu'une chose : la liste.** Aujourd'hui on inscrit un prospect depuis quatre
écrans différents — marketing pipeline, pipeline commercial, poste de démarchage,
espace agent — et personne ne peut répondre à « qui est dans cette campagne ».

C'est la différence structurante. Tout le reste en découle.

---

## 2. Le multicanal, c'est **une seule séquence** qui change de canal

Pas un outil e-mail à côté d'un outil LinkedIn à côté d'un composeur. Une ligne, un
compteur, une conversation — et le canal n'est qu'un attribut de l'étape.

> « Every customer journey is different. With lemlist, connect across multiple
> channels, on autopilot, from one synced campaign. »

**Ce que ça exige de nous.** Notre `SeqStepKind` porte déjà
`email | linkedin | whatsapp | call | wait | task` : le modèle est bon. Ce qui manque,
c'est que les écrans le reflètent — un canal ne doit jamais avoir « son » écran. C'est
précisément ce qui a éclaté notre prospection en quatre surfaces.

---

## 3. La condition remplace le calendrier

C'est le point le plus sous-estimé. Une séquence lemlist n'est pas une suite de J+n :
c'est un arbre. Treize conditions branchent la suite sur le comportement du prospect,
avec **deux temporisations** :

| Mode | Comportement |
| --- | --- |
| **Within X jours** | On surveille pendant X jours ; dès que c'est vrai, on avance sur OUI. À l'échéance, on part sur NON. |
| **Wait until** | On attend indéfiniment que ce soit vrai. |

Et lemlist impose une règle qui a l'air anodine et qui ne l'est pas : **une condition
demande au moins un jour de délai** avant d'être évaluée — sinon on teste « a-t-il
ouvert ? » avant qu'il ait eu le temps d'ouvrir.

**Ce que ça exige de nous — et la leçon la plus chère du dossier.** Nous avons déjà
*une* bifurcation : l'attente-réponse (`waitMode: 'reply'`). Mais notre équivalent de
*Wait until* (`replyTimeoutDays: 0`) **gèle l'inscription sans rien afficher** :
`processWaitStep` pose `next_run_at = null`, et rien ne la réveillera jamais. Au
19 août, **59 inscriptions dorment là-dedans** — les prospects qui n'ont pas répondu au
premier WhatsApp ne seront jamais relancés, et aucun écran ne le dit.

Chez lemlist, *Wait until* existe aussi. La différence est qu'il **se voit** : le lead
apparaît dans la liste de la campagne avec son statut. Un état invisible est un état
qui n'existe pas.

---

## 4. Une seule boîte de réception

Le canal disparaît de la vue. Il ne reste qu'**une conversation par lead**, tous
expéditeurs et tous canaux confondus, avec un statut (Intéressé / Pas intéressé /
Désabonné) et la possibilité de répondre par n'importe quel canal depuis le fil.

> « No matter the channel, account, or sending email - see all interactions with a
> lead in a single, streamlined view. »

Les trois problèmes que lemlist dit résoudre là sont mot pour mot les nôtres :
ne pas savoir où en est une conversation ; ne pas être aligné avec ce qu'un
coéquipier a fait ; ne pas pouvoir agir vite sans changer d'outil.

**Ce que ça exige de nous.** Le fil existe déjà — `email_logs` porte l'e-mail, le
WhatsApp et les notes, avec l'issue et l'étape. Il manque deux choses : un écran qui le
présente comme une conversation, et **de quoi recevoir** : aujourd'hui rien n'entre,
aucune table ne stocke un message reçu.

C'est aussi ce qui répond à « je ne vois pas les notes que Bilal a posées » : chez
lemlist, la conversation porte tout ce que l'équipe a fait, à sa date.

---

## 5. La tâche manuelle est un citoyen de première classe

lemlist n'automatise pas tout et l'assume. Ce qui ne s'automatise pas — un appel, un
commentaire sur un post — devient une **tâche** : planifiée, assignée, filtrable,
comptée, avec ses six types (appel, e-mail, LinkedIn, WhatsApp, SMS, manuelle) et ses
cinq statuts (à faire, à venir, en pause, faite, ignorée).

Trois détails qui font la différence à l'usage :

- **les tâches sont un tableau**, avec colonnes configurables, filtres cumulables en
  pastilles éditables (ET/OU imbriqués) et **vues sauvegardées** nommées ;
- **« Terminer » ferme la ligne et descend à la suivante** — la tâche suivante du même
  prospect reprend sa place dans la file **à sa date**, elle ne double personne ;
- **les actions de masse** existent : terminer, ignorer, reporter, changer de
  propriétaire, changer la priorité, sur une sélection.

**Ce que ça exige de nous.** `prospection_tasks` a déjà les types et les statuts, et
`task-routing.ts` sait à qui donner la tâche. Ce qui manque : le tableau, les vues, et
surtout l'enchaînement — aujourd'hui, marquer une tâche « faite » renvoie sur une
nouvelle carte du **même** prospect au lieu de passer au suivant.

---

## 6. La délivrabilité est un produit, pas une case à cocher

lemlist en fait trois sections à part entière (Deliverability Setup, Inbox Delivery,
Monitoring & Alerts) et un produit séparé qu'il intègre, **lemwarm** : réchauffage des
boîtes, rotation des expéditeurs, plafonds par boîte, domaine de suivi, contrôle DNS
(SPF, DKIM, DMARC), alertes, vérification de la liste avant envoi.

Leur règle de volume mérite d'être retenue telle quelle : **le total d'une boîte, c'est
la chauffe + la prospection + les réponses à la main.** Une boîte neuve encaisse peu ;
on monte progressivement ; si l'on veut du volume, on ajoute des boîtes plutôt que de
pousser une seule.

**Ce que ça exige de nous.** La mécanique est là — vérificateur d'adresses,
suppressions, disjoncteur de rebonds, sonde de domaine, plages et plafonds. Manquent
l'**écran**, le **réchauffeur**, et un **plafond par boîte** (le nôtre est global).
Le seul endroit du dépôt qui nomme le besoin est un preset du régulateur :
*« Prudent — boîte neuve, domaine à chauffer »*.

---

## 7. On mesure un entonnoir de leads, pas un volume d'envois

Leurs rapports comptent des **leads qui changent d'état**, pas des messages :

```
Contacté → Délivré → Ouvert → Cliqué → Répondu → Intéressé
```

et, à côté, un entonnoir d'**incidents** : non délivré, pas intéressé, désabonné.

Le point crucial est que **c'est une partition** : un lead est à **un seul** étage — le
plus loin qu'il ait atteint. On ne l'additionne pas deux fois.

**Ce que ça exige de nous.** Nos compteurs de file additionnent délibérément un même
prospect sous chaque signal qu'il porte (`countBySignal` : « la somme des pastilles
peut dépasser le nombre de lignes, et c'est exact »). Arithmétiquement vrai,
illisible à l'usage : « en attente » et « à appeler » comptent le même prospect deux
fois, et on ne sait plus combien de gens il y a.

La réconciliation est simple et c'est celle de lemlist : **les signaux restent des
filtres cumulables, les compteurs deviennent une partition.**

À garder, en revanche : notre comparaison de cohortes **au même âge** (J+1, J+3, J+7,
J+14) est meilleure que ce que fait lemlist, qui compare à date fixe.

---

## 8. On ne part jamais d'une page blanche

Trois départs, jamais un éditeur vide : un **modèle** de la bibliothèque, la
**duplication** d'une campagne existante, ou **décrire son objectif en une phrase** et
laisser l'IA assembler la campagne (lemAgent) — qui livre le résultat **dans
l'éditeur standard**, à valider avant lancement.

Et rien ne part sans avoir été vu : l'onglet Lancement montre le nombre de leads,
**l'aperçu par lead**, le calendrier et les conditions d'arrêt.

**Ce que ça exige de nous.** Nos cinq séquences en brouillon sont déjà des modèles qui
s'ignorent, et `/api/automations/preview` sait **déjà** rendre un message sur un vrai
prospect. Il manque de les présenter au moment où l'on crée.

Attention toutefois : leur catalogue par défaut ne nous va pas. Le modèle « 30 jours
équilibré » compte quatre e-mails, et **75 de nos 905 entreprises attribuées** ont un
contact nominatif avec adresse. Le mettre en tête, ce serait proposer une séquence
impossible à 92 % du fichier. Le catalogue se range selon le parc, pas selon leur
page d'accueil.

---

## Ce que lemlist ne sait pas faire, et nous si

Adopter leur forme ne veut pas dire tout leur concéder.

| Ce qu'on a | Pourquoi ça compte |
| --- | --- |
| **Le tri-état** (`constats_presence`) | « Site absent, vérifié » et « on n'a pas regardé » ne s'écrivent pas comme le même vide. lemlist ne connaît que présent/absent. Un enrichissement qui conclut « pas de site » est une information, pas un échec. |
| **La capture du site du prospect** (`capture_url`) | Leur image personnalisée est un prénom incrusté sur un tableau blanc. Nous stockons la photo du site réel de l'artisan. Lui montrer son propre site daté, à côté de la démo qu'on lui a faite, n'a pas d'équivalent chez eux. |
| **L'audit mesuré** | Des notes sur 100 avec leurs preuves, un PDF, un rapport public à jeton. lemlist n'a rien qui ressemble à un support de vente fabriqué par l'outil. |
| **L'explorateur à 25 familles de filtres** | Sur 60 445 entreprises, avec facettes et compteurs exacts. Leur base de leads est plus grosse ; notre filtrage est plus fin sur notre marché. |
| **La comparaison de cohortes au même âge** | Comparer deux campagnes lancées à des dates différentes n'a de sens qu'à âge égal. |
| **La séparation segment / lot** | Le segment est une requête nommée qui bouge ; le lot est une photo qui ne bouge plus. C'est ce dénominateur stable qui rend une campagne mesurable. |

---

## Les six griefs d'usage, et leur réponse

Relevés par Matteo le 19 août 2026 sur la page Démarchage actuelle.

| Le grief | La réponse de lemlist | Le principe |
| --- | --- | --- |
| Trop chargée, trop rigide ; la barre de gauche filtre mal | Tableau, colonnes configurables, filtres en pastilles, vues sauvegardées | § 5 |
| Les chiffres du haut comptent deux fois le même prospect | L'entonnoir est une partition ; les signaux restent des filtres | § 7 |
| « Fait » renvoie sur une nouvelle carte du **même** prospect | « Terminer » descend à la ligne suivante | § 5 |
| On reste cantonné à sa carte, sans vue d'ensemble | Trois niveaux : Rapports, Liste de leads, Tâches | § 1 et § 7 |
| Après le premier contact et l'appel, c'est le flou | Les conditions branchent, et **chaque branche a une fin explicite** | § 3 |
| Je ne vois pas les notes de Bilal | La conversation porte tout, tous canaux, tous coéquipiers | § 4 |

Sur l'avant-dernier, une précision qui compte : **le flou n'est pas dans le pipeline
commercial, il est dans les séquences.** Nos six séquences font cinq à sept étapes et
finissent sur un appel. Il n'y a littéralement rien après. Un pipeline ne peut pas
montrer une suite qui n'a pas été écrite.

---

## Voir aussi

- [`01-notes-brutes.md`](01-notes-brutes.md) — la capture page par page, verbatim
- [`02-fonctionnalites.md`](02-fonctionnalites.md) — l'inventaire complet
- [`03-architecture.md`](03-architecture.md) — leurs sections face aux nôtres
- [`04-modele-de-donnees.md`](04-modele-de-donnees.md) — objets, statuts, conditions
- [`05-sequences-et-modeles.md`](05-sequences-et-modeles.md) — les modèles, étape par étape
- [`06-design.md`](06-design.md) — palette, typographie, grammaire d'écran
- [`07-notre-mapping.md`](07-notre-mapping.md) — où vont nos 905 prospects
