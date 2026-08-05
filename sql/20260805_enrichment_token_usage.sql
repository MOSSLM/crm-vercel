-- Consommation LLM par projet enrichi, pour pouvoir attribuer un coût.
--
-- POURQUOI
-- L'edge function lisait `usage` de la réponse OpenAI/DeepSeek uniquement pour
-- diagnostiquer une réponse vide, puis le jetait. Sur près de 2 800 entreprises
-- enrichies, aucun coût n'était donc rattachable à aucune fiche : impossible de
-- savoir ce que coûte un enrichissement, ni de comparer deux modèles autrement
-- qu'à l'estime.
--
-- `enrichment_model` porte « provider/modèle » (ex. « openai/gpt-5 ») pour que la
-- comparaison reste lisible après un changement de provider dans les Paramètres.
--
-- APPLICATION : à la main dans l'éditeur SQL Supabase. Idempotent, rejouable.
--
-- L'edge function sait déjà se passer de ces colonnes quand la base ne les a pas
-- encore (cf. `OPTIONAL_PROJECT_COLUMNS` dans `edge function enrich/db.ts`) :
-- cette migration débloque la mesure, elle n'est pas un prérequis au bon
-- fonctionnement de l'enrichissement.

do $$
begin
  if to_regclass('public.lead_magnet_projects') is null then
    raise notice 'lead_magnet_projects absente : rien à faire.';
    return;
  end if;

  alter table public.lead_magnet_projects
    add column if not exists enrichment_tokens_prompt     integer,
    add column if not exists enrichment_tokens_completion integer,
    add column if not exists enrichment_model             text;

  raise notice 'Colonnes de consommation LLM en place.';
end $$;

comment on column public.lead_magnet_projects.enrichment_tokens_prompt is
  'Tokens d''entrée du dernier appel LLM d''enrichissement. NULL si la mesure '
  'n''était pas disponible (échec réseau) ou si le projet précède la migration.';

comment on column public.lead_magnet_projects.enrichment_tokens_completion is
  'Tokens de sortie du dernier appel LLM d''enrichissement. Pour les modèles de '
  'raisonnement, inclut les tokens de raisonnement facturés.';

comment on column public.lead_magnet_projects.enrichment_model is
  'Provider et modèle du dernier enrichissement, au format « provider/modèle » '
  '(ex. « openai/gpt-5 »). Permet de comparer les coûts après un changement de '
  'configuration dans les Paramètres.';
