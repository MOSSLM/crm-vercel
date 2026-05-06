import type { SectionField, SectionSchema, SiteSectionDef } from '@/types';

// ─── Shared field groups ──────────────────────────────────────────────────────

const colorSchemeField: SectionField = {
  type: 'color_scheme',
  id: '__color_scheme',
  label: 'Palette de couleurs',
  default: 'default',
};

const paddingField = (defaultVal = 80): SectionField => ({
  type: 'range',
  id: '__padding_y',
  label: 'Espacement vertical',
  min: 20,
  max: 240,
  step: 8,
  unit: 'px',
  default: defaultVal,
});

const alignmentField = (defaultVal = 'center'): SectionField => ({
  type: 'alignment',
  id: 'text_align',
  label: 'Alignement du texte',
  default: defaultVal,
});

// ─── Section Schemas ──────────────────────────────────────────────────────────

const heroSchema: SectionSchema = {
  name: 'Hero',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'badge', label: 'Badge / Étiquette', placeholder: 'Nouveau' },
    { type: 'text', id: 'heading', label: 'Titre principal', default: 'Votre titre accrocheur' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', default: 'Description de votre valeur ajoutée.' },
    { type: 'text', id: 'cta_primary', label: 'Bouton principal', default: 'Commencer' },
    { type: 'url', id: 'cta_primary_href', label: 'Lien bouton principal', default: '#contact' },
    { type: 'text', id: 'cta_secondary', label: 'Bouton secondaire', placeholder: 'En savoir plus' },
    { type: 'url', id: 'cta_secondary_href', label: 'Lien bouton secondaire' },
    { type: 'image_picker', id: 'background_image', label: 'Image de fond' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'layout',
      label: 'Disposition',
      options: [
        { label: 'Centré', value: 'centered' },
        { label: 'Image à droite', value: 'split-right' },
        { label: 'Image à gauche', value: 'split-left' },
      ],
      default: 'centered',
    },
    {
      type: 'select',
      id: 'height',
      label: 'Hauteur',
      options: [
        { label: 'Petite', value: 'small' },
        { label: 'Moyenne', value: 'medium' },
        { label: 'Grande', value: 'large' },
        { label: 'Plein écran', value: 'fullscreen' },
      ],
      default: 'large',
    },
    alignmentField('center'),
    { type: 'range', id: 'overlay_opacity', label: "Opacité de l'overlay", min: 0, max: 90, step: 5, unit: '%', default: 50 },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(96),
  ],
};

const navbarSchema: SectionSchema = {
  name: 'Navigation',
  settings: [
    { type: 'header', content: 'Comportement' },
    {
      type: 'select',
      id: 'position',
      label: 'Position',
      options: [
        { label: 'Sticky (suit le scroll)', value: 'sticky' },
        { label: 'Fixe (toujours visible)', value: 'fixed' },
        { label: 'Normal', value: 'relative' },
        { label: 'Absolue (par-dessus le contenu)', value: 'absolute' },
      ],
      default: 'sticky',
    },
    {
      type: 'select',
      id: 'background',
      label: 'Fond',
      options: [
        { label: 'Solide', value: 'solid' },
        { label: 'Transparent', value: 'transparent' },
        { label: 'Flouté (effet verre)', value: 'blur' },
      ],
      default: 'solid',
    },
    { type: 'checkbox', id: 'show_shadow', label: 'Ombre portée', default: true },
    { type: 'checkbox', id: 'hide_on_scroll_down', label: 'Masquer au scroll vers le bas', default: false },
    { type: 'header', content: 'Logo' },
    { type: 'text', id: 'logo_text', label: 'Texte du logo' },
    { type: 'image_picker', id: 'logo_image', label: 'Image du logo' },
    {
      type: 'select',
      id: 'logo_size',
      label: 'Taille du logo',
      options: [
        { label: 'Petit', value: 'sm' },
        { label: 'Moyen', value: 'md' },
        { label: 'Grand', value: 'lg' },
      ],
      default: 'md',
    },
    { type: 'header', content: 'Bouton CTA' },
    { type: 'checkbox', id: 'show_cta', label: 'Afficher le bouton CTA', default: true },
    { type: 'text', id: 'cta_text', label: 'Texte du bouton', default: 'Contact' },
    { type: 'url', id: 'cta_href', label: 'Lien du bouton', default: '#contact' },
    { type: 'header', content: 'Style' },
    colorSchemeField,
  ],
};

