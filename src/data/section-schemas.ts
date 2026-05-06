import type { SectionField, SectionSchema, SiteSectionDef, SectionBlockSchema, SectionPreset } from '@/types';

// ─── Shared field helpers ─────────────────────────────────────────────────────

const colorSchemeField: SectionField = {
  type: 'color_scheme',
  id: '__color_scheme',
  label: 'Palette de couleurs',
  default: 'default',
  group: 'style',
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
  group: 'style',
});

const alignmentField = (defaultVal = 'center'): SectionField => ({
  type: 'alignment',
  id: 'text_align',
  label: 'Alignement du texte',
  default: defaultVal,
  group: 'layout',
});

// ─── 1. HERO ──────────────────────────────────────────────────────────────────

const heroSchema: SectionSchema = {
  name: 'Hero',
  description: 'Bannière principale en haut d\'une page : titre, sous-titre, CTA, image de fond.',
  category: 'hero',
  icon: 'sparkles',
  limits: { instances_per_page: 1 },
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'badge', label: 'Badge / Étiquette', placeholder: 'Nouveau', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre principal', default: 'Votre titre accrocheur', required: true, group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', default: 'Description de votre valeur ajoutée.', rows: 3, group: 'content' },
    { type: 'text', id: 'cta_primary', label: 'Bouton principal', default: 'Commencer', group: 'content' },
    { type: 'page_link', id: 'cta_primary_href', label: 'Lien bouton principal', default: '#contact', allowExternal: true, group: 'content', visible_if: { field: 'cta_primary', truthy: true } },
    { type: 'text', id: 'cta_secondary', label: 'Bouton secondaire', placeholder: 'En savoir plus', group: 'content' },
    { type: 'page_link', id: 'cta_secondary_href', label: 'Lien bouton secondaire', allowExternal: true, group: 'content', visible_if: { field: 'cta_secondary', truthy: true } },
    { type: 'image_picker', id: 'background_image', label: 'Image de fond', group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'layout', label: 'Disposition',
      options: [
        { label: 'Centré', value: 'centered' },
        { label: 'Image à droite', value: 'split-right' },
        { label: 'Image à gauche', value: 'split-left' },
      ],
      default: 'centered', group: 'layout',
    },
    {
      type: 'select', id: 'height', label: 'Hauteur',
      options: [
        { label: 'Petite', value: 'small' },
        { label: 'Moyenne', value: 'medium' },
        { label: 'Grande', value: 'large' },
        { label: 'Plein écran', value: 'fullscreen' },
      ],
      default: 'large', group: 'layout',
    },
    alignmentField('center'),
    {
      type: 'range', id: 'overlay_opacity', label: "Opacité de l'overlay",
      min: 0, max: 90, step: 5, unit: '%', default: 50, group: 'layout',
      visible_if: { field: 'background_image', truthy: true },
    },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(96),
  ],
  presets: [
    {
      name: 'Centré simple',
      description: 'Titre + sous-titre + 1 CTA, sans image.',
      settings: { layout: 'centered', height: 'medium', text_align: 'center', cta_secondary: '' },
    },
    {
      name: 'Split avec image',
      description: 'Texte à gauche, image à droite.',
      settings: { layout: 'split-right', height: 'large', text_align: 'left' },
    },
    {
      name: 'Pleine hauteur dramatique',
      description: 'Image plein écran avec overlay sombre.',
      settings: { layout: 'centered', height: 'fullscreen', overlay_opacity: 60, __color_scheme: 'dark' },
    },
  ],
};

// ─── 2. NAVBAR ────────────────────────────────────────────────────────────────

const navbarLinkBlock: SectionBlockSchema = {
  type: 'nav_link',
  name: 'Lien de navigation',
  icon: 'link',
  limit: 8,
  settings: [
    { type: 'text', id: 'label', label: 'Libellé', default: 'Accueil', required: true, group: 'content' },
    { type: 'page_link', id: 'href', label: 'Lien', default: '/', allowExternal: true, group: 'content' },
  ],
};

