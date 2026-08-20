# Les conditions — une fourche qui répond trois choses

> Écrit le 20 août 2026, après avoir branché les conditions dans le moteur et
> dans l'éditeur. Les densités citées sont relevées sur les 905 entreprises
> attribuées le 19/08, pas estimées.

---

## 1. Ce qui a été refusé : une nouvelle forme de nœud

Le premier réflexe était d'ajouter au format stocké un objet `condition` avec
ses propres sorties, sa propre récursion d'atteignabilité, son propre rendu de
canvas. C'était trois fichiers à dédoubler et six séquences à migrer.

**Le mécanisme de branche était déjà générique — il était seulement *nommé*
pour l'attente.** `branch: { waitId, on: 'reply' | 'timeout' }` ne veut pas dire
« a répondu / n'a pas répondu » : il veut dire *« je dépends de la fourche
`waitId`, sur sa sortie 1 ou sa sortie 2 »*. Il suffisait de le lire ainsi :

| Sortie stockée | Sur une attente | Sur une condition |
| --- | --- | --- |
| `on: 'reply'` | a répondu | **OUI** |
| `on: 'timeout'` | est resté silencieux | **NON** |

Conséquence, et c'est le point : **les six séquences ne migrent pas d'un octet,
les 92 `vars.replies` restent valides, et `canvas.ts` ne change pas d'une
ligne.** Une condition est une étape `kind: 'condition'` de plus, et tout le
reste — atteignabilité, plan de l'éditeur, dry-run `cheminSuppose` — la traverse
sans avoir été retouché.

Ce qui s'ajoute est un sac en miroir : `vars.conditions[idx]`, comme
`vars.replies[idx]`.

---

## 2. Trois réponses, pas deux

C'est le cœur du module, et c'est la règle de maison appliquée une fois de plus :
**un zéro et une absence de mesure ne sont pas la même chose.**

```
oui · non · non_mesure
```

Une condition qu'on ne sait pas évaluer — le prospect n'a aucun constat de
présence web, son effectif est `NN`, aucun appel n'a jamais été passé — **ne
répond pas « non »**. Elle répond « je ne sais pas », et c'est l'étape qui décide
alors où l'envoyer : `siInconnu`, défaut `non`.

Le chemin pris est le même qu'avec deux réponses. **Ce qui change est ce qu'on
écrit**, donc ce qu'on pourra compter après coup : *combien de prospects sont
partis dans une voie qu'on a devinée ?* Sans le troisième état, cette question
n'a pas de réponse — et c'est exactement le genre de chiffre qu'on découvre trop
tard.

### Pourquoi une condition ne gèle jamais

Le réflexe symétrique serait de geler l'inscription quand on ne sait pas. Le
moteur le fait déjà ailleurs — un message qui promet un audit absent gèle.

Mais **un gel sans réveil est précisément ce qui a laissé 59 inscriptions dormir
des semaines** sans qu'aucun écran ne le montre. Une condition tranche donc
toujours, et **avoue** qu'elle a tranché sans savoir.

---

## 3. Les quatorze champs, et ce que chacun vaut

| Champ | Source | Densité sur 905 |
| --- | --- | --- |
| A une adresse e-mail | `collecterCanaux` | 478 |
| A un mobile | `estMobileFr` | 394 |
| A un fixe | `estFixeFr` | 466 |
| **A un contact nominatif** | `contacts` | **75** — c'est ce chiffre qui gouverne le choix des modèles |
| L'audit est prêt | `rapportEnvoyable` | 161 |
| La démo est publiée | `choisirSiteMontrable` | 321 |
| Cohorte | `entreprises.cohorte_demarchage` | A 282 · B 297 |
| Présence web | `v_presence_actuelle` | 3 041 constats, **trois états** |
| Chiffre d'affaires | `entreprises_donnees_publiques` | — |
| Effectif | `entreprises_donnees_publiques` | voir §4 |
| RGE expire sous 90 j | `v_rge_qualifications_valides` | — |
| Issue du dernier appel | `prospection_tasks` + `email_logs.outcome` | 640 tâches |
| A rebondi | `email_logs.delivery_status`, `email_suppressions` | 1 |
| RDV pris | `scheduling_bookings`, `sales_pipeline_state.rdv_at` | 1 |

**Présence web remplace le « Has score » de lemlist**, et le remplace en mieux :
`constats_presence` sait distinguer *absent confirmé* d'*inconnu*, ce que leur
score ne sait pas dire.