const servicesSchema: SectionSchema = {
  name: 'Services / Fonctionnalités',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Nos services' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'layout',
      label: 'Disposition',
      options: [
        { label: 'Grille 2 colonnes', value: 'grid-2' },
        { label: 'Grille 3 colonnes', value: 'grid-3' },
        { label: 'Grille 4 colonnes', value: 'grid-4' },
        { label: 'Liste', value: 'list' },
      ],
      default: 'grid-3',
    },
    {
      type: 'select',
      id: 'card_style',
      label: 'Style des cartes',
      options: [
        { label: 'Élevé (shadow)', value: 'elevated' },
        { label: 'Contour', value: 'bordered' },
        { label: 'Plat', value: 'flat' },
        { label: 'Fantôme', value: 'ghost' },
      ],
      default: 'elevated',
    },
    { type: 'checkbox', id: 'show_icons', label: 'Afficher les icônes', default: true },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [
    {
      type: 'service_item',
      name: 'Service',
      settings: [
        { type: 'text', id: 'icon', label: 'Icône (nom Lucide)', default: 'star' },
        { type: 'text', id: 'title', label: 'Titre', default: 'Mon service' },
        { type: 'textarea', id: 'description', label: 'Description' },
      ],
    },
  ],
};

const testimonialsSchema: SectionSchema = {
  name: 'Témoignages',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Ce que disent nos clients' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'layout',
      label: 'Disposition',
      options: [
        { label: 'Grille', value: 'grid' },
        { label: 'Carrousel', value: 'carousel' },
        { label: 'Masonry', value: 'masonry' },
      ],
      default: 'grid',
    },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 1, max: 4, step: 1, default: 3 },
    { type: 'checkbox', id: 'show_ratings', label: 'Afficher les étoiles', default: true },
    { type: 'checkbox', id: 'show_avatars', label: 'Afficher les avatars', default: true },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
};

const aboutSchema: SectionSchema = {
  name: 'À Propos',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Notre histoire' },
    { type: 'textarea', id: 'body', label: 'Texte', rows: 5 },
    { type: 'image_picker', id: 'image', label: 'Image' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'image_position',
      label: "Position de l'image",
      options: [
        { label: 'Image à gauche', value: 'left' },
        { label: 'Image à droite', value: 'right' },
        { label: 'Centré (au-dessus)', value: 'top' },
      ],
      default: 'right',
    },
    { type: 'checkbox', id: 'show_stats', label: 'Afficher les statistiques', default: true },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
};

const contactSchema: SectionSchema = {
  name: 'Contact',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Contactez-nous' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Formulaire' },
    {
      type: 'select',
      id: 'form_style',
      label: 'Style du formulaire',
      options: [
        { label: 'Carte', value: 'card' },
        { label: 'Inline', value: 'inline' },
        { label: 'Pleine largeur', value: 'full' },
      ],
      default: 'card',
    },
    { type: 'checkbox', id: 'show_map', label: 'Afficher la carte', default: false },
    { type: 'checkbox', id: 'show_phone', label: 'Afficher le téléphone', default: true },
    { type: 'checkbox', id: 'show_email', label: "Afficher l'email", default: true },
    { type: 'checkbox', id: 'show_address', label: "Afficher l'adresse", default: true },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
};

const ctaBannerSchema: SectionSchema = {
  name: 'Bannière CTA',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Prêt à commencer ?' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'text', id: 'cta_text', label: 'Bouton principal', default: 'Démarrer maintenant' },
    { type: 'url', id: 'cta_href', label: 'Lien bouton', default: '#contact' },
    { type: 'text', id: 'cta_secondary', label: 'Bouton secondaire (optionnel)' },
    { type: 'url', id: 'cta_secondary_href', label: 'Lien bouton secondaire' },
    { type: 'header', content: 'Mise en page' },
    alignmentField('center'),
    {
      type: 'select',
      id: 'button_style',
      label: 'Style du bouton',
      options: [
        { label: 'Plein', value: 'filled' },
        { label: 'Contour', value: 'outline' },
        { label: 'Doux', value: 'soft' },
      ],
      default: 'filled',
    },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
    { type: 'image_picker', id: 'background_image', label: 'Image de fond (optionnel)' },
  ],
};

