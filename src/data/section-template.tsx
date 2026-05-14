/**
 * Reference template showing all supported field types and conventions.
 * Copy this file to create a new section.
 *
 * Schema fields used:
 *   - text / textarea with {{ variable }} support
 *   - image_picker with Supabase Storage
 *   - button composite (label + href + target)
 *   - input composite (type + placeholder + label + name + required)
 *   - form composite (action + method + submit_label + success_message)
 *   - toggle, select, range
 */

/* ─── Schema definition (add to section-schemas.ts) ─────────────────────────

import type { SectionSchema } from "@/types";

export const templateSectionSchema: SectionSchema = {
  name: "Template Section",
  description: "Référence de tous les types de champs disponibles.",
  category: "content",
  icon: "layout",
  settings: [
    { type: "header", content: "Contenu", group: "content" },
    { type: "text", id: "badge", label: "Badge", placeholder: "Nouveau", group: "content" },
    { type: "text", id: "heading", label: "Titre", default: "Votre titre ici", required: true, group: "content" },
    { type: "textarea", id: "body", label: "Corps", rows: 3, group: "content" },
    { type: "image_picker", id: "image", label: "Image", group: "content" },

    // Composite button field
    { type: "button", id: "cta_primary", label: "Bouton principal", variant: "primary", group: "content" },
    { type: "button", id: "cta_secondary", label: "Bouton secondaire", variant: "secondary", group: "content" },

    // Composite form fields
    { type: "input", id: "email_field", label: "Champ email", group: "content" },
    { type: "form", id: "contact_form", label: "Formulaire de contact", group: "content" },

    { type: "header", content: "Mise en page", group: "layout" },
    {
      type: "select", id: "layout", label: "Disposition",
      options: [
        { label: "Centré", value: "centered" },
        { label: "Deux colonnes", value: "two-col" },
      ],
      default: "centered", group: "layout",
    },
    { type: "toggle", id: "show_image", label: "Afficher l'image", default: true, group: "layout" },

    { type: "header", content: "Style", group: "style" },
    { type: "color_scheme", id: "__color_scheme", label: "Palette de couleurs", group: "style" },
  ],
};

─── End schema ─────────────────────────────────────────────────────────────── */

// ─── Section component (used in iframe via buildHTML) ─────────────────────────

type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

interface TemplateButtonData {
  label?: string;
  href?: string;
  target?: "_self" | "_blank";
}

interface TemplateInputData {
  input_type?: string;
  placeholder?: string;
  label?: string;
  name?: string;
  required?: boolean;
}

interface TemplateFormData {
  action?: string;
  method?: string;
  submit_label?: string;
}

interface TemplateSectionData {
  layout?: string;
  badge?: string;
  heading?: string;
  body?: string;
  cta_primary?: TemplateButtonData;
  cta_secondary?: TemplateButtonData;
  show_image?: boolean;
  image?: string;
  contact_form?: TemplateFormData;
  email_field?: TemplateInputData;
}

interface TemplateSectionProps {
  data?: TemplateSectionData;
  variables?: TemplateVariables;
  tokens?: Record<string, unknown>;
}

// This function is called with (text, variables) to resolve {{ variable }} tokens.
function applyVariables(text: unknown, variables: TemplateVariables): string {
  const value = text == null ? "" : String(text);
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) =>
    variables[key] == null ? `{{ ${key} }}` : String(variables[key])
  );
}

export default function TemplateSection({ data = {}, variables = {}, tokens = {} }: TemplateSectionProps) {
  const v = (str: unknown) => applyVariables(str, variables);

  // Composite button helper. `fieldId` is the content key — passing it as
  // `data-field-id` lets the click-to-edit pipeline bind directly to the
  // right key without value matching.
  const renderButton = (btn: TemplateButtonData | undefined, className: string, fieldId: string) => {
    if (!btn || !btn.label) return null;
    return (
      <a
        href={v(btn.href ?? "#")}
        target={btn.target ?? "_self"}
        className={className}
        rel={btn.target === "_blank" ? "noopener noreferrer" : undefined}
        data-field-id={fieldId}
      >
        {v(btn.label)}
      </a>
    );
  };

  return (
    <section
      style={{
        backgroundColor: "var(--color-background)",
        color: "var(--color-text)",
        padding: "var(--section-padding) 1.5rem",
      }}
    >
      <div
        style={{
          maxWidth: "var(--max-content-width)",
          margin: "0 auto",
          display: "flex",
          flexDirection: data.layout === "two-col" ? "row" : "column",
          gap: "var(--element-gap)",
          alignItems: "center",
        }}
      >
        {/* Text column */}
        <div style={{ flex: 1 }}>
          {data.badge && (
            <span
              data-field-id="badge"
              style={{
                display: "inline-block",
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: "99px",
                padding: "2px 10px",
                fontSize: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              {v(data.badge)}
            </span>
          )}

          <h2
            data-field-id="heading"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "2rem",
              fontWeight: 700,
              lineHeight: 1.2,
              marginBottom: "1rem",
              color: "var(--color-text)",
            }}
          >
            {v(data.heading ?? "Votre titre ici")}
          </h2>

          {data.body && (
            <p
              data-field-id="body"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-muted)",
                marginBottom: "1.5rem",
                lineHeight: 1.6,
              }}
            >
              {v(data.body)}
            </p>
          )}

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {renderButton(data.cta_primary, "cta-primary", "cta_primary")}
            {renderButton(data.cta_secondary, "cta-secondary", "cta_secondary")}
          </div>
        </div>

        {/* Image column */}
        {data.show_image !== false && data.image && (
          <div style={{ flex: 1 }}>
            <img
              data-field-id="image"
              src={data.image}
              alt={v(data.heading ?? "")}
              style={{
                width: "100%",
                borderRadius: "var(--card-radius)",
                objectFit: "cover",
              }}
            />
          </div>
        )}

        {/* Contact form */}
        {data.contact_form && (
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              padding: "var(--card-padding)",
              backgroundColor: "var(--color-bg-alt)",
              borderRadius: "var(--card-radius)",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <form
              data-field-id="contact_form"
              action={v(data.contact_form.action ?? "#")}
              method={data.contact_form.method ?? "POST"}
            >
              {/* Email field */}
              {data.email_field && (
                <div style={{ marginBottom: "1rem" }}>
                  {data.email_field.label && (
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        marginBottom: "0.25rem",
                        color: "var(--color-text)",
                      }}
                    >
                      {v(data.email_field.label)}
                      {data.email_field.required && (
                        <span style={{ color: "var(--color-primary)", marginLeft: "2px" }}>*</span>
                      )}
                    </label>
                  )}
                  <input
                    data-field-id="email_field"
                    type={data.email_field.input_type ?? "email"}
                    placeholder={v(data.email_field.placeholder ?? "")}
                    name={data.email_field.name ?? "email"}
                    required={data.email_field.required ?? false}
                    style={{
                      width: "100%",
                      padding: "0.625rem 0.875rem",
                      border: "1px solid rgba(0,0,0,0.12)",
                      borderRadius: "var(--card-radius)",
                      fontFamily: "var(--font-body)",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              <button type="submit" className="cta-primary" style={{ width: "100%" }}>
                {v(data.contact_form.submit_label ?? "Envoyer")}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
