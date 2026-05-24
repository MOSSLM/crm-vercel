import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();

  const { data: companies, error } = await supabase
    .from("entreprises")
    .select("id, nom:name")
    .eq("qualifie", true)
    .order("name", { ascending: true });

  if (error) return jsonError(error.message, 500);

  const list = (companies ?? []) as Array<{ id: number; nom: string }>;

  const pretIds = new Set<number>();
  if (list.length > 0) {
    const { data: projects } = await supabase
      .from("lead_magnet_projects")
      .select("entreprise_id")
      .eq("pret_pour_lm", true)
      .in("entreprise_id", list.map((c) => c.id));

    for (const p of projects ?? []) {
      pretIds.add(p.entreprise_id as number);
    }
  }

  return json(
    list.map((c) => ({ id: c.id, nom: c.nom, pret_pour_lm: pretIds.has(c.id) })),
  );
});
