import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { listThemes } from "@/templates/index";
import type { ManagedTheme } from "@/types";

export const dynamic = "force-dynamic";

export const GET = withAuth({}, async () => {
  const supabase = getServiceClient();
  const builtinThemes = listThemes();

  const { data: dbThemes, error } = await supabase
    .from("site_themes")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return jsonError(error.message, 500);

  const merged: ManagedTheme[] = (dbThemes ?? []).map((row: ManagedTheme) => {
    const builtin = builtinThemes.find((t) => t.slug === row.slug);
    return { ...row, config: builtin ?? row.config };
  });

  for (const bt of builtinThemes) {
    if (!merged.find((m) => m.slug === bt.slug)) {
      merged.unshift({
        id: `builtin-${bt.slug}`,
        slug: bt.slug,
        name: bt.name,
        description: bt.description ?? "",
        preview_image_url: bt.previewImageUrl ?? undefined,
        config: bt,
        is_enabled: true,
        is_builtin: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return json(merged);
});

export const POST = withAuth({}, async ({ req }) => {
  const supabase = getServiceClient();
  const body = await req.json();
  const { slug, name, description, preview_image_url, config } = body as {
    slug: string;
    name: string;
    description?: string;
    preview_image_url?: string;
    config?: object;
  };

  if (!slug || !name) return jsonError("slug et name requis", 400);

  const { data, error } = await supabase
    .from("site_themes")
    .insert({
      slug,
      name,
      description: description ?? null,
      preview_image_url: preview_image_url ?? null,
      config: config ?? {},
      is_builtin: false,
      is_enabled: true,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data, { status: 201 });
});
