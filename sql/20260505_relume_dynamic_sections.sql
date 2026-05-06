-- ============================================================
-- Relume-like Dynamic Sections System
-- ============================================================

-- 1. site_sections table — the section library (like Relume's component library)
CREATE TABLE IF NOT EXISTS public.site_sections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,          -- "hero", "services", "testimonials", etc.
  category         TEXT,                   -- "Header", "Content", "Social Proof", etc.
  preview_image_url TEXT,
  structure        JSONB NOT NULL,         -- snippet definitions (see docs)
  default_content  JSONB NOT NULL DEFAULT '{}', -- placeholder content
  is_builtin       BOOLEAN NOT NULL DEFAULT FALSE,
  tags             TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_sections_type
  ON public.site_sections (type);

CREATE INDEX IF NOT EXISTS idx_site_sections_category
  ON public.site_sections (category);

CREATE TRIGGER trg_site_sections_updated_at
  BEFORE UPDATE ON public.site_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. site_section_instances — sections placed on a site page
CREATE TABLE IF NOT EXISTS public.site_section_instances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  section_id   UUID REFERENCES public.site_sections(id) ON DELETE SET NULL,
  page_slug    TEXT NOT NULL DEFAULT '/',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  content      JSONB NOT NULL DEFAULT '{}',  -- actual text/images replacing placeholders
  custom_style JSONB DEFAULT '{}',            -- optional per-instance style overrides
  is_hidden    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_section_instances_site_id
  ON public.site_section_instances (site_id);

CREATE INDEX IF NOT EXISTS idx_site_section_instances_page
  ON public.site_section_instances (site_id, page_slug, sort_order);

CREATE TRIGGER trg_site_section_instances_updated_at
  BEFORE UPDATE ON public.site_section_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Extend sites table with style_guide and sitemap columns
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS style_guide  JSONB,
  ADD COLUMN IF NOT EXISTS sitemap      JSONB;

-- 4. RLS policies
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_sections_public_read ON public.site_sections;
CREATE POLICY site_sections_public_read ON public.site_sections
  FOR SELECT USING (TRUE);

ALTER TABLE public.site_section_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_section_instances_public_read ON public.site_section_instances;
CREATE POLICY site_section_instances_public_read ON public.site_section_instances
  FOR SELECT USING (TRUE);

-- 5. Seed built-in sections

-- Hero Centered
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Hero Centré',
  'hero-centered',
  'Hero',
  TRUE,
  '{
    "snippets": [
      {
        "id": "badge",
        "type": "badge",
        "props": { "text": "{{badge_text}}", "color": "var(--color-primary)" },
        "editable": ["text", "color"]
      },
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 1, "text": "{{heading}}", "align": "center" },
        "editable": ["text", "level"]
      },
      {
        "id": "subheading",
        "type": "paragraph",
        "props": { "text": "{{subheading}}", "align": "center", "maxWidth": "640px", "size": "lg" },
        "editable": ["text"]
      },
      {
        "id": "cta-group",
        "type": "button-group",
        "props": {
          "buttons": [
            { "text": "{{cta_primary}}", "href": "{{cta_primary_href}}", "variant": "primary" },
            { "text": "{{cta_secondary}}", "href": "{{cta_secondary_href}}", "variant": "outline" }
          ],
          "align": "center"
        },
        "editable": ["buttons"]
      },
      {
        "id": "hero-image",
        "type": "image",
        "props": { "src": "{{hero_image}}", "alt": "{{image_alt}}", "width": "100%", "borderRadius": "12px" },
        "editable": ["src", "alt"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "badge_text": "Nouveau",
    "heading": "Votre solution professionnelle",
    "subheading": "Nous offrons des services de qualité adaptés à vos besoins. Contactez-nous dès aujourd''hui.",
    "cta_primary": "Commencer",
    "cta_primary_href": "#contact",
    "cta_secondary": "En savoir plus",
    "cta_secondary_href": "#services",
    "hero_image": "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
    "image_alt": "Notre équipe au travail"
  }',
  ARRAY['hero', 'landing', 'centered']
)
ON CONFLICT DO NOTHING;

