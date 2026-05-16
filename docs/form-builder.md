# Form Builder

Module Typeform-like intégré au CRM. Permet de créer, éditer, publier et incorporer
des formulaires interactifs avec logique conditionnelle, dans des pages publiques
ou des sections du site builder.

## Flow utilisateur

1. **Créer** : `/forms` → bouton « Nouveau formulaire ». Crée un brouillon vide.
2. **Éditer** : `/forms/[id]/edit` → SPA 4 onglets (Build / Logique / Preview / Partager).
3. **Publier** : bouton « Publier » dans la topbar — bascule `is_published`.
4. **Partager** : onglet Partager fournit le lien `/f/[slug]` et un snippet iframe.
5. **Consulter les réponses** : `/forms/[id]/submissions`.

## Architecture

```
src/app/forms/                      Liste, édition, soumissions (admin)
src/app/f/[slug]/                   Page publique (anon)
src/app/api/forms/                  CRUD admin + endpoints publics
src/components/form-builder/        SPA, runtime, sous-composants
src/lib/form-builder/               Helpers purs (logique, matching, seed)
sql/20260516_form_builder.sql       Tables forms + form_submissions
```

### Tables Supabase

- `forms` : `id, name, slug, tags TEXT[], questions JSONB, logic JSONB, brand, settings, style, is_published, enterprise_id`
- `form_submissions` : `id, form_id, site_id, answers JSONB, contact JSONB, ip_hash, source_url, status, created_at`

RLS : auth full access, anon SELECT sur `forms` filtrée par `is_published = true`.

### Types

Voir `src/types/index.ts` :
- `Form`, `FormQuestion`, `FormChoice`, `FormLogicRule`, `FormLogicClause`, `FormLogicOp`
- `FormSettings`, `FormStyle`, `FormBrand`

## Catalogue des types de questions

17 types regroupés en 7 catégories (`QT_GROUPS` dans `src/lib/form-builder/question-types.ts`) :

| Catégorie | Types |
|---|---|
| Structure | `welcome`, `statement`, `end` |
| Choix | `multi_choice`, `single_choice`, `dropdown`, `yes_no` |
| Texte | `short_text`, `long_text` |
| Contact | `email`, `phone` |
| Note | `rating`, `scale` |
| Nombre | `number`, `slider` |
| Avancé | `date`, `file` |

Chaque choix (`FormChoice`) supporte : `label`, `desc`, `icon` (slug Lucide), `image`, `value`.

## Logique conditionnelle

Modèle :

```ts
interface FormLogicRule {
  id: string;
  from: string;       // question id source
  to: string;         // question id cible
  cond?: {
    all?: FormLogicClause[];   // AND
    any?: FormLogicClause[];   // OR
  };
  label?: string;
}

interface FormLogicClause {
  field: string;
  op: 'eq' | 'neq' | 'contains' | 'not_contains'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'answered' | 'empty';
  value?: unknown;
}
```

### Évaluation

Le runtime utilise `resolveFlow(form, answers)` (cf. `src/lib/form-builder/evaluate-logic.ts`) :

1. Démarre à la première question.
2. Après chaque réponse, cherche une `FormLogicRule` où `from === currentId` et `cond` est satisfaite. La **première** règle matchée gagne.
3. Sinon, passe à la question suivante dans l&apos;ordre du tableau.
4. Boucle anti-cycle via un `Set` de question id déjà visités.

## Tags de service & auto-sélection

`scoreFormForSite(formTags, siteTags)` retourne le nombre de tags partagés
(case-insensitive). `pickDefaultFormId(forms, siteTags)` retourne l&apos;id du
formulaire avec le meilleur score, tie-break par `updated_at` desc.

Cette fonction est exposée via `FormPickerField` (voir ci-dessous).

## Insertion dans un site

Le type de section `form_block` est enregistré dans
`src/data/section-schemas.ts`. Schéma minimal :

```ts
{
  name: 'Formulaire',
  category: 'contact',
  settings: [
    { type: 'form_picker', id: 'form_id', label: 'Formulaire', filter_by_site_tags: true },
    { type: 'select', id: 'render_mode',
      options: [
        { label: 'Une question à la fois', value: 'step' },
        { label: 'Scroll', value: 'scroll' },
      ], default: 'step' },
    { type: 'checkbox', id: 'inherit_form_style', default: true },
  ],
}
```

