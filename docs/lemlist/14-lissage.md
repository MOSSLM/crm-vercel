# Lisser la base depuis l'app — couche 4 ter

> « J'aimerais vraiment qu'on puisse choisir un certain nombre de prospects, par
> exemple 100 ou 500 ou 1000, les passer dans une automatisation, et faire en
> sorte qu'à la fin le plus possible aient à la fois les données de l'API gouv,
> mais aussi l'assurance d'avoir une fiche Google **ou d'être sûr qu'ils n'en ont
> pas**. » — Matteo, 20/08/2026

## Le diagnostic, avant le code

**Le blocage n'était pas là où on croyait.** L'enrichissement passait presque
entièrement par Claude Code, et l'explication naturelle était « les outils ont
besoin de Claude ». Le registre dit le contraire : sur 34 bots, **un seul** est
un skill Claude. Quatorze sont des routes API, deux des edge functions, quatre des
crons — **vingt tournent déjà côté serveur**. Onze sont des scripts locaux
(Playwright, profil Chrome, CAPTCHA), et ceux-là resteront locaux : ce n'est pas
une limite à repousser, c'est la raison pour laquelle ils marchent.

Ce qui manquait n'était pas la nature des outils. C'était **un écran et une
file**.

**La table des trois états existait déjà, et personne ne s'en servait.**
`constats_presence` porte `sujet`, `etat ∈ present|absent|inconnu`, `valeur`,
`confiance`, `source` et `preuve`, avec une contrainte qui interdit une valeur
sans « present ». Sa contrainte déclarait cinq sujets ; ses 3 041 lignes ne
parlent que du site. Elle n'était pas à créer — elle était à **élargir** et à
**utiliser**.

## L'état réel de la base, au 20/08/2026

Sur 60 456 fiches vivantes, en appliquant les règles de dérivation du code :

| Sujet | Présent | Vérifié absent | Regardé sans conclure | Jamais regardé |
| --- | ---: | ---: | ---: | ---: |
| Identité légale | 2 959 | **0** | 0 | 57 497 |
| RGE | 2 712 | 247 | 0 | 57 497 |
| Fiche Google | 3 483 | **0** | 0 | 56 973 |
| Site web | 26 014 | 133 | 69 | 34 240 |

Chaque ligne somme exactement à 60 456 : la couverture est une **partition**,
comme l'entonnoir de la prospection, et pour la même raison — un chiffre qu'on
peut additionner est un chiffre auquel on se fie.

Deux zéros à lire de près : **rien, dans toute la base, n'a jamais été confirmé
sans identité légale ni sans fiche Google.** Ce n'est pas que tout le monde en
a ; c'est que la question n'a jamais été posée de façon à ce que la réponse
« non » puisse s'écrire.

## Le défaut le plus grave était déjà en production

**54 878 fiches portent `rge_rafraichi_le = 2026-08-16 02:17:00.123097+00`** —
la même estampille à la microseconde près. Un remplissage de masse a écrit
« interrogé » sur toute la base sans appeler l'ADEME une seule fois.

Et la preuve est nette : ces 54 878 lignes sont **exactement** les 54 878 dont
`est_rge_indicatif` est nul. Une estampille sans réponse.

Un champ vide aurait été honnête. Une estampille fausse est pire : tout ce qui
trie « les plus anciennes d'abord » les voit comme fraîches, donc **le cron ne
les reprendra jamais**.

La règle du code n'a donc pas besoin de connaître cette date : **le RGE se lit
dans `est_rge_indicatif`, jamais dans `rge_rafraichi_le`.** Une fiche sans
réponse n'a pas été regardée, quoi qu'affiche son horodatage.

## La deuxième règle, mesurée elle aussi

**Un constat l'emporte toujours sur une colonne.** 67 entreprises portent un
constat `absent` pour le site **et** une URL en colonne. En les ouvrant, le
constat a raison à chaque fois :

