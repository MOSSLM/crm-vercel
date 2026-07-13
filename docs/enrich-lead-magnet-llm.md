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