const navbarSchema: SectionSchema = {
  name: 'Navigation',
  description: 'Barre de navigation principale du site avec logo et liens.',
  category: 'navigation',
  icon: 'menu',
  tag: 'header',
  limits: { instances_per_page: 1 },
  max_blocks: 8,
  settings: [
    { type: 'header', content: 'Comportement', group: 'layout' },
    {
      type: 'select', id: 'position', label: 'Position',
      options: [
        { label: 'Sticky (suit le scroll)', value: 'sticky' },
        { label: 'Fixe (toujours visible)', value: 'fixed' },
        { label: 'Normal', value: 'relative' },
        { label: 'Absolue (par-dessus le contenu)', value: 'absolute' },
      ],
      default: 'sticky', group: 'layout',
    },
    {
      type: 'select', id: 'background', label: 'Fond',
      options: [
        { label: 'Solide', value: 'solid' },
        { label: 'Transparent', value: 'transparent' },
        { label: 'Flouté (effet verre)', value: 'blur' },
      ],
      default: 'solid', group: 'layout',
    },
    { type: 'checkbox', id: 'show_shadow', label: 'Ombre portée', default: true, group: 'layout' },
    { type: 'checkbox', id: 'hide_on_scroll_down', label: 'Masquer au scroll vers le bas', default: false, group: 'layout' },

    { type: 'header', content: 'Logo', group: 'content' },
    { type: 'text', id: 'logo_text', label: 'Texte du logo', group: 'content' },
    { type: 'image_picker', id: 'logo_image', label: 'Image du logo', group: 'content' },
    {
      type: 'select', id: 'logo_size', label: 'Taille du logo',
      options: [
        { label: 'Petit', value: 'sm' },
        { label: 'Moyen', value: 'md' },
        { label: 'Grand', value: 'lg' },
      ],
      default: 'md', group: 'layout',
      visible_if: { field: 'logo_image', truthy: true },
    },

    { type: 'header', content: 'Bouton CTA', group: 'content' },
    { type: 'checkbox', id: 'show_cta', label: 'Afficher le bouton CTA', default: true, group: 'content' },
    { type: 'text', id: 'cta_text', label: 'Texte du bouton', default: 'Contact', group: 'content', visible_if: { field: 'show_cta', equals: true } },
    { type: 'page_link', id: 'cta_href', label: 'Lien du bouton', default: '#contact', allowExternal: true, group: 'content', visible_if: { field: 'show_cta', equals: true } },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
  ],
  blocks: [navbarLinkBlock],
  presets: [
    {
      name: 'Standard',
      description: 'Navbar sticky avec logo, 4 liens et CTA.',
      settings: { position: 'sticky', background: 'solid', show_cta: true },
      blocks: [
        { type: 'nav_link', settings: { label: 'Accueil', href: '/' } },
        { type: 'nav_link', settings: { label: 'Services', href: '#services' } },
        { type: 'nav_link', settings: { label: 'À propos', href: '#about' } },
        { type: 'nav_link', settings: { label: 'Contact', href: '#contact' } },
      ],
    },
    {
      name: 'Transparente',
      description: 'Pour superposer la navbar à un hero plein écran.',
      settings: { position: 'absolute', background: 'transparent', show_shadow: false, __color_scheme: 'inverted' },
    },
  ],
};

// ─── 3. SERVICES ──────────────────────────────────────────────────────────────

const serviceItemBlock: SectionBlockSchema = {
  type: 'service_item',
  name: 'Service',
  icon: 'briefcase',
  limit: 12,
  settings: [
    { type: 'icon_picker', id: 'icon', label: 'Icône', default: 'star', group: 'content' },
    { type: 'text', id: 'title', label: 'Titre', default: 'Mon service', required: true, group: 'content' },
    { type: 'textarea', id: 'description', label: 'Description', rows: 3, group: 'content' },
    { type: 'page_link', id: 'href', label: 'Lien (optionnel)', allowExternal: true, group: 'content' },
  ],
};

const servicesSchema: SectionSchema = {
  name: 'Services / Fonctionnalités',
  description: 'Grille de services, prestations ou fonctionnalités avec icônes.',
  category: 'content',
  icon: 'layout-grid',
  max_blocks: 12,
  min_blocks: 1,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Nos services', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'layout', label: 'Disposition',
      options: [
        { label: 'Grille 2 colonnes', value: 'grid-2' },
        { label: 'Grille 3 colonnes', value: 'grid-3' },
        { label: 'Grille 4 colonnes', value: 'grid-4' },
        { label: 'Liste', value: 'list' },
      ],
      default: 'grid-3', group: 'layout',
    },
    {
      type: 'select', id: 'card_style', label: 'Style des cartes',
      options: [
        { label: 'Élevé (shadow)', value: 'elevated' },
        { label: 'Contour', value: 'bordered' },
        { label: 'Plat', value: 'flat' },
        { label: 'Fantôme', value: 'ghost' },
      ],
      default: 'elevated', group: 'layout',
    },
    { type: 'checkbox', id: 'show_icons', label: 'Afficher les icônes', default: true, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [serviceItemBlock],
  presets: [
    {
      name: 'Grille 3 cartes élevées',
      settings: { layout: 'grid-3', card_style: 'elevated', show_icons: true, heading: 'Nos services' },
      blocks: [
        { type: 'service_item', settings: { icon: 'zap', title: 'Rapidité', description: 'Intervention sous 24h.' } },
        { type: 'service_item', settings: { icon: 'shield-check', title: 'Garantie', description: 'Tous nos travaux sont garantis.' } },
        { type: 'service_item', settings: { icon: 'heart', title: 'Service client', description: 'Une équipe à votre écoute 7j/7.' } },
      ],
    },
    {
      name: 'Liste minimaliste',
      settings: { layout: 'list', card_style: 'flat', show_icons: true },
    },
  ],
};

