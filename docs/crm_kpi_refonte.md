# Refonte KPI CRM (objectifs + suivi quotidien + conversions)

## Changements proposés

### 1) Suppression des tables historiques
- `public.kpi_objectives`
- `public.journal_succes`

### 2) Nouveau modèle

#### `public.kpi_targets`
Table des objectifs (par période, par scope, par propriétaire éventuel).

- `scope`: `global`, `equipe`, `commercial`
- `period_unit`: `jour`, `semaine`, `mois`, `trimestre`
- cibles: `leads_trouves`, `leads_qualifies`, `appels`, `rdv`, `devis`, `relances`, `signatures`, `acomptes`, `ca`, `mrr`

#### `public.activity_log`
Journal d'actions granulaire (chaque action réelle du CRM).

- types: `appel`, `email`, `sms`, `rdv`, `relance`, `devis`, `signature`, `encaissement`, `note`
- statut optionnel: `a_faire`, `faite`, `annulee`
- liens métiers: `opportunite_id`, `entreprise_id`, `lead_id`

#### `public.pipeline_events`
Historique de passage des étapes pipeline (source de vérité pour conversions).

- étapes: `lead_trouve`, `lead_qualifie`, `appel`, `rdv`, `devis`, `negociation`, `signe`, `acompte`
- une entrée = un événement daté

#### `public.kpi_daily_facts`
Agrégat quotidien pour reporting rapide (alimenté via requête/cron).

- une ligne par `fact_date` + `owner_id`
- stocke volumes journaliers pour KPI opérationnels

### 3) Vues de reporting

#### `public.v_kpi_daily`
Vue brute quotidienne par commercial.

#### `public.v_conversion_funnel`
Conversions calculées à partir des événements pipeline:

- `% qualification` = `lead_qualifie / lead_trouve`
- `% rdv sur appels` = `rdv / appel`
- `% devis sur rdv` = `devis / rdv`
- `% signature sur devis` = `signe / devis`
- `% closing global` = `signe / lead_trouve`

#### `public.v_target_vs_actual`
Comparaison objectif vs réalisé sur même période / scope / owner.

## Règles métier incluses
- Unicité d'un objectif par scope/période/owner (`unique`).
- Indexation pour requêtes temporelles et par owner.
- Colonnes numériques `not null default 0` pour éviter les `NULL` en reporting.

## Plan d'exploitation
1. Saisir les objectifs via `kpi_targets`.
2. Enregistrer les actions au fil de l'eau dans `activity_log` et les passages pipeline dans `pipeline_events`.
3. Alimenter `kpi_daily_facts` chaque nuit (ou en temps réel).
4. Utiliser les vues pour dashboard manager/commerciaux.
