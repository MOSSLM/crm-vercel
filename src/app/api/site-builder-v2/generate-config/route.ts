import { NextResponse } from "next/server";
import { generateSiteConfig } from "@/lib/ai/site-config-generator";
import type { CompanyLite } from "@/utils/leadMagnetV2Api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { company, themeSlug, additionalContext } = body as {
      company: CompanyLite;
      themeSlug?: string;
      additionalContext?: string;
    };

    if (!company) {
      return NextResponse.json({ error: "company requis" }, { status: 400 });
    }

    const config = await generateSiteConfig({ company, themeSlug, additionalContext });
    return NextResponse.json({ config });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
