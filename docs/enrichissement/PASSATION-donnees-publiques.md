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

   **Mesuré depuis** : `q=CLIMIZ` et `q=Eco Solutions 44&code_postal=44800` rendent tous deux
   `total_results: 0`. L'échec est SILENCIEUX — un 200 avec une liste vide, indiscernable d'une
   entreprise qui n'existe pas. D'où l'élargissement progressif implémenté dans
   `variantesDeRecherche`.

7. **Le SIRET à retenir est celui de l'ÉTABLISSEMENT, pas du siège.** Généralisation du piège 4, et
   il mord dès le premier cas testé : la fiche « CLIMIZ, Paris 75011 » est TOP CLIMATISATION, dont
   le **siège est à Paris 75017** et dont l'établissement du 75011 porte le SIRET
   `88829510200014`. Retenir le siège donne la bonne entreprise à la mauvaise adresse, et
   interroge ensuite l'ADEME sur un établissement qui ne porte pas les qualifications.
   Le filtre `code_postal` s'applique aux `matching_etablissements`, pas au siège : c'est là qu'il
   faut lire le résultat.

8. **Homonymes stricts dans le parc.** « Chaleur et Confort » du CRM (id 2456/2457) est à **Dinan
   22100** ; l'entreprise décrite en §A7 est à **Lestrem 62136**, SIREN 749892840, avec des
   qualifications qui courent jusqu'en 2027. Deux entreprises distinctes, même nom. `q=CHALEUR ET
   CONFORT` rend 34 résultats. C'est la raison concrète pour laquelle la validation reste humaine.

9. **`ca: 0` est confirmé, `resultat_net` suit la règle INVERSE.** Sur 20 SIREN sondés, 13 ont
   répondu et 8 avaient déposé des comptes : 6 sont à `ca: 0`, et le résultat net est publié **8
   fois sur 8** — dont un négatif (−59 769 €), ce qui prouve que c'est une vraie valeur signée.
   Le résultat net est donc le chiffre qu'on a presque toujours ; il ne doit **pas** être annulé
   quand il vaut 0, contrairement au CA.

10. **`recherche-entreprises` a bien un quota, contrairement à ce qui est écrit plus haut.**
    40 requêtes lancées en parallèle : **26 sont revenues en HTTP 429 « Too Many Requests »**.
    En cadençant (~4 requêtes puis une pause d'une seconde), les 40 passent. Le traitement doit donc
    rester séquentiel, et un 429 mérite un backoff plutôt qu'un simple comptage en erreur.
    **L'ADEME, elle, encaisse 40 requêtes simultanées sans broncher** — le quota est propre à
    `recherche-entreprises`.

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

### A4. Le verrou : ~~il n'existe aucune colonne `siret`~~ — LEVÉ le 08/08/2026

> **Fait depuis.** `entreprises.siret` / `.siren` existent, avec contrôle de format, cohérence
> SIREN = préfixe du SIRET, et unicité sur les fiches non fusionnées. Voir
> `sql/20260808_donnees_publiques_siret.sql` et §A8 ci-dessous.
>
> Mesure corrigée : ce sont **41 SIREN** (couvrant 40 fiches, toutes dans les 190), et non 93, qui
> sont extractibles des notes de `contacts` ; **5 seulement** portent un SIRET à 14 chiffres. Les
> 150 fiches restantes n'ont aucun identifiant.

`entreprises` n'avait ni `siret` ni `siren`. Les SIREN déjà trouvés ne vivaient que dans le texte des
notes de `contacts`. **Rien n'était possible sans cette colonne.**

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

### A8. Le socle livré le 08/08/2026 (prompt 1)

Branche `claude/crm-siret-enrichment-ss4j8f`. Schéma et cron **déjà appliqués** sur
`llzrpcbwnqvbrcjjwysm` ; le code attend un déploiement.

**Le choix de conception à connaître avant de toucher à quoi que ce soit** : tout ce qui vient des
API vit dans `entreprises_donnees_publiques`, une table 1:1 que rien d'humain n'écrit. La règle
« ne jamais écraser le saisi humain ni les `*_official` » n'est plus une consigne qu'on peut
oublier — l'hydratation n'a pas accès aux colonnes à protéger. Un test l'affirme en constatant les
tables qui n'ont **pas** été écrites.

| Objet | Rôle |
|---|---|
| `entreprises.siret` / `.siren` | Identité validée par un humain. Seul `PATCH /resolution` l'écrit. |
| `entreprises_donnees_publiques` | Identité, taille, finances, dirigeants. 100 % API. |
| `entreprise_rge_qualifications` | Une ligne par qualification, avec ses dates. Retrait marqué, jamais supprimé. |
| `entreprise_siret_candidats` | Candidats scorés, à trancher. |
| `donnees_publiques_runs` | Journal : distingue « rien à faire » de « rien fait ». |
| `donnees_publiques_settings` | Cadences (RGE 24 h, identité 720 h, finances 8760 h) et taille de lot. |
| `v_donnees_publiques_a_rafraichir` | **La** définition de « périmé ». Ne pas la recopier ailleurs. |
| `v_rge_qualifications_valides` | Non retirées, avec `expiree` et `expire_bientot` (90 j). |

Routes : `POST /api/donnees-publiques/hydrate` (bouton, force), `/api/cron/donnees-publiques`
(pg_cron `donnees-publiques-tick`, `7 * * * *`), `POST|GET|PATCH /api/donnees-publiques/resolution`.
Composant `BoutonDonneesPubliques` à déposer dans une modale de fiche.

**Deux gains non prévus par cette note :**

- **L'ADEME accepte un joker** : `qs=siret:<siren>*` trouve les qualifications portées par
  n'importe quel établissement du SIREN. Le piège 4 (« siège ≠ établissement ») est donc réglé sans
  coût — c'est la même requête. Utiliser `qs` et non `q` : `q` cherche en plein texte et peut
  ramener une ligne étrangère.
- **`nom_certificat` a 40 valeurs**, pas 16. `public/rge/mapping.json` en couvre 16 ; les
  ~20 `CERTIFICAT_*` sont des certificats d'audit nominatifs, sans logo. Le rendu doit tolérer
  l'absence de logo, ce n'est pas une anomalie.

**Deux pièges d'implémentation, pour ne pas les repayer :**

- `_id` de l'ADEME (`45415-32-2026-06-11`) porte la date de publication du jeu et **change chaque
  jour** : s'en servir comme clé créerait un doublon quotidien. La clé stable est
  (siret, code_qualification, date_debut).
- Un index d'**expression** (`coalesce(...)`) ne peut pas être visé par `on_conflict` de PostgREST.
  D'où `nulls not distinct` sur des colonnes nues.
- `nom_qualification` a ses **accents mutilés à la source** (« gnrateur photovoltaque raccord au
  rseau »). Ne pas l'afficher tel quel ; `nom_certificat`, `domaine` et `meta_domaine` sont propres.

### A9. Le cockpit livré le 08/08/2026 (prompt 2)

`lib/donnees-publiques/fiche.ts` est le module PUR qui porte tout le jugement d'affichage
(risques, accroches, classement des dirigeants), partagé par les deux surfaces via le composant
`DossierEntreprise` : fiche agent `espace-agent/entreprises/[id]` et page admin `companies/[id]`,
où il passe **avant** les champs éditables.

**40 fiches ont été hydratées** au passage (celles dont le SIREN vivait dans les notes). Les
couvertures réelles, qui remplacent les estimations de §A3 :

| Donnée | Couverture mesurée sur 40 |
|---|---|
| **Dirigeants nommés** | **40/40 — 100 %** |
| Tranche d'effectif | 19/40 — 47 % |
| Résultat net | 16/40 — 40 % |
| **Chiffre d'affaires** | **5/40 — 12 %** |

Le dirigeant nommé est donc la seule donnée toujours là : c'est LUI qui remplace l'appel à
l'aveugle, pas le CA. D'où la règle d'affichage unique — **un bloc sans contenu n'est pas rendu**.

Trois détails coûteux à redécouvrir :

- Certains « dirigeants » sont des **commissaires aux comptes** (auditeurs externes, ne décident
  rien) ou des **personnes morales** (on n'appelle pas une holding). Les deux sont traités à part.
- La **liquidation précède la radiation** de plusieurs mois : se fier au seul `etat_administratif`
  laisse démarcher une entreprise morte. La qualité des dirigeants est le second signal.
- 30 qualifications sur 10 entreprises, **dont 7 expirent sous 90 jours** — les accroches d'appel
  de §A7 existent bel et bien.

### A10. État de départ du prompt 3, et la décision déjà prise

Les 190 projets se répartissent en trois groupes qu'il ne faut **pas** confondre :

| Groupe | Projets | Dont `stat_rge_count` saisi | Qualifs ADEME |
|---|---|---|---|
| **A.** sans SIRET — *on n'a jamais regardé* | 150 | 65 | 0 |
| **B.** SIRET + ADEME rend 0 — *absence VÉRIFIÉE* | 30 | 8 | 0 |
| **C.** SIRET + qualifications réelles | 10 | 10 | 30 |

`stat_rge_count_official` est renseigné sur **0** projet : la colonne prioritaire est vide partout,
donc rien ne la protège aujourd'hui d'un affichage dérivé — raison de plus pour ne pas y toucher.

> **DÉCISION DU PROPRIÉTAIRE (08/08/2026)** — `count(*)` ne fait autorité **que là où on a
> vérifié**, c'est-à-dire quand la fiche porte un SIRET (groupes B et C). Les 8 cas du groupe B
> perdent leur bloc RGE : c'est exactement le cas ECLEIS, une allégation prouvée fausse. Les 65 du
> groupe A **gardent leur valeur saisie**, assortie d'un avertissement visible dans le CRM disant
> qu'elle n'est pas vérifiée.
>
> Le raisonnement : ignorance et absence vérifiée ne sont pas la même chose, et un `count(*)`
> appliqué partout les confondrait — retirant des qualifications probablement réelles sur 65 démos.

**Ce qui reste à faire :** les fiches du groupe A attendent un passage de `POST /resolution`
puis une session de validation humaine. Tant qu'elles n'en ont pas, leur bloc RGE reste déclaratif.

### A11. Comment résoudre les SIRET restants — la méthode qui marche

**Constat du propriétaire, et il est juste** : la résolution est un travail PONCTUEL. Construire
dans le CRM un chercheur assez souple pour y arriver seul, c'est soit un LLM qui coûte à chaque
appel, soit un algorithme qui plafonne. Une session Claude avec accès web lit le pied de page du
site et trouve le numéro en quelques secondes.

**La méthode, en trois temps, et les trois sont nécessaires :**

1. **Chercher sur le web** (`WebSearch` fonctionne même quand le réseau du conteneur bloque les API
   `.gouv.fr` — ce sont deux chemins différents). Pappers, societe.com, l'annuaire, le site lui-même.
2. **Confirmer au registre.** Non négociable. La clé de Luhn valide la FORME, pas l'existence.
3. **Écrire avec la preuve** : `siret_source = 'recherche_web'` et l'URL dans le commentaire.

`validerCandidat` impose désormais l'étape 2 : elle interroge le registre avant toute écriture et
refuse un `siret_inconnu_au_registre`. Les divergences (code postal, entreprise cessée) ne bloquent
pas mais remontent dans `avertissements`.

**Pourquoi l'étape 2 n'est pas une précaution théorique** — deux cas rencontrés :

- Fiche 57 : la recherche web propose DEUX SIREN, même adresse, même patronyme.
  `83355558400014` KM DEPANNAGE (NAF 43.22A, chauffage, cessée) et `53498039600038`
  MOHAMED KHELOUF (**NAF 49.32Z, taxi**, active). Sans le registre : une chance sur deux.
- Fiche 2006 : l'annuaire web annonce « Président Djillali Berradia », le registre dit
  **« Liquidateur »**. L'officiel est à jour, l'annuaire non.

**Les trois entreprises mortes de §A7 sont traitées** et sortent de la prospection :

| Fiche | Au registre | État |
|---|---|---|
| 57 KM Dépannage | KM DEPANNAGE | liquidée 31/03/2025 |
| 1494 EMC Sarl | EDDIA NOUVELLE AQUITAINE | cessée 27/05/2026 |
| 2006 Energie Confort 33 | ENERGIE CONFORT 33 | liquidée 31/08/2025 |

**État de la base au 08/08/2026** (le propriétaire fait tourner une passe locale, ces chiffres
montent) : 42 fiches avec SIRET, 42 hydratées, 30 qualifications RGE, 3 cessées,
148 projets encore sans identifiant.

---

## B. Les prompts

Découper en **quatre conversations** plutôt qu'une. C'est précisément le mur de contexte qui a
motivé cette passation : une seule conversation pour les quatre chantiers s'y heurtera aussi.
Chacune peut faire plusieurs commits.

### Prompt 1 — Socle de données (Supabase + hydratation) — ✅ FAIT le 08/08/2026, cf. §A8

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

### Prompt 4 — Templates Claude Design ✅ CÔTÉ DESIGN · ⛔ CÔTÉ CRM

> **MISE À JOUR (09/08/2026, bundle `template_cvc13.zip`).** Le second volet est
> livré : le texte est pilotable. **Il ne reste RIEN à passer à Claude Design.**
> Les quatre prompts du plan sont épuisés côté design.
>
> Audité en simulant ce que le CRM retirera — les 6 variantes sont identiques :
>
> | Vérification | Résultat |
> |---|---|
> | Contrat | 81 `data-rge="oui"` · 61 `"non"` · 12 `data-rge-noms` · 28 metas jumelés |
> | Allégations restantes en version « sans RGE » | **0** |
> | `<meta>` affirmant le RGE sans jumeau | **0** |
> | Barre de confiance / grille `assure-card` | 3 items · 4 cartes dans les DEUX variantes |
> | Section aides en version « sans RGE » | supprimée |
> | Bloc de logos de `cvc12` | intact |
>
> Le défaut CSS est sûr et respecte §A10 par construction :
> `html:not([data-sans-rge]) [data-rge="non"] { display: none }`. Sans action du
> CRM, la page reste celle qui est livrée. Ce CSS voyage avec la section à
> l'import (68 sections portent déjà un `<style>`), donc **importer `cvc13`
> aujourd'hui est sans risque — mais sans effet** tant que le CRM ne retire pas
> les nœuds.
>
> Le panneau Tweaks est fusionné : `masquerCertifications` a disparu, un seul
> curseur « Vérifiées par l'ADEME » (0→5) bascule bandeau + 6 zones + meta.
> L'état incohérent (logos masqués, texte affirmant le RGE) n'existe plus.
>
> **⛔ CE QUI BLOQUE : rien n'est écrit côté CRM.** Cf. la fin de
> [`PROMPT-4b-variantes-rge.md`](./PROMPT-4b-variantes-rge.md).
>
> | À écrire | Rôle |
> |---|---|
> | `strip-rge-regions.ts` | **retirer** les nœuds de la variante inutilisée — pas les masquer en CSS : un texte caché reste dans la source et lisible par les moteurs |
> | bascule `data-content-sans-rge` | remplacer l'attribut `content` du `<meta>` |
> | remplissage `data-rge-noms` | y écrire les `nom_certificat` réels |
>
> Verdict repris tel quel de `rge-compteur.ts` : `> 0` → « oui » ; ADEME
> interrogée et zéro → « non » ; **non vérifié → on ne touche à rien**.
> Branchement dans `condition-service-markup.ts`, garde-fou via
> `porteDesCertifications` (jamais une liste de marqueurs recopiée, cf. le bug
> du 09/08 où le site publié divergeait de l'aperçu).
>
> **Deux résidus connus, réparables côté CRM, non bloquants :**
>
> 1. **5 `<meta description>` nomment une qualification en dur** côté « oui »
>    (« RGE QualiPAC », « qualifié Qualifelec »). Faux pour une entreprise qui ne
>    détient que Qualibat. Inapplicable via `data-rge-noms` : c'est un attribut,
>    pas un élément. À traiter au rendu.
> 2. **Un avis d'exemple** : « Ils nous ont monté tout le dossier MaPrimeRénov'. »
>    Remplacé dès qu'il y a de vrais avis, mais `hydrateReviews` conserve
>    délibérément les cartes d'exemple quand il n'y en a aucun.
>    Exposition mesurée : **12 projets** (sans avis ET zéro RGE vérifié).
>
> **Plafond de logos, mesuré — ce n'est pas 12.** `mapping.json` reconnaît 16
> certificats qui se réduisent à **10 logos distincts** (QualiPAC ×2 → un seul,
> QualiPV ×2 → un seul, Qualisol ×3 → un seul, Qualibois ×2 → un seul). 8 sont en
> usage aujourd'hui ; `opqibi-rge.png` et `recharge-elec.png` existent mais aucun
> certificat ne pointe dessus. Maximum observé sur une entreprise : **5**.
> **Aucun plafond dans le code** — 20 logos en entrée donnent 20 cartes ; le
> curseur d'aperçu s'arrête à 5, le rendu non. Le commentaire du template dit
> « 12 au maximum » : c'est 10.
>
> ---
>
> **Historique — l'état avant `cvc13` :** les LOGOS étaient pilotés, les BADGES
> TEXTE non. Le prompt 4 demandait les deux et disait du second que c'était « le
> vrai problème, pas la mise en forme ».
>
> Mesuré sur `template_cvc12`, hors bloc piloté, commentaires exclus :
>
> | | |
> |---|---|
> | Allégations écrites en dur, par variante | **76** |
> | …sur 6 variantes | **456** |
>
> Quatre familles, toutes affirmant la même chose à **tous** les clients :
>
> | Où | Ce qui est écrit |
> |---|---|
> | pied de page `.label-badge` | `RGE QualiPAC` · `Qualibat` · `Qualifelec` |
> | `<meta name="description">` | « Artisan installateur RGE QualiPAC… » |
> | barre de confiance du hero | « Certifié **RGE QualiPAC** » |
> | carte argumentaire | « Certifié RGE QualiPAC — une qualification reconnue par l'État » |
> | section aides | « Étant certifiés RGE QualiPAC, nos installations y ouvrent droit » |
>
> Pour 88 projets sur 190, l'ADEME confirme **zéro** qualification : sur ceux-là,
> chacune de ces phrases est fausse. Le bloc logos disparaît correctement — et
> le pied de page continue d'afficher trois badges.
>
> S'y ajoute une sixième zone, la plus sensible : **125 mentions d'aides par
> variante** (MaPrimeRénov', CEE, Coup de pouce, éco-PTZ). Ces aides **exigent
> légalement** un installateur RGE. Une entreprise sans RGE qui laisse entendre
> que ses travaux y ouvrent droit fait perdre au client une aide qu'il croyait
> acquise — ce n'est plus une exagération commerciale.
>
> ➜ **Le prompt à passer à Claude Design est dans
> [`PROMPT-4b-variantes-rge.md`](./PROMPT-4b-variantes-rge.md)**, avec le contrat
> `data-rge="oui"` / `data-rge="non"` et ce qui reste à écrire côté CRM. Le
> principe retenu par le propriétaire : **deux rédactions**, pas une zone qui se
> vide — un site sans RGE doit rester complet, pas troué.
>
> **MISE À JOUR (09/08/2026, bundle `template_cvc12.zip`).** Le propriétaire a
> repris les templates dans Claude Design. Les **six** variantes (Agency, Brut,
> Classique, Nocturne, Studio, Verdure) portent maintenant un markup identique :
>
> ```html
> <section class="section certif-band" id="sec-certifs">
>   <p class="certif-lead">Certifications &amp; qualifications reconnues par l'État</p>
>   <div class="certif-row reveal" data-certifications="">
>     <div class="certif-logo" data-certification-item=""><img … data-certification-logo="" width="360" height="180"></div>
>   </div>
> </section>
> ```
>
> Tout ce qui était « souhaitable » est fait : attributs `data-*`, **une seule**
> carte-gabarit au lieu de cinq logos en dur, canevas 360×180, `.certif-logo--tall`
> supprimée. Et trois ajouts qui vont au-delà :
>
> - `site.js` bascule la rangée en **bandeau défilant à partir de 4** logos. Il
>   clone les cartes en leur retirant `data-certification-item` /
>   `data-certification-logo` et en posant `aria-hidden` — donc les clones ne se
>   font jamais re-hydrater ni annoncer. Il sort en `if (!row) return;` quand le
>   CRM a supprimé la section.
> - CSS `.certif-band:not(:has(.certif-logo)) { display: none }` — ceinture et
>   bretelles : même une rangée vide ne laisserait pas de chapeau orphelin.
> - Un curseur `nbQualifications` (0→5) dans `index-tweaks.jsx` pour prévisualiser
>   le rendu à chaque nombre. **Aperçu seulement** (clones `data-certif-apercu`),
>   sans effet sur le site publié.
>
> **Deux défauts trouvés côté CRM en vérifiant, et corrigés :**
>
> 1. `LibrarySectionInline` — le rendu du site **publié** — court-circuitait
>    l'hydratation sur `html.includes("data-certifications")` seul. Les sections
>    déjà en base ne portent que `.certif-row` : elles étaient corrigées dans
>    l'aperçu de l'éditeur et **pas en ligne**. La divergence allait dans le pire
>    sens. Le garde-fou vient maintenant du module (`porteDesCertifications`), il
>    ne se recopie plus.
> 2. Conteneurs imbriqués : un design posant `data-certifications` sur la
>    `<section>` en gardant `.certif-row` dedans faisait garnir la section
>    elle-même — `set_content` y effaçait la rangée flex ET le chapeau, laissant
>    les cartes nues. Règle posée : **le conteneur le plus profond gagne**.
>
> 20 tests sur `hydrate-certifications`, dont 7 sur le markup réel de `cvc12`.
>
> **Reste ouvert, mineur** : si un design est exporté avec le curseur
> `nbQualifications` à 0, le markup capturé n'a plus de carte-gabarit ; le tweak
> ne sait alors rien dupliquer et la section disparaît quelles que soient les
> vraies qualifications. Remettre le curseur à ≥1 avant export.

> **Mise à jour précédente (08/08/2026, bundle `template_cvc11.zip`),
> conservée pour mémoire.**
> Il n'est plus nécessaire de reprendre les templates pour que le contrôle ADEME
> fonctionne. `hydrate-certifications` reconnaît **la convention que les
> templates CVC portent déjà** :
>
> | Rôle | Contrat explicite | Convention CVC existante |
> |---|---|---|
> | conteneur | `data-certifications` | `.certif-row` |
> | carte-modèle | `data-certification-item` | `.certif-logo` |
> | image | `data-certification-logo` | `img` |
>
> La suppression remonte à la `<section>` porteuse (`#sec-certifs` /
> `.certif-band`) pour emporter le chapeau « Certifications & qualifications
> reconnues par l'État » — sans quoi il resterait orphelin.
>
> Quatre tests tournent sur le markup RÉEL du template, copié tel quel.
>
> **Gain visuel non prévu** : le CSS du template force `height: 84px; width:
> auto` alors que ses images vont de 120×120 à **719×968** — la rangée est
> bancale. Les fichiers de `public/rge/` partagent tous le canevas 360×180, donc
> ils se rendent à l'identique. Le remplacement corrige l'alignement en même
> temps que l'exactitude, et rend la variante `.certif-logo--tall` inutile.
>
> **Nombre de logos, mesuré** : 43 entreprises en ont 1, 25 en ont 2, 9 en ont 3,
> 4 en ont 4, 2 en ont 5. Maximum théorique 12, **maximum observé 5**. Le
> `.certif-row` est déjà en `flex-wrap: wrap`, il encaisse.
>
> Ce qui reste souhaitable, mais NON bloquant : poser les attributs `data-*`
> (plus robustes qu'une classe qu'on renomme), ne laisser qu'UNE `.certif-logo`
> comme gabarit, retirer `.certif-logo--tall`, et vérifier que la section est
> belle **absente** — c'est le cas de 88 projets sur 190, donc le cas fréquent.

