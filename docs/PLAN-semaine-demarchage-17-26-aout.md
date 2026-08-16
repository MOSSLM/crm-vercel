# Plan de la semaine — 17 au 26 août 2026

*Écrit le 16/08/2026. Tous les chiffres sont des `count(*)` mesurés le jour même
sur le projet Supabase `llzrpcbwnqvbrcjjwysm`. Tous les chemins de fichiers sont
lus sur `origin/main` (e8f2e0f), pas sur le répertoire de travail.*

> **ÉTAT AU SOIR DU 16/08 — ce document est un DIAGNOSTIC, plus une liste de
> tâches.** Les défauts décrits aux §3 et §4 ont été corrigés depuis, sur la
> branche `claude/campagne-demarchage-aout` ; ils sont conservés ici parce
> qu'ils expliquent POURQUOI le code a la forme qu'il a. Ce qui reste vrai :
>
> - **Fait** : filtre `enrollment_id` levé (3.1) · quotas réglables par agent
>   (3.2) · recherche « quelqu'un rappelle » branchée (3.3) · cadre du sprint
>   sorti du code (3.4) · filtre de cohorte de bout en bout (3.5) · journal des
>   étapes + déclencheur, appliqués en base (4.1) · `stageRole` reconnaît
>   « Lost » (4.4) · plaquette publique `/plaquette` (§2) · entonnoir à huit
>   étages, lisible par cohorte et par âge (§5).
> - **Reste à faire, et ce n'est pas du code** : appliquer
>   `sql/20260816_quotas_demarchage_campagne.sql` — tant que
>   `agent_settings.quotas_demarchage` vaut NULL, la file plafonne à 60/jour et
>   quarante entreprises par jour glissent au lendemain sans un signal.
>   L'attribution, elle, est faite : les 600 fiches portent leur cohorte et leur
>   `owner_id`.

---

## L'objectif, en une phrase

Deux cohortes de 300 entreprises, démarchées à 100 par jour, comparées **au même
âge** (J+1, J+3, J+7, J+14) pour savoir laquelle mérite d'être multipliée après
le 26 août.

| | |
|---|---|
| **Cohorte A** — 17, 18, 19 août | 300 entreprises **avec un site faible** → le document est un **audit personnalisé** |
| **Cohorte B** — 20, 21, 22 août | 300 entreprises **sans site** → le document est une **plaquette** + une démo |
| 23–25 août | Plus aucune nouvelle touche. Relances, décisions, encaissements. |
| 26 août | Départ. |

Indicateur roi : **CA pour 100 premiers contacts**, doublé de **opportunités
sérieuses pour 100 contacts** — parce qu'à trois ou quatre ventes par groupe, le
closing seul ne prouve rien.

---

## 0. Trois constats à lire avant tout le reste

### 0.1 Le répertoire de travail est mort

```
git rev-list --left-right --count HEAD...origin/main  →  3 / 222
```

La branche sortie (`claude/enrichissement-donnees-publiques`) a **222 commits de
retard**. Entre-temps, `main` a supprimé `AuditPage1..6.tsx` et
`src/utils/audit/htmlPage1..6.ts`, réécrit le moteur du document, refait le
chargement des données pour 60 000 fiches, et **livré un cockpit de démarchage**.

Coder sur ce répertoire, c'est écrire contre des fichiers qui n'existent plus et
réinventer une page qui existe. **Rien d'autre ne compte tant que ce n'est pas
réglé.**

### 0.2 La machine d'envoi est à l'arrêt et en mode test

`regulator_settings` en production :

```
paused = true        test_mode = true        daily_cap = 120
```

`test_mode = true` veut dire que **seules les six adresses de test reçoivent
réellement** ; tout le reste est retenu avant Resend et journalisé en
`blocked_reason = 'mode_test'`. Demain matin, dans l'état actuel, zéro email
part. C'est une décision à prendre consciemment, pas un bouton à pousser en
passant — mais elle doit être prise **ce soir**.

