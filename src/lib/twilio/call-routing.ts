/**
 * Server-side call routing helpers: resolve which of our numbers an agent calls
 * from, and map Twilio's `client:<identity>` back to a CRM user.
 */
import type { getServiceClient } from "@/app/api/_lib/service-client";

type Db = ReturnType<typeof getServiceClient>;

export interface CallerNumber {
  numberId: string;
  e164: string;
}

/** Extract the agent's user id from a Twilio `From=client:<identity>` param. */
export const parseClientIdentity = (from: string | undefined | null): string | null => {
  if (!from) return null;
  return from.startsWith("client:") ? from.slice("client:".length) : null;
};

/**
 * The number an outbound call from this agent should present as caller ID:
 * their configured default, else the first active number assigned to them.
 * Returns null when the agent has no usable number (caller must handle it).
 */
export const resolveAgentCallerNumber = async (
  db: Db,
  agentId: string,
): Promise<CallerNumber | null> => {
  const { data: settings } = await db
    .from("agent_phone_settings")
    .select("default_number_id")
    .eq("user_id", agentId)
    .maybeSingle();

  const defaultId = (settings as { default_number_id?: string } | null)?.default_number_id;
  if (defaultId) {
    const { data: num } = await db
      .from("phone_numbers")
      .select("id, e164, status")
      .eq("id", defaultId)
      .maybeSingle();
    const n = num as { id: string; e164: string; status: string } | null;
    if (n && n.status === "active") return { numberId: n.id, e164: n.e164 };
  }

  const { data: assigned } = await db
    .from("phone_numbers")
    .select("id, e164")
    .eq("assigned_agent_id", agentId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const a = assigned as { id: string; e164: string } | null;
  return a ? { numberId: a.id, e164: a.e164 } : null;
};

/** Find the phone_numbers row for one of our E.164 numbers (inbound routing). */
export const findOwnedNumberByE164 = async (
  db: Db,
  e164: string,
): Promise<{ id: string; assigned_agent_id: string | null } | null> => {
  const { data } = await db
    .from("phone_numbers")
    .select("id, assigned_agent_id")
    .eq("e164", e164)
    .maybeSingle();
  return (data as { id: string; assigned_agent_id: string | null } | null) ?? null;
};