// ─── 4. TESTIMONIALS ──────────────────────────────────────────────────────────

const testimonialBlock: SectionBlockSchema = {
  type: 'testimonial_item',
  name: 'Témoignage',
  icon: 'quote',
  limit: 24,
  settings: [
    { type: 'textarea', id: 'quote', label: 'Citation', rows: 4, required: true, group: 'content' },
    { type: 'text', id: 'author', label: 'Auteur', default: 'Jean Dupont', required: true, group: 'content' },
    { type: 'text', id: 'role', label: 'Rôle / Entreprise', placeholder: 'CEO, Acme Inc.', group: 'content' },
    { type: 'image_picker', id: 'avatar', label: 'Avatar', group: 'content' },
    { type: 'range', id: 'rating', label: 'Note (étoiles)', min: 0, max: 5, step: 1, default: 5, group: 'content' },
  ],
};

const testimonialsSchema: SectionSchema = {
  name: 'Témoignages',
  description: 'Avis clients : configurés manuellement ou tirés dynamiquement (Google Reviews).',
  category: 'social-proof',
  icon: 'message-square-quote',
  max_blocks: 24,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Ce que disent nos clients', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },
    { type: 'review_source', id: 'source', label: 'Source des avis', default: 'config', group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'layout', label: 'Disposition',
      options: [
        { label: 'Grille', value: 'grid' },
        { label: 'Carrousel', value: 'carousel' },
        { label: 'Masonry', value: 'masonry' },
      ],
      default: 'grid', group: 'layout',
    },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 1, max: 4, step: 1, default: 3, group: 'layout' },
    { type: 'checkbox', id: 'show_ratings', label: 'Afficher les étoiles', default: true, group: 'layout' },
    { type: 'checkbox', id: 'show_avatars', label: 'Afficher les avatars', default: true, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [testimonialBlock],
  presets: [
    {
      name: 'Grille 3 témoignages',
      settings: { layout: 'grid', columns: 3, source: 'config' },
      blocks: [
        { type: 'testimonial_item', settings: { quote: 'Service exceptionnel, je recommande !', author: 'Marie L.', role: 'Cliente', rating: 5 } },
        { type: 'testimonial_item', settings: { quote: 'Travail rapide et soigné.', author: 'Pierre M.', role: 'Client', rating: 5 } },
        { type: 'testimonial_item', settings: { quote: 'Très professionnels, intervention parfaite.', author: 'Sophie B.', role: 'Cliente', rating: 5 } },
      ],
    },
    {
      name: 'Avis Google dynamiques',
      description: 'Tire les avis depuis la fiche Google de l\'entreprise.',
      settings: { layout: 'carousel', columns: 3, source: 'google', show_ratings: true, show_avatars: true },
    },
  ],
};

// ─── 5. ABOUT ─────────────────────────────────────────────────────────────────

const aboutFeatureBlock: SectionBlockSchema = {
  type: 'feature_item',
  name: 'Point clé',
  icon: 'check',
  limit: 6,
  settings: [
    { type: 'icon_picker', id: 'icon', label: 'Icône', default: 'check', group: 'content' },
    { type: 'text', id: 'title', label: 'Titre', default: 'Point clé', required: true, group: 'content' },
    { type: 'textarea', id: 'description', label: 'Description', rows: 2, group: 'content' },
  ],
};

