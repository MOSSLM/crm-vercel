import { SITE_DOMAIN, normalizeHost } from "@/lib/site-domain";

/**
 * Normalise une saisie opérateur vers le label stocké dans `published_subdomain`.
 * Accepte `technichaudfroid`, `technichaudfroid.samadigitalstudio.fr` ou l'URL
 * complète, mais refuse les domaines extérieurs pour éviter de confondre
 * sous-domaine démo et domaine client (`published_domain`).
 */
export function normalizePublishedSubdomainInput(input: string, siteDomain: string = SITE_DOMAIN): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  const withoutProtocol = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const hostOrLabel = withoutProtocol.split(/[/?#]/)[0]?.split(":")[0] ?? "";
  const cleaned = normalizeHost(hostOrLabel);
  if (!cleaned) return null;

  const suffix = `.${siteDomain}`;
  const label = cleaned.endsWith(suffix) ? cleaned.slice(0, -suffix.length) : cleaned;
  if (label.includes(".")) return null;

  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || null;
}
