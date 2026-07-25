import { preflight } from "@/app/api/_lib/cors";
import { createBooking } from "@/lib/scheduling/booking";
import { getServiceClient } from "@/app/api/_lib/service-client";
import type { BookingAnswer } from "@/lib/scheduling/types";
import { publicBookingCreateSchema, publicBookingProjection } from "@/app/api/scheduling/_lib";
import { loadPublicEventType, publicJson } from "../_lib";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req, { allowAny: true });

/**
 * Création d'une réservation par un invité SANS COMPTE.
 * La dispo est revérifiée côté serveur et la contrainte d'exclusion GiST
 * garantit qu'aucun double-booking ne passe, même sous concurrence.
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return publicJson(req, { error: "invalid_body" }, 400);
  }
  const parsed = publicBookingCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return publicJson(req, { error: "invalid_body", details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;

  const loaded = await loadPublicEventType(body.username, body.event_slug);
  if (!loaded) return publicJson(req, { error: "not_found" }, 404);
  const { page, eventType } = loaded;

  const start = new Date(body.start);
  if (Number.isNaN(start.getTime())) return publicJson(req, { error: "invalid_start" }, 400);

  // Questions custom : re-projeter les réponses sur la config serveur
  // (labels de confiance, obligatoires respectés, rien d'inventé).
  const answers: BookingAnswer[] = [];
  const byId = new Map(body.answers.map((a) => [a.id, a.value]));
  for (const q of eventType.custom_questions ?? []) {
    const value = (byId.get(q.id) ?? "").trim();
    if (q.required && !value) {
      return publicJson(req, { error: "missing_answer", question: q.label }, 400);
    }
    if (value) answers.push({ id: q.id, label: q.label, value: value.slice(0, 2000) });
  }

  // Le type « téléphone » exige un numéro (champ dédié ou question phone).
  const phone =
    body.phone?.trim() ||
    answers.find((a) => eventType.custom_questions.find((q) => q.id === a.id)?.type === "phone")
      ?.value ||
    null;
  if (eventType.location_type === "phone" && !phone) {
    return publicJson(req, { error: "phone_required" }, 400);
  }

  const result = await createBooking(getServiceClient(), {
    page,
    eventType,
    startUtc: start,
    invitee: {
      name: body.name.trim(),
      email: body.email.trim(),
      phone,
      notes: body.notes?.trim() || null,
      timezone: body.timezone,
    },
    answers,
    additionalGuests: body.guests.map((g) => g.trim().toLowerCase()),
    source: body.source,
  });

  if (!result.ok) {
    const status = result.error === "slot_taken" || result.error === "slot_unavailable" ? 409 : 500;
    return publicJson(req, { error: result.error }, status);
  }

  return publicJson(
    req,
    {
      booking: publicBookingProjection(result.booking),
      requires_confirmation: result.booking.status === "pending",
      success_redirect_url: eventType.success_redirect_url,
    },
    201,
  );
}
