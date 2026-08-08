# Passation — exploiter les données publiques d'entreprise

Ce document sert à démarrer de nouvelles conversations sans reperdre ce qui a été appris.
Il contient d'abord **le socle de connaissances** (à lire), puis **les prompts** (à copier).

Travail déjà fait, pour contexte : [2026-08-08.md](2026-08-08.md) et
[2026-08-08-lot2.md](2026-08-08-lot2.md).

---

## A. Socle de connaissances

### A1. Les sources, et ce qu'elles donnent

**`recherche-entreprises.api.gouv.fr`** — gratuite, sans clé, sans quota constaté.
`GET /search?q=<siren|nom>&code_postal=<cp>`

Champs exploitables observés : `siren`, `siege.siret`, `date_creation`, `etat_administratif`
(`A` actif / `C` cessé), `date_fermeture`, `activite_principale` (NAF), `categorie_entreprise`
(PME/ETI/GE), `tranche_effectif_salarie`, `dirigeants[]` (nom, prénoms, qualité, année de naissance),
`finances` (`{"2022":{"ca":9611495,"resultat_net":652979}}`), `siege.liste_rge`,
`complements.est_rge`, `complements.liste_idcc` (convention collective),
`matching_etablissements[]`.

**ADEME — jeu `liste-des-entreprises-rge-2`** sur data.ademe.fr (API data-fair).
`GET /data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines?q=<SIRET14>`

162 285 lignes, **mise à jour quotidienne, producteur ADEME**. Alimenté par les organismes
certificateurs, **jamais déclaratif** : l'entreprise n'a aucun moyen d'y entrer ni d'en sortir.
Une ligne par qualification : `code_qualification`, `nom_certificat`, `organisme`, `domaine`,
`lien_date_debut`, `lien_date_fin`, `url_qualification` (PDF du certificat), et aussi
`email`, `telephone`, `site_internet` déclarés par l'entreprise.

**Conséquence forte** : l'ADEME est plus fiable que le site du client. Vérifié sur ECLEIS
(SIRET 35137835100040) qui affiche des logos RGE alors que l'ADEME renvoie 0 ligne et que
`est_rge` vaut `False`. Afficher un logo RGE non détenu sur un site qu'on produit est une
allégation trompeuse : le contrôle ADEME protège.

### A2. Les pièges, tous vérifiés sur des données réelles

1. **`ca: 0` ne veut pas dire zéro** — ça veut dire « non publié ». Cottaz et EDDIA sont à
   `ca: 0` avec un résultat net à six chiffres. Écrire 0 est une erreur ; il faut `NULL`.
2. **L'ADEME ne matche QUE le SIRET à 14 chiffres.** Ni SIREN, ni nom, ni raison sociale.
   J'ai mesuré 0 email sur 22 avec un SIREN, puis 9 sur 32 en corrigeant la clé.
3. **`tranche_effectif_salarie` est un code INSEE**, pas un nombre : `01`=1-2, `02`=3-5,
   `03`=6-9, `11`=10-19, `12`=20-49, `NN`=non renseigné. Afficher « effectif 12 » pour une
   entreprise de 30 personnes serait un contresens.
4. **Siège ≠ établissement.** `liste_rge` vit sur l'établissement ; une entreprise multi-sites
   peut être qualifiée sur un établissement et pas sur le siège.
5. **Cadences différentes** : le RGE bouge quotidiennement, les finances une fois par an.
6. **Une enseigne n'est pas une raison sociale.** Rencontré souvent : HYGIS Evry est immatriculée
   « HYGIENE MORE », CLIMIZ est « TOP CLIMATISATION », Clim On est « JL2B MATERIAUX »,
   EMC Pessac est devenue « EDDIA NOUVELLE AQUITAINE ». La recherche par enseigne échoue ;
   ce qui débloque, c'est le SIRET affiché sur le site, ou le nom du dirigeant.

### A3. Couverture réelle, mesurée sur 45 entreprises du parc

| Donnée | Couverture |
|---|---|
| Tranche d'effectif | 60 % |
| Finances (CA **ou** résultat) | 37 % |
| **CA réellement publié** | **17 %** |
| Effectif exact | 0 % |
| Flag `est_rge` | 53 % |

La plupart des artisans déposent des comptes confidentiels : on obtient souvent le résultat net
sans le chiffre d'affaires. Prévoir deux colonnes distinctes plutôt que de forcer l'un dans l'autre.

