# Prompt à exécuter en local — semaine du 31/08/2026

> Copie tout ce qui suit dans une session Claude Code lancée sur ton poste,
> dans le dépôt `crm-vercel`. Le contexte nécessaire est dedans : la session
> locale n'a pas la conversation qui a produit ce plan.

---

Tu travailles sur la branche `claude/crm-bulk-qualification-qfxzs2`, déjà
poussée. Récupère-la avant toute chose :

```
git fetch origin claude/crm-bulk-qualification-qfxzs2
git checkout claude/crm-bulk-qualification-qfxzs2
```

Lis `sql/20260829_repartition_demarchage_semaine_36.sql` en entier : il porte le
raisonnement complet et il est **déjà appliqué en production**.

## L'état réel, mesuré le 29/08/2026

Sur 778 entreprises qualifiées vivantes : 140 déjà démarchées, 13 entamées,
**625 jamais touchées**. Elles n'étaient pas réparties mais empilées — 440 chez
un agent, 65 chez l'autre, 120 sans propriétaire — et **431 des 440 étaient
gelées** en `sequence_paused` avec `next_run_at` nul. C'est la cause du flux mort
depuis le 20/08 : `src/lib/automations/regulator-db.ts` ne lit que les
inscriptions dont la date est posée (`.not('next_run_at','is',null)`), donc aucun
tick ne les reprend jamais.