const aboutSchema: SectionSchema = {
  name: 'À Propos',
  description: 'Présentation de l\'entreprise avec image, texte et points clés.',
  category: 'content',
  icon: 'info',
  max_blocks: 6,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Notre histoire', group: 'content' },
    { type: 'textarea', id: 'body', label: 'Texte', rows: 5, group: 'content' },
    { type: 'image_picker', id: 'image', label: 'Image', group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'image_position', label: "Position de l'image",
      options: [
        { label: 'Image à gauche', value: 'left' },
        { label: 'Image à droite', value: 'right' },
        { label: 'Centré (au-dessus)', value: 'top' },
      ],
      default: 'right', group: 'layout',
      visible_if: { field: 'image', truthy: true },
    },
    { type: 'checkbox', id: 'show_features', label: 'Afficher les points clés', default: true, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [aboutFeatureBlock],
  presets: [
    {
      name: 'Image à droite + 3 points clés',
      settings: { image_position: 'right', show_features: true, heading: 'Notre histoire' },
      blocks: [
        { type: 'feature_item', settings: { icon: 'award', title: 'Expertise reconnue', description: 'Plus de 10 ans d\'expérience.' } },
        { type: 'feature_item', settings: { icon: 'users', title: 'Équipe dédiée', description: 'Des professionnels passionnés.' } },
        { type: 'feature_item', settings: { icon: 'shield-check', title: 'Qualité garantie', description: 'Satisfaction client avant tout.' } },
      ],
    },
    {
      name: 'Texte seul centré',
      settings: { image_position: 'top', show_features: false },
    },
  ],
};

// ─── 6. CONTACT ───────────────────────────────────────────────────────────────

const contactSchema: SectionSchema = {
  name: 'Contact',
  description: 'Coordonnées de l\'entreprise + formulaire + carte. Bind automatique vers l\'entreprise.',
  category: 'contact',
  icon: 'mail',
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Contactez-nous', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },
    {
      type: 'enterprise_field', id: 'phone_source', label: 'Téléphone (depuis l\'entreprise)',
      default: 'telephone', allow: ['telephone'], group: 'content',
    },
    {
      type: 'enterprise_field', id: 'email_source', label: 'Email (depuis l\'entreprise)',
      default: 'email', allow: ['email'], group: 'content',
    },
    {
      type: 'enterprise_field', id: 'address_source', label: 'Adresse (depuis l\'entreprise)',
      default: 'adresse', allow: ['adresse'], group: 'content',
    },

    { type: 'header', content: 'Formulaire', group: 'layout' },
    { type: 'checkbox', id: 'show_form', label: 'Afficher le formulaire', default: true, group: 'layout' },
    {
      type: 'select', id: 'form_style', label: 'Style du formulaire',
      options: [
        { label: 'Carte', value: 'card' },
        { label: 'Inline', value: 'inline' },
        { label: 'Pleine largeur', value: 'full' },
      ],
      default: 'card', group: 'layout',
      visible_if: { field: 'show_form', equals: true },
    },
    { type: 'text', id: 'submit_label', label: 'Texte du bouton', default: 'Envoyer', group: 'content', visible_if: { field: 'show_form', equals: true } },

    { type: 'header', content: 'Affichage', group: 'layout' },
    { type: 'checkbox', id: 'show_map', label: 'Afficher la carte', default: false, group: 'layout' },
    { type: 'checkbox', id: 'show_phone', label: 'Afficher le téléphone', default: true, group: 'layout' },
    { type: 'checkbox', id: 'show_email', label: "Afficher l'email", default: true, group: 'layout' },
    { type: 'checkbox', id: 'show_address', label: "Afficher l'adresse", default: true, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  presets: [
    {
      name: 'Coordonnées + formulaire',
      settings: { show_form: true, form_style: 'card', show_map: false, show_phone: true, show_email: true, show_address: true },
    },
    {
      name: 'Coordonnées + carte',
      settings: { show_form: false, show_map: true, show_phone: true, show_email: true, show_address: true },
    },
    {
      name: 'Tout activé',
      settings: { show_form: true, form_style: 'card', show_map: true, show_phone: true, show_email: true, show_address: true },
    },
  ],
};

// ─── 7. CTA BANNER ────────────────────────────────────────────────────────────

const ctaBannerSchema: SectionSchema = {
  name: 'Bannière CTA',
  description: 'Bannière d\'appel à l\'action pleine largeur avec 1 ou 2 boutons.',
  category: 'cta',
  icon: 'megaphone',
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Prêt à commencer ?', required: true, group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },
    { type: 'text', id: 'cta_text', label: 'Bouton principal', default: 'Démarrer maintenant', group: 'content' },
    { type: 'page_link', id: 'cta_href', label: 'Lien bouton', default: '#contact', allowExternal: true, group: 'content', visible_if: { field: 'cta_text', truthy: true } },
    { type: 'text', id: 'cta_secondary', label: 'Bouton secondaire (optionnel)', group: 'content' },
    { type: 'page_link', id: 'cta_secondary_href', label: 'Lien bouton secondaire', allowExternal: true, group: 'content', visible_if: { field: 'cta_secondary', truthy: true } },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    alignmentField('center'),
    {
      type: 'select', id: 'button_style', label: 'Style du bouton',
      options: [
        { label: 'Plein', value: 'filled' },
        { label: 'Contour', value: 'outline' },
        { label: 'Doux', value: 'soft' },
      ],
      default: 'filled', group: 'layout',
    },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
    { type: 'image_picker', id: 'background_image', label: 'Image de fond (optionnel)', group: 'style' },
  ],
  presets: [
    {
      name: 'CTA simple primaire',
      settings: { button_style: 'filled', text_align: 'center', __color_scheme: 'primary' },
    },
    {
      name: 'CTA avec image de fond',
      settings: { button_style: 'filled', text_align: 'center', __color_scheme: 'dark' },
    },
    {
      name: 'CTA double action',
      settings: { button_style: 'outline', text_align: 'center', cta_secondary: 'En savoir plus' },
    },
  ],
};

// ─── 8. FAQ ───────────────────────────────────────────────────────────────────

const faqItemBlock: SectionBlockSchema = {
  type: 'faq_item',
  name: 'Question',
  icon: 'help-circle',
  limit: 30,
  settings: [
    { type: 'text', id: 'question', label: 'Question', default: 'Votre question ?', required: true, group: 'content' },
    { type: 'textarea', id: 'answer', label: 'Réponse', rows: 4, required: true, group: 'content' },
  ],
};

const faqSchema: SectionSchema = {
  name: 'FAQ',
  description: 'Foire aux questions en accordéon, liste ou grille.',
  category: 'content',
  icon: 'help-circle',
  max_blocks: 30,
  min_blocks: 1,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Questions fréquentes', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'style', label: 'Style',
      options: [
        { label: 'Accordéon', value: 'accordion' },
        { label: 'Liste', value: 'list' },
        { label: 'Grille 2 colonnes', value: 'grid' },
      ],
      default: 'accordion', group: 'layout',
    },
    { type: 'checkbox', id: 'open_first', label: 'Ouvrir la 1ère question par défaut', default: true, group: 'layout', visible_if: { field: 'style', equals: 'accordion' } },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [faqItemBlock],
  presets: [
    {
      name: 'FAQ accordéon (3 questions)',
      settings: { style: 'accordion', open_first: true },
      blocks: [
        { type: 'faq_item', settings: { question: 'Combien coûte une intervention ?', answer: 'Le prix dépend de la nature des travaux. Demandez un devis gratuit.' } },
        { type: 'faq_item', settings: { question: 'Quels sont vos délais ?', answer: 'Nous intervenons généralement sous 24 à 48h.' } },
        { type: 'faq_item', settings: { question: 'Êtes-vous assurés ?', answer: 'Oui, tous nos travaux sont couverts par une assurance décennale.' } },
      ],
    },
    {
      name: 'Grille 2 colonnes',
      settings: { style: 'grid' },
    },
  ],
};

