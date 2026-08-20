# Couche 8 — Signaux, lemAgent, et l'espace agent

*20 août 2026.*

Trois choses livrées le même jour, et une seule idée commune : **montrer sans
agir**. Une veille pose une ligne, un assistant chiffre une proposition, un
espace agent affiche un périmètre — aucun des trois n'envoie quoi que ce soit.

---

## 1. Les veilles

> Une veille = un périmètre + un déclencheur. Elle **montre**, elle n'agit
> jamais : aucune inscription, aucun envoi, aucune tâche.

C'est délibéré, et c'est la leçon de la couche 0 : 59 inscriptions ont dormi des
semaines parce qu'un mécanisme avançait sans que personne le voie. Un signal qui
déclencherait un envoi referait la faute, en pire — il partirait. Verser dans une
campagne reste un geste humain, depuis la campagne.

### La difficulté réelle : nos sources sont des états, pas des événements

« Son RGE expire dans 90 jours » est vrai aujourd'hui, demain, et tous les jours
jusqu'à l'échéance. Une veille qui relit l'état à chaque passe ressort les mêmes
98 entreprises indéfiniment — et un écran qui répète est un écran qu'on cesse de
lire.

`veille_constats` est la mémoire qui convertit l'état en événement, du point de
vue du CRM : **la première fois que NOUS l'avons vu**. L'unicité
`(veille_id, entreprise_id)` fait tout le travail, et l'idempotence est une
**insertion** qui échoue — pas une lecture préalable, exactement comme
`email_logs.message_id` pour la réception.

D'où la conséquence à écrire noir sur blanc :

> ⚠️ **La première passe est une reprise, pas une veille.** Elle ramasse
> l'arriéré. 220 sites injoignables ne sont pas tombés cette nuit, et afficher
> « 220 signaux » le lendemain de la création serait un mensonge par
> présentation. La colonne `reprise` porte la distinction, l'écran la dit, et il
> la dit **ligne à ligne** — un avertissement en en-tête ne se relit pas.

### Le catalogue, avec sa densité mesurée le 20/08

| Déclencheur | Nature | Attribuées | Parc | Ce que ça permet de dire |
| --- | --- | ---: | ---: | --- |
| RGE périmé | signal | 2 | — | Son site affiche peut-être un logo qui n'est plus valable |
| Rapport ou plaquette ouvert | signal | 3 | 3 | Il a ouvert ce qu'on lui a envoyé — le seul signal d'intention du CRM |
| RGE qui expire sous 90 j | signal | 98 | 7 948 | Il va renouveler : son site et sa plaquette doivent être à jour |
| Site injoignable | signal | 220 | 314 | Son site ne répond pas — mais il faut la **cause**, pas le constat |
| Note d'audit sous 50 | **segment** | 305 | — | Le site existe et il est mauvais : la cohorte A |

**Un déclencheur qui touche un tiers du parc n'est pas un signal, c'est un
segment.** 305 sur 908 ne se traite pas au fil de l'eau, ça se verse dans une
campagne. L'écran range les deux séparément, sinon le rapport ouvert (3 sur tout
le parc) se noie dans le stock.

### Ce qu'on ne sait pas voir, et pourquoi

Le plan nommait quatre veilles. Deux sont **impossibles**, et la mesure le dit :

- **La note d'audit qui chute.** `entreprises_audit_site` a **une seule ligne par
  entreprise** — sa clé primaire est `entreprise_id`. Chaque analyse écrase la
  précédente : il n'existe aucune note d'avant, donc aucune chute à constater.
  Il faudrait une table d'historique ; `entreprises_audit_psi` a la bonne forme
  mais ne porte que 24 lignes.
