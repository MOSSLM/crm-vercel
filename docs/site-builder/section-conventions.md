# Site Builder — Section Authoring Conventions

## Overview

Sections are React components rendered inside a sandboxed iframe using Babel + React UMD. They receive three global objects:

- `window.__data` — the section's `content` record (key → value from the schema)
- `window.__variables` — `{ "entreprise.nom": "...", ... }` variable context
- `window.__tokens` — style guide tokens (colors, fonts, etc.)

The schema defined in `src/data/section-schemas.ts` drives the Properties Panel — every field declared there becomes an editable control. Nothing should be hardcoded in section code that could reasonably vary per site.

---

## Field Types

### Primitive fields

| type | Description |
|------|-------------|
| `text` | Single-line text (supports `{{ variable }}` via VariableTextarea) |
| `textarea` | Multi-line text |
| `image_picker` | Image URL with upload + library support |
| `color` | HEX color picker |
| `select` | Dropdown from fixed options |
| `range` | Numeric slider |
| `toggle` | Boolean checkbox |
| `page_link` | Internal page path or external URL |

### Composite fields

These fields store their value as an **object** in `content[fieldId]`, not a string.

#### `button`

```json
{ "label": "Commencer", "href": "/contact", "target": "_self", "style_overrides": {} }
```

Use in your section TSX:
```tsx
const btn = data.cta_primary ?? {};
<a
  href={applyVariables(btn.href ?? '#', variables)}
  target={btn.target ?? '_self'}
  className="cta-primary"
>
  {applyVariables(btn.label ?? 'Commencer', variables)}
</a>
```

#### `link`

```json
{ "label": "En savoir plus", "href": "/about", "target": "_self" }
```

#### `input`

```json
{ "input_type": "email", "placeholder": "votre@email.fr", "label": "Email", "name": "email", "required": true }
```

Use in your section TSX:
```tsx
const field = data.email_field ?? {};
<input
  type={field.input_type ?? 'text'}
  placeholder={applyVariables(field.placeholder ?? '', variables)}
  name={field.name ?? 'email'}
  required={field.required ?? false}
/>
```

#### `textarea_input`

Same as `input` plus `rows` (number).

#### `form`

```json
{ "action": "/api/contact", "method": "POST", "submit_label": "Envoyer", "success_message": "Merci !" }
```

---

## Rules

### 1. No hardcoded text or URLs

Every visible string **must** come from `window.__data` or be interpolated with `applyVariables()`. Never write:

```tsx
// ❌ BAD
<button>Contactez-nous</button>
<a href="/contact">En savoir plus</a>
```

```tsx
// ✅ GOOD
<button>{applyVariables(data.cta_label ?? 'Contactez-nous', variables)}</button>
<a href={applyVariables(data.cta_href ?? '/contact', variables)}>
  {applyVariables(data.cta_text ?? 'En savoir plus', variables)}
</a>
```

### 2. Interactive elements should bind to a content key, ideally with `data-field-id`

The builder edits any element you click in the canvas — texts, images, buttons, links, inputs, forms — **without** needing a schema declaration. It works in two layers:

- **Resolved binding** (preferred): when an element value matches a key in `content` or in a block's `settings`, that key is updated directly. Add `data-field-id="<key>"` on the element to make the binding explicit (no value matching required):

  ```tsx
  <h1 data-field-id="heading">{v(data.heading)}</h1>
  <a data-field-id="cta_primary" className="cta-primary" href={v(data.cta_primary?.href)}>
    {v(data.cta_primary?.label)}
  </a>
  ```

  This is the safest path — fast, deterministic, and robust to translation or duplicated text.

- **DOM-path override** (fallback): when no content key matches the clicked value (i.e. the element is hardcoded), the editor stores the user's edit in `content.__overrides[<DOM path>] = { kind, value }`. The iframe applies these overrides after every React render. Use this only as a safety net — explicit bindings are preferable.

### 3. CTA buttons must use `.cta-primary` / `.cta-secondary`

The global style guide injects CSS rules for `.cta-primary` and `.cta-secondary`. These classes apply the correct button colors, radius, and padding from the Style Guide without hardcoding any values.

```tsx
<a className="cta-primary" href={...}>{...}</a>
<a className="cta-secondary" href={...}>{...}</a>
```

### 4. Fonts via CSS variables, never hardcoded

```tsx
// ❌ BAD
<h1 style={{ fontFamily: 'Roboto, sans-serif' }}>

// ✅ GOOD — font-family is set globally on h1 via the style guide CSS
<h1>{data.heading}</h1>
```

### 5. Use `applyVariables()` for every text output

Define the helper at the top of your section and use it everywhere:

```tsx
function applyVariables(text, variables) {
  if (!text || !variables) return text ?? '';
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => variables[key] ?? '');
}
```

### 6. CSS variables for colors and spacing

Use the CSS custom properties injected by the style guide:

```tsx
style={{ backgroundColor: 'var(--color-primary)', padding: 'var(--section-padding)' }}
```

Available CSS vars: `--color-primary`, `--color-secondary`, `--color-accent`, `--color-background`, `--color-bg-alt`, `--color-text`, `--color-text-muted`, `--font-heading`, `--font-body`, `--section-padding`, `--element-gap`, `--max-content-width`, `--card-radius`, `--card-shadow`, `--card-padding`.

### 7. Animation — use `__animation_*` keys (read-only in section code)

Animations are applied at the canvas level by `AnimatedSection`. Section code does not need to handle them.

### 8. DOM classification rules (how the editor figures out the element kind)

When the user clicks an element in the canvas, the iframe classifies it into a *kind* that determines which editor opens:

| DOM | kind | Editor opened |
|---|---|---|
| `<img>`, `<picture>`, child `<svg>` of `<picture>` | `image` | Image picker (upload / library / URL) |
| `<button>`, `<a class="cta-primary">`, `<a class="cta-secondary">`, `<a class="btn">`, `<a class="button">`, `<a role="button">` | `button` | Label + href + target + style overrides |
| `<a>` (any other) | `link` | Label + href + target |
| `<input>`, `<textarea>` | `input` | Placeholder + type + name + required |
| `<form>` | `form` | Action + method |
| `<h1>..<h6>`, `<p>`, `<span>`, `<li>`, `<blockquote>`, `<label>` | `text` | VariableTextarea |

**Implication for section authors**: if you want a clickable element to be classified as a *button* rather than a generic link, give it `cta-primary`, `cta-secondary`, or `btn` class. If you want a heading to be its own row in the Layers panel rather than nested inside a `<p>`, give it a real `<h1>..<h6>` tag.

---

## Schema Field Groups

Each field must declare a `group`:

| group | Tab in Properties Panel |
|-------|------------------------|
| `content` | Contenu |
| `layout` | Style → Mise en page |
| `style` | Style → Style |
| *(omitted)* | Contenu (default) |

---

## Reference Template

See `src/data/section-template.tsx` for a complete example demonstrating button, input, form, variables, and CSS variables.

---

## Adding a New Section

1. Create a TSX file in `src/components/site-builder/sections/` (or similar) following the rules above.
2. Add a schema entry in `src/data/section-schemas.ts` with all editable fields declared.
3. Register the schema in `SCHEMA_MAP` at the bottom of `section-schemas.ts`.
4. The section will appear in the Library and AI can reference it.