// ─── 9. STATS ─────────────────────────────────────────────────────────────────

const statItemBlock: SectionBlockSchema = {
  type: 'stat_item',
  name: 'Statistique',
  icon: 'trending-up',
  limit: 8,
  settings: [
    { type: 'text', id: 'value', label: 'Valeur', default: '99%', required: true, group: 'content' },
    { type: 'text', id: 'label', label: 'Étiquette', default: 'Satisfaction', required: true, group: 'content' },
    { type: 'text', id: 'description', label: 'Description courte', group: 'content' },
    { type: 'icon_picker', id: 'icon', label: 'Icône (optionnel)', group: 'content' },
  ],
};

const statsSchema: SectionSchema = {
  name: 'Statistiques / Chiffres clés',
  description: 'Bandeau de chiffres clés pour mettre en avant l\'expertise.',
  category: 'social-proof',
  icon: 'bar-chart-3',
  max_blocks: 8,
  min_blocks: 2,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'layout', label: 'Disposition',
      options: [
        { label: 'Ligne horizontale', value: 'row' },
        { label: 'Grille', value: 'grid' },
      ],
      default: 'row', group: 'layout',
    },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 5, step: 1, default: 4, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [statItemBlock],
  presets: [
    {
      name: 'Bandeau 4 stats',
      settings: { layout: 'row', columns: 4 },
      blocks: [
        { type: 'stat_item', settings: { value: '500+', label: 'Clients satisfaits' } },
        { type: 'stat_item', settings: { value: '10', label: 'Années d\'expérience' } },
        { type: 'stat_item', settings: { value: '4.9/5', label: 'Note moyenne' } },
        { type: 'stat_item', settings: { value: '24h', label: 'Délai d\'intervention' } },
      ],
    },
  ],
};