**Déjà fait en base** (aucun `owner_id` n'a été touché) :

| Objet | Contenu |
| --- | --- |
| `archive_repartition_20260829` | 625 lignes : propriétaire d'avant, cohorte, canal, futur propriétaire |
| lot **7** « Semaine 36 — Bilal » | 249 fiches à lui attribuer |
| lot **8** « Semaine 36 — Matteo » | 66 fiches à attribuer à Matteo |
| lot **9** « Semaine 36 — mobiles à enrichir » | 122 mobiles dont le site répond |
| lot **10** « Semaine 36 — mobiles présence web à régler » | 65 mobiles sans site exploitable |

Identifiants d'agent :
`76353de0-ac50-4645-9530-8be2db55c7a3` = **Bilal** (`user_profiles.nom` = Cacan) ·
`66ee3ab7-0ec4-4f4c-995b-d33f58cab585` = **Matteo** (Sallami).

L'objectif de la semaine : **50 nouvelles entreprises démarchées par jour**, en
WhatsApp et en appel, partagées entre les deux. Le stock suffit (625 fiches,
2,5 semaines) ; ce qui manque, c'est que le travail soit VISIBLE dans les deux
files.

---

## Tâche 1 — le bouton « Attribuer le lot à un agent » *(le blocage)*

Sans lui, les lots 7 et 8 ne peuvent pas être attribués en un geste, et les 315
fiches restent invisibles.

**Côté serveur — `src/app/api/admin/assign/route.ts`.**
Accepte un `lot_id` en plus des `entreprise_ids` existants. Quand il est fourni,
la route résout la population elle-même depuis `lots_entreprises` : **aucun
identifiant ne circule**. C'est la convention déjà tenue par le lissage
(`/api/lissage/passes`), les plaquettes et les campagnes — le commentaire de
`GestesDuLot.tsx` explique pourquoi (le geste doit rester possible en 4G quelle
que soit la taille du lot).

Contraintes :

- Ne traite que les fiches dont `owner_id` **diffère** de l'agent visé — un
  second clic ne doit rien réécrire.
- `MAX_BATCH` vaut 200 et c'est un garde-fou anti-timeout : traite au plus 200
  par appel et rends `restant`, comme `/api/marketing-pipeline/reenrich` rend
  son `next_after_id`. Un lot de 249 se reprend, il ne se relance pas depuis le
  début. Déclare `maxDuration` en conséquence.
- **Réutilise `assignProspectsToAgent`** (`src/app/api/admin/_assign.ts`), jamais
  un `update owner_id`. La fonction pose le propriétaire, réutilise l'affaire
  existante plutôt que d'en ouvrir une seconde, qualifie la fiche, et sème la
  tâche « Appel à froid » — c'est cette tâche-là qui fait apparaître le prospect
  dans la file. Un update brut fabriquerait exactement l'état invisible dont on
  sort.

**Côté écran — `src/lib/lots/gestes.ts` et `src/components/prospection/GestesDuLot.tsx`.**
Ajoute un quatrième geste `attribuer`, avec `comble: ["proprietaire"]`. L'axe
`proprietaire` existe déjà dans `src/lib/lots/couverture.ts` — il est
actuellement rendu par `ailleurs()` avec `ou: "Pipeline commercial"`. Le geste
devenant lançable, il sort de `ailleurs()` tout seul et devient le geste
conseillé quand c'est le prochain trou : mets `ou` à jour en conséquence.

La liste des agents se lit depuis `GET /api/entreprises/explorateur/referentiel`,
qui rend déjà `{ departements, agents, lots }` — c'est la source qu'utilise
l'explorateur, n'en crée pas une seconde.

Le bouton boucle sur `restant` et montre l'avancement plutôt que de rendre la
main à 200 sur 249.

**Tests.** `src/app/api/admin/_assign.test.ts` couvre déjà l'attribution en lot ;
ajoute le cas `lot_id` et le cas « déjà chez le bon agent → aucune écriture ».

---

## Tâche 2 — corriger le registre des bots

`src/lib/architecture/bots.ts`, entrée `enrich-lead-magnet`, annonce :

> « Trigger DB via pg_net quand `pret_pour_lm` passe à true · ou appel manuel »

**Ce trigger n'existe pas.** `lead_magnet_projects` porte 8 triggers — defaults,
favicon, snapshot des tags, contenu, `updated_at`, sync email, sync logo, sync
statut — et aucun n'appelle l'edge function. Vérifie-le toi-même avant de
corriger :

```sql
select tgname, pg_get_triggerdef(oid) from pg_trigger
 where tgrelid = 'public.lead_magnet_projects'::regclass and not tgisinternal;
```

L'edge function n'est appelée que par `fetch` explicite, depuis quatre routes :
`marketing-pipeline/reenrich`, `lead-magnet/enrich`, `settings/ville-seo/recompute`
et `settings/google-stats`. Conséquence pratique, à écrire dans la règle :
**« Préparer l'enrichissement » (`enrich-prepare`) ne lance rien** — il pose
`pret_pour_lm` et remet le projet à `draft`, c'est tout.

C'est le piège que `CLAUDE.md` nomme en premier : le dépôt n'est pas la vérité
sur Supabase. Corrige la règle, ne supprime pas l'entrée.

---

## Tâche 3 — deux nettoyages, dans cet ordre

Écris-les en **une migration SQL** avec archive préalable, contrôles et rollback,
comme `sql/20260829_metiers_mis_de_cote.sql`. Montre-moi le compte avant
d'écrire.

**3a. Purger l'isolation des séquences — à faire AVANT tout dégel.**
97 inscriptions `active` portent encore un métier mis de côté
(`public.porte_metier_mis_de_cote(service_tags)`). Elles ont bien perdu leur
`qualifie`, mais personne ne les a sorties des séquences. Dégeler avant de
purger enverrait 97 messages à des poseurs d'isolation qu'on ne démarche pas.

**3b. Dégeler les inscriptions mortes.**
696 des 712 inscriptions `active` ont `next_run_at` nul :

| Motif | Inscriptions |
| --- | ---: |
| S1 · `sequence_paused` | 524 |
| S1 · aucun motif | 88 |
| S1 · `test_hold`, échu depuis le 28/08 | 44 |
| S2 · aucun motif | 40 |

Traite-les **par motif, pas en bloc** : les 44 `test_hold` sont du déchet de
test et se sortent ; les 524 se reprennent ; les 128 sans motif demandent un
arbitrage (elles ont pu déjà recevoir quelque chose — croise avec `email_logs`
et `prospection_tasks`). Les fiches attribuées en tâche 1 reçoivent déjà leur
tâche « Appel à froid » par la route : ne les dégèle pas deux fois.

---

## Tâche 4 — la chaîne de fabrication, outil par outil

Lis `src/lib/architecture/bots.ts` avant de lancer quoi que ce soit : c'est le
registre des trente-trois bots, et chaque entrée porte son coût et ses règles.
Ce qui suit dit lesquels, dans quel ordre, et **à quelle condition chacun laisse
passer** — c'est la partie qui manquait.

### La chaîne, et la porte de chaque étape

| # | Étape | L'outil | Ce qui laisse passer à la suite |
| --- | --- | --- | --- |
| 1 | Présence web | `/api/lissage/passes` + `scripts/lissage/runner.mjs` | une URL qui RÉPOND |
| 2 | Armer le dossier | « Préparer l'enrichissement » → `enrich-prepare` | `pret_pour_lm = true` |
| 3 | Enrichir | `Réglages → Enrichissement` → `reenrich` → edge function | `service_tags` remplis, statut `framer` |
| 4 | Créer le site | Site Builder → template → « Créer site web » → `deploy-batch` | un site publié, sous-domaine dérivé |
| 5 | Vignettes | `og-cards-tick` | rien à faire, cron horaire |

**L'étape 4 est celle que personne ne devine.** `regenerate-site` ne CRÉE pas un
site — il exige un `site_id` et REFAIT un site existant. La création en masse
passe par `POST /api/site-builder/sites/{templateSiteId}/deploy-batch` avec
`companyIds[]`, déclenchée depuis les réglages d'un template
(`TemplateDeployPanel.tsx`). Elle clone le gabarit, rattache l'entreprise et son
projet lead-magnet, dérive un sous-domaine unique, et **publie immédiatement**.

**La porte de l'étape 4 est double**, et c'est elle qui décide de ta semaine :
`GET /api/site-builder/template-candidates` ne retient une entreprise que si son
projet a `pret_pour_lm = true` **et** qu'elle partage au moins un `service_tag`
avec le gabarit. Une fiche enrichie mais sans tags ne sortira jamais comme
candidate, et rien ne le dira.

### Où en sont les deux lots, mesuré le 29/08

| | lot 9 (à enrichir) | lot 10 (à lisser) |
| --- | ---: | ---: |
| Fiches | 122 | 65 |
| `pret_pour_lm = true` | 21 | 45 |
| Avec `service_tags` | 66 | 36 |
| **Déployables en site aujourd'hui** | **6** | **20** |
| Enrichissement déjà terminé | 3 | 3 |

**26 sites déployables sur 187.** Le goulot n'est ni le lissage ni le LLM : c'est
la double porte ci-dessus. Les 85 mobiles sans `service_tags` sont exactement ce
qui bloque — et c'est l'edge function qui les écrit (`edge function enrich/db.ts`,
fusion non destructive). D'où l'ordre : enrichir d'abord, déployer ensuite.

### Les gestes

1. **Lot 10 (65) → lissage.** Bouton « Lancer une passe de lissage » sur la fiche
   du lot. Puis sur ce poste, pour les étapes Playwright :
   ```
   npm run dev                      # la route locale doit répondre
   node scripts/lissage/runner.mjs --taille 20 --boucle
   ```
   Le runner **n'écrit jamais une URL de site** : il dépose des candidats, un
   humain tranche. C'est voulu, ne le « corrige » pas.

2. **Lot 9 (122) → enrichissement.** `Réglages → Enrichissement`, scope `ids`,
   `overwrite: false`, **`dry_run: true` d'abord** — la route chiffre avant de
   dépenser. Un appel LLM par projet, poste le plus cher de la chaîne.
   **N'envoie pas le lot 10 à l'enrichissement** : ses sites ne répondent pas,
   l'échec `home_unreachable_or_empty` est garanti et l'appel est payé quand même.

3. **Les 26 déployables → sites.** Site Builder, réglages du gabarit, « Créer
   site web ». ⚠️ La publication est immédiate, et **republier régénère
   `shared_assets.css` depuis le gabarit** : tout correctif CSS non cuit dans
   l'asset est annulé. Un correctif qui vaut pour tout le parc se pose plutôt
   dans `src/app/(public)/layout.tsx`.

4. **Vignettes : rien à faire.** `og-cards-tick` tourne toutes les heures à la
   minute 41. C'est ce qui rend le lien propre dans WhatsApp — donc c'est
   exactement ce qu'il faut ici, et c'est déjà branché.

5. **PageSpeed jamais en masse** — uniquement sur une entreprise qu'on va
   effectivement démarcher. Le quota est la ressource rare, pas le temps.

Il reste 20 fiches sans ville ni code postal : elles ne seront jamais « prêtes
pour démo » tant que ce n'est pas saisi (`pretes_pour_demo_des_lots()` l'exige).
Ça se comble dans la grille de complétion du pipeline marketing. Aujourd'hui
**96 des 187 sont prêtes pour démo** — c'est le chiffre à faire monter.

---

## Garde-fous

- `npm run typecheck` avant de considérer quoi que ce soit terminé.
- Code et commentaires **en français**, en-têtes qui disent le *pourquoi*.
- Écrire comme le code voisin : même densité de commentaire, même idiome.
- **Archiver avant toute écriture de masse**, et prévoir le rollback.
- Ne fusionne pas les définitions de « sans site » : `chercher_entreprises` et
  l'explorateur n'en disent pas la même chose, et c'est délibéré.

Commence par la **tâche 1**, montre-moi le diff, et attends mon feu vert avant
la tâche 3 — c'est la seule qui touche des données vivantes.
