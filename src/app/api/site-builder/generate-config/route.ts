import { json, jsonError } from "@/app/api/_lib/respond";
import { withAuth } from "@/app/api/_lib/with-auth";
import { generateSiteConfig } from "@/lib/ai/site-config-generator";
import type { CompanyLite } from "@/utils/leadMagnetV2Api";

export const POST = withAuth({}, async ({ req }) => {
  const body = await req.json();
  const { company, themeSlug, additionalContext } = body as {
    company: CompanyLite;
    themeSlug?: string;
    additionalContext?: string;
  };

  if (!company) return jsonError("company requis", 400);

  const config = await generateSiteConfig({ company, themeSlug, additionalContext });
  return json({ config });
});
