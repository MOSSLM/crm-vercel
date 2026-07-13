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

/**
 * Un place_id exploitable par l'API Places v1 (ex: "ChIJ...") ne contient ni
 * ":" ni le préfixe hexadécimal "0x". L'ancien format "ftid" 0x...:0x... (celui
 * stocké historiquement en base) est rejeté par v1 → il faut le re-résoudre.
 */
export function isV1PlaceId(id: string | null | undefined): boolean {
  if (!id) return false;
  const t = id.trim();
  if (t.length < 10) return false;
  if (/0x[0-9a-f]+:0x[0-9a-f]+/i.test(t)) return false;
  if (t.includes(":")) return false;
  return true;
}

/**
 * Extrait les coordonnées (lat/lng) d'une URL Google Maps pour biaiser la
 * recherche. Formats courants : "@48.85,2.35,17z" et "!3d48.85!4d2.35".
 */
export function extractLatLngFromUrl(url: string | null): { lat: number; lng: number } | null {
  if (!url) return null;
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Garde-fou anti-mauvaise-entreprise : on n'accepte un résultat de recherche que
 * s'il partage un mot significatif avec le nom, ou si son adresse contient la ville.
 */
function looksLikeSameBusiness(
  companyName: string,
  ville: string | null,
  foundName: string,
  foundAddress: string | null,
): boolean {
  const nameTokens = new Set(
    companyName.split(/\s+/).map(normalizeToken).filter((t) => t.length >= 4),
  );
  for (const t of foundName.split(/\s+/).map(normalizeToken)) {
    if (t.length >= 4 && nameTokens.has(t)) return true;
  }
  if (ville && foundAddress) {
    const v = normalizeToken(ville);
    if (v.length >= 3 && normalizeToken(foundAddress).includes(v)) return true;
  }
  return false;
}

/**
 * Résout un place_id v1 par recherche texte (nom + ville) via Places Text Search
 * (New). Utilisé quand le place_id stocké est un ftid hérité ou absent.
 * Best-effort : renvoie null au moindre doute (aucun résultat, mauvais match,
 * erreur) pour ne jamais associer les avis d'une autre entreprise.
 */
export async function searchPlaceId(
  companyName: string | null,
  ville: string | null,
  apiKey: string,
  locationBias: { lat: number; lng: number } | null = null,
  timeoutMs = 10000,
): Promise<string | null> {
  if (!apiKey || !companyName || companyName.trim().length < 2) return null;
  const textQuery = [companyName.trim(), ville?.trim(), "France"].filter(Boolean).join(" ");

  const body: Record<string, unknown> = {
    textQuery,
    languageCode: "fr",
    regionCode: "FR",
    maxResultCount: 1,
  };
  // Biais de localisation (coordonnées issues de l'URL Google) : améliore la
  // précision du match et réduit le risque de tomber sur un homonyme ailleurs.
  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: 20000,
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`Google Places searchText non-OK ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const place = Array.isArray(data.places) ? data.places[0] : null;
    const id = place?.id;
    if (typeof id !== "string" || id.length === 0) return null;
    const foundName = (place.displayName as { text?: string } | undefined)?.text ?? "";
    const foundAddress = typeof place.formattedAddress === "string" ? place.formattedAddress : null;
    if (!looksLikeSameBusiness(companyName, ville, foundName, foundAddress)) {
      console.warn(`Google Places searchText: "${foundName}" ne matche pas "${companyName}" — ignoré`);
      return null;
    }
    return id;
  } catch (e) {
    console.warn(`Google Places searchText error: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}