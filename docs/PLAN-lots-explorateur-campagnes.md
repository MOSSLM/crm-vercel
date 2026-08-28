# Du lot à la campagne — plan du 28/08/2026

> **État : les cinq phases sont livrées le 28/08.** Ce document reste pour le
> RAISONNEMENT — ce qui avait cassé, ce qu'on a mesuré, et pourquoi on n'a pas
> fusionné ce qui en avait l'air. Les mesures et les pièges vivent désormais là
> où on les relira : `CLAUDE.md` pour les deux règles générales,
> `sql/20260828_explorateur_sans_cte_de_filtres.sql` pour le contrôle rejouable.
>
> Une seule chose a été écartée en route, et pour une raison : l'éditeur
> d'étapes n'est pas devenu un onglet de la campagne (voir la phase 4).

Trois sujets, un seul fil : l'explorateur ne répond plus, les lots ne se créent
nulle part, et campagnes et séquences sont deux portes sur la même ligne de
base. Le premier bloque les deux autres — rien de ce qui suit n'est utilisable
tant qu'un écran met trois minutes à s'ouvrir.

---

## 1. Le timeout de l'explorateur : la cause est le `cross join f`

`explorateur_entreprises` est documentée à 2,0 s sans filtre. Mesurée le 28/08
sur `llzrpcbwnqvbrcjjwysm`, elle ne rend plus la main. Et
`/api/entreprises/explorateur` ne déclare **aucun `maxDuration`** : la route
prend le défaut de la plateforme, Vercel la coupe bien avant la réponse. Le 504
n'est pas un caprice réseau, c'est la fonction.

| Mesure | Valeur |
| --- | --- |
| Un appel complet (`pg_stat_statements`) | **199 s** |
| Le seul CTE `base`, reproduit à l'identique | **> 55 s**, annulé sur délai |
| La même requête, prédicats écrits en clair | **2,3 s** |
| Les six jointures seules, sans le CTE `f` | **1,5 s** |

### Le mécanisme

Les vingt-sept filtres sont lus dans un CTE `f` d'une ligne, puis croisés avec
`entreprises`. Pour le planificateur, `f.qualifie` n'est pas une valeur : c'est
une colonne opaque. Il ne peut estimer **aucun** des vingt-sept prédicats, leur
applique une sélectivité par défaut, et **ces défauts se multiplient**.

Sur une reproduction volontairement réduite — cinq filtres au lieu de
vingt-sept — l'estimation tombe déjà à **69 lignes** là où il y en a
**60 078**. Un facteur 870. À 69 lignes attendues, une boucle imbriquée avec
sonde d'index est le bon plan ; à 60 078, c'est soixante mille sondes dans
`entreprises_donnees_publiques` et `entreprises_audit_site`, plus la relecture
des CTE `site_demo` et `constat_site`. Écrits en clair, les mêmes filtres
donnent des jointures par hachage et 2,3 s.

> **Le piège est déjà nommé dans le dépôt.** L'en-tête de
> `sql/20260817_explorateur_entreprises.sql` décrit exactement cette mécanique
> pour le `limit` : « le planificateur ignore que la tranche fait vingt-cinq
> lignes ». La correction a été appliquée au `limit`, pas au reste. Le
> `cross join f` fait la même chose aux vingt-sept filtres, et la note de
> fichier revendique une mesure (2,0 s) qui n'est plus vraie. Ajouter la
> technologie et les lots le 17/08 a ajouté deux prédicats opaques et une
> septième jointure : chaque ajout dégrade l'estimation un peu plus, en silence.

Deux aggravants secondaires : `entreprises` n'a pas été analysée depuis le 17/08
(le planificateur attend 30 080 lignes vivantes, il y en a 60 078), et la route
n'annonce aucun budget de temps.

---

## 2. Quatre portes cassées, toutes sur la couture

« Les lots n'affichent que l'existant » n'est pas une fonctionnalité manquante :
c'est une fonctionnalité **écrite mais jamais empruntée**. En base, deux lots
seulement, tous deux du 21/08, aucun portant de `criteres` — la porte « figer
depuis des critères » n'a jamais servi en production.

