# Régulateur d'envoi & pipeline commercial

Deux briques ajoutées ensemble parce qu'elles racontent la même histoire : la
séquence décide **quoi** envoyer, le régulateur décide **quand**, le pipeline
montre **où** on en est.

---

## 1. Le régulateur

### Le problème

Avant, une séquence envoyait « dès que `next_run_at` est passé », avec un
espacement de 2 à 7 minutes calculé au vol dans le ticker. Conséquences :

- deux séquences dues à la même minute partaient ensemble ;
- rien ne limitait le volume d'une journée ;
- trois contacts d'un même garage pouvaient recevoir leur email coup sur coup ;
- aucune plage horaire : un email pouvait partir à 3 h du matin ;
- aucune trace du « pourquoi ça attend ».

### Le principe

**Un seul tuyau pour tout le CRM.** Tous les emails de toutes les séquences
passent par la même file. Le calcul est une fonction pure
(`src/lib/automations/regulator.ts`) : `now` et le curseur sont des paramètres,
rien n'est lu en base, tout est testable.

```
pour chaque item de la file (trié par priorité de séquence, puis ancienneté) :
  si régulateur en pause                     → bloqué  (global_pause)
  si séquence en pause                       → bloqué  (sequence_paused)
  si le contact a déjà reçu un email du jour → bloqué  (one_per_day)
  si plafond du jour atteint                 → bloqué  (daily_cap)
  écart = aléatoire_stable(gap_min, gap_max)
  heure_voulue = curseur + écart
  si un email de la MÊME entreprise est parti il y a < company_gap
      → décaler                              (company_gap)
  si heure_voulue hors des plages de la séquence
      → décaler au début de la plage suivante (out_of_window)
      → ou au lendemain                       (next_day)
  curseur = heure retenue
```

L'écart « aléatoire » vient d'un hash stable de `(enrollment_id, jour local)` :
le ticker repasse toutes les minutes et doit retomber sur la même file, sinon
l'heure annoncée dans l'interface danserait à chaque rafraîchissement.

Les plages sont évaluées en **heure locale** via `Intl.DateTimeFormat` : une
plage `08:30–11:30` reste 08:30–11:30 en heure d'été comme en heure d'hiver.

### Où ça vit

| Fichier | Rôle |
|---|---|
| `src/lib/automations/regulator.ts` | le moteur, pur et testé (`planQueue`, `snapToWindow`, presets, plages) |
| `src/lib/automations/regulator-db.ts` | la couche base : réglages, historique du jour, montage de la file |
| `src/app/api/automations/tick/route.ts` | le ticker consomme le plan, envoie ce qui est dû, inscrit le reste |
| `src/app/api/automations/regulator/` | lecture + réglages (`GET`/`PATCH`), surcharges par séquence |
| `src/components/automations/regulator/` | la page Régulateur |

### Réglages

Globaux, dans `regulator_settings` (une seule ligne, `id = 'global'`) :

| Réglage | Défaut | Ce que ça fait |
|---|---|---|
| `gap_min_minutes` / `gap_max_minutes` | 7 / 14 | fourchette de l'écart tiré entre deux emails |
| `daily_cap` | 120 | plafond quotidien, toutes séquences confondues |
| `company_gap_minutes` | 45 | espacement minimum entre deux contacts d'une même entreprise |
| `paused` | `false` | gèle toute la file, sans rien perdre |
| `count_all_sequences` | `true` | la mémoire des envois couvre tout le CRM, pas seulement la séquence |
| `one_per_day_per_contact` | `true` | un contact inscrit deux fois n'a qu'un email par jour |
| `business_days_only` | `true` | pas d'envoi le week-end |
| `default_windows` | `08:30–11:30`, `14:00–17:30` | plages appliquées aux séquences qui n'en ont pas |
| `task_routing_mode` | `pref` | à qui reviennent les tâches manuelles (voir §2) |
| `task_max_per_agent` | 8 | au-delà, le surplus bascule chez l'admin |

Par séquence, dans `automations.settings` :

- `sendWindows` — ses propres plages (vide → celles par défaut) ;
- `queuePriority` — 1 passe devant 9 ;
- `dailyCap` — son plafond à elle (`null` = pas de limite dédiée).

### Motifs de report

Ils sont écrits dans `sequence_enrollments.hold_reason` et affichés tels quels
dans la file **et** dans la colonne Email du pipeline. C'est ce qui rend le
système lisible plutôt que magique :

