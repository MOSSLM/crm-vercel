import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { concurrentUpdateSchema, type ConcurrentUpdatePayload } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { archiveFailure } from "@/lib/archive/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

type Row = {
  id: string;
  domaine: string;
  nom: string | null;
  site_url: string | null;
  statut: string;
  notes: string | null;
  created_at: string;
};

/**
 * GET /api/concurrents
 *
 * Le registre, enrichi du nombre de prospects que chaque concurrent nous a
 * pris. Les compteurs sont agrégés ici plutôt que dans une vue SQL : une vue
 * demanderait `security_invoker` (cf. sql/20260524_security_views_to_invoker)
 * pour deux `group by` que PostgREST fait très bien.
 */
export const GET = withAuth({ role: "admin" }, async ({ cors }) => {
  const sb = getServiceClient();

  const [{ data: rows, error }, ents, opps] = await Promise.all([
    sb
      .from("concurrents")
      .select("id, domaine, nom, site_url, statut, notes, created_at")
      .order("created_at", { ascending: false }),
    sb
      .from("entreprises")
      .select("archive_concurrent_id, archived_at")
      .not("archive_concurrent_id", "is", null),
    sb
      .from("opportunites")
      .select("archive_concurrent_id")
      .not("archive_concurrent_id", "is", null),
  ]);

  if (error) return archiveFailure(error, cors);

  const parEntreprise = new Map<string, { n: number; derniere: string | null }>();
  for (const e of (ents.data ?? []) as { archive_concurrent_id: string; archived_at: string | null }[]) {
    const prev = parEntreprise.get(e.archive_concurrent_id) ?? { n: 0, derniere: null };
    parEntreprise.set(e.archive_concurrent_id, {
      n: prev.n + 1,
      derniere:
        e.archived_at && (!prev.derniere || e.archived_at > prev.derniere)
          ? e.archived_at
          : prev.derniere,
    });
  }

  const parOpportunite = new Map<string, number>();
  for (const o of (opps.data ?? []) as { archive_concurrent_id: string }[]) {
    parOpportunite.set(o.archive_concurrent_id, (parOpportunite.get(o.archive_concurrent_id) ?? 0) + 1);
  }

  const concurrents = ((rows ?? []) as Row[])
    .map((r) => ({
      ...r,
      nb_entreprises: parEntreprise.get(r.id)?.n ?? 0,
      nb_opportunites: parOpportunite.get(r.id) ?? 0,
      derniere_prise_at: parEntreprise.get(r.id)?.derniere ?? null,
    }))
    // Les plus voraces d'abord : c'est l'ordre dans lequel on veut les démarcher.
    .sort((a, b) => b.nb_entreprises - a.nb_entreprises || a.domaine.localeCompare(b.domaine));

  return json({ concurrents }, { headers: cors });
});

/** POST /api/concurrents — édition d'une fiche (nom, statut, notes). */
export const POST = withAuth<ConcurrentUpdatePayload>(
  { role: "admin", body: concurrentUpdateSchema },
  async ({ body, cors }) => {
    const { id, ...fields } = body;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) return jsonError("rien_a_modifier", 400, {}, cors);

    const { data, error } = await getServiceClient()
      .from("concurrents")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return archiveFailure(error, cors);
    if (!data) return jsonError("concurrent_introuvable", 404, {}, cors);
    return json({ ok: true }, { headers: cors });
  },
);

/**
 * DELETE /api/concurrents?id=…
 *
 * Les `archive_concurrent_id` qui pointaient dessus retombent à `null`
 * (`on delete set null`) : les fiches restent archivées avec leur motif, on ne
 * perd que le lien vers le concurrent.
 */
export const DELETE = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError("id_requis", 400, {}, cors);

  const { error } = await getServiceClient().from("concurrents").delete().eq("id", id);
  if (error) return archiveFailure(error, cors);
  return json({ ok: true }, { headers: cors });
});
