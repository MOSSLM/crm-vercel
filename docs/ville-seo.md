# Ville SEO — comment elle est déterminée

## Deux villes, jamais interchangeables

| | Colonne | Variable de template | Exemple |
|---|---|---|---|
| **Ville** | `entreprises.ville` | `{{ entreprise.ville }}` | Quetigny |
| **Ville SEO** | `lead_magnet_projects.override_city` | `{{ entreprise.ville_seo }}` | Dijon |

La ville SEO est la grande ville mise en avant partout sur le site : titres,
accroches, zone d'intervention, footer. La ville réelle ne sort que dans
l'adresse postale. Si l'entreprise est déjà dans une grande ville, les deux sont
identiques.

`{{ entreprise.location }}` est un alias historique de la ville SEO, conservé
pour les designs déjà publiés ; `override_location` en est le miroir en base.

## Ordre d'autorité

L'edge function `enrich-lead-magnet` (`resolveVilleSeo` dans `db.ts`) essaie dans
cet ordre, et s'arrête à la première réponse :

1. **`ville_seo_overrides`** — une correction manuelle gagne toujours.
2. **Calcul géographique** — distance réelle sur `communes_fr` (voir ci-dessous).
3. **Extraction du LLM** (`closest_big_city`) — filet quand le référentiel n'est
   pas chargé ou qu'aucune coordonnée n'est trouvable.
4. **`entreprises.ville`** — dernier recours ; c'est toujours une vraie ville,
   jamais un placeholder.

L'écriture est *fill-only* pendant l'enrichissement : une ville SEO déjà posée
n'est jamais écrasée. Chaque décision est tracée dans les logs de la fonction
avec sa source et, pour le calcul, le palier retenu, la distance et la population.

## Le calcul géographique

**Coordonnées de l'entreprise**, du plus précis au plus large :
Google Places (`location`) → coordonnées lues dans l'URL Google stockée → centre
de la commune du code postal.

**Choix de la ville** (`pickSeoCity` dans `geo.ts`, pur et testé) :

1. Une **métropole** (`metro_population`, 100 000 par défaut) à moins de
   `metro_radius_km` (30 km) → la plus proche. Une commune de banlieue vise la
   métropole, pas la sous-préfecture voisine.
2. Sinon, dans `preferred_radius_km` (35 km) → **la plus peuplée** au-dessus de
   `big_city_population` (20 000).
3. Sinon, jusqu'à `max_radius_km` (60 km) → **la plus proche** au-dessus du même
   seuil.
4. Sinon rien : on enchaîne sur les replis 3 et 4 ci-dessus.

La commune de l'entreprise est une candidate comme une autre : si elle est
elle-même une grande ville, elle gagne à distance 0.

C'est le **palier 2** qui fait le travail sur les départements multipolaires.
Une table « département → une ville » renvoyait Mâcon pour tout le 71, y compris
pour une commune à 15 km de Chalon-sur-Saône — qui est à la fois plus proche et
plus peuplée. Même problème dans le 62 (Arras / Calais / Boulogne), le 76
(Rouen / Le Havre), le 83, le 06. D'où le passage à la distance réelle.

Les cinq seuils vivent dans `enrichment_geo_settings` et s'éditent depuis
Paramètres › Enrichissement, sans redéploiement.

## Mise en service

1. Exécuter `sql/20260727_ville_seo_geo.sql` dans l'éditeur SQL Supabase
   (`communes_fr`, `ville_seo_overrides`, `enrichment_geo_settings`, colonne
   `lead_magnet_projects.override_city_source`).
2. Redéployer l'edge function (`edge function enrich/`).
3. Paramètres › Enrichissement › **Ville SEO** → « Charger » le référentiel des
   communes. La route itère sur les départements
   (`/api/settings/communes-fr`, source `geo.api.gouv.fr`) ; l'opération est
   idempotente et se relance pour rafraîchir les populations.
4. « Recalculer les projets existants » pour rattraper les villes SEO posées par
   la règle précédente.

Tant que 1 et 3 ne sont pas faits, rien ne casse : le calcul se met en retrait et
la chaîne retombe sur l'extraction du LLM.

## Corriger un cas

- **Une entreprise** : éditer « Ville SEO » dans sa fiche du marketing pipeline.
  Le champ passe en `override_city_source = 'manual'` et devient intouchable par
  les recalculs.
- **Toute une commune ou un code postal** : ajouter une correction dans
  Paramètres › Ville SEO. Elle prime sur le calcul et vaut pour toutes les
  entreprises concernées, présentes et à venir.
- **La règle elle-même** : ajuster les seuils, puis relancer le recalcul. Il ne
  rescrape rien et n'appelle aucun modèle — il est gratuit et rejouable.
