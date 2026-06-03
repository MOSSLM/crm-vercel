// =====================================================================
// Google PageSpeed Insights (Lighthouse) — score de performance mobile
// =====================================================================
// Best-effort, optionnel : n'est appelé que si PAGESPEED_API_KEY est défini
// dans les secrets de l'edge function (l'API est lente — 10 à 30s — et
// limitée sans clé). Sert à pré-détecter le problème « site lent ».
//
// Doc: https://developers.google.com/speed/docs/insights/v5/get-started
// =====================================================================

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Retourne le score de performance mobile (0..1) ou null si indisponible.
 */
export async function fetchPageSpeedPerf(
  url: string | null | undefined,
  apiKey: string,
  timeoutMs = 25000,
): Promise<number | null> {
  if (!url || !apiKey) return null;

  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const qs = new URLSearchParams({
    url: target,
    strategy: "mobile",
    category: "performance",
    key: apiKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PSI_ENDPOINT}?${qs.toString()}`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`PageSpeed non-OK ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const score = data?.lighthouseResult?.categories?.performance?.score;
    return typeof score === "number" ? score : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`PageSpeed fetch error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