### A4. Le verrou : il n'existe aucune colonne `siret`

`entreprises` n'a ni `siret` ni `siren`. Les 93 SIREN déjà trouvés ne vivent que dans le texte des
notes de `contacts`. **Rien n'est possible sans cette colonne.**

Le problème se découpe en deux étages qu'il ne faut pas confondre :

| Étage | Nature | Qui | Quand |
|---|---|---|---|
| **Résolution d'identité** nom+ville+CP → SIRET | difficile, homonymes, jugement | agent / validation humaine | une fois |
| **Hydratation** SIRET → tout le reste | trivial, déterministe | edge function | cron |

Une fois le SIRET stocké et vérifié, l'hydratation ne demande plus aucun LLM. Faire tourner un
modèle sur du JSON structuré est plus lent, plus cher et **moins fiable** qu'un `fetch`.

### A5. Règles de sûreté à ne jamais enfreindre

- **Ne jamais écrire les colonnes `stat_*_official`** (`stat_years_experience_official`,
  `stat_satisfied_clients_official`, `stat_installations_completed_official`,
  `stat_rge_count_official`). Ce sont les chiffres confirmés par le client, l'affichage les fait
  primer, les écraser détruit la seule donnée certaine de la fiche.
- **N'inventer aucune adresse email.** Jamais de `contact@` + domaine construit de tête, jamais de
  `prénom.nom@` déduit. Sur la passe précédente, un agent en a fabriqué une (`steve.jardin@breizhclim.fr`,
  page sans aucun `@`) : la vérification adversariale l'a arrêtée avant la base. Toute adresse doit
  venir d'une page lue ou d'un registre officiel.
- **Ne pas écraser le saisi humain.** N'écrire que là où c'est vide, ou dans des colonnes dédiées
  à l'API.

### A6. Connaissances du dépôt utiles

- `src/components/marketing-pipeline/required-fields.ts` et `missingForSite` dans
  `src/app/api/marketing-pipeline/_board.ts` définissent **les mêmes règles en double**, et
  `missing-for-site.test.ts` vérifie qu'elles produisent les mêmes libellés. **Toute exigence
  ajoutée doit l'être des deux côtés**, sinon le test casse.
- `SERVICE_TAGS_TAXONOMY` dans `src/utils/serviceTags.ts` : 9 tags et pas un de plus
  (`climatisation`, `pompe à chaleur`, `chauffage`, `ventilation`, `plomberie`, `électricité`,
  `photovoltaïque`, `rénovation générale`, `bornes IRVE`). Un tag hors liste **masque
  silencieusement** la page du service.
- `public/rge/` contient **12 logos de qualification normalisés** (canvas 360×180, 1× et 2×) et
  `mapping.json` qui relie les 16 `nom_certificat` de l'ADEME aux fichiers. Le script de
  normalisation est `scripts/normalise-logos-rge.py`. Manque encore le logo RGE générique.
- `src/app/api/media/rehost-logos` existe déjà pour héberger les logos distants.
- `pg_cron` est en place (3 jobs actifs), `net.http_post` est disponible : `cron.job_run_details`
  ne dit que si la requête a été **postée**, la vraie réponse est dans `net._http_response`.
- **Le vérificateur d'emails ne tourne pas** : son tick répond `{"ok":true,"checked":0,"remaining":0}`
  toutes les 5 minutes depuis le 3 août, car rien n'inscrit les nouvelles adresses dans la file.
  Ne pas s'appuyer dessus, et **ne pas le corriger** — décision explicite du propriétaire.

### A7. Signaux commerciaux découverts, à exploiter

- **3 prospects sont morts ou mourants** : id 57 (KM Dépannage) et id 2006 (Energie Confort 33)
  n'ont qu'un liquidateur au registre ; id 1494 (EMC Pessac, devenue EDDIA) est **cessée depuis le
  27/05/2026**. Il faut arrêter de les démarcher — c'est une fonctionnalité, pas une anecdote.
- **Les dates d'expiration RGE sont une accroche d'appel** : Chaleur et Confort a une
  qualification qui expire le 25/08/2026. « Je vois que votre QualiPAC arrive à échéance en
  septembre » ouvre une conversation.
- **100 fiches** portent encore `installations = clients × 2`, motif visible en démo.

---

## B. Les prompts

