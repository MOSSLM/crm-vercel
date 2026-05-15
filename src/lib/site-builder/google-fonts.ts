/**
 * Shared Google Fonts loader for the site builder.
 *
 * Both the editor iframe (LibrarySectionIframe) and the deployed public
 * layout (ThemeLayout) must load the same font families so headings/body
 * fonts match between live preview and the live site.
 */

export const SYSTEM_FONTS = new Set([
  "inter", "arial", "helvetica", "helvetica neue", "georgia", "times", "times new roman",
  "courier", "courier new", "verdana", "trebuchet ms", "tahoma", "impact", "comic sans ms",
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "-apple-system",
  "blinkmacsystemfont", "segoe ui", "roboto", "oxygen", "ubuntu", "cantarell", "open sans",
  "fira sans", "droid sans", "inherit", "initial", "unset",
]);

export interface GoogleFontFamilies {
  heading?: string;
  body?: string;
}

/** Returns the Google Fonts stylesheet href for the given families,
 *  or null if no non-system fonts need loading. */
export function getGoogleFontsHref(fonts: GoogleFontFamilies): string | null {
  const families = [...new Set([fonts.heading, fonts.body])]
    .map((f) => f?.trim())
    .filter((f): f is string => !!f && !SYSTEM_FONTS.has(f.toLowerCase()));
  if (families.length === 0) return null;
  const query = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

/** Returns the full HTML <link> markup for Google Fonts (preconnects + stylesheet).
 *  Used by the iframe shell (string-injected). */
export function buildGoogleFontsLinks(fonts: GoogleFontFamilies | undefined): string {
  if (!fonts) return "";
  const href = getGoogleFontsHref(fonts);
  if (!href) return "";
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${href}" rel="stylesheet">`;
}
