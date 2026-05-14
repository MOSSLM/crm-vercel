# Site Builder V2 — Architecture & Guide

## Vue d'ensemble

Le Site Builder V2 remplace l'ancienne approche d'éléments libres inline par un système de **thèmes à sections typées**, similaire à Shopify. Chaque site est représenté par une configuration JSON (`SiteConfig`) qui liste des sections ordonnées, chacune liée à un composant React du thème actif.

---

## Architecture

```
src/
├── templates/                     # Thèmes et sections
│   ├── index.ts                   # Registre des thèmes disponibles
│   └── theme-default/             # Thème "Artisan Pro"
│       ├── theme.config.ts        # Configuration du thème (sections, variables)
│       ├── layout.tsx             # Layout global (header, footer)
│       ├── sections/              # Composants de sections
│       │   ├── hero.tsx
│       │   ├── services.tsx
│       │   ├── about.tsx
│       │   ├── testimonials.tsx
│       │   ├── contact.tsx
│       │   ├── faq.tsx
│       │   ├── cta-banner.tsx
│       │   ├── gallery.tsx
│       │   ├── blog.tsx
│       │   └── popup.tsx
│       └── snippets/
│           └── button.tsx
│
├── components/site-builder/
│   ├── SiteConfigProvider.tsx     # Contexte React pour l'état de config
│   ├── use-site-config.tsx        # Hook d'accès au contexte
│   ├── SiteConfigEditor.tsx       # Éditeur V2 (panneau sections + config JSON)
│   └── SectionRenderer.tsx        # Rendu d'une section par type
│
├── lib/
│   ├── site-resolver.ts           # Chargement config + variables depuis Supabase
│   └── ai/
│       ├── site-config-generator.ts  # Générateur IA de config JSON
│       └── prompts/
│           └── system-config-generator.txt  # Prompt système
│
├── middleware.ts                  # Routage multi-tenant par sous-domaine
│
└── app/
    ├── site/[subdomain]/          # Rendu public des sites clients
    │   ├── layout.tsx             # Chargement config + thème
    │   ├── page.tsx               # Rendu des sections
    │   └── blog/[slug]/page.tsx   # Page article de blog
    │
    ├── site-builder-v2/           # Pages CRM pour gérer les sites V2
    │   ├── page.tsx               # Liste des sites
    │   └── [siteId]/page.tsx      # Éditeur de site
    │
    ├── portail/[token]/page.tsx   # Portail client (édition limitée)
    │
    └── api/
        ├── site-builder-v2/
        │   ├── sites/             # CRUD sites
        │   ├── sites/[siteId]/    # Get/Update/Delete site
        │   ├── sites/[siteId]/publish/  # Publication/dépublication
        │   └── generate-config/   # Génération IA de config
        └── public/portal/
            ├── authenticate/      # Authentification par token
            ├── site/              # Config sections éditables
            └── site/sections/[sectionId]/  # PATCH override section
```

---

## Format de configuration (`SiteConfig`)

```json
{
  "theme": "theme-default",
  "settings": {
    "colors": { "primary": "#1a56db", "secondary": "#6b7280", ... },
    "fonts": { "heading": "Inter", "body": "Inter" }
  },
  "sections": [
    {
      "id": "hero-1",
      "type": "hero",
      "dataSource": "enterprise",
      "data": {
        "title": "{{entreprise.nom}}",
        "subtitle": "Expert local depuis des années",
        "cta": { "text": "Nous contacter", "href": "#contact" },
        "settings": { "overlay": true, "height": "large" }
      }
    }
  ]
}
```

### `dataSource` — Source des données

| Valeur | Signification |
|--------|---------------|
| `enterprise` | Données auto depuis la table `entreprises`, non modifiables |
| `config` | Contenu stocké dans la config JSON, éditable par l'équipe |
| `client-editable` | Contenu surchargeables par le client via son portail |
| `dynamic` | Données dynamiques (blog, avis Google...) |

