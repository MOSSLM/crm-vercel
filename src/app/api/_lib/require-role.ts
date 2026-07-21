import { jsonError } from "./respond";
import { getServiceClient } from "./service-client";

export type UserRole = "admin" | "freelance";

/** Staff = internal CRM users (admins + freelance agents), i.e. not clients. */
export const STAFF_ROLES: UserRole[] = ["admin", "freelance"];

export type RoleResult =
  | { ok: true; role: UserRole }
  | { ok: false; response: Response };

/**
 * Looks up the caller's role in `user_profiles` and confirms it matches the
 * required role. `required` may be a single role or a list — the caller passes
 * when their role is in the list (e.g. `["admin", "freelance"]` = staff).
 * Returns a ready-to-return 403 if the profile is missing or the role differs,
 * or 500 if the lookup itself fails.
 *
 * The wrapper from `withAuth` calls this after `requireUser`; route code
 * should rarely call this directly.
 */
export const requireRole = async (
  user: { id: string },
  required: UserRole | UserRole[],
  extraHeaders: Record<string, string> = {},
): Promise<RoleResult> => {
  const { data, error } = await getServiceClient()
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonError("profile_lookup_failed", 500, {}, extraHeaders) };
  }
  const allowed = Array.isArray(required) ? required : [required];
  if (!data || !allowed.includes(data.role as UserRole)) {
    return { ok: false, response: jsonError("forbidden", 403, {}, extraHeaders) };
  }
  return { ok: true, role: data.role as UserRole };
};