Découper en **quatre conversations** plutôt qu'une. C'est précisément le mur de contexte qui a
motivé cette passation : une seule conversation pour les quatre chantiers s'y heurtera aussi.
Chacune peut faire plusieurs commits.

### Prompt 1 — Socle de données (Supabase + hydratation)

> Projet `crm-vercel`, Supabase MCP projet `llzrpcbwnqvbrcjjwysm`. Tu as les pleins droits sur la
> base et le dépôt, tu peux committer.
>
> **Lis d'abord `docs/enrichissement/PASSATION-donnees-publiques.md` en entier** : il contient les
> API, leurs pièges vérifiés et les règles de sûreté. Ne les redécouvre pas.
>
> Objectif : que le CRM sache stocker et rafraîchir tout ce que les API publiques donnent sur une
> entreprise, à partir de son SIRET.
>
> 1. **Explore l'existant avant de décider** : le schéma `entreprises`, `lead_magnet_projects`,
>    `contacts`, et ce que renvoient réellement les deux API sur les SIRET de test listés dans la
>    passation. Sonde les champs toi-même, ne te fie pas à ma liste — elle est vraie mais peut-être
>    incomplète.
> 2. **Conçois le schéma** qui accueille : identité (siret, siren, date de création, NAF, catégorie,
>    état administratif, date de fermeture), taille (tranche d'effectif), finances (CA, résultat net,
>    année d'exercice — attention, `ca: 0` signifie « non publié », il faut `NULL`), et les
>    qualifications RGE. Pour le RGE je recommande **une table dédiée, une ligne par qualification
>    avec ses dates**, plutôt qu'un compteur : c'est ce qui permettra d'afficher les bons logos et de
>    repérer les qualifications expirées. Discute-en si tu vois mieux.
>    Prévois la traçabilité : d'où vient chaque donnée, quand a-t-elle été rafraîchie.
> 3. **Construis l'hydratation** : SIRET → toutes ces données. Edge function Supabase ou route API,
>    à toi de juger selon ce qui existe déjà dans le dépôt. Elle doit être idempotente, traiter par
>    lots, ne jamais écraser le saisi humain ni les colonnes `*_official`, et respecter des cadences
>    différentes (RGE quotidien, finances annuel).
> 4. **Déclenchement** : un bouton pour une fiche, et un passage automatique pour toutes celles qui
>    ont un SIRET et des données périmées. `pg_cron` est déjà en place, regarde comment les 3 jobs
>    existants sont câblés.
> 5. **La résolution d'identité** (trouver le SIRET quand on ne l'a pas) est le point dur : les
>    enseignes ne correspondent pas aux raisons sociales, voir la passation §A2.6. Ne l'automatise
>    pas silencieusement — propose des candidats avec un score de concordance et fais valider.
>    190 fiches sont concernées.
>
> Écris des tests. Commite par étapes cohérentes.

### Prompt 2 — Cockpit d'appel et fiche entreprise

> Projet `crm-vercel`. **Lis `docs/enrichissement/PASSATION-donnees-publiques.md`**, en particulier
> §A3 (les couvertures réelles) et §A7 (les signaux commerciaux).
>
> Le socle de données de la conversation précédente est en place. Objectif : que je n'appelle plus
> jamais un prospect à l'aveugle.
>
> Construis la fiche entreprise et le cockpit d'appel avec ce qu'on sait désormais : dirigeants
> nommés avec leur qualité, ancienneté, taille, CA quand il existe, certifications RGE avec leur
> validité, contacts avec téléphone et email.
>
> Trois exigences de conception :
> - **L'absence de donnée est la norme, pas l'exception.** Le CA n'existe que pour 17 % des fiches.
>   L'interface doit rester belle et lisible quand la moitié des champs sont vides — pas une grille
>   de tirets.
> - **Le risque doit sauter aux yeux.** Une entreprise cessée ou en liquidation doit être visible
>   immédiatement et sortir de la prospection. Trois cas existent déjà en base (ids 57, 1494, 2006).
> - **Ce qui ouvre une conversation doit être mis en avant** : une qualification RGE qui expire dans
>   deux mois est une raison d'appeler.
>
> Regarde comment sont faites les pages existantes et reste cohérent avec elles. Propose-moi la
> maquette avant de tout construire si tu hésites sur la disposition.

### Prompt 3 — Lead magnet : n'afficher que le vrai