// ─── 10. GALLERY ──────────────────────────────────────────────────────────────

const galleryItemBlock: SectionBlockSchema = {
  type: 'gallery_item',
  name: 'Image',
  icon: 'image',
  limit: 30,
  settings: [
    { type: 'image_picker', id: 'src', label: 'Image', required: true, group: 'content' },
    { type: 'text', id: 'alt', label: 'Texte alternatif (accessibilité)', group: 'content' },
    { type: 'text', id: 'caption', label: 'Légende (optionnel)', group: 'content' },
  ],
};

const gallerySchema: SectionSchema = {
  name: 'Galerie',
  description: 'Galerie d\'images : grille, masonry ou carrousel.',
  category: 'media',
  icon: 'image',
  max_blocks: 30,
  min_blocks: 1,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Notre galerie', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'layout', label: 'Style de galerie',
      options: [
        { label: 'Grille uniforme', value: 'grid' },
        { label: 'Masonry', value: 'masonry' },
        { label: 'Carrousel', value: 'carousel' },
      ],
      default: 'grid', group: 'layout',
    },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 5, step: 1, default: 3, group: 'layout' },
    { type: 'range', id: 'gap', label: 'Espacement entre images', min: 0, max: 32, step: 4, unit: 'px', default: 8, group: 'layout' },
    { type: 'checkbox', id: 'lightbox', label: 'Activer le zoom (lightbox)', default: true, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [galleryItemBlock],
  presets: [
    {
      name: 'Grille 3 colonnes',
      settings: { layout: 'grid', columns: 3, gap: 8, lightbox: true },
    },
    {
      name: 'Masonry artistique',
      settings: { layout: 'masonry', columns: 3, gap: 16, lightbox: true },
    },
  ],
};

// ─── 11. TEAM ─────────────────────────────────────────────────────────────────

const teamMemberBlock: SectionBlockSchema = {
  type: 'team_member',
  name: 'Membre',
  icon: 'user',
  limit: 20,
  settings: [
    { type: 'image_picker', id: 'photo', label: 'Photo', group: 'content' },
    { type: 'text', id: 'name', label: 'Nom', default: 'Jean Dupont', required: true, group: 'content' },
    { type: 'text', id: 'role', label: 'Rôle', default: 'Directeur', group: 'content' },
    { type: 'textarea', id: 'bio', label: 'Bio courte', rows: 3, group: 'content' },
    { type: 'url', id: 'linkedin', label: 'LinkedIn URL', group: 'content' },
    { type: 'url', id: 'twitter', label: 'Twitter URL', group: 'content' },
  ],
};

const teamSchema: SectionSchema = {
  name: 'Équipe',
  description: 'Présentation des membres de l\'équipe.',
  category: 'content',
  icon: 'users',
  max_blocks: 20,
  min_blocks: 1,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Notre équipe', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 5, step: 1, default: 4, group: 'layout' },
    { type: 'checkbox', id: 'show_social', label: 'Afficher les liens sociaux', default: true, group: 'layout' },
    { type: 'checkbox', id: 'show_role', label: 'Afficher le rôle', default: true, group: 'layout' },
    {
      type: 'select', id: 'card_style', label: 'Style',
      options: [
        { label: 'Carte', value: 'card' },
        { label: 'Minimal', value: 'minimal' },
        { label: 'Cercle', value: 'circle' },
      ],
      default: 'card', group: 'layout',
    },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  blocks: [teamMemberBlock],
  presets: [
    {
      name: 'Grille 4 membres en carte',
      settings: { columns: 4, card_style: 'card', show_social: true, show_role: true },
    },
    {
      name: 'Cercles minimaliste',
      settings: { columns: 4, card_style: 'circle', show_social: false, show_role: true },
    },
  ],
};