`FormPickerField` (`src/components/site-builder/editors/FormPickerField.tsx`) :
- fetch `GET /api/forms`,
- trie via `scoreFormForSite`,
- affiche un groupe « Recommandés pour ce site » (score > 0) et « Autres ».

Le rendu se fait dans `DynamicSectionRenderer` qui :
- détecte `sectionDef.type === 'form_block'`,
- fetch `GET /api/forms/public/[form_id]`,
- monte `<FormRuntime />` en lazy-load.

## URL publique `/f/[slug]`

SSR via `src/app/f/[slug]/page.tsx`. Lit la table `forms` avec le service client
(filtre `is_published = true`), monte `<FormRuntime />`. Convient au partage
direct, QR code, SMS.

## Variables runtime

`FormRuntime` accepte `variables?: Record<string, string>`. Les titres et
sous-titres supportent l&apos;interpolation `{{key}}`. Exemple :

```ts
<FormRuntime form={form} variables={{ 'entreprise.nom': 'Acme' }} />
// title: "Bonjour, ici {{entreprise.nom}}" → "Bonjour, ici Acme"
```

Quand le formulaire est rendu via un `form_block`, les variables du site builder
sont propagées automatiquement.

## API

| Méthode | Chemin | Auth | Rôle |
|---|---|---|---|
| GET | `/api/forms` | service | Liste (`?tags=a,b`, `?enterprise_id=`) |
| POST | `/api/forms` | service | Crée `{name, tags?, enterprise_id?, fromSeed?}` |
| GET | `/api/forms/[id]` | service | Lecture admin |
| PUT | `/api/forms/[id]` | service | Update (whitelist) |
| DELETE | `/api/forms/[id]` | service | Delete |
| GET | `/api/forms/public/[id]` | anon | Lecture runtime |
| GET | `/api/forms/public/by-slug/[slug]` | anon | Lecture par slug |
| POST | `/api/forms/[id]/submit` | anon | Insert form_submissions |
| GET | `/api/forms/[id]/submissions` | service | Liste pour admin |

## Hors-scope V1

Les colonnes existent et les placeholders sont en place dans l&apos;UI, mais ne
sont pas implémentés en V1 :

- Envoi d&apos;email via Resend sur submit (`settings.notify_email`).
- Création automatique d&apos;`opportunite` à la soumission (`settings.create_opportunity`).
- Webhook sortant.
- Génération IA d&apos;un formulaire depuis les services du site.
- Canvas SVG visuel pour la logique (l&apos;onglet Logique utilise une liste simple).

## Pour Claude / AI

Quand vous générez ou modifiez des sections d&apos;un site :

1. **Pour un formulaire**, déposez un `form_block` plutôt que d&apos;inventer un
   schéma custom (le `contact` schema est désormais réservé à un simple bloc
   d&apos;informations de contact, pas un formulaire interactif).

2. **`content.form_id`** : si vous ne connaissez pas le formulaire à utiliser,
   laissez vide — l&apos;auto-sélection par tags choisira le meilleur (cf.
   `pickDefaultFormId`). Si l&apos;utilisateur a explicitement nommé un
   formulaire, settez `form_id` à son UUID.

3. **Defaults** :
   - `inherit_form_style: true` (le formulaire garde son propre style)
   - `render_mode: 'step'` (une question à la fois — UX Typeform)

4. **Shape `Form` côté API** :
   ```ts
   {
     name: string, slug?: string, tags: string[],
     questions: FormQuestion[], logic: FormLogicRule[],
     brand: { name?: string, color?: string, logo_url?: string },
     settings: { progressBar: boolean, showQuestionNumber: boolean,
                 submitLabel: string, renderMode: 'step'|'scroll',
                 redirect_url?: string },
     style: { density?: 'compact'|'regular'|'cozy', accent?: string },
     is_published: boolean,
   }
   ```
   Pour seed un formulaire complet via API, voir `SEED_FORM` dans
   `src/lib/form-builder/seed-form.ts` (lead HVAC/solaire 16 questions).

5. **Tags** : ajoutez `tags: ['plomberie', 'chauffage', ...]` aux formulaires
   pour qu&apos;ils soient auto-suggérés dans un site dont l&apos;entreprise a
   ces `service_tags`.