`out_of_window` · `next_day` · `company_gap` · `daily_cap` · `sequence_paused`
· `global_pause` · `one_per_day`

### Ce qui n'a pas changé

Les étapes **manuelles** (WhatsApp, LinkedIn, appel) ne passent pas par la file :
elles créent leur tâche immédiatement, même régulateur en pause. La pause ne
concerne que les envois automatiques.

---

## 2. Les tâches manuelles

`wa.me` n'a pas d'API d'envoi : un message WhatsApp n'est **jamais** envoyé par
le CRM. La séquence le prépare, puis le CRM le pose dans la file de la bonne
personne (`src/lib/automations/task-routing.ts`).

| Mode | Comportement |
|---|---|
| `pref` | l'agent propriétaire du contact ; si sa file du jour est pleine ou s'il est indisponible, l'admin prend le relais |
| `strict` | tout reste chez l'agent, même absent — la tâche l'attend |
| `admin` | rien n'est distribué, l'admin traite et redistribue à la main |

Ordre de résolution du propriétaire : `entreprises.owner_id` →
`sequence_enrollments.created_by` → `opportunites.owner_id` → **admin**. Une
tâche ne reste jamais orpheline.

Le motif du routage est stocké dans `prospection_tasks.routing_reason` et
affiché sur la carte : on sait toujours pourquoi une tâche est là.

Une absence se déclare dans `agent_settings.unavailable_until`.

---

## 3. Le pipeline commercial

Une ligne = une opportunité. Les colonnes ne sont **pas** une liste figée :
elles viennent de deux sources réelles, mises bout à bout.

```
┌ À DÉMARCHER ┐ ╔═══ SÉQUENCE · Artisans ═══════════╗ ┌ PIPELINE · Agent SAMA ┐
│  en attente │ ║ J+0 Email │ J+1 WhatsApp │ J+5 ☎  ║ │ RDV calé │ Client signé│
└─────────────┘ ╚═══════════════════════════════════╝ └───────────────────────┘
   le stock            automatisé, teinté violet          le commercial reprend
```

- **Colonne d'entrée** — le stock : tout ce qui n'est pas encore en séquence s'y
  gare. C'est la seule colonne qui dise si le prospect est *prêt* à être
  démarché (audit, démo, contact identifié), et c'est là que se fait le geste le
  plus fréquent du tableau : « Mettre en séquence », ou « Écarter ». Sans
  contact rattaché, le bouton est désactivé — la mise en séquence échouerait
  côté serveur, autant le dire avant.
- **Groupe séquence** — une colonne par étape de la séquence choisie, avec son
  `J+n`, son canal et son CTA (Ouvrir WhatsApp, cockpit d'appel, file d'envoi).
  Encadré et teinté pour qu'on voie d'un coup d'œil ce qui tourne tout seul.
- **Groupe pipeline** — les étapes réelles de `etapes_pipeline`, à partir de
  l'**étape de reprise** (« RDV calé » par défaut, réglable par séquence dans
  `settings.handoffStage`).
- Sur chaque ligne, un badge rappelle **l'étape de pipeline courante**, même
  pendant la séquence.

Deux sélecteurs en barre d'outils pilotent tout ça : **Pipeline** (le tableau
n'affiche que ses opportunités, donc les colonnes correspondent toujours aux
lignes) et **Séquence**. Les deux choix sont mémorisés en `localStorage`.

**Règle d'or : on n'intervient que quand le prospect réagit.** Le reste avance
seul.

### La position est dérivée, pas stockée

- inscription vivante sur la séquence affichée → `step:<id de l'étape courante>` ;
- sinon → `stage:<opportunites.stage_id>`.

Les colonnes portent donc des ids préfixés (`step:` / `stage:`) et le pointeur
est naturellement **monotone** : les index croissent avec les étapes de
séquence, puis avec l'`ordre` du pipeline. Une séquence qui repasse par un email
après un WhatsApp ne re-verrouille rien — c'est une colonne différente.

`sales_pipeline_state` ne garde que ce qui n'est pas déductible : `state`,
`state_reason`, `nurture_at`, `replied`, `skipped` + `skip_reason`, et les
jalons commerciaux (`rdv_at`, `propo_amount`, `objection`, `stage_dates`).

Les étapes sautées ne disparaissent pas : elles s'affichent en « Sauté ·
*motif* » avec un bouton « Rouvrir ». Le client envoie la liste des colonnes
concernées (`skip_columns`) — c'est lui qui a les colonnes sous les yeux, le
serveur ne les devine pas.