> Projet `crm-vercel`. **Lis `docs/enrichissement/PASSATION-donnees-publiques.md`**, en particulier
> §A1 (l'ADEME est plus fiable que le site du client), §A5 (règles de sûreté) et §A6 (le dépôt).
>
> Objectif : qu'un site de démo n'affiche **jamais** une qualification RGE que l'entreprise ne
> détient pas.
>
> 1. Les qualifications viennent maintenant de l'ADEME, source officielle et quotidienne. Une
>    entreprise pour laquelle on n'a rien ne doit afficher **aucun bloc** de certifications — pas un
>    bloc vide, pas un placeholder. Le tweak d'affichage doit gérer ce cas proprement.
> 2. Une qualification récemment expirée peut rester affichée — c'est un choix assumé du
>    propriétaire — mais l'interface CRM doit **montrer la date** pour qu'il décide en connaissance
>    de cause.
> 3. Remplace les logos actuels par ceux de `public/rge/` : 12 fichiers normalisés au même gabarit
>    360×180, en 1× et 2×, avec `mapping.json` qui relie chaque `nom_certificat` ADEME à son fichier.
>    Ils sont déjà équilibrés optiquement, ne les redimensionne pas à la main.
> 4. `stat_rge_count` doit devenir un `count(*)` sur les qualifications valides, plus une saisie.
>    Attention : `stat_rge_count_official` reste prioritaire et **ne se touche pas**.
> 5. Les exigences de complétude vivent en double (`required-fields.ts` et `missingForSite`), avec un
>    test qui vérifie l'alignement. Toute modification doit être faite des deux côtés.

### Prompt 4 — Templates Claude Design

> À passer à Claude Design, pas au CRM.
>
> Les blocs « certifications » et « RGE » des templates doivent être repris. Le jeu de logos officiel
> est désormais normalisé : 12 fichiers PNG sur un canvas unique de 360×180 (plus une version @2x),
> tous mis à l'échelle sur leur aire optique et non sur leur hauteur, donc une rangée s'aligne sans
> ajustement manuel. Ne pas les recadrer ni les redimensionner un par un.
>
> Deux comportements à prévoir :
> - nombre variable de logos, de 1 à 6 selon l'entreprise ;
> - **zéro logo** : le bloc entier disparaît, sans laisser d'espace ni de titre orphelin.
>
> Les noms de fichiers font foi et servent de clé depuis le CRM : `qualipac`, `qualibois`, `qualipv`,
> `qualisol`, `chauffage-plus`, `ventilation-plus`, `qualibat`, `qualifelec`, `opqibi`, `opqibi-rge`,
> `certiforage`, `recharge-elec`.

---

## C. Ce que j'ajouterais à ta liste

1. **La résolution des SIRET est le préalable absolu.** Aucun des quatre chantiers ne fonctionne
   sans elle, et c'est le seul qui demande du jugement. À traiter en premier, dans le prompt 1.
2. **Arrêter la prospection sur les entreprises mortes.** Trois cas déjà identifiés. C'est du temps
   commercial économisé et de la réputation d'envoi préservée.
3. **Surveiller les expirations RGE.** Une qualification qui expire est à la fois un motif d'appel
   et une raison de retirer un logo d'une démo publiée. Un job quotidien suffit.
4. **Les 100 fiches encore en `clients × 2`.** Le motif reste visible en démo ; une passe de
   variation du ratio suffirait, sans recherche web.
5. **Le logo RGE générique manque** dans `public/rge/`. Le logo Qualibat livré est la version simple,
   sans bandeau RGE, alors que QUALIBAT-RGE représente 60 % du marché. À récupérer auprès de
   l'ADEME ou de France Rénov (les deux bloquaient l'accès automatisé au moment de l'écriture).
   **Ne pas fabriquer de badge RGE par-dessus un logo existant** : ce serait créer une marque.
6. **L'email et le téléphone déclarés à l'ADEME** sont une source officielle non exploitée. Elle a
   déjà rendu 9 adresses sur 32 fiches testées. 31 fiches restent sans email.
7. **Un inventaire d'API plus complet tournait** au moment de la rédaction (BODACC pour les
   procédures collectives, API Sirene, RNE/INPI, géocodage). Son résultat est dans
   `/private/tmp/claude-501/.../tasks/wp6268mua.output` s'il a abouti ; sinon il est peu coûteux de
   le relancer.
