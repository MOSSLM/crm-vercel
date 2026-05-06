import { NextResponse } from "next/server";
import { generateThemeFromUrl } from "@/lib/ai/theme-generator-from-url";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, themeName, themeSlug } = body as {
      url: string;
      themeName?: string;
      themeSlug?: string;
    };

    if (!url) {
      return NextResponse.json({ error: "url requis" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "URL invalide" }, { status: 400 });
    }

    const result = await generateThemeFromUrl({ url, themeName, themeSlug });
    return NextResponse.json({ theme: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