- « le nom de domaine n'existe pas (NXDOMAIN) » — KM Dépannage, Paris Génie Clim,
  GreenTech Home…
- « l'URL détenue n'est pas la leur ET la recherche web n'a rien rendu de mieux »

La colonne n'a jamais été nettoyée ; le constat porte sa date, sa source et sa
preuve. Une colonne porte un état sans provenance, un constat porte un acte daté.

> ⚠️ **CETTE NOTE A DIT UNE FAUSSETÉ, et la base l'a corrigée le 20/08.** On
> lisait ici que `v_entreprises_presence_site` « fait l'inverse » et appellerait
> « présent » ces 67 fiches. Mesuré : **0** — la première branche de son `CASE`
> ne peut rendre qu'« absent », le constat gagnait déjà.
> Son vrai défaut était l'inverse : **25 291 fiches avec une URL en colonne et
> sans constat y étaient déclarées « inconnu »**, c'est-à-dire « personne n'a
> regardé ». Corrigé par `sql/20260820_presence_site_colonne.sql`, qui ajoute
> `origine_statut` et `confiance_statut`.

Corollaire dans le code : une URL en colonne vaut `haute`, **jamais** `certaine`.
Une passe de consolidation (exigence `certaine`) la fera revérifier.

## Le modèle

Une **passe** fige une population choisie par les filtres de l'explorateur, et
lui applique un **plan** : les sujets à trancher, la confiance exigée, et deux
autorisations (outils facturés, étapes du poste local).

```
sujets      identite → rge → fiche_google → site_web
exigence    moyenne
facture     oui
local       oui
```

**L'ordre n'est pas arbitraire.** L'identité donne le SIRET dont l'ADEME a
besoin ; le RGE est gratuit et instantané une fois le SIRET connu ; la fiche
Google *déclare* souvent le site, la consulter avant évite une recherche
entière ; le site vient en dernier parce que c'est le seul sujet qui finit par un
jugement humain — on ne fait pas relire ce qu'on aurait pu trancher seul.

### Les trois lieux

| Lieu | Ce que c'est | Ce qui l'exécute |
| --- | --- | --- |
| `serveur` | route, edge function, cron | `/api/lissage/tick` — tout de suite, sans personne |
| `local` | Playwright, Chrome, CAPTCHA | `scripts/lissage/runner.mjs`, quand Matteo ouvre son poste |
| `humain` | un jugement | un écran — jamais un script |

Une étape locale est **posée puis relâchée** : elle attend, elle n'est pas en
erreur. L'écran le dit en toutes lettres — « attend le poste local ».

### Ce qui empêche la file de tourner en rond

Un outil qui a été lancé entre dans `tentes` **quoi qu'il ait rendu** — y compris
quand il n'a rien conclu. Sans ça, un CAPTCHA ou une API muette ferait relancer
le même outil indéfiniment sur la même fiche, en ayant l'air de travailler.

Et une ligne qui sort d'une passe sans être complète sort **avec son motif** :
« rien ne peut prendre identite — il manque siret ». Une ligne qui sort en
silence est celle qui dort trois semaines sans que personne le voie.

## Ce qui n'est pas fait, et pourquoi

- **`refresh-google-stats` n'est pas branché.** L'edge function prend des
  `project_ids`, pas des entreprises. Traduire l'un en l'autre est un travail à
  part, qui ne se cache pas dans un adaptateur. Tant qu'il n'est pas fait, la
  file le **dit** au lieu de réessayer trois fois dans le vide.
- **Le site ne s'écrit jamais automatiquement.** Le runner pose un `absent`
  quand la preuve le permet, jamais un `present` : un `present` vaudrait écriture
  d'URL, et l'écriture exige une relecture.

## Le choix du SIRET — la porte de sortie que la file n'avait pas

`resolution-siret` propose des candidats et ne choisit jamais. C'est la règle du
registre, et elle a été payée : un rapprochement faux n'est pas une donnée fausse
isolée, c'est une **contamination** — mauvais SIRET, puis mauvaise identité,
mauvaises finances, et mauvaises qualifications RGE, qui finissent en logos sur
un site public qu'on produit.

