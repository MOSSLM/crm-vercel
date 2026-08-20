# Où vont nos prospects dans le modèle lemlist

> La question posée : « t'as bien trouvé une place pour chacun de mes leads, en mode
> ils vont pas être perdus dans leur avancée ? »
>
> **Réponse : oui, et la partition tombe juste — mais l'univers de départ était trop
> petit de 127 leads, et la preuve de réponse ne vit pas là où on la cherchait.**
>
> Mesuré en production le 19 août 2026, puis **contredit** par une passe adversariale
> (six agents, dont deux chargés de casser la partition). Les chiffres ci-dessous ont
> été rejoués à la main après cette passe. Ils vieillissent : la méthode reste.

---

## 1. Les trois corrections que la vérification a apportées

### a. L'univers n'est pas 905, il est 1 032

Compter « les entreprises attribuées » laissait dehors **121 opportunités vivantes dont
l'entreprise n'a pas de propriétaire** — étape « Qualifié », réparties sur cinq
pipelines. Elles ne figurent dans **aucun tableau** : les boards filtrent par
propriétaire. Elles n'ont ni tâche, ni inscription, ni la moindre touche : rien à
perdre, mais tout à récupérer.

| Ensemble | Effectif |
| --- | --- |
| Attribuées, vivantes | 905 |
| **Opportunité vivante, entreprise sans propriétaire** | **121** |
| Non attribuées, trace résiduelle | 2 |
| Archivées portant un historique (dont 2 avec un appel encore en attente) | 3 |
| Référencée nulle part sauf dans le journal d'activité | 1 |
| **Total** | **1 032** |

### b. La preuve de réponse n'est pas là où on la cherche

`sales_pipeline_state.replied` vaut **`false` sur 153 lignes sur 153**. La réponse d'un
prospect vit dans **`sequence_enrollments.vars.replies`**, et nulle part ailleurs.

Ma première mesure, adossée à `replied` et aux notes, comptait **6 prospects ayant
réagi**. La vraie mesure en compte **55**.

> Un garde-fou assis sur `replied` classerait 49 personnes qui ont répondu parmi les
> silencieux, et les renverrait en premier contact. C'est très exactement « perdre
> l'avancée ».

### c. Une alerte vérifiée, et écartée

La passe adversariale annonçait : « le moteur relance 39 personnes qui ont répondu ».
Je suis allé voir étape par étape — **c'est le fonctionnement voulu, pas un bug** :

| Étape | Ont répondu | Relance programmée | Ce que c'est |
| --- | --- | --- | --- |
| `s4` (attente 3 j) | 34 | oui | l'appel qui suit l'envoi de la démo |
| `s5` (appel) | 5 | oui | l'appel lui-même |

La séquence est conçue pour que la réponse **fasse avancer** (« je suis bien avec X ? »
→ réponse → envoi de la démo → appel), d'où `exitOnReply: false`, posé exprès. Le
rapport lisait `definition` au lieu de `settings`. Rien à corriger.

---

## 2. La table de placement

| # | Destination | n | Ce qui est conservé |
| --- | --- | --- | --- |
| **A** | **Reprise commerciale** — a répondu, pris RDV, ou est mis de côté avec une date | **55** | L'inscription reste **en l'état** : `current_step`, `vars.replies`, `anchor_at`. Aucune réinscription. |
| **B** | **Sortie définitive** — refus, blacklist, désabonnement | 6 | Le motif et l'historique |
| **C1** | **Inscription figée, jamais partie** (`current_step = 0`, aucun gel) | 18 | Rien à conserver : rien n'est parti. Entrée légitime à l'étape 1 d'un nouveau modèle |
| **C2** | **Inscription gelée sur l'attente sans délai** | **59** | `current_step`, `entered_at`, `vars.replies`. Reprise **à `s3` au plus tôt, jamais à `s1`** |
| **D** | **« Touché » sans inscription vivante** | 11 | Dont **10 dont le numéro n'a pas de compte WhatsApp : rien ne leur est parvenu**. Ils repartent en appel, pas en reprise |
| **E** | Modèle 1 — WhatsApp + appel | 269 | — (jamais touchés) |
| **F** | Modèle 2 — e-mail entreprise + appel | 241 | — |
| **G** | Modèle 3 — appel seul | 173 | — |
| **H** | Modèle 4 — équilibré 30 j | 26 | — |
| **I** | Enrichissement — aucun canal | 44 | Dont 7 portent pourtant un « Appel à froid » en attente |
| | **Sous-total attribuées** | **905** | |
| **J** | Orphelines qualifiées, à réattribuer | 121 | Rien à perdre : 0 tâche, 0 inscription, 0 touche |
| **K / Z / L** | Trace résiduelle, archivées avec historique, fiche isolée | 6 | Tâches à passer en « ignorée », jamais à supprimer |
| | **TOTAL** | **1 032** | |

Aucun doublon, aucun lead sans case.

---

## 3. Ce qui empêche encore de lancer

Ce ne sont pas des détails de migration : ce sont les raisons pour lesquelles une
campagne lancée demain ne partirait pas, ou partirait mal.

