import type { SignatureData } from "@/components/messaging/SignatureSettings";

// Rendu volontairement minimal : l'email doit ressembler à un message écrit
// à la main dans un client mail classique (pas de gabarit de marque, pas de
// couleurs, pas de mise en forme superflue).
const BODY_STYLE = "font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;line-height:1.6;";

/**
 * Converts plain text (with \n line breaks) into simple HTML paragraphs.
 * Double newlines become paragraph breaks; single newlines become <br>.
 */
function textToParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const content = para.trim().replace(/\n/g, "<br>");
      if (!content) return "";
      return `<p style="margin:0 0 16px 0;">${content}</p>`;
    })
    .filter(Boolean)
    .join("");
}

function signatureLines(sig: SignatureData): { text: string; href?: string }[] {
  const fullName = [sig.first_name, sig.last_name].filter(Boolean).join(" ");
  const titleLine = [sig.job_title, sig.company].filter(Boolean).join(" — ");
  const lines: { text: string; href?: string }[] = [];
  if (fullName) lines.push({ text: fullName });
  if (titleLine) lines.push({ text: titleLine });
  if (sig.phone) lines.push({ text: sig.phone });
  if (sig.website) lines.push({ text: sig.website.replace(/^https?:\/\//, ""), href: sig.website });
  if (sig.linkedin_url)
    lines.push({ text: sig.linkedin_url.replace(/^https?:\/\//, ""), href: sig.linkedin_url });
  return lines;
}

/**
 * Plain signature, like one typed by hand: name, role, phone, links.
 */
export function buildSignatureHtml(sig: SignatureData): string {
  const lines = signatureLines(sig);
  if (lines.length === 0) return "";
  const html = lines
    .map((l) => (l.href ? `<a href="${l.href}">${l.text}</a>` : l.text))
    .join("<br>");
  return `<p style="margin:24px 0 0 0;">${html}</p>`;
}

/** Same signature content as plain text (for the text/plain part). */
export function buildSignatureText(sig: SignatureData): string {
  const lines = signatureLines(sig);
  if (lines.length === 0) return "";
  return lines.map((l) => l.text).join("\n");
}

/**
 * Wraps a plain-text email body + optional signature in minimal HTML —
 * no header, no footer, no card, no background.
 */
export function wrapEmailBodyHtml(body: string, sig: SignatureData | null): string {
  const bodyHtml = textToParagraphs(body);
  const sigHtml = sig ? buildSignatureHtml(sig) : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="${BODY_STYLE}">
${bodyHtml}
${sigHtml}
</div>
</body>
</html>`;
}

/**
 * Async wrapper kept for compatibility with existing callers.
 */
export async function renderEmailHtml(
  body: string,
  signature?: SignatureData | null
): Promise<string> {
  return wrapEmailBodyHtml(body, signature ?? null);
}