- **Le site qui vient de tomber.** `constats_presence` garde bien un historique,
  mais il enregistre **qui a dit quoi**, pas ce que le monde a fait. Mesuré : les
  **159 transitions « présent → absent » sont toutes survenues le même jour, à
  zéro heure d'intervalle**, entre `dossier-web/*` et `verifier-sites`. Ce sont
  deux bots qui se contredisent, pas 53 sites tombés. Une veille bâtie là-dessus
  tirerait 159 fausses alarmes.
- **L'intention GA4.** `intentBySite` interroge l'API en direct et ne stocke
  rien (cache de 60 s posé pour le quota). Une passe sur 908 entreprises le ferait
  exploser. Le signal existe déjà là où il sert : la pastille « Chauds » de la
  file de démarchage.
- **Le concurrent détecté.** Rien ne relève l'agence qui a fait le site ;
  `entreprises_audit_site.detail` porte la technologie, jamais le prestataire.

Les quatre restent **à l'écran**, grisées, avec leur raison et ce qu'il faudrait
construire. C'est ce qui évite de les redemander tous les trimestres.

### Pas de segment sur une veille, et c'est mesuré

Le plan dit « une veille = un segment + un déclencheur ».
`segments_entreprises` porte **zéro ligne** : brancher le filtre aujourd'hui
serait construire pour personne. La colonne `segment_id` est en base pour le
jour où ; en attendant, `perimetre` porte la seule distinction qui sert — les
908 qu'on démarche, ou tout le parc.

### Pas de cron non plus