| n | Le problème | Ce qu'il faut avant |
| --- | --- | --- |
| **686** | **Ni démo publiée, ni audit.** Les modèles e-mail promettent l'un ou l'autre ; les gardes `etapePromettUnAuditAbsent` et `etapePromettUneDemoAbsente` **gèleraient la campagne en masse** au lieu de l'envoyer. Le garde-fou fait son travail — mais 686 leads sur 905 n'ont rien à montrer. | Produire le support **avant** d'inscrire, ou n'ouvrir que les modèles qui ne promettent rien |
| **133** | **Site vérifié absent**, et la seule accroche WhatsApp existante dit « une version plus vendeuse de **votre** site ». | Écrire l'accroche « création » — elle **n'existe pas** |
| **326** | **Aucune cohorte.** Rien ne permet de choisir entre « refonte » et « création ». | Router sur `constats_presence` (qui sait dire *absent vérifié* contre *inconnu*) plutôt que sur `cohorte_demarchage`, qui n'est renseignée que sur 579 fiches |
| **55** | `enrollInSequence` écrit **`current_step: 0` en dur** : réinscrire un lead engagé efface `vars.replies` et remet l'ancre à zéro. | Aucun lead de A ou C2 ne repasse par `enrollInSequence` |
| **631** | Tâches d'appel **sans inscription**, toutes en retard. L'avancée du parc ne vit donc **pas** dans le moteur : 531 entreprises ont une tâche en attente et aucune inscription. | Les passer en « ignorée » **avant** d'inscrire — jamais les supprimer |
| **17** | Entreprises ayant **déjà reçu l'accroche 2 à 4 fois** : l'unicité de tâche est `(inscription, étape)`, donc une nouvelle inscription la renvoie. | Garde **par entreprise**, pas par étape |
| **6** | Tâches mises de côté, réveils tous **futurs** (25/08 → 17/09) : les six leads les plus chauds. | Ne jamais toucher au statut « mise de côté » |
| **1** | Un chemin de code (`unassignProspectFromAgent`) **supprime** les tâches en attente au lieu de les ignorer, et ne regarde ni l'étape ni les réponses. Les 121 orphelines vont justement passer par là. | Corriger avant la réattribution |
| **1** | La signature **« Bilal » est en dur** dans les modèles, alors que 561 des 905 fiches appartiennent à Matteo. Un envoi est déjà parti signé du mauvais nom. | `{{owner.first_name}}` |

---

## 4. L'ordre des opérations

Chaque étape a sa sonde, et la sonde doit rendre le résultat attendu avant de passer à
la suivante.

| # | Étape | Sonde |
| --- | --- | --- |
| 0 | **Archiver** les cinq tables concernées — le déclencheur `updated_at` détruit la preuve | mêmes comptes qu'en production |
| 1 | **Éteindre le moteur** sur la séquence active, sinon la migration lui court après | `status = off`, 0 inscription due |
| 2 | **Écrire la voie silence** *(puis seulement)* poser le délai et réveiller par paquets | plus aucune inscription vivante sans `next_run_at` |
| 3 | **Réattribuer** les 121 + les cas isolés | 0 opportunité vivante sans propriétaire |
| 4 | **Neutraliser** les 631 tâches d'appel orphelines → « ignorée » | 0 orpheline, 0 sur fiche archivée |
| 5 | **Verrou d'exclusivité** : un lead dans une seule campagne de premier contact | 0 entreprise à deux inscriptions vivantes |
| 6 | **Peupler `campagne_leads` sans inscrire personne** | total = distincts = 1 032, et 0 « premier contact » ayant déjà été touché |
| 7 | **Vérifier le support** avant d'ouvrir les modèles qui promettent audit ou démo | 0 sur le paquet inscrit |
| 8 | **Inscrire par paquets de ~20**, avec contrôle après chaque paquet | 0 doublon de message sur 24 h |

> **L'ordre 2 n'est pas négociable** : les 59 gelées sont arrêtées juste avant « Très
> bien, je me suis permis de faire une version plus vendeuse de votre site » — un texte
> qui acquiesce à une réponse. Poser le délai avant d'écrire la voie silence l'envoie à
> 59 personnes qui n'ont rien dit.

---

## 5. Ce qui demande un arbitrage humain

1. **Les 121 orphelines : à qui ?** Aujourd'hui 561 fiches à Matteo, 344 à Bilal.
2. **Qui écrit l'accroche « création »**, et sur quel signal on route — `constats_presence`
   (mesuré, à trois états) ou `cohorte_demarchage` (renseigné sur 579 fiches sur 1 032) ?
3. **Six sorties « définitives » à relire à l'œil** : l'une porte `pas intéressé` alors
   que la note de l'agent dit de rappeler à la rentrée.
4. **Aucun e-mail de prospection n'est jamais parti de ce CRM.** Les quatre lignes
   existantes sont des confirmations de rendez-vous. Les modèles 2 et 4 (267 leads)
   reposent sur une chaîne d'envoi jamais éprouvée — domaine, réputation, suppressions
   à valider sur un premier lot très court.