Le reste de cette section décrit l'état AVANT cette mise à jour, conservé pour
mémoire.

État réel des sections au moment de l'écriture :

| | |
|---|---|
| Sections en HTML brut (`render_mode='raw'`) | **460** |
| …mentionnant certif / Qualibat / RGE | **454** |
| …portant le marqueur `data-certifications` | **0** |

Et ce ne sont pas des logos : ce sont des **badges TEXTE écrits en dur**, du type
`<span class="label-badge">RGE QualiPAC</span> <span class="label-badge">Qualibat</span>`,
généralement en pied de page. Ils attribuent donc les mêmes trois certifications à **tous** les
clients, quels qu'ils soient. Le CRM sait maintenant lesquelles sont réelles (66 projets avec des
qualifications vérifiées, 88 pour lesquels l'ADEME confirme ZÉRO), mais **aucun template ne sait les
recevoir** : le tweak `hydrate-certifications` ne trouve aucun marqueur et ne fait rien.

Le prompt ci-dessous est celui à passer à Claude Design.

---

> Les blocs « certifications » / « RGE » des templates doivent être repris. Aujourd'hui ils portent
> des badges écrits en dur — `RGE QualiPAC`, `Qualibat`, `Qualifelec` — affichés pour **toutes** les
> entreprises. C'est une allégation trompeuse : le CRM sait désormais lesquelles sont réellement
> détenues, et pour beaucoup d'entreprises la réponse vérifiée est « aucune ».
>
> **Ce qu'il faut produire : un bloc pilotable par le CRM.** Trois attributs, et c'est tout :
>
> ```html
> <div data-certifications class="...">
>   <div data-certification-item class="...">
>     <img data-certification-logo src="/rge/qualipac.png" alt="QualiPAC module Chauffage et ECS">
>   </div>
> </div>
> ```
>
> - `data-certifications` — le conteneur. **Le CRM le SUPPRIME entièrement** quand l'entreprise n'a
>   aucune qualification vérifiée. Il ne doit donc rien contenir d'autre que les logos : pas de
>   titre « Nos certifications » à l'intérieur si vous voulez le voir disparaître avec, pas de
>   marge portée par un parent qui resterait orphelin.
> - `data-certification-item` — la carte-modèle. La **première** sert de gabarit et sera dupliquée
>   autant de fois qu'il y a de logos réels. Mettez-en une seule dans le markup livré.
> - `data-certification-logo` — le `<img>` à remplir. Le CRM y écrit `src`, `srcset`, `alt`,
>   `width`, `height`.
>
> **Retirez tous les badges texte en dur.** C'est le vrai problème, pas la mise en forme.
>
> **Le jeu de logos** est dans `public/rge/`, déjà normalisé : 12 fichiers PNG sur un canvas unique
> de **360×180**, plus une version `@2x`, tous mis à l'échelle sur leur aire optique et non sur leur
> hauteur. Une rangée s'aligne donc sans ajustement. **Ne les recadrez pas, ne les redimensionnez
> pas un par un**, ne leur imposez pas une hauteur commune — ce serait défaire la normalisation.
>
> Noms de fichiers, qui font foi et servent de clé depuis le CRM :
> `qualipac`, `qualibois`, `qualipv`, `qualisol`, `chauffage-plus`, `ventilation-plus`, `qualibat`,
> `qualifelec`, `opqibi`, `opqibi-rge`, `certiforage`, `recharge-elec`.
>
> **Deux comportements à prévoir dans la mise en page :**
>
> - **nombre variable, de 1 à 6 logos** selon l'entreprise. Une rangée qui suppose exactement trois
>   éléments cassera. Mesuré sur le parc : la plupart en ont 1 ou 2, le maximum observé est 6.
> - **zéro logo** : le bloc entier disparaît, sans laisser d'espace, de séparateur ni de titre
>   orphelin. C'est le cas le PLUS FRÉQUENT — 88 projets sur 190 ont une absence vérifiée contre 66
>   avec des qualifications réelles. Concevez donc la section pour être belle *absente*, pas
>   seulement pleine.
>
> **Ne fabriquez aucun badge RGE par-dessus un logo existant** : ce serait créer une marque. Et
> n'ajoutez pas de logo « générique RGE » — il manque toujours dans `public/rge/`, et l'inventer
> serait exactement l'allégation qu'on cherche à supprimer.

---

### Prompt 4 (version d'origine) — Templates Claude Design

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
