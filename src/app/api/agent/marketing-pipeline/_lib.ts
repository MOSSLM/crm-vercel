import { getServiceClient } from "@/app/api/_lib/service-client";

/**
 * Garde de propriété pour les étapes du marketing pipeline exécutées par un
 * agent : il ne peut agir que sur les entreprises qui lui sont attribuées
 * (`entreprises.owner_id`). La capacité `marketing_pipeline` est déjà vérifiée
 * en amont par `withAuth`, mais elle n'est pas liée à une entreprise donnée.
 */
export type OwnershipResult =
  | { ok: true; entrepriseId: number }
  | { ok: false; error: string; status: number };

export async function assertOwnsEntreprise(
  agentId: string,
  entrepriseId: number,
): Promise<OwnershipResult> {
  const { data, error } = await getServiceClient()
    .from("entreprises")
    .select("id, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "entreprise_introuvable", status: 404 };
  if (data.owner_id !== agentId) {
    return { ok: false, error: "entreprise_non_attribuee", status: 403 };
  }
  return { ok: true, entrepriseId };
}

/** Journalise une étape de pipeline jouée par l'agent. Best-effort. */
export async function logPipelineStep(params: {
  agentId: string;
  entrepriseId: number;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getServiceClient().from("agent_activity_events").insert({
    agent_id: params.agentId,
    entreprise_id: params.entrepriseId,
    action: params.action,
    metadata: params.metadata ?? {},
  });
  if (error) console.warn("agent_activity_events insert failed:", error.message);
}
