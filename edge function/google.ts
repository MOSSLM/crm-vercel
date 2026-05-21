// =====================================================================
// Google Places API (New) — récupération des reviews et infos
// =====================================================================
// Doc: https://developers.google.com/maps/documentation/places/web-service/place-details
// Nécessite GOOGLE_PLACES_API_KEY dans les secrets de l'edge function.
// Utilise la nouvelle API v1 (Place Details endpoint).
// =====================================================================

import type { GooglePlaceData, GoogleReview } from "./types.ts";

const PLACES_V1_BASE = "https://places.googleapis.com/v1/places/";

/**
 * Extrait le place_id d'une URL Google Maps.
 * Formats supportés :
 *   - https://www.google.com/maps/place/.../data=!...!1s0x...:0x...
 *   - https://maps.google.com/?cid=...
 *   - https://www.google.com/maps/place/?q=place_id:ChIJ...
 *   - URLs courtes https://maps.app.goo.gl/... (celles-là, on ne peut pas sans résoudre)
 * En général, si on a déjà le place_id stocké dans entreprises.google_place_id,
 * on l'utilise en priorité.
 */
export function extractPlaceIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  // Cas direct: place_id:ChIJ...
  const mDirect = url.match(/place_id[:=]([A-Za-z0-9_-]{20,})/);
  if (mDirect) return mDirect[1];
  // Format ftid=0x...:0x... peut être converti mais nécessite un appel supplémentaire
  // On retourne null pour ce cas, le caller utilisera google_place_id de la DB
  return null;
}

/**
 * Récupère les infos d'un lieu Google via Places API v1.
 * On demande uniquement les champs dont on a besoin (fieldMask) pour
 * minimiser le coût.
 */
export async function fetchGooglePlace(
  placeId: string,
  apiKey: string,
  timeoutMs = 10000,
): Promise<GooglePlaceData | null> {
  if (!placeId || !apiKey) return null;

  const url = `${PLACES_V1_BASE}${encodeURIComponent(placeId)}?languageCode=fr&regionCode=FR`;
  const fieldMask = [
    "displayName",
    "formattedAddress",
    "userRatingCount",
    "reviews",
  ].join(",");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`Google Places non-OK ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }
    const data = await res.json();

    // Parse reviews : on filtre celles à 5 étoiles
    const rawReviews: Array<Record<string, unknown>> = Array.isArray(data.reviews) ? data.reviews : [];
    const reviews_5star: GoogleReview[] = [];
    for (const r of rawReviews) {
      const rating = typeof r.rating === "number" ? r.rating : 0;
      if (rating !== 5) continue;
      const author = (r.authorAttribution as { displayName?: string } | undefined)?.displayName;
      const text = (r.text as { text?: string } | undefined)?.text
        ?? (r.originalText as { text?: string } | undefined)?.text
        ?? null;
      if (!author || !text || text.trim().length < 20) continue; // on ignore les reviews vides
      reviews_5star.push({
        author_name: author,
        text: text.trim(),
        rating: 5,
        time: typeof r.publishTime === "string" ? Date.parse(r.publishTime) : undefined,
      });
    }

    return {
      formatted_address: typeof data.formattedAddress === "string" ? data.formattedAddress : null,
      total_reviews: typeof data.userRatingCount === "number" ? data.userRatingCount : null,
      reviews_5star,
      name: (data.displayName as { text?: string } | undefined)?.text ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`Google Places fetch error: ${msg}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Résout le placeId à utiliser :
 *   1. Si entreprises.google_place_id est set → on l'utilise directement
 *   2. Sinon on tente d'extraire depuis google_url ou google_maps_url
 *   3. Sinon null → on skip la partie Google
 */
export function resolvePlaceId(
  google_place_id: string | null,
  google_url: string | null,
  google_maps_url: string | null,
): string | null {
  if (google_place_id && google_place_id.trim().length > 10) return google_place_id.trim();
  const fromUrl = extractPlaceIdFromUrl(google_url) ?? extractPlaceIdFromUrl(google_maps_url);
  return fromUrl;
}