-- Hero Split (text left, image right)
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Hero Divisé',
  'hero-split',
  'Hero',
  TRUE,
  '{
    "snippets": [
      {
        "id": "content-col",
        "type": "flex-col",
        "props": { "gap": "var(--spacing-md)", "flex": 1 },
        "children": [
          {
            "id": "heading",
            "type": "heading",
            "props": { "level": 1, "text": "{{heading}}" },
            "editable": ["text", "level"]
          },
          {
            "id": "subheading",
            "type": "paragraph",
            "props": { "text": "{{subheading}}", "size": "lg" },
            "editable": ["text"]
          },
          {
            "id": "cta",
            "type": "button",
            "props": { "text": "{{cta_text}}", "href": "{{cta_href}}", "variant": "primary" },
            "editable": ["text", "href"]
          }
        ]
      },
      {
        "id": "image-col",
        "type": "image",
        "props": { "src": "{{hero_image}}", "alt": "{{image_alt}}", "width": "100%", "borderRadius": "12px", "flex": 1 },
        "editable": ["src", "alt"]
      }
    ],
    "layout": { "type": "grid", "columns": [1, 1], "gap": "var(--spacing-xl)", "align": "center" },
    "responsive": { "mobile": { "layout": "stack" } },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "heading": "Experts à votre service depuis 15 ans",
    "subheading": "Notre équipe passionnée vous accompagne à chaque étape. Qualité, réactivité et professionnalisme.",
    "cta_text": "Nous contacter",
    "cta_href": "#contact",
    "hero_image": "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80",
    "image_alt": "Notre équipe"
  }',
  ARRAY['hero', 'split', 'landing']
)
ON CONFLICT DO NOTHING;

