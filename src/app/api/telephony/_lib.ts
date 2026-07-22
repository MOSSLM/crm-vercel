/**
 * Shared helpers for telephony API routes.
 */

import type { getServiceClient } from "@/app/api/_lib/service-client";

type ServiceClient = ReturnType<typeof getServiceClient>;

export interface AgentExtension {
  extension: string;
  sip: string | null;
}

/** The active PBX extension / SIP login assigned to an agent, if any. */
export async function resolveAgentExtension(
  sc: ServiceClient,
  agentId: string,
): Promise<AgentExtension | null> {
  const { data } = await sc
    .from("phone_extensions")
    .select("extension, sip")
    .eq("agent_id", agentId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { extension: data.extension as string, sip: (data.sip as string | null) ?? null };
}

/** Whether the caller is an admin (they may hear/see any call). */
export async function isAdminUser(sc: ServiceClient, userId: string): Promise<boolean> {
  const { data } = await sc
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin";
}
