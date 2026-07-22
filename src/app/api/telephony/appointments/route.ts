/**
 * Appointments — book (POST) and list upcoming (GET), linked to CRM records.
 *
 * An appointment is a crm_calendar_events row. It can be assigned to the booking
 * agent (assigned_to = self) or escalated to the admin/superior
 * (created_for_role = 'admin'). Admins see all upcoming; agents see their own.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { telephonyAppointmentSchema, type TelephonyAppointmentPayload } from "@/app/api/_lib/schemas";
import { isAdminUser } from "@/app/api/telephony/_lib";

export const runtime = "nodejs";

export const GET = withAuth({}, async ({ user, cors }) => {
  const sc = getServiceClient();
  const admin = await isAdminUser(sc, user.id);
  const nowIso = new Date().toISOString();

  let q = sc
    .from("crm_calendar_events")
    .select("id, title, start_at, end_at, assigned_to, created_for_role, contact_id, entreprise_id")
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(50);
  if (!admin) q = q.eq("assigned_to", user.id);

  const { data, error } = await q;
  if (error) return jsonError(error.message, 500, {}, cors);
  return json({ appointments: data ?? [] }, { headers: cors });
});

export const POST = withAuth<TelephonyAppointmentPayload>(
  { body: telephonyAppointmentSchema },
  async ({ user, body, cors }) => {
    const sc = getServiceClient();
    const admin = await isAdminUser(sc, user.id);

    const start = new Date(body.start_at);
    if (Number.isNaN(start.getTime())) return jsonError("invalid_start", 400, {}, cors);
    const end = new Date(start.getTime() + body.duration_min * 60_000);

    // "for_admin" escalates the RDV to the admin/superior pool; otherwise it is
    // assigned to the booking user.
    const forAdmin = body.for_admin === true;
    const assigned_to = forAdmin ? null : user.id;
    const created_for_role = forAdmin || admin ? "admin" : "freelance";

    const { data, error } = await sc
      .from("crm_calendar_events")
      .insert({
        title: body.title,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        created_by: user.id,
        assigned_to,
        created_for_role,
        contact_id: body.contact_id ?? null,
        entreprise_id: body.entreprise_id ?? null,
        opportunite_id: body.opportunite_id ?? null,
        call_id: body.call_id ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error) return jsonError(error.message, 500, {}, cors);

    return json({ ok: true, id: data?.id, assignedToAdmin: forAdmin }, { headers: cors });
  },
);