### Variables entreprise

Dans les champs `data`, utiliser `{{entreprise.xxx}}` pour injecter les données de l'entreprise liée :

- `{{entreprise.nom}}`, `{{entreprise.telephone}}`, `{{entreprise.email}}`
- `{{entreprise.adresse}}`, `{{entreprise.ville}}`, `{{entreprise.code_postal}}`
- `{{entreprise.logo_url}}`, `{{entreprise.site_web_canonique}}`
- `{{entreprise.note_moyenne}}`, `{{entreprise.nombre_avis}}`

---

## Routage multi-tenant

Le `middleware.ts` détecte le sous-domaine et reroute vers `src/app/site/[subdomain]/` :

```
app.monsupercrm.fr    → Routes CRM (inchangées)
demo.monsupercrm.fr   → src/app/site/[subdomain]/ (demo)
client-a.monsupercrm.fr → src/app/site/[subdomain]/ (client-a)
```

### Publication d'un site

1. Dans l'éditeur V2, cliquer "Publier"
2. Entrer un sous-domaine (ex: `mon-client`)
3. Le site est accessible sur `mon-client.monsupercrm.fr`

Pour un domaine personnalisé, stocker le domaine dans `published_domain` et demander au client de configurer un CNAME vers Vercel.

---

## Portail client

URL : `/portail/{token}` (token depuis `entreprises.client_portal_token`)

Le client peut modifier uniquement les sections avec `dataSource: "client-editable"`. Les modifications sont stockées dans la table `client_overrides` et fusionnées au moment du rendu.

### API portail

```
POST /api/public/portal/authenticate   { token } → { ok, company, site }
GET  /api/public/portal/site           (header: x-portal-token) → sections éditables
PATCH /api/public/portal/site/sections/:id  (header: x-portal-token) → sauvegarde override
```

---

## Génération IA

L'IA (Claude) génère la configuration JSON complète d'un site à partir des données entreprise.

### API

```
POST /api/site-builder-v2/generate-config
Body: { company: { id, name, service_tags, ville, ... }, themeSlug?: string }
Response: { config: SiteConfig }
```

Dans l'éditeur, le bouton "Générer avec l'IA" déclenche ce processus. Une entreprise doit être liée au site.

---

## Migration SQL

Le fichier `sql/20260505_site_builder_v2.sql` ajoute :

- Colonnes `published_subdomain`, `published_domain`, `is_published`, `enterprise_id`, `site_config` sur `sites`
- Table `client_overrides` (overrides par section et par site)
- Table `blog_posts` (articles de blog par site)
- Colonnes `client_portal_token`, `client_portal_activated` sur `entreprises`
- Génération automatique du token portail à la création d'une entreprise

**Pour appliquer :**
```bash
# Via Supabase CLI
supabase db push
# Ou via l'interface SQL de Supabase Studio
```

---

## Créer un nouveau thème

1. Créer `src/templates/mon-theme/`
2. Ajouter `theme.config.ts` (voir `theme-default/theme.config.ts` comme modèle)
3. Créer les composants dans `sections/`
4. Ajouter les exports dans `index.ts`
5. Enregistrer dans `src/templates/index.ts`

---

## Tests

### Tester le rendu d'un site

1. Appliquer la migration SQL
2. Créer un site V2 dans l'interface CRM
3. Configurer les sections avec des données de test
4. Publier sur un sous-domaine (ex: `test`)
5. Accéder à `test.monsupercrm.fr` (en local, modifier votre `/etc/hosts` : `127.0.0.1 test.localhost`)

### Tester le portail client

1. Récupérer le `client_portal_token` d'une entreprise dans Supabase
2. Accéder à `/portail/{token}`
3. Modifier une section `client-editable`