Six opérateurs seulement : `vrai`, `faux`, `est`, `nest_pas`, `au_moins`,
`au_plus`. Pas de langage d'expression, pas d'arbre — la leçon des vues de tâches
tient ici aussi : **un interrupteur, pas un arbre.**

---

## 4. Le piège qui aurait faussé un quart du fichier

`entreprises_donnees_publiques.effectif` n'est **pas un nombre** : c'est un code
de tranche INSEE. `'02'` ne vaut pas deux salariés, il vaut *3 à 5*. Et surtout,
**`'NN'` — 672 lignes sur 2 884 — veut dire « non renseigné »**.

Le lire comme un entier, c'est faire répondre « 0 salarié » à un quart du fichier,
et envoyer tous ces prospects du côté « petite structure » d'une fourche sans que
personne ne le sache jamais.

`effectifPlancher(code)` rend donc **le plancher de la tranche**, et **`null`
pour `NN`** — jamais `0`. Un `null` remonte en `non_mesure`, où il est visible.

```
00 → 0    01 → 1    02 → 3    03 → 6    11 → 10   12 → 20
21 → 50   22 → 100  31 → 200  32 → 250  41 → 500  42 → 1000
51 → 2000 52 → 5000 53 → 10000          NN → null
```

Comparer sur un plancher, c'est répondre juste à `au_moins` et **prudemment** à
`au_plus` — une tranche « 10 à 19 » est certainement ≥ 10, elle n'est pas
certainement ≤ 10.

---

## 5. L'ordre d'écriture, qui n'est pas un détail

Risque n° 3 du plan : *un nœud `condition` déployé avant son moteur serait
traversé sans être évalué, rendant les deux voies inatteignables.*

La parade est dans `processConditionStep` : le verdict est **écrit dans
`vars.conditions[idx]` AVANT** l'appel à `avancerApres`. Si l'ordre s'inversait,
l'avancement lirait un sac vide, trouverait `undefined`, et enverrait tout le
monde du côté NON — silencieusement, et sans jamais l'écrire nulle part.

Et **un seul endroit applique `siInconnu`** : `lecteurDIssue`, dans `branches.ts`.
C'est ce qui garantit que le moteur, le dry-run et le plan de l'éditeur
répondent la même chose. La première version l'appliquait dans le moteur : le
dry-run, lui, voyait `non_mesure` et rendait `false` — l'éditeur aurait dessiné
un chemin que le moteur n'aurait pas pris.

---

## 6. Les cinq conditions écartées, et dites à l'écran

Elles ne sont pas absentes : elles sont **listées dans l'éditeur avec leur
raison**. Une fonctionnalité qu'on cache revient toutes les six semaines dans la
conversation ; une fonctionnalité dont le refus est écrit ne revient pas.

| Écartée | Pourquoi |
| --- | --- |
| **A ouvert / a cliqué** | Correction au plan, §2b. Le préalable a été livré (en-têtes, `message_id`) et **ça ne suffit pas** : Resend ne suit pas les ouvertures par envoi, c'est un réglage de *domaine* — et on ne l'active pas, parce que le pixel et la réécriture de liens abîment la réputation qu'on est en train de construire (`trackOpens` est `@deprecated` dans le dépôt). `email_events` porte **une** ligne. Ce qui se mesure vraiment chez nous : les vues des liens à jeton, comptées côté serveur. |
| Désabonné | Aucun mécanisme n'existe — ni `List-Unsubscribe`, ni route à jeton. C'est un chantier, pas une condition. |
| A un compte WhatsApp | Indétectable avant d'écrire. C'est la sortie `hors_canal` qui le dit, après coup. |
| Invitation LinkedIn acceptée · message lu | Aucune intégration, et **aucune** de nos 905 fiches n'a d'URL LinkedIn. |
| Has score | Aucun score n'existe. L'inventer créerait un chiffre que personne ne saurait expliquer. |

---

## 7. Où c'est

| Quoi | Où |
| --- | --- |
| Le vocabulaire et les verdicts, pur | `src/lib/automations/conditions.ts` — 17 tests |
| La collecte des faits, 7 lectures parallèles | `src/lib/automations/conditions-db.ts` |
| La lecture d'issue unique (attente **et** condition) | `src/lib/automations/branches.ts` · `lecteurDIssue` |
| Le sac en miroir | `src/lib/automations/week.ts` · `readConditions` |
| L'exécution | `src/lib/automations/engine.ts` · `processConditionStep` |
| L'éditeur | `src/components/automations/SequenceBuilder.tsx` · `ConditionSection` |
