# lemlist — le modèle de données, reconstitué

> Reconstitué depuis le centre d'aide, l'académie et les pages produit : lemlist ne
> publie pas son schéma. Chaque objet est suivi de **son équivalent chez nous**, avec
> les noms de tables et de colonnes réels.
> Mesures de production du 19 août 2026.

---

## 1. Campagne

L'objet central. Quatre faces, un seul objet.

```
Campagne
├─ nom, statut (Draft | In Progress | Paused | Ended), étiquettes
├─ Séquence      → une suite d'Étapes, avec branches
├─ Liste de leads → des Leads, chacun avec son statut
├─ Lancement     → calendrier, expéditeurs, conditions d'arrêt
├─ Performance   → l'entonnoir de cette campagne
└─ Réglages      → Automation · Senders · General · Tracking · Schedules · CRM
```

**Chez nous.** `automations` (kind=`sequence`) porte déjà tout sauf la liste :
`definition.steps` (jsonb) pour la séquence, et `settings` pour `pipeline`, `stage`,
`handoffStage`, `acces`, `requireCanaux`/`excludeCanaux`, `sendWindows`,
`queuePriority`, `dailyCap`, `exitOnReply`, `oncePerDay`.

**Il manque la liste**, et c'est le seul manque structurel. Elle ne peut pas aller dans
`lots_entreprises` : un **lot est une photo qui ne bouge plus** — c'est ce dénominateur
stable qui rend une campagne mesurable — alors qu'une liste de campagne bouge (on
écarte, on rafraîchit, on note pourquoi).

---

## 2. Étape

| Champ lemlist | Valeurs | Chez nous |
| --- | --- | --- |
| Type | e-mail · LinkedIn (6 actions) · appel · SMS · WhatsApp · tâche manuelle · appel API · délai · **condition** | `SeqStepKind = 'email' \| 'linkedin' \| 'whatsapp' \| 'call' \| 'wait' \| 'task'` |
| Mode | automatique ou manuel | `SeqStepMode = 'auto' \| 'manual'` |
| Délai | **en jours d'envoi**, pas en jours calendaires | `day` (J+n), plus `vars.stepShifts` pour un décalage manuel |
| Contenu | objet, corps, variables, images, pièces jointes | `template`, `message`, `script`, `attachAudit` |
| Suivi | ouvertures, clics | `trackOpens`, `trackClicks` — ⚠️ **lus par l'éditeur et jamais transmis à Resend** |
| Branche | appartient à la voie Oui ou Non d'une fourche | `branch: { waitId, on: 'reply' \| 'timeout' }` |

**Le point de conception qui compte** : notre format de branche est **déjà générique**.
`{ waitId, on }` veut dire « je dépends de la fourche `waitId`, sur sa sortie 1 ou 2 ».
Il suffit de lire `'reply'` comme OUI et `'timeout'` comme NON pour porter les
conditions **sans migrer un seul octet** des six séquences existantes.

---

## 3. Condition — les treize

| # | Condition lemlist | Ce qu'elle évalue | Évaluable chez nous ? |
| --- | --- | --- | --- |
| 1 | Has an email address | adresse valide et délivrable | ✅ `collecterCanaux` — **478** des 905 attribuées |
| 2 | Has a LinkedIn URL | profil connu | ✅ `contacts.linkedin_url` — **0** aujourd'hui |
| 3 | Has phone number | numéro connu | ✅ `estMobileFr` / `estFixeFr` — **394** mobiles, **466** fixes seuls |
| 4 | Opened an email | ouverture | ⚠️ voir ci-dessous |
| 5 | Clicked on a link | clic | ⚠️ voir ci-dessous |
| 6 | Unsubscribed from email | désabonnement | ❌ **aucun mécanisme n'existe** |
| 7 | Booked a meeting | RDV pris | ✅ `scheduling_bookings`, `sales_pipeline_state.rdv_at` |
| 8 | Accepted invite | invitation LinkedIn acceptée | ❌ aucune intégration |
| 9 | Opened LinkedIn message | message lu | ❌ aucune intégration |
| 10 | Has score | seuil d'engagement | ❌ aucun score n'existe |
| 11 | Call status | répondu / sans réponse / messagerie | ⚠️ **`calls` = 0 ligne** — à lire dans `prospection_tasks.status` + `email_logs.outcome` |
| 12 | Has WhatsApp account | compte WhatsApp | ❌ indétectable avant d'écrire |
| 13 | Custom condition | n'importe quelle variable | ✅ `sequence_enrollments.vars` |

**Sur les ouvertures et les clics** : la donnée n'existe pas encore. `email_events`
compte **≈1 ligne**, parce que `sendEngineEmail` n'envoie ni `tags`, ni en-têtes, ni
`Reply-To` à Resend. Et surtout : **elles ne se lisent pas dans
`email_logs.delivery_status`** — le piège est déjà documenté dans notre
`stats/_view.ts`, où `DELIVERY_RANK` fait gagner `delivered` (3) sur `opened` (1) et
`clicked` (2) : la ligne n'enregistre donc jamais une ouverture qui suit une livraison.
Il faut relire `email_events`, le journal brut.

