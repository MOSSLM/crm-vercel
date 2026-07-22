import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { marketingCompanyDetailsSchema } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/marketing-pipeline/company-details
 *
 * Persists the Marketing & Web edit modal (company row + enrichment + lead
 * magnet overrides/stats/zones + reviews) in one authenticated call, using the
 * service client (RLS-bypassing) after `withAuth` has validated the caller —
 * mirroring the other marketing-pipeline routes.
 *
 * Why server-side: the modal used to write to Supabase directly from the
 * browser (anon key). The board that opens the modal loads through the service
 * client, so a company can be shown/opened but its browser-side UPDATE rejected
 * by RLS — e.g. the freelance `entreprises` policy's `WITH CHECK (owner_id =
 * auth.uid())` blocks every pool company (`owner_id IS NULL`), surfacing as a
 * random "erreur d'enregistrement". Writing here means anything the board can
 * show, the modal can save.
 */
export const POST = withAuth({ body: marketingCompanyDetailsSchema }, async ({ body, cors }) => {
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const { entreprise_id, project_id, enrichment_id, company, enrichment, project, reviews } = body;

  // 1) Company row.
  const { error: compErr } = await supabase
    .from("entreprises")
    .update({
      name: company.name || null,
      ville: company.ville || null,
      code_postal: company.code_postal || null,
      adresse: company.adresse || null,
      telephone: company.telephone || null,
      email: company.email || null,
      site_web_canonique: company.site_web_canonique || null,
      linkedin_url: company.linkedin_url || null,
      service_tags: company.service_tags ?? [],
      note_moyenne: company.note_moyenne ?? null,
      nombre_avis: company.nombre_avis ?? null,
      horaires: company.horaires || null,
      manually_enriched: true,
      updated_at: now,
    })
    .eq("id", entreprise_id);
  if (compErr) return jsonError(compErr.message, 500, {}, cors);

  // 2) Enrichment row: update the loaded/latest row, else insert when there's data.
  if (enrichment) {
    const enrPayload = {
      website_url: enrichment.website_url || null,
      emails: enrichment.emails ?? [],
      phones: enrichment.phones ?? [],
      services_list: enrichment.services_list ?? [],
      contact_page_url: enrichment.contact_page_url || null,
      site_summary: enrichment.site_summary || null,
      updated_at: now,
    };
    const hasEnrData = !!(
      enrPayload.website_url ||
      enrPayload.emails.length ||
      enrPayload.phones.length ||
      enrPayload.services_list.length ||
      enrPayload.contact_page_url ||
      enrPayload.site_summary
    );

    // Prefer the id the modal loaded; else fall back to the latest row for this
    // company so we update instead of inserting a duplicate (avoids a 23505).
    let targetId = enrichment_id ?? null;
    if (!targetId && hasEnrData) {
      const { data: latest } = await supabase
        .from("automated_enrichment")
        .select("id")
        .eq("entreprise_id", entreprise_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetId = (latest as { id?: string } | null)?.id ?? null;
    }

    if (targetId) {
      const { error } = await supabase.from("automated_enrichment").update(enrPayload).eq("id", targetId);
      if (error) return jsonError(error.message, 500, {}, cors);
    } else if (hasEnrData) {
      const { error } = await supabase.from("automated_enrichment").insert({ entreprise_id, ...enrPayload });
      if (error) return jsonError(error.message, 500, {}, cors);
    }
  }

  // 3) Lead magnet project overrides / logo / stats / zones.
  if (project_id && project) {
    const payload: Record<string, unknown> = {
      override_entreprise_name: project.override_entreprise_name || null,
      override_city: project.override_city || null,
      override_location: project.override_location || null,
      override_phone: project.override_phone || null,
      override_email: project.override_email || null,
      override_address: project.override_address || null,
      logo_url: project.logo_url || null,
      service_tags_snapshot: project.service_tags_snapshot ?? [],
      stat_years_experience: project.stat_years_experience || null,
      stat_satisfied_clients: project.stat_satisfied_clients || null,
      stat_installations_completed: project.stat_installations_completed || null,
      stat_rge_count: project.stat_rge_count || null,
      updated_at: now,
    };
    // Only overwrite the jsonb when the client actually sent it (never blank it).
    if (project.variables != null) payload.variables = project.variables;

    const { error } = await supabase.from("lead_magnet_projects").update(payload).eq("id", project_id);
    if (error) return jsonError(error.message, 500, {}, cors);
  }

  // 4) Reviews: deletions first, then updates (existing) / inserts (new).
  if (project_id && reviews) {
    if (reviews.deleted_ids.length > 0) {
      const { error } = await supabase.from("lead_magnet_reviews").delete().in("id", reviews.deleted_ids);
      if (error) return jsonError(error.message, 500, {}, cors);
    }
    for (const r of reviews.rows) {
      if (r.id) {
        const { error } = await supabase
          .from("lead_magnet_reviews")
          .update({
            author_name: r.author_name,
            review_text: r.review_text,
            rating: r.rating,
            is_active: r.is_active,
            display_order: r.display_order,
          })
          .eq("id", r.id);
        if (error) return jsonError(error.message, 500, {}, cors);
      } else {
        const { error } = await supabase.from("lead_magnet_reviews").insert({
          lead_magnet_project_id: project_id,
          author_name: r.author_name,
          review_text: r.review_text,
          rating: r.rating,
          is_active: r.is_active,
          is_manual: true,
          source: "manual",
          display_order: r.display_order,
        });
        if (error) return jsonError(error.message, 500, {}, cors);
      }
    }
  }

  return json({ ok: true }, { headers: cors });
});
