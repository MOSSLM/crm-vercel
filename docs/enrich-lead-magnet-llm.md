# Enrichissement — modèle IA configurable

L'edge function Supabase `enrich-lead-magnet` (source dans `edge function
enrich/`, déployée séparément) appelle un LLM pour analyser le site web d'une
entreprise et en extraire des informations structurées (services, logo, email,
stats, villes desservies…).

## Choisir le modèle

Le provider + le modèle se choisissent depuis le CRM : **Paramètres →
Enrichissement → « Modèle IA de l'enrichissement »**. Le choix est stocké dans la
table globale `enrichment_llm_settings` (une seule ligne `id='default'`) et lu
par l'edge function à **chaque run** (pas besoin de redéployer).

Repli si la table est absente : variables d'env `ENRICH_LLM_PROVIDER` /
`ENRICH_LLM_MODEL`, sinon défaut **OpenAI / `gpt-5`**.

Modèles proposés (voir `src/lib/enrichment/llm-options.ts`) :

| Provider | Modèle | Sortie | Note |
|---|---|---|---|
| OpenAI | `gpt-5` *(défaut)* | schéma strict | recommandé, moins cher que GPT-4o |
| OpenAI | `gpt-5-nano` | schéma strict | ultra économique |
| OpenAI | `gpt-4.1-nano` | schéma strict | très économique |
| OpenAI | `gpt-4o-2024-08-06` | schéma strict | ancien défaut |
| DeepSeek | `deepseek-v4-flash` | JSON simple | le moins cher, bon en analyse |
| DeepSeek | `deepseek-v4-pro` | JSON simple | mode raisonnement |

**OpenAI** utilise les *Structured Outputs* (`json_schema` strict) : la sortie
est garantie conforme. **DeepSeek** (API compatible OpenAI) n'accepte que le mode
`json_object` : le schéma est injecté dans le prompt et la sortie est
normalisée/validée côté edge function (`normalizeExtraction` dans `llm.ts`), avec
un retry en cas de réponse vide.

## Secrets (côté Supabase)

L'edge function lit ses secrets via `Deno.env` :

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — requis.
- `OPENAI_API_KEY` — requis si le provider sélectionné est OpenAI.
- `DEEPSEEK_API_KEY` — requis si le provider sélectionné est DeepSeek.
- `GOOGLE_PLACES_API_KEY` — optionnel (avis/adresse Google, best-effort).
- `JINA_API_KEY` — optionnel mais **fortement recommandé**. Le scraper
  (`scraper.ts`) lit les sites via Jina Reader ; sans clé, la version gratuite
  est rate-limitée et renvoie souvent du vide (échecs `home_unreachable_or_empty`
  sur des sites pourtant en ligne). Avec la clé, quotas bien plus élevés. En
  dernier recours, le scraper récupère aussi le HTML **en direct** (fallback sans
  Jina), donc l'enrichissement fonctionne même sans cette clé, mais de façon
  moins fiable sur les sites protégés (Cloudflare…).

## Déploiement

La migration `sql/20260712_enrichment_llm_settings.sql`, le déploiement de la
fonction (re-zip de `edge function enrich/*.ts`) et l'ajout du secret
`DEEPSEEK_API_KEY` se font **côté Supabase** (le CRM ne déploie pas la fonction).

## Mesurer la qualité et le coût

Chaque passage de l'edge function écrit une ligne dans **`enrichment_runs`** —
une par projet traité, **y compris les runs ignorés et échoués**. C'est ce qui
permet de juger la fonction et de comparer les modèles ; les colonnes
`lead_magnet_projects.enrichment_model` / `enrichment_tokens_*` restent, mais
elles ne portent que le DERNIER run réussi d'un projet.

Ce qu'une ligne contient : l'origine de l'appel (`source`), l'issue (`status`,
`outcome_reason`), le scraping (site atteint, URL corrigée, pages et caractères
récupérés, Jina ou fetch direct, rate-limit), Google Places (identifiant repris
de la fiche ou re-cherché — la recherche texte est facturée), l'appel LLM
(provider, modèle, tentatives, statut HTTP, tokens dont raisonnement, durée) et
la qualité de l'extraction (`fields_found` champ par champ, `fields_written`,
source de la ville SEO).

Aucun contenu brut n'est stocké : ni le markdown scrapé, ni le JSON du modèle.

### Où le lire

**Paramètres → Enrichissement → « Qualité & coût de l'enrichissement »** :
comparatif par modèle, taux de remplissage champ par champ, causes d'échec,
derniers runs. En SQL, trois vues donnent la même chose sur tout l'historique :
`v_enrichment_runs_by_model`, `v_enrichment_field_fill_rate`,
`v_enrichment_failures` (chacune appelle une fonction homonyme qui accepte une
date de début, ex. `select * from enrichment_metrics_by_model(now() - interval '7 days')`).

### Renseigner les tarifs

Les coûts sont calculés à la volée depuis **`enrichment_llm_pricing`**, en
centimes d'euro par million de tokens. La migration sème les six modèles à `0`,
donc aucun coût ne s'affiche tant qu'on n'a pas renseigné les prix du provider :

```sql
update enrichment_llm_pricing
   set input_cents_per_mtok = 125, output_cents_per_mtok = 1000, updated_at = now()
 where model = 'gpt-5';
```

Le coût n'étant jamais figé dans le journal, corriger un tarif recalcule tout
l'historique — pas de redéploiement, pas de réécriture de lignes.

### Ordre des opérations

Appliquer `sql/20260806_enrichment_runs.sql` **avant** de redéployer l'edge
function. L'inverse ne casse rien — l'insert du journal est best-effort et
l'absence de la table ne fait qu'un `console.warn` — mais les runs de
l'intervalle ne sont pas mesurés. Le panneau Paramètres, lui, affiche
explicitement que la migration manque.
