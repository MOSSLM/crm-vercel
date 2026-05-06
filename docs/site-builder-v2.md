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
| `__padding_y` | Override de `paddingTop`/`paddingBottom` de la section |

### Sections built-in avec schema

Les 12+ types de sections built-in ont des schemas prédéfinis :
`hero`, `hero-centered`, `hero-split`, `navbar`, `services`, `services-grid`, `features`,
`testimonials`, `about`, `contact`, `cta-banner`, `faq`, `stats`, `stat-row`,
`gallery`, `team`, `logos`, `logo-row`, `blog`, `footer`

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