### 0.3 Le cockpit que tu demandes existe déjà, à trois manques près

`src/app/(crm)/espace-agent/demarchage/page.tsx` (313 lignes sur `main`) fait
déjà : file du jour à gauche, entreprise au centre (dossier + frise de séquence
+ carte d'action + historique), outils à droite (démo, audit, RDV, registre).
`src/lib/agent-portal/demarchage-buckets.ts` étale la file sur des journées
datées, remonte les signaux chauds hors quota. `src/app/api/agent/tasks/route.ts`
(519 lignes) assemble déjà le signal de visite GA4, les réponses, le dernier
appel, et la distinction premier-contact / conversation.

Le chantier 2 n'est donc **pas une création**. C'est trois modifications ciblées
(§3).

---

## 1. Ce qu'on a réellement en stock

### Le vivier

| | |
|---|---|
| fiches vivantes non masquées | **60 317** |
| avec un site | 26 755 |
| **sans site** | **33 562** — dont 32 054 avec téléphone, 33 436 avec email |
| **attribuées à un agent (`owner_id`)** | **68** |

### La cohorte A — « site faible »

`entreprises_audit_site` : **1 844 sites notés** (du 09 au 15/08).

| note globale | entreprises | avec téléphone |
|---|---|---|
| ≤ 50 | **448** | 447 |
| ≤ 65 | 561 | 560 |

**448 suffisent pour 300** — mais c'est le seul stock, et le cron d'audit tourne
à 30/heure. Si on veut de la marge, il faut le relancer dès ce soir sur les
26 755 entreprises qui ont un site.

Point noir : **2 captures d'écran sur 1 844**. La couverture de l'audit affiche
la capture du site du prospect ; sans elle, la page 1 tombe sur son repli.

### La cohorte B — « sans site »

33 562 disponibles : aucun problème de volume. Le problème est le **document**.
Pour un prospect sans site, il n'y a pas d'audit à faire — d'où la plaquette.

Et la démo : **36 sites publiés** (`sites.published_subdomain` non nul), sur
128. `lead_magnet_projects` : 216 draft / 113 framer / 24 failed / **10 ready**.
Si le pitch de la cohorte B est « voici votre site », c'est 36 démos pour 300
prospects. **C'est la vraie contrainte de la semaine**, et elle se décide
maintenant : soit on fabrique en masse jeudi–samedi, soit la cohorte B est
démarchée à la plaquette seule et la démo n'arrive qu'après réponse.

### La machine commerciale

| | |
|---|---|
| opportunités | 363 — **329 « Qualifié »**, 25 « Approche », 8 « LM Déployé », 1 « Relance 1 » |
| RDV / Devis / Signature / Acompte / Perdu | **0 partout** |
| séquences actives | **1 seule** (`WhatsApp seul — sans e-mail`) ; les 6 autres en brouillon |
| inscriptions | 34 actives, dont 12 en attente de réponse |
| tâches | 18 en attente (15 WhatsApp, 3 appels) — et **65 appels « skipped » hors séquence** |
| audits | 73 lignes, **1 seul `ready`**, 9 avec un avant/après rédigé |
| jetons de rapport public | 42, dont 7 actifs — **somme des vues : 1** |
| appels journalisés (`calls`) | **0** |

---

## 2. Chantier « Plaquette »

### Le principe

Le document d'audit est déjà un HTML autonome de 3 feuilles A4 × 2 demi-pages,
assemblé par une fonction **pure** : `corpsCompact(content, mesures)` dans
`src/utils/audit/htmlCompact.ts:436`. Six demi-pages :

| # | fonction | personnalisée ? |
|---|---|---|
| 1 | `cCouverture` (l.100) | oui — nom, secteur/ville, capture, URL de démo |
| 2 | `cReleve` (l.222) | oui — tout vient des mesures |
| 3 | `cConstats` (l.276) | oui — les constats du prospect |
| 4 | `cRecu` (l.331) | **non — sa signature ne prend même pas `mesures`** |
| 5 | `cInvestissement` (l.361) | **non — idem** |
| 6 | `cEtapes` (l.403) | quasi — ne lit que `m.captureUrl` |

**Les demi-pages 4, 5 et 6 sont déjà la plaquette.** « Ce que vous recevez »,
« L'investissement », « Les étapes + le CTA » : c'est exactement « les points
forts de nos offres et nos tarifs », déjà rédigé, déjà relu, déjà à la charte.

### Ce qu'il faut faire

1. **Exporter** `cRecu`, `cInvestissement`, `cEtapes` (aujourd'hui privées) et
   ajouter un `corpsPlaquette(content)` à côté de `corpsCompact`.
2. **`sheetFoot(nom, n)`** (`htmlCompact.ts:92`) écrit « N / **3** » en dur et
   « Confidentiel · préparé pour {nom} ». Une plaquette de 2 feuilles afficherait
   « 01 / 3 · préparé pour Entreprise cliente ». Lui passer un total et neutraliser
   la mention nominative.
3. **Nombre pair de demi-pages obligatoire** : `.sheet` est une grille
   `1fr 1fr` en `overflow:hidden` (`compactCss.ts:76`). 3 demi-pages ⇒ soit on en
   ajoute une (une page « références / avant-après génériques » serait la bonne),
   soit on tombe à 2 (Investissement + Étapes) et « Ce que vous recevez » passe
   en page 1. **Tout débordement disparaît en silence** — recette avec l'option
   `debordement`.
4. **Une page publique** : aucune route serveur ne rend le document,
   `generateAuditHtml` n'est appelé que depuis le navigateur. Patron disponible :
   `src/app/(public)/rapport/[token]/page.tsx`. Une plaquette n'a pas besoin de
   jeton — `/plaquette` en accès libre suffit, et c'est un lien qu'on colle dans
   un WhatsApp.
5. **Ne pas la stocker dans `audits`** : `opportunite_id` y est `TEXT NOT NULL
   UNIQUE`. Une plaquette n'appartient à personne.

### Le contenu, déjà disponible

- **Tarifs vivants** : `construirePage5(page5, offres, [])` (`src/lib/audit/offres-audit.ts:127`)
  rend socle + hébergement + alternative sans aucune addition — soit exactement
  le comportement d'un document non personnalisé. Table `offres`, 34 lignes.
  Socle **490 € HT** (fourchette jusqu'à 690) + **19 €/mois**, alternative
  « Site sur mesure » **1 990 €**.
- **Arguments rédigés, sans donnée client** :
  `src/app/(crm)/espace-agent/argumentaire/page.tsx` — points forts, objections,
  et ce qu'on ne promet jamais. `offres.metadata.libelle_client` porte la
  formulation orientée bénéfice sur 12 offres.
- **Charte** : `src/components/audit/AuditShared.tsx:5-11` (5 jetons ; un test
  échoue si un hexadécimal est recopié ailleurs).

⚠️ **Ne pas ressusciter les 4 colonnes de `page4.livrables`.** `main` les a
remplacées par 3 volets, et le commentaire (`default-content.ts:53-64`) dit que
l'ancienne version employait du vocabulaire interdit par la règle éditoriale.

⚠️ **Le prix affiché est figé dans chaque audit.** `audits.content` embarque sa
copie de `page5` : 4 audits annoncent encore 1 490 € + 89 €/mois, 1 annonce
779 €. Et 238 opportunités portent un snapshot « Starter (Framer) » à 1 990 €
alors que 68 audits sur 73 disent 490 €. La plaquette doit lire `offres` en
direct, jamais un contenu figé.

**Coût estimé : une demi-journée.**

---

## 3. Chantier « Cockpit » — trois modifications, pas une page

### 3.1 La file ne voit pas les appels à froid — c'est le bloquant n°1

`src/app/api/agent/tasks/route.ts:115` :

```ts
.not("enrollment_id", "is", null)
```

Commentaire assumé l.93 : « cette page ne montre que les entreprises en
séquence ». Conséquence directe : **les 100 nouvelles entreprises par jour
n'apparaîtront jamais dans le cockpit** si elles ne sont pas inscrites à une
séquence. Les 65 appels déjà créés hors séquence sont invisibles, tous
`skipped`.

Deux issues, à trancher :

- **(a) Inscrire en masse** les 600 entreprises dans une séquence. Cohérent avec
  l'architecture, mais il n'existe qu'**une** séquence `on`, WhatsApp-seul, et
  100 messages WhatsApp manuels par jour n'est pas tenable à la main.
- **(b) Lever le filtre** et laisser entrer les tâches sans `enrollment_id`,
  avec un libellé « appel à froid ». Une ligne de code, réversible.

**Recommandation : (b) tout de suite, (a) en parallèle pour l'email.** Le levier
volume, c'est l'email — 33 436 des sans-site en ont un, l'ADEME les fournit à
99 % — et `daily_cap = 120` colle pile aux 100/jour.

### 3.2 Le quota de la file plafonne à 60/jour

`DAILY_QUOTA = { call: 20, whatsapp: 20, linkedin: 20 }`
(`src/lib/agent-portal/demarchage-buckets.ts:86`).

100 touches par jour ne rentrent pas. À passer en réglage, pas en constante — et
à décider par canal : 100 emails automatiques + 20 appels humains est réaliste,
100 appels ne l'est pas.

### 3.3 La recherche existe mais n'est branchée nulle part

`src/app/api/entreprises/recherche/route.ts` cherche par nom, ville, adresse
**et par numéro dès 4 chiffres** (colonne générée `telephone_chiffres`, index
GIN trigram, **19 ms sur 61 000 fiches**, 58 223 numéros indexés). Elle a été
écrite exactement pour « quand quelqu'un rappelle ».

**Elle a un seul appelant** (`src/utils/api.tsx:719`, le sélecteur de RDV).
Aucun champ de saisie dans `demarchage/page.tsx`. C'est le geste que tu décris —
« taper le numéro ou le nom et voir où elle en est » — et il ne manque que la
barre de recherche, branchée sur le `CompanyBundle` que
`src/app/api/agent/demarchage/company/route.ts` sert déjà.

### 3.4 Deux réglages à corriger tant qu'on y est

- **`/api/agent/sprint`** porte en dur `OBJECTIF_CENTS = 200_000`,
  `DEADLINE = "2026-08-20"`, `SPRINT_START = "2026-08-13"`,
  `CIBLE_CONTACTS_JOUR = 40`. Ces constantes contredisent la campagne : l'écran
  agent affichera un objectif périmé à partir de jeudi.
- **L'attribution** : 68 entreprises possédées sur 60 317. Toute la chaîne agent
  (file, historique, fiche, board) est cadrée sur `entreprises.owner_id`, et
  `/api/agent/claim` est unitaire. **Sans attribution en lot, la file reste vide
  quoi qu'on fasse.**

### 3.5 Le filtre de cohorte, qui manque partout

Rien ne distingue « site faible » de « sans site » dans la file. La matière
existe (`entreprises_audit_site.note_globale`, `site_web_canonique`) mais ne
franchit pas la frontière vers le démarchage. Sans ce filtre, **la comparaison
des deux cohortes est impossible** — c'est la raison d'être de la semaine.

**Coût estimé : une journée pour 3.1 à 3.5.**

---

## 4. Chantier « Entonnoir »

### Pourquoi il n'existe pas

- **Aucune date de changement d'étape.** `opportunites` n'a que `created_at` /
  `updated_at`. `pipeline_events` a 18 lignes, toutes écrites le **10/04/2026
  entre 16h15 et 16h17**, et n'est plus alimentée. `sales_pipeline_state.stage_dates`
  n'est non vide que sur 7 lignes.
- **Aucune perte représentée.** 0 opportunité sur une étape de perte. Et
  `stageRole()` teste `/perdu|abandon|refus|annul/` (`src/lib/opportunites/stage-roles.ts:45`)
  alors que l'étape s'appelle **« Lost »** dans la majorité des pipelines : elle
  tombe en rôle `autre`, donc elle apparaîtrait comme une **colonne
  d'avancement** au lieu d'une perte. Même bug dans `isLostStage`
  (`stages.ts:225`). **Un mot à ajouter à deux expressions régulières.**
- **L'entonnoir affiché aujourd'hui est décoratif.**
  `src/components/dashboard/calculations.tsx:120` compte « Contactées » =
  `contacts.length` (374 fiches contacts, pas des entreprises contactées), et
  « Appelées » vient de `activity_log` / `pipeline_events`, figés en avril.
  La vue SQL `v_conversion_funnel` rend **une ligne**, celle du 10/04.

### Ce qui, en revanche, marche déjà

`agent_activity_events` — **465 lignes vivantes**, écrite par `logPipelineStep`
(`src/app/api/agent/marketing-pipeline/_lib.ts:32`) : `qualify` 215, `skip` 150,
`regenerate_site` 73, `enrich` 21… C'est le seul journal d'activité réellement
alimenté du CRM. C'est le bon patron à étendre, pas à remplacer.

### Ce qu'il faut poser

**1. Un journal d'étapes, alimenté par déclencheur.**

```sql
create table public.opportunite_etapes_journal (
  id            bigserial primary key,
  opportunite_id uuid not null references public.opportunites(id) on delete cascade,
  entreprise_id bigint,
  owner_id      uuid,
  stage_avant   uuid,
  stage_apres   uuid not null,
  survenu_le    timestamptz not null default now()
);
```

+ un `AFTER UPDATE OF stage_id ON opportunites`. **On stocke le `stage_id` brut,
pas un rôle** : le classement se fait à la lecture avec `stageRole()`, qui est
déjà écrit et testé. Pas de logique métier dupliquée en SQL, pas d'`enum` à
faire évoluer — `pipeline_events.stage` est un enum figé
(`lead_trouve…acompte`) qui **ne sait pas exprimer une perte**, c'est pourquoi
je ne le réutilise pas.

**2. Deux colonnes de cohorte sur `entreprises`** :

```sql
alter table public.entreprises
  add column cohorte_demarchage text,      -- 'A_site_faible' | 'B_sans_site'
  add column premiere_touche_le timestamptz;
```

`premiere_touche_le` est ce qui permet la comparaison **au même âge** : sans
elle, comparer les deux groupes samedi soir compare cinq jours de relances à
un jour, ce que la conversation avec ChatGPT dit précisément de ne pas faire.

**3. L'entonnoir, huit étages, chacun avec sa perte** :

| # | étage | source |
|---|---|---|
| 1 | Ciblée | `cohorte_demarchage` |
| 2 | Touchée | `premiere_touche_le` |
| 3 | Jointe / a répondu | `sequence_enrollments.hold_reason='awaiting_reply'`, `email_logs` |
| 4 | Démo ou audit **ouvert** | GA4 (`intentByEnterprise`) — voir l'avertissement §5 |
| 5 | Conversation | `prospection_tasks` `kind='call'` `status='done'` |
| 6 | Plaquette / offre envoyée | `opportunite_offres` |
| 7 | Décision attendue | étape de pipeline |
| 8 | Payée | encaissement |

La perte à chaque étage est la différence entre deux étages consécutifs, plus
les sorties explicites (`perdu`, `nurturing`). Et la vue se lit **par cohorte ×
par âge** (J+1, J+3, J+7, J+14), jamais à date absolue.

**4. Corriger `stageRole` et `isLostStage`** pour reconnaître « Lost ». Quinze
minutes, et sans ça tout le reste ment.

**Coût estimé : une journée.**

---

## 5. Les pièges qui coûteront le plus cher

1. **Coder sur le répertoire actuel.** Coût : la semaine entière.
2. **GA4 n'est peut-être pas branché en production.** `PublicAnalytics` est
   **opt-in par variable d'environnement** (`NEXT_PUBLIC_GA_MEASUREMENT_ID`,
   `NEXT_PUBLIC_CLARITY_PROJECT_ID`) et « silencieusement absent » sinon. Si
   `getGa4Config()` est nul, `intentBySite` rend `[]` **sans erreur** : tous les
   signaux « a visité la démo » valent `null`, les filtres « chauds » et « non
   rappelés » sont vides, et deux compteurs du sprint tombent à zéro sans le
   dire. Signal d'alerte mesuré : `analytics_radar_clarity_cache` = 0 ligne.
   **À vérifier dans les variables Vercel, pas dans un fichier.** Et même branché :
   seuls **36 sites** ont un sous-domaine publié, donc seuls 36 prospects sont
   mesurables.
3. **Le bouton « Valider les audits » ne lit toujours pas le contenu.**
   `/api/agent/marketing-pipeline/audit/route.ts` fait `SELECT id, opportunite_id`
   puis `UPDATE statut='ready'` en masse. L'incident du 12/08 — 67 audits validés
   en 10 secondes sans constat rédigé, `sql/ROLLBACK_20260814_devalidation_audits.sql` —
   peut se rejouer, et cette semaine il y a 300 audits à préparer. Le garde-fou
   existe sur la branche non fusionnée `claude/bareme-audit-contenu-netlinking`.
4. **La page publique `/rapport/[token]` se rend même sans mesure ni rédaction**
   (repli sur `getDefaultAuditContent`). Envoyer « voici l'audit de votre site »
   vers une de ces pages est décrit dans le code comme pire que ne rien envoyer.
   1 audit `ready`, 9 avec un avant/après : **le stock rédigé n'existe pas.**
5. **L'issue d'appel est perdue.** `/api/telephony/cockpit/outcome` insère dans
   `public.opportunite_notes`, table dont `to_regclass` vaut **null** en
   production, sans contrôle d'erreur : l'interface affiche « Issue enregistrée »
   et rien n'est écrit. Deux autres écrivains visent la même table
   (`sql/20260504_workflow_automation.sql:174`, `/api/cron/process-scheduled-actions:105`).
   Le chemin qui marche est celui de `PATCH /api/agent/tasks`, qui écrit dans
   `email_logs` en `channel:'note'`.
6. **`calls` = 0 ligne.** Le webhook Zadarma n'est pas branché ; en softphone
   navigateur, `CallProvider.dial()` n'écrit rien. La chronologie du cockpit
   repose donc sur `prospection_tasks.done_at`, pas sur la téléphonie.
7. **Plafonds** : `OPPORTUNITY_LIMIT = 1000` sur les deux boards,
   `MAX_SENDS_PER_TICK = 5` sur `/api/automations/tick`,
   `LIST_QUERY_LIMIT = 500` sur les listes.

---

## 6. Ce qu'il ne faut pas toucher

- **`opportunites.stage_id` écrit à l'aveugle.** `trg_sync_opportunity_pipeline_from_stage`
  réécrit `pipeline_id` et **lève une exception** sur étape inconnue. Passer par
  `outcome` / `resolveStageForRole`, jamais par un `stage_id` deviné côté client.
- **Les lignes filles se créent seules.** `trg_ensure_lead_magnet_project_for_opportunity`
  crée le `lead_magnet_projects`. Faire des `UPDATE`, jamais des `INSERT`.
- **Trois autres déclencheurs écoutent `opportunites`** — dont
  `process_workflow_on_stage_change` (0 workflow actif). Le réactiver ferait
  partir des tâches en double.
- **`update_audits_updated_at`** est un `BEFORE UPDATE` inconditionnel : toute
  écriture de masse détruit la preuve horodatée. **Archiver avant.**
- **`.sheet { overflow:hidden }`** : tout bloc qui déborde disparaît sans signal.
- **`sales_pipeline_state.reached` / `.passed`** sont des colonnes mortes : les
  interroger pour un entonnoir donnerait des chiffres périmés.
- **13 tables ont RLS désactivé** en production. Ne pas l'activer sans policies.
- **Ne jamais se fier aux compteurs de `list_tables`** (reltuples périmés) :
  `count(*)`.

---

## 7. L'ordre, collé au calendrier

### Ce soir, dimanche 16 — sans quoi rien ne part demain

1. `git stash` / commiter la branche courante, puis repartir de `origin/main`.
2. Décider **paused** et **test_mode** sur le régulateur.
3. Attribuer en lot les 300 entreprises de la cohorte A (`owner_id`).
4. Marquer les cohortes (`cohorte_demarchage`) — deux `UPDATE`, et l'entonnoir
   devient calculable rétroactivement.
5. Vérifier les variables GA4 sur Vercel.
6. Relancer le cron d'audit de site pour épaissir le stock au-delà de 448.

### Lundi 17 — la cohorte A part

7. Lever le filtre `enrollment_id` de la file **(3.1)** et relever `DAILY_QUOTA`
   **(3.2)** : sans ça, les 100 du jour sont invisibles dans le cockpit.
8. Corriger `stageRole`/`isLostStage` pour « Lost » **(4.4)** — 15 minutes.
9. Poser le journal d'étapes + le déclencheur **(4.1)**. Le poser **avant** la
   première touche, sinon les trois premiers jours n'auront pas d'historique.

### Mardi 18 — la plaquette, parce que la cohorte B commence jeudi

10. `corpsPlaquette` + page publique **(§2)**. C'est le seul document possible
    pour un prospect sans site.
11. La barre de recherche du cockpit **(3.3)** — c'est le geste « il me rappelle,
    qui est-ce ? », et il tombe pile au moment où les rappels de la cohorte A
    arrivent.

### Mercredi 19 — la vue entonnoir

12. La page entonnoir par cohorte × par âge **(4.3)**. Elle n'a de sens qu'à
    partir de mercredi : avant, il n'y a rien à comparer.
13. Corriger `/api/agent/sprint` **(3.4)** pour que l'écran agent ne mente pas
    à partir de jeudi.

### Jeudi 20 → samedi 22 — la cohorte B

14. Aucune nouvelle fonctionnalité. Deux machines en parallèle : 100 nouvelles
    touches le matin, relances et appels l'après-midi. Le temps humain va
    majoritairement aux **anciennes**.

### Dimanche 23 → mardi 25

15. Zéro nouvelle touche. Nettoyage du pipeline, décisions, encaissements.
16. Première lecture sérieuse de l'entonnoir : cohorte A à J+7, cohorte B à J+3.

---

## 8. Ce qui reste à trancher, et que je ne peux pas trancher

1. **`test_mode` et `paused`** : les couper envoie de vrais emails à de vrais
   prospects. C'est ta décision, pas la mienne.
2. **Le pitch de la cohorte B** : démo personnalisée (36 en stock, il en faudrait
   300) ou plaquette seule avec démo après réponse ? Cela change ce qu'on
   construit mardi.
3. **Filtre `enrollment_id` : lever ou inscrire ?** Ma recommandation est
   « lever tout de suite, inscrire en parallèle pour l'email », mais l'inverse se
   défend si tu veux que tout passe par le régulateur.
4. **Le seuil de « site faible »** : ≤ 50 donne 448 entreprises, ≤ 65 en donne
   561. Le premier est plus dur à défendre en appel, le second donne de la marge.
