# Sama CRM — ce qu'il faut savoir avant de toucher à quoi que ce soit

Ce fichier est lu au démarrage de chaque session. Il ne décrit pas le code —
le code se lit — il porte ce qui ne se déduit **pas** en le lisant : les
outils qui existent déjà, et les pièges déjà payés.

## Avant de fabriquer un bot, lire le registre

**`src/lib/architecture/bots.ts`** catalogue tout ce qui collecte, cherche,
enrichit, mesure et fabrique : scripts locaux, edge function, routes, crons,
services externes. Chaque entrée porte son chemin, ce qu'elle coûte, si elle
écrit en base, et les règles qu'il ne faut pas réapprendre.

> **La règle : on ne crée pas un nouveau bot sans avoir lu l'entrée
> correspondante.** Si rien ne correspond, on ajoute l'entrée en même temps que
> le bot — pas six mois plus tard.

Visible dans le CRM : **Pilotage → Les bots**. Les schémas d'architecture
(`src/lib/architecture/diagrams.ts`) sont dans **Pilotage → Architecture**.

Quelques réflexes que le registre détaille :

- La recherche de présence web **existe déjà** (`scripts/prospection/`) et elle
  est aboutie. Ne pas réécrire un scraper Google : tout ce qui ne marche pas a
  déjà été essayé et est documenté.
- **Le CAPTCHA de Google ne se résout jamais** — ni par un script, ni en le
  demandant à un humain : il se réémet à l'infini face à un navigateur piloté.
- Chercher et écrire sont **deux scripts séparés**. Garder cette séparation :
  c'est elle qui rend une collecte relançable sans conséquence.
- **PageSpeed jamais en masse** : le quota est la ressource rare.

## Les pièges d'infrastructure

**Le dépôt n'est pas la vérité sur Supabase.** Les fonctions déployées et le
schéma réel peuvent diverger des fichiers. Vérifier en base avant de conclure.

**L'edge function n'est pas dans `supabase/functions/`** — ce dossier n'existe
pas ici. La source vit dans `edge function enrich/`, recopiée puis déployée via
`npx supabase functions deploy`. Ne pas la chercher ailleurs.

**Archiver avant toute écriture de masse.** Le trigger `updated_at` détruit la
preuve de ce qui était là. Une fois écrasée, elle ne revient pas.

**Les lignes filles se créent toutes seules.** Des triggers posent les projets
et les entreprises à la création d'une opportunité : faire `UPDATE`, jamais
`INSERT`, sous peine de doublons.

**Republier efface le CSS du site.** `shared_assets.css` est régénéré depuis le
gabarit : tout correctif CSS doit être cuit dans l'asset, sinon la republication
l'annule.

**Les images d'un artisan sont à lui seul.** Jamais versées dans le fonds
commun — `entreprise_id` est un mur, pas un tri.

## Où vivent les données qui trompent

| Ce qu'on cherche | Où c'est vraiment |
| --- | --- |
| CA, effectif | `entreprises_donnees_publiques` (les colonnes `*_band` d'`entreprises` sont de la prose libre, presque toujours nulles) |
| Site présent / absent / inconnu | `constats_presence` — « absent » et « inconnu » ne s'écrivent pas comme le même `NULL` |
| Technologie, ancienneté du site | `entreprises_audit_site` |

## Conventions

- **Le code et les commentaires sont en français**, y compris les noms de
  variables métier. Les en-têtes de fichier expliquent le *pourquoi*, pas le
  *quoi* — s'y conformer en ajoutant du code.
- **Écrire comme le code voisin** : même densité de commentaire, même idiome.
- `npm run typecheck` avant de considérer un travail terminé.
- Le travail se fait **sur `main`, en ajoutant plutôt qu'en réécrivant**, pour
  qu'un déploiement n'annule jamais ce qui tourne déjà.

## Points ouverts

- Le secret pg_cron est **en clair** dans
  `sql/20260808_donnees_publiques_cron.sql`. Les migrations cron suivantes
  utilisent un placeholder ; celle-ci est restée en arrière et le secret est à
  tourner.
- `edge function enrich/enrich-lead-magnet(1).zip` ressemble à un export
  ponctuel oublié — à confirmer avant suppression.
- **ProÉco** figure dans le schéma des sources et dans les libellés de
  l'explorateur, mais aucun bot du dépôt ne l'interroge : les fiches portant
  cette source viennent d'un versement antérieur.