// ─── 12. LOGOS ────────────────────────────────────────────────────────────────

const logoItemBlock: SectionBlockSchema = {
  type: 'logo_item',
  name: 'Logo',
  icon: 'building-2',
  limit: 24,
  settings: [
    { type: 'image_picker', id: 'logo', label: 'Logo', required: true, group: 'content' },
    { type: 'text', id: 'name', label: 'Nom (alt text)', group: 'content' },
    { type: 'url', id: 'href', label: 'Lien (optionnel)', group: 'content' },
  ],
};

const logosSchema: SectionSchema = {
  name: 'Logos Partenaires',
  description: 'Bandeau de logos clients/partenaires en grille ou défilement.',
  category: 'social-proof',
  icon: 'building-2',
  max_blocks: 24,
  min_blocks: 3,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', placeholder: 'Ils nous font confiance', group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    { type: 'range', id: 'columns', label: 'Logos par ligne', min: 3, max: 8, step: 1, default: 5, group: 'layout' },
    { type: 'checkbox', id: 'autoplay', label: 'Défilement automatique', default: false, group: 'layout' },
    { type: 'range', id: 'logo_height', label: 'Hauteur des logos', min: 24, max: 80, step: 4, unit: 'px', default: 40, group: 'layout' },
    { type: 'checkbox', id: 'grayscale', label: 'Logos en niveaux de gris', default: true, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(60),
  ],
  blocks: [logoItemBlock],
  presets: [
    {
      name: 'Bandeau 5 logos statique',
      settings: { columns: 5, autoplay: false, grayscale: true },
    },
    {
      name: 'Carrousel automatique',
      settings: { columns: 6, autoplay: true, grayscale: false },
    },
  ],
};

// ─── 13. BLOG ─────────────────────────────────────────────────────────────────

const blogSchema: SectionSchema = {
  name: 'Blog / Articles',
  description: 'Liste des derniers articles du blog (source dynamique).',
  category: 'content',
  icon: 'newspaper',
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'heading', label: 'Titre', default: 'Derniers articles', group: 'content' },
    { type: 'textarea', id: 'subheading', label: 'Sous-titre', rows: 2, group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    { type: 'range', id: 'columns', label: 'Colonnes', min: 2, max: 4, step: 1, default: 3, group: 'layout' },
    { type: 'range', id: 'posts_count', label: "Nombre d'articles", min: 3, max: 12, step: 3, default: 6, group: 'layout' },
    { type: 'checkbox', id: 'show_excerpt', label: "Afficher l'extrait", default: true, group: 'layout' },
    { type: 'checkbox', id: 'show_author', label: "Afficher l'auteur", default: true, group: 'layout' },
    { type: 'checkbox', id: 'show_date', label: 'Afficher la date', default: true, group: 'layout' },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(80),
  ],
  presets: [
    {
      name: '3 derniers articles',
      settings: { columns: 3, posts_count: 3, show_excerpt: true, show_author: true, show_date: true },
    },
    {
      name: 'Grille 6 articles compacte',
      settings: { columns: 3, posts_count: 6, show_excerpt: false, show_author: false, show_date: true },
    },
  ],
};

// ─── 14. FOOTER ───────────────────────────────────────────────────────────────

const footerColumnBlock: SectionBlockSchema = {
  type: 'footer_column',
  name: 'Colonne de liens',
  icon: 'list',
  limit: 5,
  settings: [
    { type: 'text', id: 'title', label: 'Titre de la colonne', default: 'Liens', required: true, group: 'content' },
    { type: 'textarea', id: 'links', label: 'Liens (un par ligne, format: Libellé | URL)', rows: 5, group: 'content',
      info: 'Exemple : "Accueil | /" — un lien par ligne.' },
  ],
};

