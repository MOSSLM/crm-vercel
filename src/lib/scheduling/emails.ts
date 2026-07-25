/**
 * Emails transactionnels du module Rendez-vous, envoyés via Resend (notre
 * compte existant — RESEND_API_KEY / RESEND_FROM_EMAIL) et journalisés dans
 * `email_logs` avec type 'scheduling' comme le reste du CRM.
 *
 * L'échec d'un email ne doit JAMAIS faire échouer la réservation : tout est
 * best-effort, les erreurs sont loguées puis avalées.
 */

import { Resend } from "resend";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { buildIcs } from "./ics";
import { formatDurationFr, formatSlotRangeFr } from "./format";
import { LOCATION_LABELS, type LocationType } from "./types";

export interface BookingEmailContext {
  bookingId: string;
  eventTitle: string;
  durationMinutes: number;
  startUtc: Date;
  endUtc: Date;
  locationType: string;
  locationText: string | null;
  meetingUrl: string | null;
  host: { name: string; email: string | null };
  invitee: {
    name: string;
    email: string;
    timezone: string;
    phone?: string | null;
    notes?: string | null;
  };
  hostTimezone: string;
  answers: { label: string; value: string }[];
  additionalGuests: string[];
  manageUrl: string; // page publique reprogrammer/annuler
  dashboardUrl: string; // page hôte dans le CRM
  contactId?: string | null;
  entrepriseId?: number | null;
  /** Incrément ICS (0 création, +1 par modification). */
  icsSequence?: number;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const locationLabel = (ctx: BookingEmailContext): string => {
  const label = LOCATION_LABELS[ctx.locationType as LocationType] ?? ctx.locationType;
  if (ctx.meetingUrl) return `${label} — ${ctx.meetingUrl}`;
  if (ctx.locationText) return `${label} — ${ctx.locationText}`;
  return label;
};

/** Bloc récapitulatif commun (quoi, quand, où, avec qui). */
const detailsHtml = (ctx: BookingEmailContext, timezone: string): string => {
  const rows: [string, string][] = [
    ["Évènement", esc(ctx.eventTitle)],
    ["Date", esc(formatSlotRangeFr(ctx.startUtc, ctx.endUtc, timezone))],
    ["Durée", esc(formatDurationFr(ctx.durationMinutes))],
    ["Lieu", esc(locationLabel(ctx))],
  ];
  if (ctx.invitee.phone) rows.push(["Téléphone", esc(ctx.invitee.phone)]);
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#8A877F;white-space:nowrap;vertical-align:top;">${k}</td>` +
        `<td style="padding:4px 0;color:#14120E;">${v}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;font-size:14px;line-height:1.5;margin:16px 0;">${tr}</table>`;
};

const answersHtml = (ctx: BookingEmailContext): string => {
  const items: string[] = [];
  for (const a of ctx.answers) {
    if (a.value) items.push(`<p style="margin:4px 0;"><strong>${esc(a.label)}</strong><br>${esc(a.value)}</p>`);
  }
  if (ctx.invitee.notes) {
    items.push(`<p style="margin:4px 0;"><strong>Notes de l'invité</strong><br>${esc(ctx.invitee.notes)}</p>`);
  }
  if (items.length === 0) return "";
  return `<div style="margin:16px 0;padding:12px 16px;background:#F4F2EC;border-radius:8px;font-size:14px;">${items.join("")}</div>`;
};

const button = (href: string, label: string, primary = true): string =>
  `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 18px;` +
  `border-radius:8px;font-size:14px;text-decoration:none;` +
  (primary
    ? "background:#E2552B;color:#ffffff;"
    : "background:#ffffff;color:#14120E;border:1px solid #D8D4C8;") +
  `">${esc(label)}</a>`;

/** Gabarit commun : carte sobre, accent orange, footer discret. */
const layout = (title: string, bodyHtml: string): string => `
<div style="background:#FBFAF7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E8E4DA;border-radius:12px;overflow:hidden;">
    <div style="height:4px;background:#E2552B;"></div>
    <div style="padding:24px 28px;">
      <h1 style="margin:0 0 12px 0;font-size:18px;color:#14120E;">${title}</h1>
      ${bodyHtml}
    </div>
  </div>
  <p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#8A877F;text-align:center;">
    Rendez-vous géré automatiquement — merci de ne pas répondre si ce message ne vous concerne pas.
  </p>
</div>`;

export interface SchedulingEmail {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  replyTo?: string;
  icsContent?: string;
  icsMethod?: "REQUEST" | "CANCEL";
}

const icsFor = (
  ctx: BookingEmailContext,
  method: "REQUEST" | "CANCEL",
): string =>
  buildIcs({
    uid: `rdv-${ctx.bookingId}@crm-sama`,
    sequence: ctx.icsSequence ?? 0,
    startUtc: ctx.startUtc,
    endUtc: ctx.endUtc,
    summary: `${ctx.eventTitle} — ${ctx.invitee.name}`,
    description:
      `${ctx.eventTitle} avec ${ctx.host.name}.` +
      (ctx.meetingUrl ? `\nLien visio : ${ctx.meetingUrl}` : "") +
      `\nGérer le rendez-vous : ${ctx.manageUrl}`,
    location: ctx.meetingUrl ?? ctx.locationText ?? undefined,
    url: ctx.meetingUrl ?? undefined,
    organizer: { name: ctx.host.name, email: ctx.host.email ?? "no-reply@resend.dev" },
    attendees: [
      { name: ctx.invitee.name, email: ctx.invitee.email },
      ...ctx.additionalGuests.map((email) => ({ email })),
    ],
    method,
  });

// ---------------------------------------------------------------------------
// Compositions par scénario
// ---------------------------------------------------------------------------

export const confirmedInviteeEmail = (ctx: BookingEmailContext): SchedulingEmail => ({
  to: ctx.invitee.email,
  toName: ctx.invitee.name,
  replyTo: ctx.host.email ?? undefined,
  subject: `Confirmé : ${ctx.eventTitle} avec ${ctx.host.name}`,
  html: layout(
    "Votre rendez-vous est confirmé ✅",
    `<p style="font-size:14px;color:#14120E;">Bonjour ${esc(ctx.invitee.name)},<br>
     votre rendez-vous avec <strong>${esc(ctx.host.name)}</strong> est confirmé.</p>` +
      detailsHtml(ctx, ctx.invitee.timezone) +
      (ctx.meetingUrl ? `<p style="margin:16px 0;">${button(ctx.meetingUrl, "Rejoindre la visio")}</p>` : "") +
      `<p style="margin:20px 0 4px 0;">${button(ctx.manageUrl, "Reprogrammer ou annuler", false)}</p>
       <p style="font-size:12px;color:#8A877F;">L'invitation (.ics) est en pièce jointe — ajoutez-la à votre agenda.</p>`,
  ),
  icsContent: icsFor(ctx, "REQUEST"),
  icsMethod: "REQUEST",
});

export const confirmedHostEmail = (ctx: BookingEmailContext): SchedulingEmail => ({
  to: ctx.host.email ?? "",
  toName: ctx.host.name,
  replyTo: ctx.invitee.email,
  subject: `Nouveau RDV : ${ctx.invitee.name} — ${ctx.eventTitle}`,
  html: layout(
    "Nouvelle réservation 📅",
    `<p style="font-size:14px;color:#14120E;"><strong>${esc(ctx.invitee.name)}</strong>
     (${esc(ctx.invitee.email)}) a réservé un créneau.</p>` +
      detailsHtml(ctx, ctx.hostTimezone) +
      answersHtml(ctx) +
      `<p style="margin:20px 0 4px 0;">${button(ctx.dashboardUrl, "Voir dans le CRM")}</p>`,
  ),
  icsContent: icsFor(ctx, "REQUEST"),
  icsMethod: "REQUEST",
});

export const pendingInviteeEmail = (ctx: BookingEmailContext): SchedulingEmail => ({
  to: ctx.invitee.email,
  toName: ctx.invitee.name,
  replyTo: ctx.host.email ?? undefined,
  subject: `Demande envoyée : ${ctx.eventTitle} avec ${ctx.host.name}`,
  html: layout(
    "Demande de rendez-vous envoyée ⏳",
    `<p style="font-size:14px;color:#14120E;">Bonjour ${esc(ctx.invitee.name)},<br>
     votre demande a bien été transmise à <strong>${esc(ctx.host.name)}</strong>.
     Vous recevrez un email dès qu'elle sera confirmée.</p>` +
      detailsHtml(ctx, ctx.invitee.timezone) +
      `<p style="margin:20px 0 4px 0;">${button(ctx.manageUrl, "Modifier ou annuler la demande", false)}</p>`,
  ),
});

export const pendingHostEmail = (ctx: BookingEmailContext): SchedulingEmail => ({
  to: ctx.host.email ?? "",
  toName: ctx.host.name,
  replyTo: ctx.invitee.email,
  subject: `À valider : ${ctx.invitee.name} — ${ctx.eventTitle}`,
  html: layout(
    "Demande de rendez-vous à valider ⏳",
    `<p style="font-size:14px;color:#14120E;"><strong>${esc(ctx.invitee.name)}</strong>
     (${esc(ctx.invitee.email)}) demande un créneau. Confirmez ou refusez depuis le CRM.</p>` +
      detailsHtml(ctx, ctx.hostTimezone) +
      answersHtml(ctx) +
      `<p style="margin:20px 0 4px 0;">${button(ctx.dashboardUrl, "Confirmer ou refuser")}</p>`,
  ),
});

export const declinedInviteeEmail = (ctx: BookingEmailContext, reason?: string | null): SchedulingEmail => ({
  to: ctx.invitee.email,
  toName: ctx.invitee.name,
  replyTo: ctx.host.email ?? undefined,
  subject: `Demande refusée : ${ctx.eventTitle}`,
  html: layout(
    "Demande de rendez-vous refusée",
    `<p style="font-size:14px;color:#14120E;">Bonjour ${esc(ctx.invitee.name)},<br>
     ${esc(ctx.host.name)} n'a pas pu accepter ce créneau.</p>` +
      (reason ? `<p style="font-size:14px;color:#14120E;">Motif : ${esc(reason)}</p>` : "") +
      detailsHtml(ctx, ctx.invitee.timezone),
  ),
});

export const cancelledEmail = (
  ctx: BookingEmailContext,
  recipient: "invitee" | "host",
  cancelledBy: "invitee" | "host",
  reason?: string | null,
): SchedulingEmail => {
  const toInvitee = recipient === "invitee";
  const who = cancelledBy === "invitee" ? esc(ctx.invitee.name) : esc(ctx.host.name);
  return {
    to: toInvitee ? ctx.invitee.email : ctx.host.email ?? "",
    toName: toInvitee ? ctx.invitee.name : ctx.host.name,
    replyTo: toInvitee ? ctx.host.email ?? undefined : ctx.invitee.email,
    subject: `Annulé : ${ctx.eventTitle} du ${formatSlotRangeFr(
      ctx.startUtc,
      ctx.endUtc,
      toInvitee ? ctx.invitee.timezone : ctx.hostTimezone,
    )}`,
    html: layout(
      "Rendez-vous annulé ❌",
      `<p style="font-size:14px;color:#14120E;">Ce rendez-vous a été annulé par ${who}.</p>` +
        (reason ? `<p style="font-size:14px;color:#14120E;">Motif : ${esc(reason)}</p>` : "") +
        detailsHtml(ctx, toInvitee ? ctx.invitee.timezone : ctx.hostTimezone) +
        (toInvitee ? "" : `<p style="margin:20px 0 4px 0;">${button(ctx.dashboardUrl, "Voir dans le CRM", false)}</p>`),
    ),
    icsContent: icsFor(ctx, "CANCEL"),
    icsMethod: "CANCEL",
  };
};

export const rescheduledEmail = (
  ctx: BookingEmailContext,
  recipient: "invitee" | "host",
  oldStartUtc: Date,
  oldEndUtc: Date,
): SchedulingEmail => {
  const toInvitee = recipient === "invitee";
  const tz = toInvitee ? ctx.invitee.timezone : ctx.hostTimezone;
  return {
    to: toInvitee ? ctx.invitee.email : ctx.host.email ?? "",
    toName: toInvitee ? ctx.invitee.name : ctx.host.name,
    replyTo: toInvitee ? ctx.host.email ?? undefined : ctx.invitee.email,
    subject: `Reprogrammé : ${ctx.eventTitle} — ${formatSlotRangeFr(ctx.startUtc, ctx.endUtc, tz)}`,
    html: layout(
      "Rendez-vous reprogrammé 🔁",
      `<p style="font-size:14px;color:#14120E;">Ancien créneau :
        <s>${esc(formatSlotRangeFr(oldStartUtc, oldEndUtc, tz))}</s></p>` +
        detailsHtml(ctx, tz) +
        (ctx.meetingUrl && toInvitee
          ? `<p style="margin:16px 0;">${button(ctx.meetingUrl, "Rejoindre la visio")}</p>`
          : "") +
        `<p style="margin:20px 0 4px 0;">${
          toInvitee
            ? button(ctx.manageUrl, "Reprogrammer ou annuler", false)
            : button(ctx.dashboardUrl, "Voir dans le CRM", false)
        }</p>`,
    ),
    icsContent: icsFor(ctx, "REQUEST"),
    icsMethod: "REQUEST",
  };
};

export const reminderEmail = (
  ctx: BookingEmailContext,
  recipient: "invitee" | "host",
): SchedulingEmail => {
  const toInvitee = recipient === "invitee";
  const tz = toInvitee ? ctx.invitee.timezone : ctx.hostTimezone;
  return {
    to: toInvitee ? ctx.invitee.email : ctx.host.email ?? "",
    toName: toInvitee ? ctx.invitee.name : ctx.host.name,
    replyTo: toInvitee ? ctx.host.email ?? undefined : ctx.invitee.email,
    subject: `Rappel : ${ctx.eventTitle} — ${formatSlotRangeFr(ctx.startUtc, ctx.endUtc, tz)}`,
    html: layout(
      "Rappel de rendez-vous ⏰",
      `<p style="font-size:14px;color:#14120E;">${
        toInvitee
          ? `Votre rendez-vous avec <strong>${esc(ctx.host.name)}</strong> approche.`
          : `Rendez-vous à venir avec <strong>${esc(ctx.invitee.name)}</strong>.`
      }</p>` +
        detailsHtml(ctx, tz) +
        (ctx.meetingUrl ? `<p style="margin:16px 0;">${button(ctx.meetingUrl, "Rejoindre la visio")}</p>` : "") +
        (toInvitee ? `<p style="margin:20px 0 4px 0;">${button(ctx.manageUrl, "Reprogrammer ou annuler", false)}</p>` : ""),
    ),
  };
};

// ---------------------------------------------------------------------------
// Envoi + journalisation
// ---------------------------------------------------------------------------

/**
 * Envoie un email de scheduling via Resend et le journalise dans email_logs.
 * Best-effort : renvoie false si la clé manque ou si l'envoi échoue.
 */
export async function sendSchedulingEmail(
  email: SchedulingEmail,
  log: { contactId?: string | null; entrepriseId?: number | null } = {},
): Promise<boolean> {
  if (!email.to) return false;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[scheduling/emails] RESEND_API_KEY absent — email non envoyé:", email.subject);
    return false;
  }
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const resend = new Resend(apiKey);

