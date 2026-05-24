import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { generateThemeFromUrl } from "@/lib/ai/theme-generator-from-url";

export const POST = withAuth({}, async ({ req }) => {
  const body = await req.json();
  const { url, themeName, themeSlug } = body as {
    url: string;
    themeName?: string;
    themeSlug?: string;
  };

  if (!url) return jsonError("url requis", 400);

  try {
    new URL(url);
  } catch {
    return jsonError("URL invalide", 400);
  }

  const result = await generateThemeFromUrl({ url, themeName, themeSlug });
  return json({ theme: result });
});