const faqSchema: SectionSchema = {
  name: 'FAQ',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Questions fréquentes' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'style',
      label: 'Style',
      options: [
        { label: 'Accordéon', value: 'accordion' },
        { label: 'Liste', value: 'list' },
        { label: 'Grille 2 colonnes', value: 'grid' },
      ],
      default: 'accordion',
    },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [
    {
      type: 'faq_item',
      name: 'Question',
      settings: [
        { type: 'text', id: 'question', label: 'Question', default: 'Votre question ?' },
        { type: 'textarea', id: 'answer', label: 'Réponse' },
      ],
    },
  ],
};

const statsSchema: SectionSchema = {
  name: 'Statistiques / Chiffres clés',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'layout',
      label: 'Disposition',
      options: [
        { label: 'Ligne horizontale', value: 'row' },
        { label: 'Grille', value: 'grid' },
      ],
      default: 'row',
    },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 5, step: 1, default: 4 },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [
    {
      type: 'stat_item',
      name: 'Statistique',
      settings: [
        { type: 'text', id: 'value', label: 'Valeur', default: '99%' },
        { type: 'text', id: 'label', label: 'Étiquette', default: 'Satisfaction' },
        { type: 'text', id: 'description', label: 'Description courte' },
      ],
    },
  ],
};

const gallerySchema: SectionSchema = {
  name: 'Galerie',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Notre galerie' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'layout',
      label: 'Style de galerie',
      options: [
        { label: 'Grille uniforme', value: 'grid' },
        { label: 'Masonry', value: 'masonry' },
        { label: 'Carrousel', value: 'carousel' },
      ],
      default: 'grid',
    },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 5, step: 1, default: 3 },
    { type: 'range', id: 'gap', label: 'Espacement entre images', min: 0, max: 32, step: 4, unit: 'px', default: 8 },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
};

const teamSchema: SectionSchema = {
  name: 'Équipe',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Notre équipe' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Mise en page' },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 5, step: 1, default: 4 },
    { type: 'checkbox', id: 'show_social', label: 'Afficher les liens sociaux', default: true },
    { type: 'checkbox', id: 'show_role', label: 'Afficher le rôle', default: true },
    {
      type: 'select',
      id: 'card_style',
      label: 'Style',
      options: [
        { label: 'Carte', value: 'card' },
        { label: 'Minimal', value: 'minimal' },
        { label: 'Cercle', value: 'circle' },
      ],
      default: 'card',
    },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [
    {
      type: 'team_member',
      name: 'Membre',
      settings: [
        { type: 'image_picker', id: 'photo', label: 'Photo' },
        { type: 'text', id: 'name', label: 'Nom', default: 'Jean Dupont' },
        { type: 'text', id: 'role', label: 'Rôle', default: 'Directeur' },
        { type: 'textarea', id: 'bio', label: 'Bio courte' },
        { type: 'url', id: 'linkedin', label: 'LinkedIn URL' },
      ],
    },
  ],
};

const logosSchema: SectionSchema = {
  name: 'Logos Partenaires',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', placeholder: 'Ils nous font confiance' },
    { type: 'header', content: 'Mise en page' },
    { type: 'range', id: 'columns', label: 'Logos par ligne', min: 3, max: 8, step: 1, default: 5 },
    { type: 'checkbox', id: 'autoplay', label: 'Défilement automatique', default: false },
    { type: 'range', id: 'logo_height', label: 'Hauteur des logos', min: 24, max: 80, step: 4, unit: 'px', default: 40 },
    { type: 'checkbox', id: 'grayscale', label: 'Logos en niveaux de gris', default: true },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(60),
  ],
  blocks: [
    {
      type: 'logo_item',
      name: 'Logo',
      settings: [
        { type: 'image_picker', id: 'logo', label: 'Logo' },
        { type: 'text', id: 'name', label: 'Nom (alt text)' },
        { type: 'url', id: 'href', label: 'Lien (optionnel)' },
      ],
    },
  ],
};

