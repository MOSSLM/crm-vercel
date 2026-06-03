/**
 * Single source of truth for where each role lands after auth.
 *
 *   admin     → full staff CRM            (/dashboard)
 *   freelance → agent prospecting portal  (/espace-agent)
 *   client    → client portal             (/espace-client)
 *
 * Used by every role guard (LoginPage, AppLayout, RequireAuth, espace-client &
 * espace-agent layouts) so the role→portal mapping never drifts between them.
 */
export type AppRole = "admin" | "freelance" | "client" | "unknown";

export function roleHome(role: AppRole | null | undefined): string {
  switch (role) {
    case "admin":
      return "/dashboard";
    case "freelance":
      return "/espace-agent/dashboard";
    case "client":
      return "/espace-client/dashboard";
    default:
      return "/login";
  }
}
