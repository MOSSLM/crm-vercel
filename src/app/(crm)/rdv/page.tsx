import { notFound, redirect } from "next/navigation";
import { getServiceClient } from "@/app/api/_lib/service-client";

export const dynamic = "force-dynamic";

/**
 * /rdv — raccourci vers la page de réservation principale du studio :
 * la page active du premier admin, sinon la première page active.
 * Utilisé notamment par le CTA « Réserver un échange » de la landing.
 */
export default async function RdvIndexPage() {
  const sc = getServiceClient();

  const { data: adminPage } = await sc
    .from("scheduling_pages")
    .select("username, user_id, is_active, created_at, owner:user_profiles!scheduling_pages_user_id_fkey(role)")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const rows = (adminPage ?? []) as Array<{
    username: string;
    owner: { role: string } | { role: string }[] | null;
  }>;
  const roleOf = (r: (typeof rows)[number]): string | null => {
    if (!r.owner) return null;
    return Array.isArray(r.owner) ? r.owner[0]?.role ?? null : r.owner.role;
  };

  const target = rows.find((r) => roleOf(r) === "admin") ?? rows[0];
  if (!target) notFound();

  redirect(`/rdv/${target.username}`);
}