const footerSchema: SectionSchema = {
  name: 'Pied de page',
  description: 'Pied de page : logo, slogan, colonnes de liens, mentions légales, réseaux sociaux.',
  category: 'footer',
  icon: 'layout-bottom-line',
  tag: 'footer',
  limits: { instances_per_page: 1 },
  max_blocks: 5,
  settings: [
    { type: 'header', content: 'Contenu', group: 'content' },
    { type: 'text', id: 'tagline', label: 'Slogan', placeholder: 'Votre partenaire de confiance', group: 'content' },
    { type: 'image_picker', id: 'logo', label: 'Logo', group: 'content' },

    { type: 'header', content: 'Réseaux sociaux', group: 'content' },
    { type: 'checkbox', id: 'show_social', label: 'Afficher les réseaux sociaux', default: true, group: 'content' },
    {
      type: 'social_links', id: 'social', label: 'Liens des réseaux',
      platforms: ['facebook', 'instagram', 'linkedin', 'twitter'],
      group: 'content',
      visible_if: { field: 'show_social', equals: true },
    },

    { type: 'header', content: 'Mentions légales', group: 'content' },
    { type: 'checkbox', id: 'show_legal', label: 'Afficher les mentions légales', default: true, group: 'content' },
    { type: 'text', id: 'copyright', label: 'Copyright', placeholder: '© 2025 Mon Entreprise', group: 'content' },

    { type: 'header', content: 'Mise en page', group: 'layout' },
    {
      type: 'select', id: 'columns_layout', label: 'Colonnes',
      options: [
        { label: '2 colonnes', value: '2col' },
        { label: '3 colonnes', value: '3col' },
        { label: '4 colonnes', value: '4col' },
      ],
      default: '3col', group: 'layout',
    },

    { type: 'header', content: 'Style', group: 'style' },
    colorSchemeField,
    paddingField(60),
  ],
  blocks: [footerColumnBlock],
  presets: [
    {
      name: 'Footer standard 3 colonnes',
      settings: { columns_layout: '3col', show_social: true, show_legal: true, __color_scheme: 'dark' },
      blocks: [
        { type: 'footer_column', settings: { title: 'Navigation', links: 'Accueil | /\nServices | #services\nÀ propos | #about\nContact | #contact' } },
        { type: 'footer_column', settings: { title: 'Légal', links: 'Mentions légales | /mentions\nCGV | /cgv\nConfidentialité | /privacy' } },
      ],
    },
    {
      name: 'Footer minimal',
      settings: { columns_layout: '2col', show_social: false, show_legal: true, __color_scheme: 'light' },
    },
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
 * Skips header/paragraph fields and any field without a `default`.
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

/**
 * Returns default settings for a single block type, derived from its schema.
 */
export function getBlockDefaults(blockSchema: SectionBlockSchema): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of blockSchema.settings) {
    if (field.type === 'header' || field.type === 'paragraph') continue;
    if ('id' in field && field.default !== undefined) {
      defaults[field.id] = field.default;
    }
  }
  return defaults;
}

/**
 * Locate a block schema by its `type` within a section schema.
 */
export function findBlockSchema(schema: SectionSchema, blockType: string): SectionBlockSchema | null {
  return schema.blocks?.find((b) => b.type === blockType) ?? null;
}

/**
 * Returns all preset configurations for a section type.
 * Empty array if no preset is defined.
 */
export function getPresetsForSection(sectionType: string): SectionPreset[] {
  return SECTION_SCHEMAS[sectionType]?.presets ?? [];
}

/**
 * Computes the initial content + blocks pair for a freshly added section.
 * If a preset is provided, its values take precedence over the schema defaults.
 */
export function buildInitialSectionState(
  schema: SectionSchema,
  preset?: SectionPreset,
): { content: Record<string, unknown>; blocks: Array<{ type: string; settings: Record<string, unknown> }> } {
  const baseContent = getSchemaDefaults(schema);
  const content = { ...baseContent, ...(preset?.settings ?? {}) };

  // If preset defines blocks, use them; otherwise leave blocks empty.
  // The first preset of a schema is treated as the default seed for the editor — callers may
  // still pass `preset = undefined` to add an empty section.
  const blocks = (preset?.blocks ?? []).map((b) => {
    const blockSchema = findBlockSchema(schema, b.type);
    const blockDefaults = blockSchema ? getBlockDefaults(blockSchema) : {};
    return {
      type: b.type,
      settings: { ...blockDefaults, ...(b.settings ?? {}) },
    };
  });

  return { content, blocks };
}

/**
 * Evaluates a `visible_if` rule against a settings record.
 * Returns true when the field has no rule.
 */
export function isFieldVisible(
  field: SectionField,
  settings: Record<string, unknown>,
): boolean {
  if (field.type === 'header' || field.type === 'paragraph') return true;
  const rule = (field as { visible_if?: { field: string; equals?: unknown; in?: unknown[]; truthy?: boolean } }).visible_if;
  if (!rule) return true;
  const target = settings[rule.field];
  if (rule.equals !== undefined) return target === rule.equals;
  if (rule.in !== undefined) return rule.in.includes(target);
  if (rule.truthy) return Boolean(target) && target !== '' && target !== 0;
  return true;
}
