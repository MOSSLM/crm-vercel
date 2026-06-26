import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { cloneTemplateSite } from "@/lib/site-builder/clone-template-site";

export const dynamic = "force-dynamic";

type Params = { siteId: string };

/**
 * POST /api/site-builder/claude/[siteId]/duplicate   (JSON: { name? })
 *
 * Duplicates the current Claude Design template into a NEW template (variation)
 * — same base pages, but its own tweaks / inline edits. Lets you keep several
 * tweaked variants from a single imported ZIP. Nothing is published.
 */
export const POST = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const body = await req.json().catch(() => ({}));
  const supabase = getServiceClient();

  const { data: src } = await supabase.from("sites").select("name").eq("id", params.siteId).single();
  const baseName = (src as { name?: string } | null)?.name ?? "Template";
  const name = ((body as { name?: string }).name?.trim()) || `${baseName} (copie)`;

  const clone = await cloneTemplateSite(supabase, params.siteId, { name, asTemplate: true });
  if (!clone.ok || !clone.siteId) return jsonError(clone.error ?? "Duplication échouée", 500);

  return json({ siteId: clone.siteId, name }, { status: 201 });
});
