"use client";

import React from "react";
import type { SnippetDefinition } from "@/types";

// ─── Utility: resolve {{placeholder}} values ──────────────────────────────────

function resolveVal(val: unknown, content: Record<string, unknown>): unknown {
  if (typeof val !== "string") return val;
  return val.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const resolved = content[key.trim()];
    return resolved !== undefined && resolved !== null ? String(resolved) : "";
  });
}

function resolveProps(
  props: Record<string, unknown>,
  content: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string") {
      out[k] = resolveVal(v, content);
    } else if (Array.isArray(v)) {
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─── Heading ─────────────────────────────────────────────────────────────────

interface HeadingProps {
  level?: number;
  text?: string;
  align?: string;
  color?: string;
}

function SnippetHeading({ level = 2, text = "", align = "left", color }: HeadingProps) {
  const sizeMap: Record<number, string> = {
    1: "text-4xl md:text-5xl lg:text-6xl",
    2: "text-3xl md:text-4xl",
    3: "text-2xl md:text-3xl",
    4: "text-xl md:text-2xl",
    5: "text-lg md:text-xl",
    6: "text-base md:text-lg",
  };
  const clampedLevel = Math.min(Math.max(level, 1), 6);
  const headingStyle: React.CSSProperties = {
    textAlign: align as React.CSSProperties["textAlign"],
    color: color ?? "var(--color-text)",
    fontFamily: "var(--font-heading)",
  };
  const className = `font-bold leading-tight ${sizeMap[clampedLevel] ?? sizeMap[2]}`;
  if (clampedLevel === 1) return <h1 className={className} style={headingStyle} dangerouslySetInnerHTML={{ __html: text }} />;
  if (clampedLevel === 3) return <h3 className={className} style={headingStyle} dangerouslySetInnerHTML={{ __html: text }} />;
  if (clampedLevel === 4) return <h4 className={className} style={headingStyle} dangerouslySetInnerHTML={{ __html: text }} />;
  if (clampedLevel === 5) return <h5 className={className} style={headingStyle} dangerouslySetInnerHTML={{ __html: text }} />;
  if (clampedLevel === 6) return <h6 className={className} style={headingStyle} dangerouslySetInnerHTML={{ __html: text }} />;
  return <h2 className={className} style={headingStyle} dangerouslySetInnerHTML={{ __html: text }} />;
}

// ─── Paragraph ───────────────────────────────────────────────────────────────

interface ParagraphProps {
  text?: string;
  align?: string;
  maxWidth?: string;
  size?: string;
  color?: string;
}

function SnippetParagraph({ text = "", align = "left", maxWidth, size = "base", color }: ParagraphProps) {
  const sizeMap: Record<string, string> = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };
  return (
    <p
      className={`leading-relaxed ${sizeMap[size] ?? "text-base"}`}
      style={{
        textAlign: align as React.CSSProperties["textAlign"],
        maxWidth: maxWidth,
        margin: align === "center" ? "0 auto" : undefined,
        color: color ?? "var(--color-text-muted)",
        fontFamily: "var(--font-body)",
      }}
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

interface BadgeProps {
  text?: string;
  align?: string;
  color?: string;
}

function SnippetBadge({ text = "", align = "left", color }: BadgeProps) {
  return (
    <div style={{ textAlign: align as React.CSSProperties["textAlign"] }}>
      <span
        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold"
        style={{
          backgroundColor: `${color ?? "var(--color-primary)"}15`,
          color: color ?? "var(--color-primary)",
        }}
      >
        {text}
      </span>
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps {
  text?: string;
  href?: string;
  variant?: "primary" | "outline" | "white" | "ghost";
  size?: "sm" | "md" | "lg";
}

function SnippetButton({ text = "En savoir plus", href = "#", variant = "primary", size = "md" }: ButtonProps) {
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: "var(--color-primary)",
      color: "#fff",
      border: "2px solid var(--color-primary)",
    },
    outline: {
      backgroundColor: "transparent",
      color: "var(--color-primary)",
      border: "2px solid var(--color-primary)",
    },
    white: {
      backgroundColor: "#fff",
      color: "var(--color-primary)",
      border: "2px solid #fff",
    },
    ghost: {
      backgroundColor: "transparent",
      color: "var(--color-text)",
      border: "2px solid transparent",
    },
  };
  const sizeStyles: Record<string, string> = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  };
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center font-semibold transition-all hover:opacity-90 ${sizeStyles[size] ?? sizeStyles.md}`}
      style={{
        ...variantStyles[variant] ?? variantStyles.primary,
        borderRadius: "var(--btn-radius)",
        textDecoration: "none",
      }}
    >
      {text}
    </a>
  );
}

// ─── Button Group ─────────────────────────────────────────────────────────────

interface ButtonGroupProps {
  buttons?: Array<{ text: string; href: string; variant?: ButtonProps["variant"] }>;
  align?: string;
}

function SnippetButtonGroup({ buttons = [], align = "left" }: ButtonGroupProps) {
  return (
    <div
      className="flex flex-wrap gap-3"
      style={{ justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }}
    >
      {buttons.map((btn, i) => (
        <SnippetButton key={i} text={btn.text} href={btn.href} variant={btn.variant} />
      ))}
    </div>
  );
}

// ─── Image ───────────────────────────────────────────────────────────────────

interface ImageProps {
  src?: string;
  alt?: string;
  width?: string;
  borderRadius?: string;
}

function SnippetImage({ src, alt = "", width = "100%", borderRadius = "0" }: ImageProps) {
  if (!src) {
    return (
      <div
        className="bg-gray-100 flex items-center justify-center text-gray-400 text-sm"
        style={{ width, minHeight: "200px", borderRadius }}
      >
        Image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{ width, borderRadius, display: "block", objectFit: "cover" }}
    />
  );
}

// ─── Card Grid ───────────────────────────────────────────────────────────────

interface CardItem {
  icon?: string;
  title?: string;
  description?: string;
  href?: string;
}

interface CardGridProps {
  cards?: CardItem[];
  columns?: number;
}

const ICON_MAP: Record<string, string> = {
  wrench: "🔧",
  shield: "🛡️",
  star: "⭐",
  check: "✅",
  home: "🏠",
  phone: "📞",
  mail: "📧",
  map: "📍",
  clock: "🕐",
  users: "👥",
  "check-circle": "✅",
  zap: "⚡",
  heart: "❤️",
  award: "🏆",
};

function SnippetCardGrid({ cards = [], columns = 3 }: CardGridProps) {
  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: `repeat(${Math.min(columns, cards.length || columns)}, minmax(0, 1fr))`,
        gap: "var(--element-gap)",
      }}
    >
      {cards.map((card, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 h-full"
          style={{
            backgroundColor: "var(--color-bg-alt)",
            borderRadius: "var(--card-radius)",
            padding: "var(--card-padding)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          {card.icon && (
            <span className="text-2xl">{ICON_MAP[card.icon] ?? "◆"}</span>
          )}
          {card.title && (
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--color-text)", fontFamily: "var(--font-heading)" }}
            >
              {card.title}
            </h3>
          )}
          {card.description && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
              {card.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Testimonial Grid ─────────────────────────────────────────────────────────

interface TestimonialItem {
  name?: string;
  role?: string;
  text?: string;
  rating?: number;
  avatar?: string;
}

interface TestimonialGridProps {
  testimonials?: TestimonialItem[];
  columns?: number;
}

function SnippetTestimonialGrid({ testimonials = [], columns = 3 }: TestimonialGridProps) {
  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: `repeat(${Math.min(columns, testimonials.length || columns)}, minmax(0, 1fr))`,
        gap: "var(--element-gap)",
      }}
    >
      {testimonials.map((t, i) => (
        <div
          key={i}
          className="flex flex-col gap-3"
          style={{
            backgroundColor: "var(--color-bg-alt)",
            borderRadius: "var(--card-radius)",
            padding: "var(--card-padding)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div className="flex gap-1">
            {Array.from({ length: t.rating ?? 5 }).map((_, j) => (
              <span key={j} className="text-amber-400 text-sm">★</span>
            ))}
          </div>
          {t.text && (
            <p className="text-sm leading-relaxed italic" style={{ color: "var(--color-text-muted)" }}>
              "{t.text}"
            </p>
          )}
          <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-100">
            {t.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.avatar} alt={t.name ?? ""} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {(t.name ?? "?")[0]}
              </div>
            )}
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{t.name}</div>
              {t.role && <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{t.role}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────

interface FaqItem {
  question?: string;
  answer?: string;
}

function SnippetFaqAccordion({ items = [] }: { items?: FaqItem[] }) {
  const [open, setOpen] = React.useState<number | null>(null);
  return (
    <div className="w-full max-w-3xl mx-auto divide-y" style={{ borderColor: "var(--color-border, #e5e7eb)" }}>
      {items.map((faq, i) => (
        <div key={i} className="py-4">
          <button
            className="flex items-center justify-between w-full text-left font-medium gap-4"
            style={{ color: "var(--color-text)", fontFamily: "var(--font-body)" }}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span>{faq.question}</span>
            <span className="text-lg flex-shrink-0">{open === i ? "−" : "+"}</span>
          </button>
          {open === i && faq.answer && (
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "var(--color-text-muted)" }}
            >
              {faq.answer}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Contact Info ─────────────────────────────────────────────────────────────

function SnippetContactInfo({ phone, email, address }: { phone?: string; email?: string; address?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {phone && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
          <span>📞</span>
          <a href={`tel:${phone}`} className="hover:underline">{phone}</a>
        </div>
      )}
      {email && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
          <span>✉️</span>
          <a href={`mailto:${email}`} className="hover:underline">{email}</a>
        </div>
      )}
      {address && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
          <span>📍</span>
          <span>{address}</span>
        </div>
      )}
    </div>
  );
}

// ─── Contact Form ─────────────────────────────────────────────────────────────

function SnippetContactForm({ submitText = "Envoyer" }: { submitText?: string; fields?: string[] }) {
  return (
    <form className="w-full max-w-lg mx-auto flex flex-col gap-4" onSubmit={(e: React.FormEvent) => e.preventDefault()}>
      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Votre nom"
          className="border rounded px-4 py-3 text-sm w-full"
          style={{ borderColor: "var(--color-border, #e5e7eb)", borderRadius: "var(--btn-radius)", fontFamily: "var(--font-body)" }}
        />
        <input
          type="email"
          placeholder="Votre email"
          className="border rounded px-4 py-3 text-sm w-full"
          style={{ borderColor: "var(--color-border, #e5e7eb)", borderRadius: "var(--btn-radius)", fontFamily: "var(--font-body)" }}
        />
      </div>
      <input
        type="tel"
        placeholder="Votre téléphone"
        className="border rounded px-4 py-3 text-sm w-full"
        style={{ borderColor: "var(--color-border, #e5e7eb)", borderRadius: "var(--btn-radius)", fontFamily: "var(--font-body)" }}
      />
      <textarea
        placeholder="Votre message"
        rows={4}
        className="border rounded px-4 py-3 text-sm w-full resize-none"
        style={{ borderColor: "var(--color-border, #e5e7eb)", borderRadius: "var(--btn-radius)", fontFamily: "var(--font-body)" }}
      />
      <SnippetButton text={submitText} variant="primary" />
    </form>
  );
}

// ─── Stat Row ────────────────────────────────────────────────────────────────

interface StatItem {
  value?: string;
  label?: string;
  icon?: string;
}

function SnippetStatRow({ stats = [] }: { stats?: StatItem[] }) {
  return (
    <div className="flex flex-wrap gap-8">
      {stats.map((s, i) => (
        <div key={i} className="flex flex-col gap-1">
          <span className="text-3xl font-bold" style={{ color: "var(--color-primary)", fontFamily: "var(--font-heading)" }}>
            {s.value}
          </span>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Grid ────────────────────────────────────────────────────────────────

function SnippetStatGrid({ stats = [], columns = 4 }: { stats?: StatItem[]; columns?: number }) {
  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: `repeat(${Math.min(columns, stats.length || columns)}, minmax(0, 1fr))`,
        gap: "var(--element-gap)",
      }}
    >
      {stats.map((s, i) => (
        <div key={i} className="flex flex-col items-center gap-2 text-center p-6"
          style={{
            backgroundColor: "var(--color-bg-alt)",
            borderRadius: "var(--card-radius)",
          }}
        >
          {s.icon && <span className="text-2xl">{ICON_MAP[s.icon] ?? "◆"}</span>}
          <span className="text-3xl font-bold" style={{ color: "var(--color-primary)", fontFamily: "var(--font-heading)" }}>
            {s.value}
          </span>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Image Grid ────────────────────────────────────────────────────────────────

interface ImageItem { src?: string; alt?: string }

function SnippetImageGrid({ images = [], columns = 3 }: { images?: ImageItem[]; columns?: number }) {
  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: `repeat(${Math.min(columns, images.length || columns)}, minmax(0, 1fr))`,
        gap: "var(--element-gap)",
      }}
    >
      {images.map((img, i) => (
        <div key={i} style={{ borderRadius: "var(--card-radius)", overflow: "hidden" }}>
          <SnippetImage src={img.src} alt={img.alt} width="100%" />
        </div>
      ))}
    </div>
  );
}

// ─── Team Grid ────────────────────────────────────────────────────────────────

interface TeamMember { name?: string; role?: string; bio?: string; avatar?: string }

function SnippetTeamGrid({ members = [], columns = 3 }: { members?: TeamMember[]; columns?: number }) {
  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: `repeat(${Math.min(columns, members.length || columns)}, minmax(0, 1fr))`,
        gap: "var(--element-gap)",
      }}
    >
      {members.map((m, i) => (
        <div key={i} className="flex flex-col items-center gap-3 text-center"
          style={{
            backgroundColor: "var(--color-bg-alt)",
            borderRadius: "var(--card-radius)",
            padding: "var(--card-padding)",
          }}
        >
          {m.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatar} alt={m.name ?? ""} className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {(m.name ?? "?")[0]}
            </div>
          )}
          {m.name && <div className="font-semibold" style={{ color: "var(--color-text)" }}>{m.name}</div>}
          {m.role && <div className="text-sm" style={{ color: "var(--color-primary)" }}>{m.role}</div>}
          {m.bio && <div className="text-sm" style={{ color: "var(--color-text-muted)" }}>{m.bio}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Logo Row ─────────────────────────────────────────────────────────────────

function SnippetLogoRow({ logos = [], grayscale = true }: { logos?: ImageItem[]; grayscale?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-8 w-full">
      {logos.map((logo, i) =>
        logo.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={logo.src}
            alt={logo.alt ?? `Logo ${i + 1}`}
            className="h-10 object-contain"
            style={{ filter: grayscale ? "grayscale(1) opacity(0.6)" : undefined }}
          />
        ) : (
          <div
            key={i}
            className="h-10 w-24 rounded flex items-center justify-center text-xs"
            style={{ backgroundColor: "var(--color-bg-alt)", color: "var(--color-text-muted)" }}
          >
            {logo.alt ?? `Logo ${i + 1}`}
          </div>
        )
      )}
    </div>
  );
}

// ─── Spacer ───────────────────────────────────────────────────────────────────

function SnippetSpacer({ height = "40px" }: { height?: string }) {
  return <div style={{ height }} aria-hidden="true" />;
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function SnippetDivider({ color }: { color?: string }) {
  return (
    <hr
      style={{
        borderColor: color ?? "var(--color-border, #e5e7eb)",
        width: "100%",
        margin: "0",
      }}
    />
  );
}

// ─── Master registry ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SNIPPET_REGISTRY: Record<string, React.ComponentType<any>> = {
  heading: SnippetHeading,
  paragraph: SnippetParagraph,
  badge: SnippetBadge,
  button: SnippetButton,
  "button-group": SnippetButtonGroup,
  image: SnippetImage,
  "card-grid": SnippetCardGrid,
  "testimonial-grid": SnippetTestimonialGrid,
  "faq-accordion": SnippetFaqAccordion,
  "contact-info": SnippetContactInfo,
  "contact-form": SnippetContactForm,
  "stat-row": SnippetStatRow,
  "stat-grid": SnippetStatGrid,
  "image-grid": SnippetImageGrid,
  "team-grid": SnippetTeamGrid,
  "logo-row": SnippetLogoRow,
  spacer: SnippetSpacer,
  divider: SnippetDivider,
};

// ─── Recursive snippet renderer ───────────────────────────────────────────────

export interface SnippetRendererProps {
  snippet: SnippetDefinition;
  content: Record<string, unknown>;
  /** Highlight for editor selection */
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function SnippetRenderer({ snippet, content, selected, onSelect }: SnippetRendererProps) {
  const Component = SNIPPET_REGISTRY[snippet.type];
  const resolvedProps = resolveProps(snippet.props, content);

  const handleClick = onSelect
    ? (e: React.MouseEvent) => { e.stopPropagation(); onSelect(snippet.id); }
    : undefined;

  if (!Component) {
    return (
      <div className="text-xs text-orange-500 border border-dashed border-orange-300 p-2 rounded">
        Snippet inconnu: {snippet.type}
      </div>
    );
  }

  // Handle flex-col / flex-row containers with children
  if ((snippet.type === "flex-col" || snippet.type === "flex-row") && snippet.children) {
    return (
      <div
        className={snippet.type === "flex-row" ? "flex flex-row flex-wrap" : "flex flex-col"}
        style={{
          gap: (resolvedProps.gap as string) ?? "var(--element-gap)",
          flex: resolvedProps.flex as string | number | undefined,
        }}
        onClick={handleClick}
      >
        {snippet.children.map((child) => (
          <SnippetRenderer key={child.id} snippet={child} content={content} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      style={selected ? { outline: "2px solid #3b82f6", outlineOffset: "2px", borderRadius: "4px" } : undefined}
    >
      <Component {...resolvedProps} />
    </div>
  );
}

export { SNIPPET_REGISTRY };
export {
  SnippetHeading,
  SnippetParagraph,
  SnippetBadge,
  SnippetButton,
  SnippetButtonGroup,
  SnippetImage,
  SnippetCardGrid,
  SnippetTestimonialGrid,
  SnippetFaqAccordion,
  SnippetContactInfo,
  SnippetContactForm,
  SnippetStatRow,
  SnippetStatGrid,
  SnippetImageGrid,
  SnippetTeamGrid,
  SnippetLogoRow,
  SnippetSpacer,
  SnippetDivider,
};