  let resendId: string | undefined;
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | undefined;

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: email.toName ? `${email.toName} <${email.to}>` : email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
      attachments: email.icsContent
        ? [
            {
              filename: email.icsMethod === "CANCEL" ? "annulation.ics" : "invitation.ics",
              content: Buffer.from(email.icsContent, "utf8").toString("base64"),
              contentType: `text/calendar; method=${email.icsMethod ?? "REQUEST"}; charset=UTF-8`,
            },
          ]
        : undefined,
    });
    if (result.error) {
      status = "failed";
      errorMessage = result.error.message;
    } else {
      resendId = result.data?.id;
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
  }

  try {
    await getServiceClient().from("email_logs").insert({
      resend_id: resendId ?? null,
      contact_id: log.contactId ?? null,
      entreprise_id: log.entrepriseId ?? null,
      to_email: email.to,
      to_name: email.toName ?? null,
      from_email: fromEmail,
      subject: email.subject,
      body_html: email.html,
      type: "scheduling",
      status,
      error_message: errorMessage ?? null,
    });
  } catch (logErr) {
    console.error("[scheduling/emails] log error:", logErr);
  }

  if (status === "failed") {
    console.error("[scheduling/emails] envoi échoué:", email.subject, errorMessage);
  }
  return status === "sent";
}