**Sur le désabonnement** : ni en-tête `List-Unsubscribe`, ni route à jeton.
`email_suppressions` ne se remplit que par rebond et par plainte. C'est un chantier à
part entière, pas une condition.

### Les conditions que nous pouvons ajouter et qu'ils n'ont pas

| Condition | Source | Pourquoi elle vaut mieux que leur équivalent |
| --- | --- | --- |
| **L'audit est prêt** | `rapportEnvoyable` | Déjà appelée par le garde `etapePromettUnAuditAbsent` : le moteur refuse déjà d'envoyer une promesse sans la pièce |
| **La démo est prête** | `choisirSiteMontrable` | Idem, via `etapePromettUneDemoAbsente` |
| **Présence web** (3 états) | `v_presence_actuelle` | Remplace leur « Has score » par du mesuré : présent / **absent confirmé** / inconnu |
| **Cohorte A ou B** | `entreprises.cohorte_demarchage` | Site faible contre sans site : c'est l'accroche qui change |
| **RGE qui expire** | `v_rge_qualifications_valides` | Un motif d'appel daté que personne d'autre n'a |
| **CA, effectif** | `entreprises_donnees_publiques` | Chiffres officiels, pas déclaratifs |
| **A ouvert sa plaquette** | `entreprises_rapport_public.plaquette_vues` | L'équivalent exact de leur signal « a visité le site », mais par prospect |

### Les deux temporisations

| lemlist | Comportement | Chez nous |
| --- | --- | --- |
| **Within X jours** | fenêtre ; on avance sur OUI dès que c'est vrai, sur NON à l'échéance | `replyTimeoutDays: n` |
| **Wait until** | attente indéfinie | `replyTimeoutDays: 0` — ⚠️ **et c'est notre cul-de-sac** |

> `processWaitStep` pose `hold_reason='awaiting_reply'` **et `next_run_at = null`** :
> l'inscription quitte la file du ticker et rien ne la réveillera. Au 19 août,
> **59 inscriptions** y dorment. Chez lemlist, *Wait until* existe aussi — la
> différence est qu'il **se voit** dans la liste des leads.
> Conclusion pour nous : le défaut doit être 3 jours, et une attente sans limite doit
> exiger un choix explicite **et** une branche de secours.

**Règle commune** : une condition temporelle demande **au moins 1 jour** de délai —
sinon on teste « a-t-il ouvert ? » avant qu'il ait eu le temps d'ouvrir.

---

## 4. Lead — les seize statuts

```
        AVANT CAMPAGNE              ACTIVE                ENGAGEMENT
   Enriching → To launch  →  Ready to send → In progress  →  Sent → Opened
        ↓ Skipped              ↓ Paused                        → Clicked → Replied

        INCIDENTS                    FIN
   Bounced · Failed          Completed · Interested · Not interested · Unsubscribed
```

**Le défaut de conception, et comment on le corrige.** Ces seize statuts mélangent
**deux axes indépendants**, et c'est ce qui les rend ambigus : un lead peut être *Sent*
**et** *Paused* en même temps. On les sépare :

| Axe | Valeurs |
| --- | --- |
| **Progression** — où en est l'envoi | à préparer · à lancer · écarté · en pause · prêt · en cours · terminé |
| **Engagement** — ce que le prospect a fait | envoyé · ouvert · cliqué · répondu · intéressé · pas intéressé · désabonné · rebond · échec |

**Et rien n'est stocké.** Une colonne de statut divergerait au premier `UPDATE` manqué
— le CRM a déjà payé ça avec `pipeline_events`, abandonnée après 18 écritures. Tout se
dérive :

| Statut | Dérivé de |
| --- | --- |
| Enriching | lead à lancer + audit/démo pas prêts |
| To launch | lead à lancer + il a un canal (`leadEligible`) |
| Skipped | écarté, avec son motif |
| Paused | `enrollment.status='paused'` **ou** `hold_reason ∈ {sequence_paused, global_pause, awaiting_reply, lien_manquant, demo_manquante, message_vide}` |
| Ready to send | `active` + `send_at` posé + aucun gel |
| In progress | `active` + `current_step > 0` |
| Sent | ≥ 1 `email_logs(status='sent')` sur l'inscription |
| Opened / Clicked | `email_events` — **jamais `delivery_status`** |
| Replied | `vars.replies` **ou** `sales_pipeline_state.replied` **ou** message entrant |
| Bounced | `email_logs.delivery_status='bounced'` + `bounce_type` |
| Failed | `email_logs.status='failed'` **ou** `hold_reason ∈ {email_invalid, no_email}` |
| Completed | `enrollment.status='finished'` |
| Interested | `outcome ∈ {answered, later}` **ou** `state='won'` **ou** `rdv_at` posé |
| Not interested | `outcome='not_interested'` **ou** `state ∈ {lost, black}` **ou** `exit_reason='stop'` |
| Unsubscribed | `email_suppressions` + `phone_blacklist` |