### Variables d'environnement requises

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
ANTHROPIC_API_KEY=xxx              # Pour la génération IA
NEXT_PUBLIC_APP_DOMAIN=monsupercrm.fr  # Optionnel, défaut: "monsupercrm.fr"
```

---

## Système de Schemas par Section (Shopify-like)

### Vue d'ensemble

Chaque type de section peut désormais définir un **schema** qui liste ses paramètres éditables, avec un type par champ. Ce système est identique aux `sections/*.liquid` de Shopify.

Le schema est résolu dans cet ordre de priorité :
1. `sectionDef.schema` — schema inline depuis la DB (`theme_sections.schema`)
2. `SECTION_SCHEMAS[sectionDef.type]` — registre statique (`src/data/section-schemas.ts`)
3. Fallback snippets / clé-valeur générique (comportement legacy)

### Types de champs disponibles

| Type | Composant | Description |
|------|-----------|-------------|
| `text` | `TextField` | Champ texte simple |
| `textarea` | `TextField` | Zone de texte multilignes |
| `url` | `TextField` | Champ URL |
| `number` | `RangeField` | Nombre avec min/max/step |
| `range` | `RangeField` | Slider avec unité (px, %, rem…) |
| `select` | `SelectField` | Dropdown ou boutons segmentés |
| `radio` | `SelectField` | Boutons radio (≤3 options = boutons) |
| `checkbox` | `CheckboxField` | Toggle switch |
| `color` | `ColorPickerField` | Color picker avec palette style guide + shades |
| `color_scheme` | `ColorSchemeField` | Sélecteur de palette de section (7 presets) |
| `image_picker` | `ImagePickerField` | Sélecteur d'image (URL + upload) |
| `alignment` | `AlignmentField` | Sélecteur left/center/right/justify |
| `font` | `FontPickerField` | Sélecteur de police Google Fonts |
| `header` | — | Séparateur de groupe (non éditable) |
| `paragraph` | — | Texte informatif (non éditable) |

### Définir un schema pour une section

```typescript
// src/data/section-schemas.ts
import type { SectionSchema } from '@/types';

const monSchema: SectionSchema = {
  name: "Ma Section",
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Mon titre' },
    { type: 'textarea', id: 'body', label: 'Description', rows: 3 },
    { type: 'image_picker', id: 'image', label: 'Image principale' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select', id: 'layout', label: 'Disposition',
      options: [
        { label: 'Image à gauche', value: 'left' },
        { label: 'Image à droite', value: 'right' },
      ],
      default: 'right',
    },
    { type: 'range', id: '__padding_y', label: 'Espacement vertical', min: 40, max: 200, step: 8, unit: 'px', default: 80 },
    { type: 'header', content: 'Style' },
    { type: 'color_scheme', id: '__color_scheme', label: 'Palette de couleurs' },
  ],
  blocks: [
    {
      type: 'item',
      name: 'Élément',
      settings: [
        { type: 'text', id: 'title', label: 'Titre' },
        { type: 'textarea', id: 'description', label: 'Description' },
        { type: 'image_picker', id: 'icon', label: 'Icône' },
      ],
    },
  ],
};

// Ajouter au registre
export const SECTION_SCHEMAS: Record<string, SectionSchema> = {
  'ma-section': monSchema,
  // ...
};
```

### IDs réservés (comportement automatique)

| ID | Comportement |
|----|-------------|
| `__color_scheme` | Sélecteur de palette appliqué comme CSS vars override au niveau section |
| `__padding_y` | Override de `paddingTop`/`paddingBottom` de la section (legacy, préférer `__padding_top/bottom`) |
| `__padding_top` | Padding haut en px (priorité sur `__padding_y` et le CSS var global) |
| `__padding_bottom` | Padding bas en px |
| `__padding_x` | Padding gauche/droite en px |
| `__margin_top` | Marge haut en px |
| `__margin_bottom` | Marge bas en px |
| `__height_mode` | Hauteur : `auto` \| `fullscreen` (100vh) \| `large` (80vh) \| `fixed` |
| `__height_value` | Valeur de hauteur fixe (ex: `500px`, `60vh`) — actif si `__height_mode=fixed` |
| `__library` | Référence vers une section bibliothèque (theme_sections), géré au runtime |

### Sections built-in avec schema

Les 14 types de sections built-in ont des schemas complets (settings + blocks + presets) :
`hero`, `navbar`, `services`, `testimonials`, `about`, `contact`, `cta-banner`,
`faq`, `stats`, `gallery`, `team`, `logos`, `blog`, `footer`.

Les alias `hero-centered`, `hero-split`, `services-grid`, `features`, `about-split`,
`cta`, `stat-row`, `image-grid`, `logo-row`, `header` pointent vers les mêmes schemas.

---

## Champs avancés du schema

### `group` — Groupement dans l'éditeur

Chaque champ peut être tagué avec un `group` qui détermine dans quel onglet il apparaît :

| Group | Onglet | Exemple |
|-------|--------|---------|
| `content` | Contenu | Titre, description, CTA |
| `layout` | Style → Mise en page | Disposition, colonnes, alignement |
| `style` | Style → Style | Palette, padding, image de fond |
| `advanced` | Style → Avancé | Custom CSS |

À défaut, le splitter utilise des heuristiques (id `__color_scheme` / `__padding_y`, type `color`).

### `visible_if` — Visibilité conditionnelle

Cache un champ tant que la condition n'est pas remplie. Évalué dans la même portée
(settings de la section ou settings d'un block).

```typescript
{ type: 'text', id: 'cta_secondary', label: 'Bouton secondaire' },
{
  type: 'url', id: 'cta_secondary_href', label: 'Lien bouton secondaire',
  visible_if: { field: 'cta_secondary', truthy: true },
},

// Aussi : { equals: 'value' } ou { in: ['a', 'b'] }
```

### `required` — Champ obligatoire

Sert d'indication à l'éditeur (badge "requis") et au validateur côté serveur.

### Types de champs CRM-spécifiques

| Type | Description | Stocke |
|------|-------------|--------|
| `page_link` | Sélecteur de page interne du site (avec option URL externe) | URL string |
| `icon_picker` | Sélecteur d'icône Lucide avec autocomplete | `name` Lucide |
| `enterprise_field` | Bind vers `entreprise.<key>` (nom, telephone, email, …) | clé string |
| `review_source` | Choix de la source des avis : `google`, `config`, `static` | string |
| `social_links` | Groupe pré-fait fb/ig/li/tw/yt/tiktok | object |

Pas de `product_picker` / `collection_picker` / `article_picker` (non pertinent pour le CRM).

---

## Blocks (éléments répétables)

Inspirés des blocks Shopify : un schema peut déclarer un ou plusieurs `blocks[]`,
chacun avec son propre jeu de `settings`. Les blocks d'une instance sont stockés
dans la colonne JSONB `site_section_instances.blocks` (ajoutée par la migration
`20260507_section_instance_blocks.sql`).

```typescript
const servicesSchema: SectionSchema = {
  name: 'Services',
  // ...
  max_blocks: 12,
  min_blocks: 1,
  blocks: [
    {
      type: 'service_item',
      name: 'Service',
      icon: 'briefcase',
      limit: 12,
      settings: [
        { type: 'icon_picker', id: 'icon', label: 'Icône', default: 'star' },
        { type: 'text', id: 'title', label: 'Titre', required: true },
        { type: 'textarea', id: 'description', label: 'Description', rows: 3 },
      ],
    },
  ],
};
```

Forme stockée dans `site_section_instances.blocks` :

```json
[
  { "id": "abc123", "type": "service_item", "settings": { "icon": "wrench", "title": "Plomberie", "description": "..." } },
  { "id": "def456", "type": "service_item", "settings": { "icon": "flame", "title": "Chauffage", "description": "..." } }
]
```

L'éditeur (`BlocksEditor`) supporte : ajouter, dupliquer, supprimer, réordonner.
Les limites `limit` (par type) et `max_blocks` (section) sont respectées dans l'UI.

---

## Presets

Configurations prêtes à l'emploi exposées dans l'onglet **Contenu** du panneau de
propriétés. Appliquer un preset remplace le `content` et les `blocks` de l'instance.

```typescript
presets: [
  {
    name: 'Grille 3 cartes élevées',
    description: '3 services en cartes avec ombre.',
    settings: { layout: 'grid-3', card_style: 'elevated' },
    blocks: [
      { type: 'service_item', settings: { icon: 'zap', title: 'Rapidité', description: '…' } },
      { type: 'service_item', settings: { icon: 'shield-check', title: 'Garantie', description: '…' } },
      { type: 'service_item', settings: { icon: 'heart', title: 'Service client', description: '…' } },
    ],
  },
],
```

---

## Limits

```typescript
limits: {
  instances_per_page?: number,  // ex: 1 pour navbar / footer / hero
  instances_per_site?: number,
}
```

Utilisé par la library de sections pour griser une section déjà placée le
nombre de fois autorisé.

---

## Validation runtime

`src/data/section-schemas.ts` expose :

- `validateSectionContent(schema, content)` — applique les defaults, coerce les types
  (`number`, `boolean`, `select` → valeur autorisée)
- `validateSectionBlocks(schema, blocks)` — drop les blocks de type inconnu, coerce
  les settings, applique `limit` et `max_blocks`
- `isFieldVisible(field, content)` — évalue `visible_if`
- `getVisibleFields(schema, content)` — retourne les champs actuellement visibles
- `buildInitialSectionState(schema, preset?)` — content + blocks initiaux pour
  une nouvelle instance

---

## Legacy adapter (rétrocompatibilité runtime)

`src/lib/site-builder/legacy-content-adapter.ts` projette les nouvelles clés
de schema vers les clés legacy consommées par les composants de section et le
moteur de snippets :

| Schema id | Legacy alias |
|-----------|--------------|
| `heading` | `title` |
| `subheading` | `subtitle` |
| `body` | `content` |
| `background_image` | `backgroundImage` |
| `cta_primary` + `cta_primary_href` | `cta: { text, href }` |
| `image_position` | `imagePosition` |
| `logo_image` | `logo` |

Les `blocks[]` sont projetés en arrays sous les clés attendues par les snippets
(`service_item` → `items` / `cards`, `testimonial_item` → `testimonials` /
`reviews`, `faq_item` → `faqs`, `stat_item` → `stats`, `gallery_item` → `images`,
`team_member` → `members`, `logo_item` → `logos`, `nav_link` → `links`,
`footer_column` → `columns`).

Les valeurs explicitement déjà présentes ne sont jamais écrasées.

---

## Génération IA basée sur le schema

Le prompt système `src/lib/ai/prompts/system-config-generator.txt` contient
le placeholder `{{SECTIONS_DOC}}` qui est remplacé à chaque appel par
`buildSectionsPromptDoc()` (`src/lib/ai/schema-prompt-doc.ts`).

Cette doc est dérivée directement du registre `SECTION_SCHEMAS` :
- liste des sections disponibles avec leur description
- pour chaque section : champs `content` (id, type, valeurs autorisées, défaut)
- pour chaque section : blocks supportés et leurs settings
- noms des presets disponibles

Conséquence : ajouter ou modifier un schema met automatiquement le prompt à jour
au prochain appel — aucun changement manuel du `.txt` n'est nécessaire.

L'IA est instruite de :
1. Utiliser strictement les `id` de schema (`heading`, pas `title`)
2. Mettre les éléments répétables dans `blocks[]`, pas dans `content`
3. Respecter les valeurs autorisées des `select`
4. Respecter `max_blocks` et les limites par type

### Tokens du Style Guide à respecter dans le code des sections

Toute section générée (`theme_sections.code`) s'exécute dans un iframe alimenté
par `LibrarySectionIframe`, qui injecte automatiquement les variables CSS du
Style Guide (`StyleGuide` côté types, `styleGuideToCSSVars()` côté runtime).
Pour que les réglages utilisateur (couleurs, polices, arrondi des boutons,
ombre des cartes, padding des sections, …) prennent réellement effet, le code
généré DOIT utiliser ces variables — sinon les valeurs codées en dur priment.

| Token CSS                     | Usage                                                  |
| ----------------------------- | ------------------------------------------------------ |
| `--color-primary`             | Couleur primaire                                       |
| `--color-secondary`           | Couleur secondaire                                     |
| `--color-accent`              | Couleur d'accent                                       |
| `--color-background`          | Fond principal                                         |
| `--color-bg-alt`              | Fond alternatif                                        |
| `--color-text`                | Texte par défaut                                       |
| `--color-text-muted`          | Texte secondaire                                       |
| `--color-primary-50…950`      | Nuances générées (idem secondary / accent)             |
| `--font-heading`              | Police des titres                                      |
| `--font-body`                 | Police du corps                                        |
| `--btn-primary-bg`            | Fond du bouton principal CTA                           |
| `--btn-primary-text`          | Texte du bouton principal                              |
| `--btn-primary-border-color`  | Bordure du bouton principal                            |
| `--btn-primary-border-width`  | Épaisseur de bordure du bouton principal               |
| `--btn-primary-radius`        | Arrondi du bouton principal                            |
| `--btn-primary-padding`       | Padding du bouton principal                            |
| `--btn-primary-shadow`        | Ombre du bouton principal                              |
| `--btn-secondary-bg`          | Fond du bouton secondaire CTA                          |
| `--btn-secondary-text`        | Texte du bouton secondaire                             |
| `--btn-secondary-border-color`| Bordure du bouton secondaire                           |
| `--btn-secondary-border-width`| Épaisseur de bordure du bouton secondaire              |
| `--btn-secondary-radius`      | Arrondi du bouton secondaire                           |
| `--btn-secondary-padding`     | Padding du bouton secondaire                           |
| `--btn-secondary-shadow`      | Ombre du bouton secondaire                             |
| `--btn-bg` / `--btn-text` etc.| **Alias legacy** → pointent vers les vars primaires    |
| `--card-radius`               | Rayon des cartes / images                              |
| `--card-padding`              | Padding des cartes                                     |
| `--card-shadow`               | Ombre des cartes (mappée depuis `none/sm/md/lg`)       |
| `--section-padding`           | Padding vertical des sections                          |
| `--element-gap`               | Gap entre éléments                                     |
| `--max-content-width`         | Largeur max du contenu                                 |

### Convention boutons CTA — opt-in par classe

**Seuls les éléments marqués `.cta-primary` ou `.cta-secondary` reçoivent les tokens bouton.**
Les autres éléments interactifs (toggles FAQ, flèches de slider, boutons hamburger, dots de pagination, etc.) gardent leur style natif.

```tsx
{/* ✅ Bouton d'action principal → reçoit les tokens du Style Guide */}
<a href="#contact" className="cta-primary inline-block font-semibold text-sm">
  Nous contacter