| Chemin | Ce qui se passe | État |
| --- | --- | --- |
| Explorateur → lot | L'écran poste `entreprise_ids`, la route attend `entrepriseIds` → 400. Et si ça passait, l'écran lit `corps.id / nom / taille` quand la route rend `{ lotId, entreprises }` : « Lot « undefined » créé ». `ExplorateurEntreprises.tsx:250` · `api/entreprises/lots/route.ts` | mort |
| Lot → campagne | Le menu « Ajouter depuis un lot… » lit `l.id` et `l.taille` d'une charge utile qui porte `lotId` et `total` : les `<option>` partent sans `value`. Et le schéma exige `lot_id` en **uuid** quand `lots.id` est un **bigint**. `CampagneDetail.tsx:311` · `api/automations/campagnes/_campagne.ts:101` | mort |
| Atelier → lots | « Vue complète des lots » pointe sur `/entreprises/lots` — le chemin de l'*API*. L'écran est à `/prospection/lots`. `Atelier.tsx:589` | 404 |
| Vide des lots | L'écran vide invite à « aller dans l'explorateur, cocher, et figer sous un nom » : c'est le premier chemin de ce tableau. La consigne est juste, la porte est fermée. `Lots.tsx:128` | ment |

La fusion demandée est donc en grande partie **du câblage à réparer**, pas de
l'architecture à inventer. La vraie décision de conception se réduit à une seule
question, traitée en phase 2 : *avec quel vocabulaire fige-t-on un lot depuis
l'explorateur ?*

---

## 3. Le plan, en cinq temps

Les numéros sont une dépendance, pas une préférence : la phase 0 débloque tout
le reste, et la phase 2 a besoin du prédicat partagé que la phase 0 fabrique.

### Phase 0 — Rendre l'explorateur à nouveau ouvrable (bloquant)

Réécrire `explorateur_entreprises` en plpgsql, avec du SQL assemblé par
`format()` et `%L` : on n'émet que les prédicats réellement demandés, en
littéraux. Plus de CTE `f`, plus de `cross join`, plus de vingt-sept clauses
toujours vraies évaluées sur 60 000 lignes. Le planificateur retrouve des
estimations justes — et un filtre posé devient *plus* rapide qu'aujourd'hui au
lieu d'être noyé dans le même plan.

- Extraire l'assemblage du prédicat dans une fonction à part : c'est elle que la
  phase 2 réutilisera pour figer un lot, ce qui garantit que « ce que l'humain
  voit » et « ce qui est figé » sortent du même code.
- `analyze entreprises`, et abaisser `autovacuum_analyze_scale_factor` sur la
  table : onze jours de retard suffisent à doubler l'erreur d'estimation.
- Déclarer `export const maxDuration` sur la route, comme les onze autres routes
  du dépôt qui annoncent leur budget.
- Un contrôle en une ligne dans le fichier SQL, sur le modèle de
  `sql/20260826_index_sans_site.sql` : la mesure vieillit, la note d'en-tête doit
  pouvoir être revérifiée.

**À ne pas faire au passage** : épingler un `search_path` sur
`host_est_generique`, `host_key` ou `chercher_entreprises`. Les advisors
Supabase le réclament, et ça ferait décrocher `entreprises_sans_site_idx` en
silence (351 ms → 6 461 ms). C'est déjà écrit dans `CLAUDE.md`.

### Phase 1 — Réparer les quatre portes

Quatre correctifs indépendants, tous petits, tous en amont de la fusion. Ils se
font avant parce qu'ils rendent la fusion *testable* : sans eux, on ne peut pas
vérifier à la main le chaînage qu'on veut construire.

- `entreprise_ids` → `entrepriseIds`, et lire la vraie réponse (`lotId`) dans
  l'explorateur.
- `lot_id` passe de `uuid` à un entier positif dans `ajoutLeadsSchema` ; le menu
  lit `lotId` et `total`.