`Perdu`, `Nurturing` et `Blacklist` ne sont **pas** des colonnes mais des états
de ligne : une étape de pipeline nommée « Perdu » est donc exclue des colonnes,
et une opportunité posée dessus est lue comme perdue.

### « Le prospect a réagi »

Cinq issues, sur chaque ligne. **Toutes annulent les envois encore planifiés** —
c'est la partie critique : retirer l'entreprise de la séquence ne suffit pas,
sans annuler les `automation_jobs` et les tâches en attente, un email part quand
même après que le prospect a pris rendez-vous.

| Issue | Ligne | Séquence | Envois en attente | Tâches |
|---|---|---|---|---|
| A pris RDV lui-même | → RDV | `exited` (définitif) | annulés | `skipped` |
| M'a rappelé / a répondu | → RDV, Appel marqué fait | `paused` (reprenable) | annulés | `skipped` |
| Intéressé, mais plus tard | `nurturing` + date | `exited` | annulés | `skipped` |
| Pas intéressé | `lost` + motif obligatoire | `exited` | annulés | `skipped` |
| Mauvais numéro / fermé | `black` + blacklist du numéro | `exited` | annulés | `skipped` |

Dès que `replied` est vrai, les cellules WhatsApp et Appel basculent seules en
« Inutile — passer au RDV » : on ne relance pas quelqu'un qui a déjà répondu.

### Vues

- **Admin** (`/pipeline-commercial`) : tout le CRM, filtre par agent.
- **Agent** (`/espace-agent/pipeline-commercial`) : ses prospects uniquement,
  scoping sur `opportunites.owner_id` doublé par `entreprises.owner_id` dans
  chaque action.

Pagination serveur (8 lignes par page), recherche plein texte, filtres statut /
séquence / « à faire aujourd'hui », sélection multiple pour la mise en séquence
en lot.

### Validation d'une colonne

- colonne de **séquence** → la tâche est close et l'inscription avance d'une
  étape (`advanceEnrollmentAfterTask`) ;
- colonne de **pipeline** → `opportunites.stage_id` passe à l'étape suivante,
  en avant seulement. Valider la dernière colonne, c'est signer.

---

## 4. Phase de test

Interrupteur dans les réglages du régulateur (`regulator_settings.test_mode`).
Quand il est actif, seules les adresses de `test_email_addresses` reçoivent
réellement ; tout autre destinataire est retenu **avant** l'appel à Resend,
journalisé dans `email_logs` avec `blocked_reason = 'mode_test'`, et la séquence
**avance quand même** — c'est ce qui permet de voir le régulateur tourner de
bout en bout sans qu'un email ne sorte.

Le garde vit dans `src/lib/email/test-guard.ts` (`allowRecipient`) et couvre les
deux chemins de prospection : `sendEngineEmail` (séquences, workflows) et
`POST /api/email/send` (envoi manuel, qui répond 409 `mode_test`).

Les confirmations de rendez-vous (`src/lib/scheduling/emails.ts`) en sont
**volontairement exclues** : transactionnelles, déclenchées par quelqu'un qui
vient de réserver — les bloquer casserait la réservation.

Rien n'est décompté du plafond du jour : un envoi retenu n'est pas un envoi.
La liste d'adresses se gère depuis **Opportunités › Mode test**
(`TestModeDialog`), déjà en place.

---

## 5. Migrations

Les deux sont idempotentes et doivent être appliquées dans l'ordre.

`sql/20260801_sending_regulator_and_sales_pipeline.sql` :

- table `regulator_settings` (+ ligne `global`) ;
- `sequence_enrollments` : `send_at`, `hold_reason`, `last_email_at` ;
- `prospection_tasks.routing_reason`, `agent_settings.unavailable_until` ;
- `email_logs.automation_id` / `enrollment_id` — sans quoi on ne peut ni
  compter le plafond d'une séquence ni afficher sa part de la file ;
- table `sales_pipeline_state` ;
- plages par défaut posées sur les séquences existantes.

`sql/20260802_test_phase_guard.sql` :

- `regulator_settings.test_mode`, `email_logs.blocked_reason` ;
- les six adresses de la phase de test ;
- remise à zéro de `sales_pipeline_state.reached/passed/skipped` : ces colonnes
  portaient des identifiants figés (`seq`, `email`, `wa`…) qui n'ont plus cours
  depuis que les colonnes viennent de la séquence et du pipeline.