</a>

{/* ✅ Bouton d'action secondaire */}
<a href="#services" className="cta-secondary inline-flex items-center gap-1 font-semibold text-sm">
  En savoir plus <ArrowRight size={14} />
</a>

{/* ✅ Bouton FAQ — PAS de cta-*, garde son style natif */}
<button onClick={toggle} className="flex items-center justify-between w-full py-4">
  {question} <ChevronDown />
</button>

{/* ✅ Flèche de slider — PAS de cta-* */}
<button onClick={prev} className="p-2 rounded-full bg-gray-100">
  <ChevronLeft />
</button>
```

Le runtime injecte automatiquement ces règles CSS dans l'iframe :
```css
.cta-primary  { background-color: var(--btn-primary-bg)  !important; color: var(--btn-primary-text)  !important; ... }
.cta-secondary { background-color: var(--btn-secondary-bg) !important; color: var(--btn-secondary-text) !important; ... }
```

**Règles obligatoires pour les sections :**

1. **Boutons CTA** : ajouter `cta-primary` (bouton principal) ou `cta-secondary` (bouton secondaire) à la `className`. Ne jamais coder `backgroundColor: '#xxx'` ou `color: '#fff'` en dur sur un CTA — les tokens CSS s'en chargent.
2. **Autres boutons** : ne pas ajouter `cta-*` aux éléments non-CTA (FAQ, slider, menu, etc.).
3. Cartes / images : `style={{ borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)' }}`.
4. Polices : titres avec `fontFamily: 'var(--font-heading)'`, corps avec `'var(--font-body)'`.
5. Couleurs : utiliser les `var(--color-*)` plutôt que des hex codés en dur.
6. **Interdit** : `min-h-screen`, `h-screen`, `100vh` sur le conteneur racine — privilégier un
   `paddingTop`/`paddingBottom` basé sur `var(--section-padding)`. Le runtime neutralise tout de
   même `min-h-screen`/`100vh` pour éviter les sections géantes, mais éviter ces classes reste la
   bonne pratique.

### Style Guide — boutons : schéma étendu

Le Style Guide supporte désormais des boutons primaire/secondaire indépendants, avec contrôle complet :

```ts
buttons: {
  // Legacy (raccourci primaire — toujours utilisé comme fallback)
  borderRadius: '8px',
  padding: '12px 24px',
  style: 'filled',
  // Variants détaillés (optionnels, remplacent les valeurs legacy si présents)
  primary: {
    style: 'filled' | 'outline' | 'soft' | 'ghost',
    bg?: string,          // couleur exacte (null = auto depuis style + primary)
    text?: string,
    borderColor?: string,
    borderWidth: '2px',
    borderRadius: '8px',
    padding: '12px 24px',
    shadow?: { x, y, blur, spread, color } | null,
    hoverEffect?: 'darken' | 'lift' | 'scale' | 'none',
  },
  secondary: { /* même structure */ },
  preset?: 'modern' | 'minimal' | 'pill' | 'sharp' | 'bold' | 'soft' | 'elevated' | 'glass' | 'playful' | 'custom',
}
```

Le Style Guide Workspace expose un modal "Boutons CTA" avec :
- **Sélecteur de preset** (9 presets prêts à l'emploi + "Custom")
- **Onglets Principal / Secondaire**
- Par onglet : style, couleurs (fond/texte/bordure) avec overrides, épaisseur de bordure, arrondi, padding, ombre (toggle + x/y/blur/spread/couleur)

Ces règles sont rappelées dans le prompt système (`src/lib/ai/prompts/system-config-generator.txt`)
et dans le prompt par défaut du chat IA d'édition de section
(`src/app/api/themes/[slug]/sections/[sectionId]/chat/route.ts`).

---

## Système de Couleurs — Nuances & Color Schemes

### Génération de nuances (Shade Scales)

Depuis les 7 couleurs de base du Style Guide, le système génère automatiquement **11 nuances** (50→950) via `src/lib/color-utils.ts`.

```typescript
import { generateColorShades } from '@/lib/color-utils';

const shades = generateColorShades('#1a56db');
// → { 50: '#f0f4ff', 100: '#e0e9fd', ..., 500: '#1a56db', ..., 950: '#040d2a' }
```

- Les nuances sont calculées côté client à partir des couleurs de base (jamais stockées en DB)
- Accessibles en CSS via `--color-primary-50` … `--color-primary-950` (et idem pour `secondary`, `accent`)
- Accessibles dans les sections library via `window.__tokens.primaryShades[500]`
- Visibles dans **Style Guide → Couleurs** : clic sur "Nuances Primaire" pour développer/copier

### Color Schemes par section

Chaque instance de section peut avoir un color scheme indépendant du style guide global :

| Preset | Fond | Texte |
|--------|------|-------|
| `default` | `colors.background` | `colors.text` |
| `alt` | `colors.backgroundAlt` | `colors.text` |
| `primary` | `colors.primary` | auto (contraste) |
| `secondary` | `colors.secondary` | auto (contraste) |
| `dark` | `#111827` | `#f9fafb` |
| `light` | `#ffffff` | `#111827` |
| `inverted` | `colors.text` | `colors.background` |

Le color scheme est stocké dans `instance.content.__color_scheme` (string preset ou objet `{ preset, customBg?, customText? }`).

Dans le builder : **cliquer une section → onglet Style → Palette de couleurs**.

---

## Navbar — Options de Comportement

La section Navbar expose des paramètres spécifiques via son schema :

| Paramètre | Valeurs | Effet |
|-----------|---------|-------|
| `position` | `sticky` \| `fixed` \| `relative` \| `absolute` | CSS `position` de la navbar |
| `background` | `solid` \| `transparent` \| `blur` | Style du fond (glass effect) |
| `show_shadow` | `true` \| `false` | Ombre portée |
| `hide_on_scroll_down` | `true` \| `false` | Masquer quand scroll vers le bas |

Ces valeurs sont stockées dans `instance.content` et doivent être lues par le composant de rendu de la section navbar.

---

## Design Workspace — Panneau Contextuel

Le panneau gauche du Design Workspace s'adapte à ce qui est sélectionné.

### Mode A — Rien de sélectionné : Outils globaux

Accordéons empilés (pas de tabs) :

- **Animations & Transitions** — type d'animation au chargement/scroll, durée, délai, transitions de page
- **Style global** — padding sections, gap éléments, largeur max contenu (dispatche `UPDATE_STYLE_GUIDE`)

### Mode B — Section sélectionnée : Éditeur de propriétés

Tabs **Contenu | Style | IA** :

- **Contenu** : champs du schema (`group: 'content'`) + presets si disponibles
- **Style** : Palette de couleurs + champs `group: 'style'` + `group: 'layout'` (dont les champs dimensions/espacement générés par `commonStyleFields()`)
- **IA** : régénération du contenu de la section via l'IA

L'onglet Style affiche automatiquement les champs `__height_mode`, `__padding_top/bottom`, `__padding_x`, `__margin_top/bottom` issus de `commonStyleFields()`.

### Mode C — Élément texte sélectionné : Éditeur inline

Quand un `h1`–`h6`, `p`, `span` ou `blockquote` est sélectionné via click dans le canvas :
- Zone de texte pour modifier le contenu
- Contrôles gras / italique / soulignement
- Alignement (gauche/centre/droite/justifié)
- Taille (slider) et couleur

### `commonStyleFields(opts?)` — Champs partagés

Tous les schemas incluent automatiquement ces champs via `commonStyleFields()` :

```typescript
import { commonStyleFields } from '@/data/section-schemas';

const monSchema: SectionSchema = {
  settings: [
    // ... champs métier ...
    ...commonStyleFields({ skipHeight: false, defaultPadding: 80 }),
  ],
};
```

Options :
- `skipHeight?: boolean` — pour les sections dont la hauteur ne doit pas être modifiable (navbar, footer)
- `defaultPadding?: number` — valeur par défaut du padding vertical en px

---

## Composants d'Édition (Field Editors)

Tous les composants vivent dans `src/components/site-builder/editors/`.

```typescript
import { FieldRenderer, SchemaEditor } from '@/components/site-builder/editors';

// Rendre un champ individuel
<FieldRenderer field={setting} value={content[setting.id]} onChange={...} styleGuide={guide} />

// Rendre tout un schema
<SchemaEditor schema={schema} content={instance.content} onUpdate={updateContent} styleGuide={guide} />
```

Le `PropertiesPanel` détecte automatiquement si la section a un schema et l'utilise. Sans schema, il retombe sur l'éditeur snippets/générique existant.