- Le lien de l'atelier pointe sur `/prospection/lots`.
- Un test qui parcourt `spaces.ts`, `mobile.ts` et les `<Link>` des écrans, et
  vérifie que chaque `href` correspond à une route du `app/` — le 404 de
  l'atelier serait tombé dessus.

### Phase 2 — L'explorateur devient l'écran de création d'un lot

`/prospection/lots` liste les lots existants et porte un bouton « Créer un lot »
qui mène à l'explorateur ; l'explorateur porte une barre « Figer ce résultat en
lot » avec le compte en grand, le nom, et un bouton.

**Le seul vrai arbitrage du plan.** Il existe déjà deux façons de figer, et
aucune des deux ne convient telle quelle :

- *par identifiants* — plafonnée à la sélection cochée, donc 500 fiches au
  mieux : inutile sur un résultat de 34 633 ;
- *par critères* (`figer_lot_depuis_criteres`) — elle ne parle que le
  vocabulaire de `chercher_entreprises`, neuf drapeaux et quatre sources, quand
  l'explorateur en montre vingt-sept familles. Figer « WordPress abandonnés en
  Gironde » par cette porte rendrait *tout le parc* : exactement le mensonge que
  `CLAUDE.md` nomme déjà pour `services` / `filtres`.

D'où une troisième porte :

- `figer_lot_depuis_explorateur(p_filtres jsonb, p_total_attendu, …)`, qui
  appelle **le prédicat extrait en phase 0**. Même objet de filtres que l'écran,
  donc même population, par construction.
- On garde la garde qui vaut de l'or : le compte affiché est reposté et comparé
  en base ; s'il a bougé, on refuse (409) au lieu de fabriquer un lot que
  personne n'a validé. C'est déjà la logique de `CreerLot` dans l'atelier.
- `lots.criteres` reçoit l'objet de filtres complet — ce qui rend enfin lisible,
  six mois plus tard, *pourquoi* ce lot contient ces fiches-là.
- Le vide de `/prospection/lots` peut alors dire la vérité, et le `CreerLot` de
  l'atelier reste ce qu'il est : la version pouce, à six cases, de la même porte.

### Phase 3 — Le lot devient l'objet qu'on prépare

La chaîne — lissage, enrichissement, préprod, démarchage — existe déjà en
morceaux. Il manque un endroit où elle se lit et se déclenche dans l'ordre, et
cet endroit est la fiche d'un lot (`/prospection/lots/[id]`), dont l'atelier
devient la façade mobile plutôt qu'un second jeu de boutons.

| Geste | Où ça en est |
| --- | --- |
| 1. Lisser | `POST /api/lissage/passes {lotId}` — la troisième porte, en place depuis le 26/08 |
| 2. Enrichir | `scripts/prospection/enrichir-lot.mjs`, script local exigeant `service_role`. À ouvrir en route, ou à assumer comme local |
| 3. Fabriquer les démos | `pretes_pour_demo_des_lots()` compte déjà les fiches fabricables — le bouton manque |
| 4. Plaquettes | `POST /api/atelier/plaquettes {lotId}` — le lien, pas le PDF ; le PDF reste au bureau |
| 5. Démarcher | « Mettre ce lot en campagne » — la porte réparée en phase 1, remontée ici comme geste final |

L'ordre n'est pas décoratif : `prochainGeste()` le calcule déjà à partir des
sept axes de couverture. La fiche de lot met en avant **un seul** bouton — le
prochain — et range les autres, comme la page Lots le fait déjà pour ses
colonnes. Ce qui exige le poste local reste marqué comme tel, compté par
`lissage_leads.lieu` : l'atelier ne prétend pas déplacer les onze bots locaux.

### Phase 4 — Une seule porte pour les campagnes

Voir la section suivante. Un écran au lieu de deux, aucun changement de modèle,
et une entrée en moins dans le rail — `spaces.ts`, le sous-menu et la palette ⌘K
le lisent tous.

---

## 4. Campagnes ou séquences : il n'y a rien à fusionner

**Une campagne n'est pas un doublon d'une séquence : c'est la même ligne.**
`sql/20260819_campagne_leads.sql` le dit en toutes lettres — « pas de table
`campagnes` : elle serait 1-1 avec `automations` ». Neuf lignes en base,
`kind = 'sequence'`, et deux écrans qui les listent toutes les deux.

