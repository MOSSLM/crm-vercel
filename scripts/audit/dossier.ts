/**
 * Le dossier d'un prospect, tel que la validation le verra.
 *
 * `univers` est la référence exacte : ce qui n'y figure pas ne franchira pas
 * l'écriture. Le lire AVANT de rédiger évite d'écrire trois cartes pour se les
 * faire rejeter une par une.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { construireDossier, universDe } from "@/lib/audit/dossier";

function chargerEnv(): void {
  const c = resolve(process.cwd(), ".env.local");
  if (!existsSync(c)) return;
  for (const l of readFileSync(c, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function main(): Promise<void> {
  chargerEnv();
  const id = Number(process.argv[2]);
  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
    /^https?:\/\//.test(v ?? ""),
  );
  const sb = createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const d = await construireDossier(sb, id);
  if (!d) throw new Error("Entreprise introuvable.");
  const u = universDe(d) as unknown as Record<string, unknown>;
  // Les ensembles et les tables de correspondance se sérialisent en `{}` : on
  // les déplie, sans quoi un dossier plein a l'air vide.
  const deplier = (v: unknown): unknown =>
    v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v;
  console.log(
    JSON.stringify(
      Object.fromEntries(Object.entries(u).map(([k, v]) => [k, deplier(v)])),
      null,
      1,
    ),
  );
  console.log("offres :", d.offres.map((o) => o.code).join(", "));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