Une passe est sans risque (elle n'écrit que ses constats), mais la cadence dépend
de la matière : le RGE bouge au trimestre, le rapport ouvert à l'heure. Fixer une
cadence avant d'avoir vu une veille tourner, c'est choisir un chiffre au hasard
et le défendre six mois.

---

## 2. lemAgent — l'assistant assemble, il ne rédige pas

lemlist génère du texte. Ici ce serait le mauvais problème :

- **Les messages existent déjà** — 8 modèles WhatsApp, 7 e-mails, 6 scripts
  d'appel, écrits et relus. « On ne part jamais d'une page blanche » se répond
  par la bibliothèque, pas par la génération.
- **Ce qui manque n'est pas la prose, c'est l'arbitrage.** La faute qu'on commet
  vraiment est de choisir une séquence que le fichier ne peut pas porter :
  « 30 jours équilibré » compte quatre e-mails nominatifs, et **75 entreprises
  sur 908** ont un contact nominatif. Un LLM ne connaît pas ce chiffre.
- **Un texte généré serait relu de toute façon** — il partirait chez de vrais
  artisans. La génération ne fait économiser aucune relecture, seulement de la
  frappe.

Donc : déterministe, éprouvable sans base ni réseau, et il rend des **réserves
chiffrées** plutôt qu'une confiance.

### Il dit ce qu'il n'a pas compris

C'est la seule chose qui rend un analyseur par mots-clés acceptable. Sur
« les plombiers en Gironde sans site » il rend `sans site` compris, et
`plombiers, gironde` **non pris en compte** — parce que ces critères n'existent
pas dans l'explorateur et ne filtrent rien. Avaler « en Gironde » construirait
une campagne nationale en ayant l'air d'avoir obéi.

### Les réserves qu'il produit

- combien de fiches le canal demandé laisse dehors, en clair (« 430 sur 908 » si
  l'on demande l'e-mail) ;
- la part d'adresses nominatives (75 sur 478, soit 16 %) — d'où « le ton doit
  rester d'entreprise à entreprise, pas de prénom en accroche » ;
- cibler les silencieux suppose une voie « sans réponse » écrite ;
- le RGE est une **veille**, pas une audience figée : passer par Signaux.

Et une garantie de forme : **la proposition ne pose jamais une attente sans
délai**. C'est ce qui a gelé 59 inscriptions ; le reproduire dans chaque nouvelle
campagne recréerait le problème à l'échelle. Un test le tient.

---

## 3. L'espace agent — quatre entrées, pas douze

| Entrée | Ce que c'est |
| --- | --- |
| **Ma journée** | Le poste de travail existant (`/espace-agent/demarchage`) : le stock des premiers contacts et le calendrier des relances |
| **Inbox** | Ses conversations — le même écran que l'admin, filtré à ses entreprises |
| **Tâches** | Sa file en tableau, avec ses vues enregistrées |
| **Mes campagnes** | En lecture seule : où en sont ses prospects |

Un agent **ne conçoit pas d'audience** : ni constructeur de campagne, ni
segments, ni délivrabilité. C'est ce qui garde son écran lisible. Les sections
Pilotage, Relation, Téléphonie et SAMA ne bougent pas — ce sont d'autres métiers,
et ils tournent.

### Une lecture, deux écrans

`lireLesFils` et `lireLesTaches` sont partagées entre l'admin et l'agent : le
périmètre est un **paramètre**, pas une seconde route. Deux routes auraient donné
deux définitions de « ce qu'est un fil », qui divergeraient à la première colonne
ajoutée.

### Le périmètre de l'agent est une union, et c'est important

« Ce qui m'est attribué » et « mes entreprises » **ne se recouvrent pas** : le
régulateur attribue des tâches sur des fiches qui ne sont pas au nom de l'agent,
et des tâches détachées (`assignee_id` nul) pendent sur ses propres fiches.
Prendre l'un des deux seulement escamote des lignes **sans que rien à l'écran ne
le dise** — c'est un rappel qui n'est jamais passé. D'où deux lectures réunies
par identifiant (PostgREST ne sait pas exprimer « OU » entre une colonne et un
embed), et six tests qui le tiennent.

### Trois gestes, pas quatre

L'agent peut reporter, ignorer, reprendre. Il ne peut **pas attribuer** : la
réattribution est le filet de sécurité de l'admin. Le mur est côté serveur — la
route relit chaque tâche et compte ce qui tombe hors périmètre — et l'écran ne
fait que ne pas offrir un bouton qui rendrait 403.

Et il ne peut pas **terminer** depuis le tableau, comme l'admin et pour la même
raison : « Fait » pose `premiere_touche_le` et fait avancer l'inscription. Cocher
trente appels faits daterait trente premiers contacts qui n'ont pas eu lieu, et
la comparaison des deux cohortes se lit précisément à l'âge depuis cette date.

### Ce que l'écran a immédiatement rendu visible

Vérifié dans le navigateur le 20/08, sur le compte de Bilal : **122 de ses
prospects, 33 avancent, 71 garées, 47 ont répondu, 18 sorties.**

Et un défaut attrapé là, pas avant : `holdReasonLabel` prend une **date de
réveil** en second argument, et c'est elle qui distingue « en attente de réponse
— relance prévue » d'« attente sans limite — rien ne la réveillera ». En ne la
passant pas, l'écran annonçait **70 impasses** ; il y en a **47**, les 23 autres
ayant une relance prévue. Grouper sur le seul `hold_reason` écrasait les deux cas
dans le pire libellé.

---

## Ce qui n'a pas été fait, et pourquoi

- **LinkedIn** — retiré du lot par Matteo. C'était de toute façon le canal sans
  matière : 2 `linkedin_url` sur 60 456.
- **`/leads` et `/modeles`** — ils **existent**. L'explorateur (25 familles de
  filtres, segments enregistrés, figeage en lot) et la bibliothèque de modèles
  (trois familles, aperçu, « quelles séquences s'en servent ») étaient déjà là ;
  il leur manquait d'être atteignables depuis Prospection. C'est fait, en deux
  entrées de rail. Le dossier d'entreprise existe aussi, à `/companies/[id]` —
  et non `/entreprises/[id]`, qui n'existe pas.
- **La bibliothèque DANS l'éditeur** — le constructeur choisit déjà un modèle et
  l'affiche en aperçu. Ce qui manque encore, c'est d'en **créer** un sans quitter
  l'étape. Petit, et pas fait.
