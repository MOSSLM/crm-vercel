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

## Tâche 4 — lancer la fabrication *(gestes, pas du code)*

Une fois 1 à 3 passés :

1. **Lot 10 (65 fiches) → lissage.** Bouton « Lancer une passe de lissage » sur
   la fiche du lot. Puis sur ce poste, pour les étapes Playwright que le serveur
   ne peut pas faire :
   ```
   npm run dev                      # la route locale doit répondre
   node scripts/lissage/runner.mjs --taille 20 --boucle
   ```
   Le runner **n'écrit jamais une URL de site** : il dépose des candidats dans le
   dossier de la ligne, un humain tranche. C'est voulu.

2. **Lot 9 (122 fiches) → enrichissement.** `Réglages → Enrichissement`, scope
   `ids`, `overwrite: false`, et **`dry_run: true` d'abord** : la route chiffre
   avant de dépenser. Un appel LLM par projet, c'est le poste le plus cher de
   toute la chaîne — ne l'envoie pas sur le lot 10, dont les sites ne répondent
   pas (`home_unreachable_or_empty` garanti).

3. **Les vignettes : rien à faire.** `og-cards-tick` tourne toutes les heures à
   la minute 41 et fabrique les cartes de partage. C'est ce qui rend le lien
   propre dans WhatsApp.

4. **PageSpeed jamais en masse** — uniquement sur une entreprise qu'on va
   effectivement démarcher. Le quota est la ressource rare.

Ce qui manque encore aux 187 mobiles, mesuré le 29/08 : **85 sans
`service_tags`** et 20 sans ville ou code postal. L'enrichissement écrit
`entreprise.service_tags` en fusion non destructive, donc l'étape 2 en comble
une bonne partie seule ; le reste se saisit dans la grille de complétion du
pipeline marketing. Aujourd'hui **96 des 187 sont « prêtes pour démo »** — c'est
ce chiffre qu'il faut monter.

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
