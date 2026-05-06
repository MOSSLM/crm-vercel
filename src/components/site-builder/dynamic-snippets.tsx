"use client";

import React from "react";
import type { SnippetDefinition } from "@/types";

interface SnippetRendererProps {
  snippet: SnippetDefinition;
  content: Record<string, unknown>;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

function resolveVal(val: unknown, content: Record<string, unknown>): unknown {
  if (typeof val !== "string") return val;
  return val.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const resolved = content[key.trim()];
    return resolved !== undefined && resolved !== null ? String(resolved) : "";
  });
}

export function SnippetRenderer({ snippet, content, selected, onSelect }: SnippetRendererProps) {
  const rp = (key: string) => String(resolveVal(snippet.props[key], content) ?? "");

  const handleClick = onSelect
    ? (e: React.MouseEvent) => { e.stopPropagation(); onSelect(snippet.id); }
    : undefined;

  const editorWrap = (node: React.ReactNode) => (
    <div
      onClick={handleClick}
      style={{ position: "relative", outline: selected ? "2px solid #3b82f6" : undefined, cursor: onSelect ? "pointer" : undefined }}
    >
      {node}
    </div>
  );

  const wrap = onSelect ? editorWrap : (node: React.ReactNode) => <>{node}</>;

  if (snippet.type === "heading") {
    const level = Math.min(Math.max(parseInt(rp("level")) || 2, 1), 6);
    const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    const sizeMap: Record<number, string> = { 1: "2.5rem", 2: "2rem", 3: "1.5rem", 4: "1.25rem", 5: "1.1rem", 6: "1rem" };
    return wrap(
      <Tag style={{ fontFamily: "var(--font-heading)", fontSize: sizeMap[level] ?? "2rem", fontWeight: 700, color: rp("color") || "var(--color-text)", textAlign: (rp("align") as React.CSSProperties["textAlign"]) || "left", lineHeight: 1.2, margin: 0 }}>
        {rp("text")}
      </Tag>
    );
  }

  if (snippet.type === "paragraph") {
    return wrap(
      <p style={{ fontFamily: "var(--font-body)", color: rp("color") || "var(--color-text-muted)", textAlign: (rp("align") as React.CSSProperties["textAlign"]) || "left", maxWidth: rp("maxWidth") || undefined, margin: rp("align") === "center" ? "0 auto" : 0, lineHeight: 1.7 }}>
        {rp("text")}
      </p>
    );
  }

  if (snippet.type === "badge") {
    return wrap(
      <div style={{ textAlign: (rp("align") as React.CSSProperties["textAlign"]) || "left" }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: "9999px", fontSize: "0.875rem", fontWeight: 600, backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)", color: "var(--color-primary)" }}>
          {rp("text")}
        </span>
      </div>
    );
  }

  if (snippet.type === "button") {
    return wrap(
      <a href={rp("href") || "#"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "var(--btn-padding)", borderRadius: "var(--btn-radius)", backgroundColor: "var(--color-primary)", color: "#fff", textDecoration: "none", fontWeight: 600, border: "2px solid var(--color-primary)" }}>
        {rp("text")}
      </a>
    );
  }

  if (snippet.type === "button-group") {
    const buttons = (snippet.props.buttons ?? []) as Array<{ text?: string; href?: string; variant?: string }>;
    return wrap(
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
        {buttons.map((btn, i) => (
          <a key={i} href={btn.href || "#"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "var(--btn-padding)", borderRadius: "var(--btn-radius)", backgroundColor: btn.variant === "outline" ? "transparent" : "var(--color-primary)", color: btn.variant === "outline" ? "var(--color-primary)" : "#fff", textDecoration: "none", fontWeight: 600, border: "2px solid var(--color-primary)" }}>
            {btn.text}
          </a>
        ))}
      </div>
    );
  }

  if (snippet.type === "image") {
    const src = rp("src");
    if (!src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return wrap(<img src={src} alt={rp("alt")} style={{ width: rp("width") || "100%", borderRadius: rp("borderRadius") || "var(--card-radius)", display: "block", objectFit: "cover" }} />);
  }

  if (snippet.type === "flex-col" && snippet.children) {
    return wrap(
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--element-gap)", flex: snippet.props.flex as number | undefined }}>
        {snippet.children.map((child) => (
          <SnippetRenderer key={child.id} snippet={child} content={content} />
        ))}
      </div>
    );
  }

  if (snippet.type === "flex-row" && snippet.children) {
    return wrap(
      <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: "var(--element-gap)", alignItems: "center" }}>
        {snippet.children.map((child) => (
          <SnippetRenderer key={child.id} snippet={child} content={content} />
        ))}
      </div>
    );
  }

  if (snippet.type === "card-grid") {
    const cards = (content[snippet.props.cards as string] ?? snippet.props.cards) as Array<{ icon?: string; title?: string; description?: string }> ?? [];
    const cols = Number(snippet.props.columns) || 3;
    return wrap(
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "var(--element-gap)", width: "100%" }}>
        {cards.map((card, i) => (
          <div key={i} style={{ backgroundColor: "var(--color-bg-alt)", borderRadius: "var(--card-radius)", padding: "var(--card-padding)", display: "flex", flexDirection: "column", gap: "12px" }}>
            {card.title && <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>{card.title}</h3>}
            {card.description && <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", lineHeight: 1.6, margin: 0 }}>{card.description}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "testimonial-grid") {
    const testimonials = (content[snippet.props.testimonials as string] ?? snippet.props.testimonials) as Array<{ name?: string; role?: string; text?: string; rating?: number }> ?? [];
    const cols = Number(snippet.props.columns) || 3;
    return wrap(
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "var(--element-gap)", width: "100%" }}>
        {testimonials.map((t, i) => (
          <div key={i} style={{ backgroundColor: "var(--color-bg-alt)", borderRadius: "var(--card-radius)", padding: "var(--card-padding)" }}>
            {t.rating && <div style={{ color: "#f59e0b", marginBottom: "8px" }}>{"★".repeat(t.rating)}</div>}
            {t.text && <p style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontSize: "0.875rem", margin: "0 0 12px 0" }}>"{t.text}"</p>}
            {t.name && <div style={{ fontWeight: 600, color: "var(--color-text)", fontSize: "0.875rem" }}>{t.name}</div>}
            {t.role && <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>{t.role}</div>}
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "stat-grid") {
    const stats = (content[snippet.props.stats as string] ?? snippet.props.stats) as Array<{ value?: string; label?: string }> ?? [];
    const cols = Number(snippet.props.columns) || 4;
    return wrap(
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "var(--element-gap)", width: "100%" }}>
        {stats.map((s, i) => (
          <div key={i} style={{ textAlign: "center", padding: "24px", backgroundColor: "var(--color-bg-alt)", borderRadius: "var(--card-radius)" }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-primary)", fontFamily: "var(--font-heading)" }}>{s.value}</div>
            <div style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginTop: "4px" }}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "stat-row") {
    const stats = (content[snippet.props.stats as string] ?? snippet.props.stats) as Array<{ value?: string; label?: string }> ?? [];
    return wrap(
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--element-gap)", justifyContent: "center", width: "100%" }}>
        {stats.map((s, i) => (
          <div key={i} style={{ textAlign: "center", minWidth: "120px" }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-primary)", fontFamily: "var(--font-heading)" }}>{s.value}</div>
            <div style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginTop: "4px" }}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "faq-accordion") {
    const faqs = (content[snippet.props.items as string] ?? snippet.props.items) as Array<{ question?: string; answer?: string }> ?? [];
    return wrap(
      <div style={{ width: "100%", maxWidth: "768px", margin: "0 auto" }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: "1px solid var(--color-bg-alt)", padding: "16px 0" }}>
            <div style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: "8px" }}>{faq.question}</div>
            <div style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>{faq.answer}</div>
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "contact-form") {
    return wrap(
      <form style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "480px", width: "100%" }} onSubmit={(e) => e.preventDefault()}>
        <input placeholder={rp("namePlaceholder") || "Votre nom"} style={{ padding: "10px 14px", borderRadius: "var(--btn-radius)", border: "1px solid var(--color-bg-alt)", fontFamily: "var(--font-body)", fontSize: "1rem", color: "var(--color-text)", backgroundColor: "var(--color-background)" }} />
        <input type="email" placeholder={rp("emailPlaceholder") || "Votre email"} style={{ padding: "10px 14px", borderRadius: "var(--btn-radius)", border: "1px solid var(--color-bg-alt)", fontFamily: "var(--font-body)", fontSize: "1rem", color: "var(--color-text)", backgroundColor: "var(--color-background)" }} />
        <textarea rows={4} placeholder={rp("messagePlaceholder") || "Votre message"} style={{ padding: "10px 14px", borderRadius: "var(--btn-radius)", border: "1px solid var(--color-bg-alt)", fontFamily: "var(--font-body)", fontSize: "1rem", color: "var(--color-text)", backgroundColor: "var(--color-background)", resize: "vertical" }} />
        <button type="submit" style={{ padding: "var(--btn-padding)", borderRadius: "var(--btn-radius)", backgroundColor: "var(--color-primary)", color: "#fff", fontWeight: 600, border: "none", cursor: "pointer" }}>
          {rp("submitText") || "Envoyer"}
        </button>
      </form>
    );
  }

  if (snippet.type === "contact-info") {
    return wrap(
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {rp("phone") && <div style={{ color: "var(--color-text)", fontSize: "0.875rem" }}>📞 <a href={`tel:${rp("phone")}`} style={{ color: "inherit" }}>{rp("phone")}</a></div>}
        {rp("email") && <div style={{ color: "var(--color-text)", fontSize: "0.875rem" }}>✉️ <a href={`mailto:${rp("email")}`} style={{ color: "inherit" }}>{rp("email")}</a></div>}
        {rp("address") && <div style={{ color: "var(--color-text)", fontSize: "0.875rem" }}>📍 {rp("address")}</div>}
      </div>
    );
  }

  if (snippet.type === "logo-row") {
    const logos = (content[snippet.props.logos as string] ?? snippet.props.logos) as Array<{ src?: string; alt?: string }> ?? [];
    return wrap(
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--element-gap)", alignItems: "center", justifyContent: "center", width: "100%", opacity: 0.6 }}>
        {logos.map((logo, i) =>
          logo.src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img key={i} src={logo.src} alt={logo.alt ?? ""} style={{ height: "40px", objectFit: "contain" }} />
            : null
        )}
      </div>
    );
  }

  if (snippet.type === "team-grid") {
    const members = (content[snippet.props.members as string] ?? snippet.props.members) as Array<{ name?: string; role?: string; image?: string }> ?? [];
    const cols = Number(snippet.props.columns) || 3;
    return wrap(
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "var(--element-gap)", width: "100%" }}>
        {members.map((m, i) => (
          <div key={i} style={{ textAlign: "center", backgroundColor: "var(--color-bg-alt)", borderRadius: "var(--card-radius)", padding: "var(--card-padding)" }}>
            {m.image && <img src={m.image} alt={m.name ?? ""} style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", margin: "0 auto 12px" }} />}
            {m.name && <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{m.name}</div>}
            {m.role && <div style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>{m.role}</div>}
          </div>
        ))}
      </div>
    );
  }

  if (snippet.type === "image-grid") {
    const images = (content[snippet.props.images as string] ?? snippet.props.images) as Array<{ src?: string; alt?: string }> ?? [];
    const cols = Number(snippet.props.columns) || 3;
    return wrap(
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "var(--element-gap)", width: "100%" }}>
        {images.map((img, i) =>
          img.src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img key={i} src={img.src} alt={img.alt ?? ""} style={{ width: "100%", borderRadius: "var(--card-radius)", objectFit: "cover", display: "block" }} />
            : null
        )}
      </div>
    );
  }

  if (snippet.type === "video") {
    const src = rp("src");
    if (!src) return null;
    return wrap(
      <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: "var(--card-radius)", overflow: "hidden" }}>
        <iframe src={src} title={rp("title") || "Video"} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen />
      </div>
    );
  }

  if (snippet.type === "spacer") {
    const height = rp("height") || "var(--section-padding)";
    return <div style={{ height }} />;
  }

  if (snippet.type === "divider") {
    return wrap(<hr style={{ border: "none", borderTop: `1px solid var(--color-bg-alt)`, width: "100%", margin: 0 }} />);
  }

  if (snippet.type === "icon") {
    return wrap(
      <div style={{ fontSize: rp("size") || "2rem", color: rp("color") || "var(--color-primary)", textAlign: (rp("align") as React.CSSProperties["textAlign"]) || "left" }}>
        {rp("value")}
      </div>
    );
  }

  if (snippet.type === "card") {
    return wrap(
      <div style={{ backgroundColor: "var(--color-bg-alt)", borderRadius: "var(--card-radius)", padding: "var(--card-padding)", boxShadow: "var(--card-shadow)", display: "flex", flexDirection: "column", gap: "12px" }}>
        {snippet.children?.map((child) => (
          <SnippetRenderer key={child.id} snippet={child} content={content} />
        ))}
      </div>
    );
  }

  if (snippet.type === "custom") {
    const html = rp("html");
    if (html) return wrap(<div dangerouslySetInnerHTML={{ __html: html }} />);
    return null;
  }

  return null;
}