> **La règle héritée de notre entonnoir, mot pour mot** : un lead sans `email_events`
> n'est pas « pas ouvert », il est **non mesuré**. Un zéro et une absence de mesure ne
> sont pas la même chose.

---

## 5. Tâche — six types, cinq statuts

| Types | Statuts |
| --- | --- |
| Call · Email · LinkedIn · WhatsApp · SMS · Manual | Due · Upcoming · Paused · Done · Ignored |

**Chez nous** : `prospection_tasks.kind = 'call' | 'whatsapp' | 'linkedin' | 'email'`
(il manque `sms` et `manual`) et `status = 'pending' | 'done' | 'skipped' | 'snoozed'`.
La correspondance est directe : *Due* et *Upcoming* se distinguent par `due_at`,
*Paused* est notre `snoozed` (la mise de côté, avec son motif et sa date),
*Ignored* est notre `skipped`.

**Ce qu'il manque, ce n'est pas le modèle, c'est la présentation** : colonnes
configurables, filtres cumulables en trois familles (tâche / contact / entreprise) avec
ET-OU imbriqués, vues sauvegardées avec compteur en direct, actions de masse — et
l'enchaînement, « terminer » qui descend à la ligne suivante.

**Une tâche peut naître sur une branche conditionnelle** : c'est le
« my call tasks are created only if the lead has a mobile » de leur témoignage.

---

## 6. Conversation

```
Conversation (1 par lead)
├─ messages : canal, direction, expéditeur, date, contenu
├─ statut : Interested | Not interested | Unsubscribed
├─ assignation
└─ contexte : campagne, étape, historique
```

**Chez nous**, le fil existe déjà et le projet a **déjà tranché** de ne pas le couper en
deux tables (`sql/20260815_notes_de_demarchage.sql`) : « une table séparée aurait
obligé chacun de ces écrans à fusionner deux sources dans le bon ordre — trois
occasions de diverger ».

`email_logs` porte donc `channel = 'email' | 'whatsapp' | 'note'`, `outcome`, `step_id`,
`automation_id`, `enrollment_id`, et l'état de livraison.

**Ce qui manque : la direction, et de quoi recevoir.** Aujourd'hui tout est sortant.
Une note contourne `to_email NOT NULL` par une chaîne vide ; un message **entrant**,
lui, n'a rien à contourner (`to_email` = notre adresse, `from_email` = le prospect).
À ajouter : `direction` (défaut `sortant`, les 210 lignes existantes restent justes
sans être touchées), `message_id` unique (l'idempotence), `in_reply_to`, `recu_le`,
`lu_le`, `assignee_id`.

⚠️ **Un message entrant ne doit pas poser `replied` tout seul.** Notre `reply.ts`
explique pourquoi : `hasInterest()` s'en sert pour éteindre les cellules WhatsApp et
Appel, ce qui couperait précisément les étapes que la séquence veut enchaîner. Une
réponse **débloque une attente** ; elle ne dit pas que le prospect est intéressé.

---

## 7. Rapport

Deux entonnoirs, jamais mélangés :

```
PROGRESSION   Contacté → Délivré → Ouvert → Cliqué → Répondu → Intéressé
INCIDENTS     Non délivré · Pas intéressé · Désabonné
```

**Et c'est une partition** : un lead est à **un seul** étage, le plus loin atteint.
C'est ce qui manque à nos compteurs de file, qui additionnent délibérément un même
prospect sous chaque signal qu'il porte — vrai arithmétiquement, illisible à l'usage.

La réconciliation : **les signaux restent des filtres cumulables, les compteurs
deviennent une partition.**

Quatorze widgets, filtres date / étiquettes / campagnes / utilisateurs, onglets
sauvegardables, partage par lien.

**À garder de chez nous** : `lectureParAge` compare deux cohortes **au même âge**
(J+1, J+3, J+7, J+14) plutôt qu'à date fixe. lemlist ne sait pas faire ça, et c'est
exactement ce dont la campagne des deux cohortes a besoin.

---

## 8. Récapitulatif — ce qu'il faut créer en base

| Objet | Décision |
| --- | --- |
| Campagne | **Aucune table** — c'est l'`automations` existante |
| Liste de leads | **`campagne_leads`** : automation_id, entreprise_id, contact_id, enrollment_id (nullable), origine, origine_ref, statut, motif_ecart |
| Audience | **`automations.settings.audience`** en jsonb — type, segmentId, lotId |
| Condition | **Aucune table** — un type d'étape dans `definition.steps`, format de branche inchangé |
| Statut de lead | **Aucune colonne** — dérivé |
| Message entrant | **Colonnes sur `email_logs`** — direction, message_id, in_reply_to, recu_le, lu_le, assignee_id |
| Vue de tâches | **`vues_taches`** — nom, icône, filtres jsonb, portée, tri. Copie conforme de `segments_entreprises` : critères stockés, **jamais** de résultats |

Une règle traverse ce tableau : **on stocke des critères et des liens, jamais des
états dérivables ni des résultats de requête.**
