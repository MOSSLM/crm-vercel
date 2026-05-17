# Intégrer un formulaire dans une section

Le site-builder expose un type de section dédié, `form_block`, qui embarque
n'importe quel formulaire créé dans `/forms`. Pas besoin d'écrire du code
TSX : le composant `FormBlockSection` (`src/components/site-builder/DynamicSectionRenderer.tsx`)
gère le rendu pour toi.

## Ajouter un form_block à une page

1. Onglet **Sitemap** → ouvre la page concernée (ex. *Contact*).
2. Clique **Ajouter une section** → catégorie *contact* → choisis **Formulaire**.
3. L'instance est créée immédiatement. Va dans l'onglet **Design** pour la
   configurer.

## Configurer le formulaire dans la sidebar Design

Sélectionne la section `form_block` : la sidebar de gauche affiche le schéma
`formBlockSchema` (cf. `src/data/section-schemas.ts:999`).

- **Formulaire** (`form_picker`) — liste tous les formulaires existants. Si
  l'entreprise du site est liée et qu'un formulaire porte le tag matching
  (cf. `scoreFormForSite` dans `src/lib/form-builder/match-form-by-tags.ts`),
  il apparaît dans le groupe **Recommandés pour ce site** en haut.
- **Auto-sélection par défaut** : si aucun formulaire n'est encore choisi, le
  premier formulaire recommandé est sélectionné automatiquement au montage.
  L'utilisateur reste libre de changer.
- **Mode de rendu** : *Une question à la fois* (parcours type Typeform) ou
  *Scroll* (toutes les questions visibles d'un coup).
- **Hériter du style du formulaire** : si activé, le formulaire utilise son
  propre thème (défini dans `/forms/[id]/edit` → onglet *Theme*) ; sinon, il
  hérite du Style Guide du site.

## Lier un formulaire à une entreprise

Dans `/forms/[id]/edit`, ajoute un tag qui correspond aux `service_tags` de
l'entreprise (ex. `plomberie`, `electricite`). Le scoring est défini dans
`src/lib/form-builder/match-form-by-tags.ts` — n'importe quel chevauchement
de tag suffit à classer le formulaire en "recommandé".

## Quand ajouter un nouveau champ de schéma ?

Si tu veux exposer un nouveau réglage côté builder (ex. un *checkbox*
"afficher le titre"), édite `formBlockSchema` puis utilise la valeur via
`instance.content.<id>` dans `FormBlockSection`. Le pipeline d'affichage du
panneau (`PropertiesPanel` → `FieldRenderer`) prend ça en charge sans
modification supplémentaire.

## Voir aussi

- `docs/form-builder.md` — création et structure des formulaires.
- `src/components/site-builder/DynamicSectionRenderer.tsx` (recherche
  `FormBlockSection`) — rendu runtime.
- `src/lib/form-builder/match-form-by-tags.ts` — algorithme de matching.