-- Services Grid
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Services en Grille',
  'services-grid',
  'Services',
  TRUE,
  '{
    "snippets": [
      {
        "id": "section-label",
        "type": "badge",
        "props": { "text": "{{section_label}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "subheading",
        "type": "paragraph",
        "props": { "text": "{{subheading}}", "align": "center", "maxWidth": "600px" },
        "editable": ["text"]
      },
      {
        "id": "services-cards",
        "type": "card-grid",
        "props": {
          "columns": 3,
          "cards": "{{services}}",
          "showIcon": true,
          "showCta": false
        },
        "editable": ["cards", "columns"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "section_label": "Nos Services",
    "heading": "Ce que nous proposons",
    "subheading": "Découvrez l''étendue de nos expertises et comment nous pouvons vous aider.",
    "services": [
      { "icon": "wrench", "title": "Service 1", "description": "Description du premier service proposé." },
      { "icon": "shield", "title": "Service 2", "description": "Description du deuxième service proposé." },
      { "icon": "star", "title": "Service 3", "description": "Description du troisième service proposé." }
    ]
  }',
  ARRAY['services', 'grid', 'features']
)
ON CONFLICT DO NOTHING;

-- Testimonials
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Témoignages',
  'testimonials',
  'Social Proof',
  TRUE,
  '{
    "snippets": [
      {
        "id": "section-label",
        "type": "badge",
        "props": { "text": "{{section_label}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "testimonials-grid",
        "type": "testimonial-grid",
        "props": { "testimonials": "{{testimonials}}", "columns": 3 },
        "editable": ["testimonials", "columns"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "section_label": "Témoignages",
    "heading": "Ce que disent nos clients",
    "testimonials": [
      { "name": "Marie D.", "role": "Directrice", "text": "Service exceptionnel, équipe très professionnelle.", "rating": 5, "avatar": "" },
      { "name": "Pierre M.", "role": "Gérant", "text": "Réactivité et qualité au rendez-vous. Je recommande vivement.", "rating": 5, "avatar": "" },
      { "name": "Sophie L.", "role": "Responsable", "text": "Excellent rapport qualité-prix. Très satisfaite du résultat.", "rating": 5, "avatar": "" }
    ]
  }',
  ARRAY['testimonials', 'reviews', 'social-proof']
)
ON CONFLICT DO NOTHING;

-- About Section
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'À Propos',
  'about',
  'Content',
  TRUE,
  '{
    "snippets": [
      {
        "id": "image",
        "type": "image",
        "props": { "src": "{{about_image}}", "alt": "{{image_alt}}", "width": "100%", "borderRadius": "12px" },
        "editable": ["src", "alt"]
      },
      {
        "id": "content",
        "type": "flex-col",
        "props": { "gap": "var(--spacing-md)" },
        "children": [
          {
            "id": "label",
            "type": "badge",
            "props": { "text": "{{section_label}}" },
            "editable": ["text"]
          },
          {
            "id": "heading",
            "type": "heading",
            "props": { "level": 2, "text": "{{heading}}" },
            "editable": ["text"]
          },
          {
            "id": "body",
            "type": "paragraph",
            "props": { "text": "{{body}}" },
            "editable": ["text"]
          },
          {
            "id": "stats",
            "type": "stat-row",
            "props": { "stats": "{{stats}}" },
            "editable": ["stats"]
          }
        ]
      }
    ],
    "layout": { "type": "grid", "columns": [1, 1], "gap": "var(--spacing-xl)", "align": "center" },
    "responsive": { "mobile": { "layout": "stack" } },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "section_label": "À Propos",
    "heading": "Notre histoire et nos valeurs",
    "body": "Fondée il y a plus de 15 ans, notre entreprise s''est construite sur des valeurs fortes : qualité, intégrité et service client irréprochable. Aujourd''hui, nous servons des centaines de clients satisfaits.",
    "about_image": "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80",
    "image_alt": "Notre équipe",
    "stats": [
      { "value": "15+", "label": "Années d''expérience" },
      { "value": "500+", "label": "Clients satisfaits" },
      { "value": "98%", "label": "Taux de satisfaction" }
    ]
  }',
  ARRAY['about', 'company', 'team']
)
ON CONFLICT DO NOTHING;

-- Contact Section
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Contact',
  'contact',
  'Contact',
  TRUE,
  '{
    "snippets": [
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "subheading",
        "type": "paragraph",
        "props": { "text": "{{subheading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "contact-info",
        "type": "contact-info",
        "props": {
          "phone": "{{phone}}",
          "email": "{{email}}",
          "address": "{{address}}"
        },
        "editable": ["phone", "email", "address"]
      },
      {
        "id": "contact-form",
        "type": "contact-form",
        "props": { "fields": ["name", "email", "phone", "message"], "submitText": "{{submit_text}}" },
        "editable": ["submitText"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "heading": "Contactez-nous",
    "subheading": "Notre équipe est disponible pour répondre à toutes vos questions.",
    "phone": "01 23 45 67 89",
    "email": "contact@entreprise.fr",
    "address": "123 Rue de la Paix, 75001 Paris",
    "submit_text": "Envoyer le message"
  }',
  ARRAY['contact', 'form', 'cta']
)
ON CONFLICT DO NOTHING;

-- CTA Banner
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Bannière CTA',
  'cta-banner',
  'CTA',
  TRUE,
  '{
    "snippets": [
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center", "color": "white" },
        "editable": ["text"]
      },
      {
        "id": "subheading",
        "type": "paragraph",
        "props": { "text": "{{subheading}}", "align": "center", "color": "rgba(255,255,255,0.85)" },
        "editable": ["text"]
      },
      {
        "id": "cta",
        "type": "button",
        "props": { "text": "{{cta_text}}", "href": "{{cta_href}}", "variant": "white", "size": "lg" },
        "editable": ["text", "href"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-md)" },
    "background": "var(--color-primary)",
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "heading": "Prêt à démarrer votre projet ?",
    "subheading": "Contactez-nous dès aujourd''hui pour un devis gratuit et sans engagement.",
    "cta_text": "Demander un devis",
    "cta_href": "#contact"
  }',
  ARRAY['cta', 'banner', 'conversion']
)
ON CONFLICT DO NOTHING;

-- FAQ Section
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'FAQ',
  'faq',
  'Content',
  TRUE,
  '{
    "snippets": [
      {
        "id": "label",
        "type": "badge",
        "props": { "text": "{{section_label}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "faq-list",
        "type": "faq-accordion",
        "props": { "items": "{{faqs}}" },
        "editable": ["items"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "section_label": "FAQ",
    "heading": "Questions fréquentes",
    "faqs": [
      { "question": "Comment fonctionne votre service ?", "answer": "Notre service est simple et efficace. Contactez-nous et nous nous occupons du reste." },
      { "question": "Quels sont vos délais d''intervention ?", "answer": "Nous intervenons généralement sous 24 à 48 heures selon votre localisation." },
      { "question": "Proposez-vous des devis gratuits ?", "answer": "Oui, tous nos devis sont gratuits et sans engagement." }
    ]
  }',
  ARRAY['faq', 'questions', 'accordion']
)
ON CONFLICT DO NOTHING;

-- Stats / Chiffres Clés
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Chiffres Clés',
  'stats',
  'Social Proof',
  TRUE,
  '{
    "snippets": [
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "stats-grid",
        "type": "stat-grid",
        "props": { "stats": "{{stats}}", "columns": 4 },
        "editable": ["stats", "columns"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "heading": "Nos chiffres parlent d''eux-mêmes",
    "stats": [
      { "value": "15+", "label": "Années d''expérience", "icon": "clock" },
      { "value": "500+", "label": "Clients satisfaits", "icon": "users" },
      { "value": "1200+", "label": "Projets réalisés", "icon": "check-circle" },
      { "value": "98%", "label": "Satisfaction client", "icon": "star" }
    ]
  }',
  ARRAY['stats', 'numbers', 'social-proof']
)
ON CONFLICT DO NOTHING;

-- Gallery
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Galerie',
  'gallery',
  'Media',
  TRUE,
  '{
    "snippets": [
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "gallery-grid",
        "type": "image-grid",
        "props": { "images": "{{images}}", "columns": 3 },
        "editable": ["images", "columns"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "heading": "Nos réalisations",
    "images": [
      { "src": "https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80", "alt": "Réalisation 1" },
      { "src": "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=600&q=80", "alt": "Réalisation 2" },
      { "src": "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&q=80", "alt": "Réalisation 3" }
    ]
  }',
  ARRAY['gallery', 'portfolio', 'images']
)
ON CONFLICT DO NOTHING;

-- Team Section
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Équipe',
  'team',
  'Content',
  TRUE,
  '{
    "snippets": [
      {
        "id": "label",
        "type": "badge",
        "props": { "text": "{{section_label}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "heading",
        "type": "heading",
        "props": { "level": 2, "text": "{{heading}}", "align": "center" },
        "editable": ["text"]
      },
      {
        "id": "team-grid",
        "type": "team-grid",
        "props": { "members": "{{members}}", "columns": 3 },
        "editable": ["members", "columns"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-lg)" },
    "padding": { "top": "var(--section-padding)", "bottom": "var(--section-padding)" }
  }',
  '{
    "section_label": "Notre équipe",
    "heading": "Les experts qui vous accompagnent",
    "members": [
      { "name": "Jean Dupont", "role": "Directeur", "bio": "15 ans d''expérience dans le secteur.", "avatar": "" },
      { "name": "Marie Martin", "role": "Responsable technique", "bio": "Spécialiste certifiée dans son domaine.", "avatar": "" },
      { "name": "Paul Bernard", "role": "Chef de projet", "bio": "Expert en gestion de projets complexes.", "avatar": "" }
    ]
  }',
  ARRAY['team', 'people', 'about']
)
ON CONFLICT DO NOTHING;

-- Logos / Partenaires
INSERT INTO public.site_sections (name, type, category, is_builtin, structure, default_content, tags)
VALUES (
  'Logos Partenaires',
  'logos',
  'Social Proof',
  TRUE,
  '{
    "snippets": [
      {
        "id": "heading",
        "type": "paragraph",
        "props": { "text": "{{heading}}", "align": "center", "size": "sm", "color": "var(--color-text-muted)" },
        "editable": ["text"]
      },
      {
        "id": "logo-row",
        "type": "logo-row",
        "props": { "logos": "{{logos}}", "grayscale": true },
        "editable": ["logos", "grayscale"]
      }
    ],
    "layout": { "type": "stack", "align": "center", "gap": "var(--spacing-md)" },
    "padding": { "top": "var(--spacing-xl)", "bottom": "var(--spacing-xl)" },
    "background": "var(--color-background-alt)"
  }',
  '{
    "heading": "Ils nous font confiance",
    "logos": [
      { "src": "", "alt": "Partenaire 1" },
      { "src": "", "alt": "Partenaire 2" },
      { "src": "", "alt": "Partenaire 3" },
      { "src": "", "alt": "Partenaire 4" }
    ]
  }',
  ARRAY['logos', 'partners', 'trust', 'social-proof']
)
ON CONFLICT DO NOTHING;