Mais une règle qui interdit d'écrire sans offrir de porte pour trancher ne
protège rien : **elle empile**. C'est ce que l'écran `/prospection/identite`
corrige.

### Ce qu'on a trouvé en ouvrant la table, et ce que le chiffre brut cachait

`entreprise_siret_candidats` existait depuis le 08/08, avec son score à cinq
composantes, ses rejets et sa validation admin. **On n'en a donc pas créé une
seconde** — la première version de l'outil déposait ses trouvailles dans
`lissage_leads.dossier`, ce qui faisait exactement ça, et deux listes de
candidats SIRET finissent toujours par se contredire.

| Mesure, 20/08/2026 | Valeur |
| --- | --- |
| Lignes au statut `propose` | 506, sur 186 fiches |
| …dont la fiche a **déjà** un SIRET | **458 lignes, 172 fiches** |
| Fiches qui attendent vraiment | **14**, pour 48 candidats |
| …dont un candidat a les **quatre** critères | **0** |
| …que le score ne départage pas (< 8 points d'écart) | **8 sur 14** |
| Le gisement : fiches vivantes sans SIRET | **2 648**, dont **1 479** cherchables |

Les 172 fiches déjà tranchées gardent des candidats en `propose` parce que leur
SIRET vient d'un **versement antérieur** — `proeco_registre_auto` (139),
`api_gouv` (19), `proeco_site_mentions_legales` (14) — qui n'est jamais passé par
`validerCandidat`, et n'a donc rejeté aucun concurrent. D'où le filtre
`siret is null` de la route : sans lui, l'écran ouvrirait sur 186 fiches dont 172
questions déjà répondues.

### Pourquoi l'écran montre quatre critères et non un score

Le registre des bots pose le critère mot pour mot : « pour écrire un
rapprochement sans relecture humaine, il faut **adresse + code postal + nom +
métier** concordants ; trois sur quatre ne suffisent pas ». On affiche donc les
quatre, un par un. Un « 71/100 » ne se conteste pas ; « nom oui, code postal
non » se conteste tout seul — et c'est le cas classique de l'homonyme d'un autre
département.

Les seuils relisent le détail que `score.ts` écrit déjà, en points pondérés :
nom ≥ 36/45, code postal **= 25** (l'égalité stricte : les 10 points du « même
département » sont un encouragement à regarder, pas une adresse commune),
commune ≥ 12/15, métier = 10/10. La commune tient lieu d'adresse faute de rue
côté fiche, et l'écran le dit plutôt que de faire croire qu'on a comparé une rue.

**Même avec les quatre, on ne valide pas tout seul.** La fiche 57 « KM
Dépannage » a deux SIREN plausibles à la même adresse et au même patronyme :
l'un chauffagiste, l'autre taxi. Seul l'appel au registre les distingue — et il a
lieu à la validation, y compris pour un SIRET lu ailleurs (pied de page d'un
site) : la clé de Luhn valide une forme, pas une existence.

### Ce que la file gagne

Une ligne posée sur une étape `humain` porte `lieu = 'humain'`, et le tick
serveur ne réclame que `null` et `serveur` — c'est ce qui l'empêche de trancher à
la place d'un humain. Personne ne repasserait donc jamais dessus : une fois le
SIRET tranché à l'écran, la ligne resterait « attend une relecture » pour
toujours, **sur une relecture déjà faite**. `libererEtapeHumaine` ferme la
boucle, et seulement quand il ne reste plus rien à trancher sur la fiche.

## Ce que l'usage a ajouté, le 20/08

Trois choses demandées en se servant de l'écran — et chacune a révélé un défaut
plus profond que la demande.

### Filtrer une passe par propriétaire

`chercher_entreprises` n'avait aucun paramètre d'attribution : « valider mes
fiches d'abord, pour fabriquer un site derrière » n'était pas exprimable. Or
`entreprises.owner_id` porte **908 fiches vivantes** — Matteo 561, Bilal 344 — et
239 des siennes n'ont pas de SIRET.

`sql/20260820_chercher_entreprises_owner.sql` ajoute `p_owner uuid default null`,
en dernière position pour ne toucher aucun appelant. ⚠️ **Avec un `drop`
explicite** : ajouter un paramètre change la signature, donc
`create or replace` ne remplace rien — il crée une SURCHARGE, et PostgREST
répond alors « Could not choose the best candidate function » sur *tout*
l'explorateur, pas seulement sur le lissage. Relu après application : une seule
fonction en base.

Le propriétaire se **cumule** avec les drapeaux, comme les filtres de manque :
« mes fiches » ET « sans SIRET » veut dire les deux à la fois.

### Marquer ce qui coûte et ce qui attend le poste local

`$` pour un outil facturé à l'appel, `⌂` pour une étape qui attend le poste
local, `✋` pour une relecture à la main. **Ils ne s'excluent pas** — un sujet
peut avoir plusieurs chemins : `fiche_google` se tranche par
`refresh-google-stats` (serveur, facturé) *ou* par `dossier-web` (local,
facturé).

Ce qui est marqué n'est donc pas le sujet mais **son chemin**, recalculé à
chaque réglage : un sujet ne coûte rien en soi, ce sont les outils qui restent
praticables une fois les deux interrupteurs réglés. D'où `natureDuSujet()`, pur.

Et le cas que ça fait apparaître, qui n'était pas demandé : décocher « outils
facturés » retire à `fiche_google` ses deux seuls outils. La passe partait quand
même et s'arrêtait en `sans_prise` sur **toute** la population — du travail pour
rien, découvert après coup. L'écran le dit maintenant **avant** de lancer.

### Deux SIRET de même SIREN : une entreprise, deux établissements

Signalé devant « Aviz'energie » et « CK Travaux » : *« les deux font sens,
comment faire ? »*. La question était juste, et l'écran n'y répondait pas — il
criait « deux candidats se tiennent, lisez l'adresse » sur un cas sans enjeu.

Ce sont **deux questions**, et les confondre était le défaut :

| | |
| --- | --- |
| « Est-ce la bonne entreprise ? » | reste un jugement — deux établissements peuvent être ceux de la mauvaise entreprise |
| « Lequel des établissements ? » | se décide tout seul |

Ce que le choix de l'établissement **ne change pas**, vérifié dans le code :
raison sociale, dirigeants, finances (unité légale), et **les qualifications
RGE** — `hydraterRge` interroge l'ADEME avec `tousEtablissements: true`, donc
`siret:<SIREN>*`. Ce qu'il change : l'adresse, `fetchIdentite` rendant celle de
l'établissement demandé.

L'écran regroupe donc par SIREN : une carte = une **entreprise**, l'établissement
le mieux rapproché déjà retenu (le score porte l'adresse et le code postal, donc
« le mieux noté » = « celui dont l'adresse colle le mieux »), les autres repliés.
Effet de bord utile : « serrée » se mesure désormais entre entreprises
**distinctes**, et ne crie plus que sur le vrai danger.

### Le double barème de `score_detail`

Découvert en regardant l'écran : « AVIZ'ENERGIE », adresse exacte, bon code
postal, bon métier, **score 100** — affiché **« 1/4 critères »**.

Il existe deux formats en base, et **48 candidats sur 54** sont au second :

|  | `score.ts` | `proeco` |
| --- | --- | --- |
| `nom` | 0 → 45 | 0 → 25 |
| `codePostal` | 0 / 10 / 25 | 0 / 7 / 20 |
| adresse | `ville`, 0 → 15 | `adresse`, 0 / 20 / 45 + `niveau_adresse` |

Appliquer « nom ≥ 36 » à un barème qui plafonne le nom à 25 rejette **tous** ses
candidats, y compris les parfaits. L'écran poussait à écarter les meilleurs.

Et le barème `proeco` est **le meilleur des deux** sur le critère qui compte le
plus : il compare l'adresse **au niveau de la voie**, là où `score.ts` ne compare
que la commune. D'où le libellé variable à l'écran — « adresse exacte », « même
voie », ou « commune » — au lieu d'un « commune » en dur qui mentait dans 89 %
des cas.

## Ce qui a été corrigé au passage

- `verifier-sites.mjs` n'acceptait que `--cohorte` : appelé par la file, il
  aurait relancé la cohorte B entière à chaque tour. Il accepte `--ids` désormais.
- Son entrée au registre disait `ecrit: false`. C'est faux sous `--constats` — et
  `ecrit` est la question la plus importante du registre. Corrigée, avec la
  condition écrite.
- `constatSite` vivait dans `appliquer-dossiers.mjs`. Elle est sortie dans
  `scripts/prospection/verdict-site.mjs` et importée aux deux endroits : deux
  définitions de « sans site » auraient fini par diverger.
- **La file cherchait une identité pour des fiches qui en avaient déjà une.**
  L'outil n'exigeait que `nom_et_ville` : toute fiche portant un nom et une
  commune le déclenchait, **y compris les 57 801 qui ont déjà leur SIRET**. Un
  appel à l'annuaire par fiche, pour reproposer une identité déjà écrite — et la
  file avait l'air de travailler. D'où `siret_manquant`, le seul préalable
  négatif du module. Ce qu'il faut à une fiche qui a son SIRET, c'est
  l'hydratation, et c'est `donnees-publiques` qui la fait.
- **Un seul compteur de candidats servait deux relectures.** Un prospect à qui
  l'annuaire avait proposé trois SIRET était envoyé relire son **site**.
  `candidat` s'est scindé en `candidat_site` et `candidat_identite`.
- L'outil du lissage pointait `recherche-entreprises`, qui est le **client
  d'API** — et dont l'en-tête est formel : « il n'écrit rien ». Ce qui écrit les
  propositions, c'est la résolution. Deux entrées neuves au registre,
  `resolution-siret` (propose) et `choix-siret` (tranche), sur la même séparation
  que `dossier-web` / `appliquer-dossiers`.

## La deuxième porte : lisser une sélection (20 août)

L'écran du lissage choisit sa population par **filtres**. C'est le bon geste
pour ratisser le parc, et le mauvais quand on a sous les yeux les trente lignes
qu'on vient de trier à la main dans le pipeline marketing : **rien ne décrit
« ces trente-là » comme un filtre**. La sélection *est* le filtre.

D'où un bouton **« Lisser »** dans la barre de sélection du pipeline, et un
second chemin dans `POST /api/lissage/passes` : une liste d'identifiants au lieu
de critères. Trois choix qui vont avec :

- **Le nom est composé, pas demandé.** `nomDeSelection` rend
  « Pipeline marketing — 120 fiches, 20/08 à 14 h 32 ». Personne ne nomme un lot
  qu'il vient de cocher, et une passe sans nom est introuvable dans la liste.
  L'heure est celle de **Paris** et pas du serveur : Vercel tourne en UTC, et
  une passe lancée à 14 h 32 qui s'appellerait « 12 h 32 » serait perdue pour
  celui qui l'a lancée.
- **Les identifiants du navigateur ne sont pas crus sur parole.**
  `lissage_leads.entreprise_id` est une clé étrangère : un id inventé ferait
  échouer l'insertion du **lot entier**. `populationDeLaSelection` relit, écarte
  les archivées et les fusionnées, et **dit combien** — un lot silencieusement
  rogné passerait pour complet.
- **`criteres` porte l'origine, pas des filtres.** Y écrire des critères qu'on
  n'a pas appliqués ferait croire que la passe se rejoue. Elle ne se rejoue pas :
  sa population est une liste figée. L'écran affiche la pastille
  « pipeline marketing » pour qu'on n'aille pas chercher des filtres inexistants.

### Et l'autre bouton : les chiffres clés

Le lissage va **chercher** la date de création ; le bouton voisin en **déduit**
les chiffres. Mesuré le 20/08 : **564 dossiers sur 882 n'ont pas d'années
d'expérience, et 352 ont déjà leur date de création en base**. L'enrichissement
la faisait pourtant deviner par un LLM à partir du texte du site du prospect.

`src/lib/enrichment/chiffres-cles.ts` applique le barème de Matteo — années au
registre, installations = `max(années × 40, avis × 4)`, clients = 75 %. Il
remplit les cases vides **et remonte celles qui sont sous le barème**, parce que
les deux sont le même défaut vu à deux moments : 146 dossiers portaient des
installations tirées des seuls avis Google, et remplir l'ancienneté sans toucher
au reste *fabriquait* le site qui annonce « 40 ans d'expérience, 14 chantiers ».
Le sens est unique — **il monte, il ne baisse jamais** — et il ne touche jamais
aux colonnes `*_official`.

> ⚠️ **Le barème se calcule sur le REGISTRE, jamais sur l'année affichée.**
> 131 dossiers annoncent plus d'ancienneté que le registre, et 7 le dépassent de
> plus de vingt ans : « Ocean Clim Plomberie » affiche **100 ans** pour une
> entreprise immatriculée le 10/09/2024. Partir de l'année affichée aurait donné
> 4 000 chantiers — un chiffre faux rendu quarante fois plus faux. En partant du
> registre, une ancienneté gonflée ne contamine jamais les deux autres chiffres.
> `ancienneteDouteuse` les compte et l'écran les signale sans les corriger :
> trancher « revendication du dirigeant » contre « chiffre cassé » demande un œil.

**Passé sur le parc le 20/08** : 484 dossiers recalés — 341 années remplies,
32 montées, 132 installations montées, **zéro chiffre baissé**. Les incohérences
massives sont passées de 29 à 3, et ces trois-là sont exactement celles qu'on ne
peut pas trancher seul : deux annoncent une ancienneté que le registre contredit,
la troisième n'a aucune date. Archive préalable dans `archive_stats_lm_20260820`.

> ⚠️ **`1900-01-01` est la sentinelle SIRENE pour « date inconnue »** — 4 fiches
> la portent. Prise au mot, elle affichait **126 ans d'expérience** sur un site
> vendu à un artisan : exactement le chiffre surestimé que le barème interdit.
> Tout ce qui précède 1950 est traité comme *pas de date*, ce qui est la vérité.
> Trouvé en regardant la base après le premier lot, pas en relisant le code.

Les deux boutons se répondent dans cet ordre : **sans date, on ne déduit rien** —
ces fiches-là relèvent du lissage, et le compte le dit séparément de
« déjà complet ». Deux silences différents, deux gestes différents.

## Le tableau : paginer, filtrer, et ne plus buter sur les plafonds (20 août)

Trois défauts du même ordre — **l'écran empêchait un geste que le serveur savait
faire.**

**« invalid_body » sur un gros lot.** `enrich-prepare` refuse au-delà de
cinquante opportunités, `validate-enrichment` au-delà de cent : ces bornes
protègent une **requête**, pas un **geste**. Cocher trois cents lignes est un
geste, et il ne devrait jamais buter sur la taille d'une requête. `parPaquets`
(`src/lib/paquets.ts`) découpe côté client, et un paquet refusé n'arrête plus
les suivants — il est compté et dit.

> ⚠️ **Lever le plafond sans borner la concurrence aurait été pire que
> l'erreur.** L'enrichissement tirait ses appels avec un `Promise.allSettled`
> sur toute la liste : c'est le plafond de cinquante qui limitait
> accidentellement la casse. Sur 877 lignes, ça ferait 877 appels simultanés à
> une fonction qui interroge un LLM. D'où `filePlafonnee`, six à la fois.
> Vérifié dans le navigateur : paquets `[50, 50, 50, 50]`, pic de six appels
> simultanés.
>
> Et le test qui le garde a dû être réécrit : il n'affirmait que `pic <= 3`,
> donc il passait aussi pour une exécution strictement séquentielle. **Une borne
> haute seule ne prouve rien d'une file.**

**Une page, et c'est aussi l'unité de sélection.** 10 à 1000 lignes par page ; la
case d'en-tête coche **la page**, donc lisser cinq cents fiches se fait en
réglant la page sur cinq cents. La sélection, elle, **traverse les pages** : ce
sont des identifiants, pas des lignes, et le bandeau dit quand elle déborde de
ce qu'on regarde.

**Des cases à cocher, pas six menus de plus.** La barre était le grief n° 1
(« trop chargée, trop rigide ») : un seul bouton *Filtres*, un panneau, quatre
blocs — site du prospect, note du site, notre démo, audit — avec l'effectif de
chaque case compté sur **tout** le tableau. La grammaire est celle des pastilles
de lemlist : **ou** dans un bloc, **et** entre les blocs, et un bloc où rien
n'est coché ne filtre rien. Plus un bouton qui vide **tout** — cases, menus,
recherche et lignes masquées : n'en vider qu'une partie laisserait un tableau
encore filtré et passerait pour cassé.

> **Le site du prospect a trois états, et c'est le fond du filtre.** Il se lit
> dans `v_entreprises_presence_site`, la même vue que le moteur — jamais dans
> `canonical_url`, qui ment dans les deux sens : au 20/08, **612 lignes seraient
> « présent » sur la seule foi de la colonne**, alors que 124 portent un constat
> « absent » et 62 pointent un hébergeur sans site. Relevé sur le tableau :
> **678 avec site · 186 vérifiés sans · 13 regardés sans conclure**. « Vérifié
> sans site » se démarche sur l'accroche « création » ; « on ne sait pas »
> s'envoie au lissage. Les fondre ferait promettre un site à quelqu'un qui en a
> peut-être un.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `sql/20260820_lissage.sql` | `constats_presence` élargie, `lissage_passes`, `lissage_leads` |
| `sql/20260820_lissage_dossier.sql` | `lissage_leads.dossier` — le pont vers l'exécuteur local |
| `src/lib/lissage/passe.ts` | pur : sujets, outils, préalables, `prochaineEtape`, couverture |
| `src/lib/lissage/passe-db.ts` | lire les faits, poser les constats, tenir la file |
| `src/lib/lissage/outils-serveur.ts` | `ok`/`vide`/`erreur` → `present`/`absent`/`inconnu` |
| `src/lib/lissage/moteur.ts` | le tour de file, quatre tours par appel |
| `src/app/api/lissage/` | passes, détail, tick, poste local |
| `sql/20260820_chercher_entreprises_owner.sql` | `p_owner` sur la recherche — ⚠️ `drop` obligatoire |
| `src/lib/lissage/choix-siret.ts` | pur : les deux barèmes, les quatre critères, le regroupement par SIREN |
| `src/app/api/lissage/identite/` | la file des SIRET à trancher, et la décision |
| `src/components/prospection/Lissage.tsx` | l'écran, et ses quatre colonnes |
| `src/components/prospection/ChoixSiret.tsx` | l'écran de décision, quatre critères par candidat |
| `scripts/lissage/runner.mjs` | le bras local |
| `src/lib/enrichment/chiffres-cles.ts` | pur : le barème, et les dates qui n'en sont pas |
| `src/app/api/marketing-pipeline/chiffres-cles/` | déduire les chiffres d'un lot, sans appel externe |
| `src/lib/paquets.ts` | pur : découper un lot, et la file plafonnée |
| `src/components/marketing-pipeline/filtres.ts` | pur : les quatre blocs, « ou » dedans, « et » entre |