const blogSchema: SectionSchema = {
  name: 'Blog / Articles',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Derniers articles' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre' },
    { type: 'header', content: 'Mise en page' },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 4, step: 1, default: 3 },
    { type: 'range', id: 'posts_count', label: "Nombre d'articles", min: 3, max: 12, step: 3, default: 6 },
    { type: 'checkbox', id: 'show_excerpt', label: "Afficher l'extrait", default: true },
    { type: 'checkbox', id: 'show_author', label: "Afficher l'auteur", default: true },
    { type: 'checkbox', id: 'show_date', label: 'Afficher la date', default: true },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(80),
  ],
};

const footerSchema: SectionSchema = {
  name: 'Pied de page',
  settings: [
    { type: 'header', content: 'Contenu' },
    { type: 'text', id: 'tagline', label: 'Slogan', placeholder: 'Votre partenaire de confiance' },
    { type: 'image_picker', id: 'logo', label: 'Logo' },
    { type: 'header', content: 'Réseaux sociaux' },
    { type: 'checkbox', id: 'show_social', label: 'Afficher les réseaux sociaux', default: true },
    { type: 'url', id: 'facebook', label: 'Facebook URL' },
    { type: 'url', id: 'instagram', label: 'Instagram URL' },
    { type: 'url', id: 'linkedin', label: 'LinkedIn URL' },
    { type: 'url', id: 'twitter', label: 'Twitter / X URL' },
    { type: 'header', content: 'Mentions légales' },
    { type: 'checkbox', id: 'show_legal', label: 'Afficher les mentions légales', default: true },
    { type: 'text', id: 'copyright', label: 'Copyright', placeholder: '© 2025 Mon Entreprise' },
    { type: 'header', content: 'Mise en page' },
    {
      type: 'select',
      id: 'columns_layout',
      label: 'Colonnes',
      options: [
        { label: '2 colonnes', value: '2col' },
        { label: '3 colonnes', value: '3col' },
        { label: '4 colonnes', value: '4col' },
      ],
      default: '3col',
    },
    { type: 'header', content: 'Style' },
    colorSchemeField,
    paddingField(60),
  ],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const SECTION_SCHEMAS: Record<string, SectionSchema> = {
  // Hero variants
  'hero': heroSchema,
  'hero-centered': heroSchema,
  'hero-split': { ...heroSchema, name: 'Hero Divisé' },

  // Navigation
  'navbar': navbarSchema,
  'header': navbarSchema,

  // Content sections
  'services': servicesSchema,
  'services-grid': servicesSchema,
  'features': { ...servicesSchema, name: 'Fonctionnalités' },

  // Social proof
  'testimonials': testimonialsSchema,

  // About
  'about': aboutSchema,
  'about-split': aboutSchema,

  // Contact
  'contact': contactSchema,

  // CTA
  'cta-banner': ctaBannerSchema,
  'cta': ctaBannerSchema,

  // FAQ
  'faq': faqSchema,

  // Stats
  'stats': statsSchema,
  'stat-row': statsSchema,

  // Gallery
  'gallery': gallerySchema,
  'image-grid': gallerySchema,

  // Team
  'team': teamSchema,

  // Logos
  'logos': logosSchema,
  'logo-row': logosSchema,

  // Blog
  'blog': blogSchema,

  // Footer
  'footer': footerSchema,
};

/**
 * Returns the schema for a section — checks inline schema first, then registry.
 */
export function getSchemaForSection(sectionDef: SiteSectionDef): SectionSchema | null {
  if (sectionDef.schema) return sectionDef.schema;
  return SECTION_SCHEMAS[sectionDef.type] ?? null;
}

/**
 * Returns the default values from a schema as a content record.
 */
export function getSchemaDefaults(schema: SectionSchema): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of schema.settings) {
    if (field.type === 'header' || field.type === 'paragraph') continue;
    if ('id' in field && field.default !== undefined) {
      defaults[field.id] = field.default;
    }
  }
  return defaults;
}
