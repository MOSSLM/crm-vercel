import { jsonError } from "./respond";
import { resolveAgentContext } from "./require-capability";

/**
 * Autorise les rôles « internes » (admin **ou** freelance) et refuse tout le
 * reste — notamment le rôle `client`, qui a bien un compte Supabase et donc un
 * jeton valide.
 *
 * Pourquoi ce helper existe alors que `requireRole` est déjà là : `requireRole`
 * teste une égalité stricte (`role === required`), il ne sait pas exprimer
 * « l'un ou l'autre ». Et `capability` ne convient pas non plus pour les écrans
 * ouverts à tous les agents : un freelance sans ligne dans `agent_settings`
 * n'a aucune capacité et serait refusé à tort.
 *
 * À utiliser sur toute route dont les données couvrent l'ensemble du parc
 * (tous les prospects, tous les sites) plutôt que le périmètre du caller.
 */
export type StaffResult = { ok: true; role: "admin" | "freelance" } | { ok: false; response: Response };

export const requireStaff = async (
  user: { id: string },
  extraHeaders: Record<string, string> = {},
): Promise<StaffResult> => {
  const ctx = await resolveAgentContext(user.id);
  if (ctx.role !== "admin" && ctx.role !== "freelance") {
    return { ok: false, response: jsonError("forbidden", 403, {}, extraHeaders) };
  }
  return { ok: true, role: ctx.role };
};
