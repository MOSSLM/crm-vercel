import type { SignatureData } from "@/components/messaging/SignatureSettings";

// SAMA brand tokens (email-safe, no CSS variables)
const NUIT  = "#0B1D3A";
const AZUR  = "#3A7BD5";
const CREME = "#F4F1EB";

/**
 * Converts plain text (with \n line breaks) into email-safe HTML paragraphs.
 * Double newlines become paragraph breaks; single newlines become <br>.
 */
function textToParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const content = para.trim().replace(/\n/g, "<br>");
      if (!content) return "";
      return `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:rgba(11,29,58,0.8);line-height:1.75;">${content}</p>`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * Generates a table-based email signature compatible with major email clients.
 * Design: SAMA visual identity — gradient bar, Georgia name, uppercase title, contact rows.
 */
export function buildSignatureHtml(sig: SignatureData): string {
  const fullName  = [sig.first_name, sig.last_name].filter(Boolean).join(" ");
  if (!fullName && !sig.job_title && !sig.email && !sig.phone) return "";

  const color     = sig.accent_color || AZUR;
  const titleLine = [sig.job_title, sig.company].filter(Boolean).join(" · ");

  const contactRows = [
    sig.email
      ? `<p style="margin:0 0 3px 0;font-size:11px;color:rgba(11,29,58,0.6);">📧&nbsp;<a href="mailto:${sig.email}" style="color:rgba(11,29,58,0.6);text-decoration:none;">${sig.email}</a></p>`
      : "",
    sig.phone
      ? `<p style="margin:0 0 3px 0;font-size:11px;color:rgba(11,29,58,0.6);">📞&nbsp;${sig.phone}</p>`
      : "",
    sig.website
      ? `<p style="margin:0 0 3px 0;font-size:11px;color:rgba(11,29,58,0.6);">🌐&nbsp;<a href="${sig.website}" style="color:rgba(11,29,58,0.6);text-decoration:none;">${sig.website.replace(/^https?:\/\//, "")}</a></p>`
      : "",
    sig.linkedin_url
      ? `<p style="margin:0;font-size:11px;color:rgba(11,29,58,0.6);">🔗&nbsp;<a href="${sig.linkedin_url}" style="color:rgba(11,29,58,0.6);text-decoration:none;">LinkedIn</a></p>`
      : "",
  ].filter(Boolean).join("");

  const rightCol = sig.company
    ? `<td style="padding-left:20px;border-left:1px solid #e8e8e8;text-align:center;vertical-align:bottom;">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:10px;letter-spacing:0.32em;color:${NUIT};text-transform:uppercase;">${sig.company}</p>
        <p style="margin:6px 0 0 0;font-size:8px;color:rgba(11,29,58,0.35);line-height:1.5;max-width:110px;">Des sites qui g&eacute;n&egrave;rent des clients.</p>
      </td>`
    : "";

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;margin-top:20px;padding-top:16px;border-top:1px solid rgba(11,29,58,0.1);">
  <tr>
    <td style="width:3px;background:${color};padding:0;vertical-align:top;">&nbsp;&nbsp;</td>
    <td style="padding:0 20px 0 14px;vertical-align:top;">
      ${fullName ? `<p style="margin:0 0 3px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${NUIT};line-height:1.2;">${fullName}</p>` : ""}
      ${titleLine ? `<p style="margin:0 0 10px 0;font-size:9px;font-weight:bold;letter-spacing:0.2em;text-transform:uppercase;color:${color};">${titleLine}</p>` : ""}
      ${contactRows}
    </td>
    ${rightCol}
  </tr>
</table>`;
}

/**
 * Wraps a plain-text email body + optional signature in a full SAMA-branded
 * HTML email template (table-based, email-client compatible).
 */
export function wrapEmailBodyHtml(body: string, sig: SignatureData | null): string {
  const bodyHtml = textToParagraphs(body);
  const sigHtml  = sig ? buildSignatureHtml(sig) : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f0ede6;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0ede6;padding:32px 16px;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;">

      <!-- HEADER -->
      <tr>
        <td style="background:${NUIT};padding:24px 36px;border-radius:6px 6px 0 0;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:300;font-size:14px;letter-spacing:0.38em;color:rgba(181,208,240,0.75);text-transform:uppercase;">SAMA</p>
          <p style="margin:4px 0 0;font-size:9px;font-weight:bold;letter-spacing:0.18em;text-transform:uppercase;color:${AZUR};font-family:Arial,Helvetica,sans-serif;">Agence Digitale</p>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="background:${CREME};padding:36px;">
          ${bodyHtml}
          ${sigHtml}
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="background:${NUIT};padding:18px 36px;border-radius:0 0 6px 6px;text-align:center;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:rgba(181,208,240,0.3);line-height:1.7;">
            SAMA &middot; Agence Digitale &middot; contact@sama.fr &middot; sama.fr
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;
}
