import Link from "next/link";
import { listThemes } from "@/templates/index";
import { createClient } from "@supabase/supabase-js";
import type { ThemeConfig, ManagedTheme } from "@/types";

// Server component — regenerated on every request, always fresh
export const dynamic = "force-dynamic";

async function loadAllThemes(): Promise<ThemeConfig[]> {
  const builtin = listThemes();

  // Also load custom themes from DB
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await supabase
      .from("site_themes")
      .select("*")
      .eq("is_enabled", true)
      .eq("is_builtin", false)
      .order("created_at", { ascending: true });

    const customThemes: ThemeConfig[] = (data ?? [])
      .filter((row: ManagedTheme) => row.config && typeof row.config === "object")
      .map((row: ManagedTheme) => ({
        slug: row.slug,
        name: row.name,
        description: row.description ?? "",
        sections: (row.config as ThemeConfig).sections ?? [],
        globalVariables: (row.config as ThemeConfig).globalVariables ?? {
          colors: { primary: "#000", secondary: "#666", accent: "#f59e0b", background: "#fff", text: "#111" },
          fonts: { heading: "Inter", body: "Inter" },
        },
        enterpriseVariables: (row.config as ThemeConfig).enterpriseVariables ?? [],
      }));

    return [...builtin, ...customThemes];
  } catch {
    return builtin;
  }
}

export default async function ThemesDocsPage() {
  const themes = await loadAllThemes();

  return (
    <div className="max-w-4xl mx-auto p-6 pb-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">Documentation des Thèmes</h1>
          <p className="text-muted-foreground">
            Documentation auto-générée depuis les thèmes installés.{" "}
            <Link href="/themes" className="text-primary hover:underline">Gérer les thèmes →</Link>
          </p>
        </div>
        <span className="text-sm text-muted-foreground">{themes.length} thème{themes.length !== 1 ? "s" : ""}</span>
      </div>

      {themes.map((theme) => (
        <ThemeDoc key={theme.slug} theme={theme} />
      ))}
    </div>
  );
}

function ThemeDoc({ theme }: { theme: ThemeConfig }) {
  const exampleConfig = {
    theme: theme.slug,
    settings: {
      colors: theme.globalVariables.colors,
      fonts: theme.globalVariables.fonts,
    },
    pages: [
      {
        id: "page-home",
        slug: "/",
        title: "Accueil",
        sections: theme.sections.slice(0, 2).map((s) => ({
          id: "example-id",
          type: s.type,
          dataSource: "config",
          data: s.defaultData,
        })),
      },
    ],
  };

  return (
    <section className="mb-12 border rounded-xl overflow-hidden">
      {/* Theme header */}
      <div className="bg-muted/50 px-6 py-5 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{theme.name}</h2>
            <code className="text-sm text-muted-foreground mt-0.5 block">slug: {theme.slug}</code>
            {theme.description && (
              <p className="text-sm text-muted-foreground mt-1">{theme.description}</p>
            )}
          </div>
          <div className="text-right text-sm text-muted-foreground shrink-0">
            <div>{theme.sections.length} sections</div>
            <div>{theme.enterpriseVariables.length} variables entreprise</div>
          </div>
        </div>

        {/* Color palette preview */}
        <div className="flex items-center gap-2 mt-4">
          {Object.entries(theme.globalVariables.colors).map(([name, hex]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <div
                className="h-8 w-8 rounded-full border border-border shadow-sm"
                style={{ background: hex }}
                title={hex}
              />
              <span className="text-[10px] text-muted-foreground">{name}</span>
            </div>
          ))}
          <div className="ml-4 text-sm text-muted-foreground">
            {theme.globalVariables.fonts.heading} / {theme.globalVariables.fonts.body}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Sections */}
        <div>
          <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
            Sections disponibles ({theme.sections.length})
          </h3>
          <div className="grid gap-3">
            {theme.sections.map((section) => (
              <SectionDoc key={section.type} section={section} />
            ))}
          </div>
        </div>

        {/* Enterprise variables */}
        {theme.enterpriseVariables.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
              Variables entreprise disponibles
            </h3>
            <div className="flex flex-wrap gap-2">
              {theme.enterpriseVariables.map((v) => (
                <code key={v} className="text-xs bg-muted px-2 py-1 rounded border">
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </div>
        )}

        {/* Example config */}
        <div>
          <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
            Exemple de configuration JSON
          </h3>
          <pre className="bg-muted/70 border rounded-lg p-4 text-xs overflow-x-auto text-foreground/80 max-h-80 overflow-y-auto">
            {JSON.stringify(exampleConfig, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}

function SectionDoc({ section }: { section: ThemeConfig["sections"][number] }) {
  const params = Object.entries(section.defaultData).map(([key, value]) => ({
    key,
    type: Array.isArray(value) ? "array" : typeof value,
    example: typeof value === "string" ? value.slice(0, 60) : undefined,
  }));

  return (
    <div className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{section.label}</span>
            <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {section.type}
            </code>
          </div>
          {section.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
          )}
        </div>
      </div>

      {/* Parameters table */}
      <div className="mt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-left pb-1 font-medium">Paramètre</th>
              <th className="text-left pb-1 font-medium">Type</th>
              <th className="text-left pb-1 font-medium">Valeur par défaut</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.key} className="border-b border-dashed last:border-0">
                <td className="py-1 pr-3 font-mono text-foreground/70">{p.key}</td>
                <td className="py-1 pr-3">
                  <span className="text-blue-600 dark:text-blue-400">{p.type}</span>
                </td>
                <td className="py-1 text-muted-foreground truncate max-w-xs">
                  {p.example ?? (p.type === "array" ? "[]" : p.type === "object" ? "{}" : p.type === "boolean" ? "false" : "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