| Écran | Ce qu'il montre de l'objet | Lit |
| --- | --- | --- |
| `/automations/sequences` | Sa **définition** : étapes, canevas, canaux, accès et agents, fenêtres du régulateur, dupliquer / supprimer | `automations` |
| `/prospection/campagnes` | Son **audience et sa marche** : qui est dedans, qui reste à lancer, qui est écarté et pourquoi, la revue avant lancement, les inscriptions | `automations` + `campagne_leads` |

### Recommandation

Fusionner les **écrans**, garder **un seul objet**. Une liste « Campagnes », et
un détail à quatre onglets : *Audience · Séquence · Lancement · Résultats*.
L'éditeur d'étapes garde son adresse et devient l'onglet Séquence ; il quitte le
rail.

**Pourquoi pas l'autre piste** — « une campagne pilote un lot et orchestre
plusieurs actions, dont des séquences ». L'idée est juste, mais elle veut
introduire une table `campagnes` distincte, donc une deuxième identité pour une
chose qui en a déjà une : `campagne_leads.automation_id`,
`sequence_enrollments`, `sequence_agent_assignments` et `prospection_tasks`
pointent tous sur l'automation. Forker ce modèle pour gagner un niveau de
regroupement se paierait sur les quatre.

Et ce que cette piste cherche à ranger a déjà un foyer : **les « actions autres
que la séquence » sont des gestes de préparation, et elles appartiennent au
lot** (phase 3). Lisser, enrichir, fabriquer, imprimer : ça se fait sur une
population, pas sur un envoi. La chaîne devient lisible d'un bout à l'autre —
*un lot se prépare, puis il entre en campagne* — et chaque objet garde une seule
raison d'exister.

Le jour où il faudra vraiment deux séquences sur un même lot (un A/B, un canal
de repli), ce sera **deux campagnes nées du même lot** :
`campagne_leads.origine_ref` porte déjà le lot d'origine. C'est le regroupement
demandé, sans nouvelle table.

Détails :

- L'onglet Audience met « Ajouter depuis un lot » en premier — c'est la fin de
  la chaîne construite en phases 2 et 3, pas une option parmi d'autres.
- « Où on en est » (`/prospection/etat-sequences`) et les statistiques restent
  des écrans à part : ils parlent de *toutes* les campagnes à la fois.
- Les routes `/automations/sequences/*` continuent de répondre — les liens
  existants et les signets ne doivent pas casser — mais elles sortent du rail et
  du sous-menu.

---

## 5. Ce qu'on ne fait pas, et pourquoi

- **Pas de table `campagnes`.** Quatre tables pointent déjà sur `automations` ;
  une deuxième identité les ferait toutes diverger.
- **On ne supprime pas l'explorateur d'Acquisition.** Il y sert aussi, et
  `spaces.ts` autorise déjà le même écran dans deux espaces.
- **On ne remplace pas la porte « par identifiants ».** Cocher trente fiches
  précises dans le pipeline marketing reste légitime, et ce chemin-là fonctionne.
  On ajoute une troisième porte, on n'en retire aucune.
- **On ne déplace pas les onze bots locaux.** Playwright, un profil Chrome
  persistant, des CAPTCHA : c'est la raison pour laquelle ils marchent.
- **On ne touche pas à `cohorte_demarchage`.** Sa contrainte n'accepte que deux
  valeurs et c'est très bien : un lot de travail n'est pas une cohorte de
  campagne.

---

## Provenance des chiffres

Relevés le 28/08/2026 sur le projet `llzrpcbwnqvbrcjjwysm` : 60 445 entreprises
vivantes, 2 lots (652 appartenances), 9 automations `kind='sequence'` dont 3
actives, 677 inscriptions. Les temps d'exécution viennent de `explain (analyze)`
et de `pg_stat_statements`, sur une base dont le débit varie d'un facteur trois
entre deux exécutions du même plan : lire les **rapports** entre les mesures,
pas les valeurs absolues.
