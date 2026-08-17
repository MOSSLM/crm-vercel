/**
 * Soumettre la rédaction d'un audit, sans session ouverte.
 *
 * Appelle `appliquerPreparation` — LE MÊME code que la route, pas une copie.
 * Les quatre règles s'appliquent donc à l'identique : un constat sans preuve en
 * échec n'existe pas, une offre hors catalogue n'existe pas, un chiffre absent
 * du dossier n'existe pas, et un rejet ne bloque jamais — il est nommé.
 *
 *   ./scripts/audit/run.sh scripts/audit/preparer.ts <entrepriseId> <fichier.json>
 *
 * Le JSON attendu est celui du contrat : `{ intro, accroche, cartes, offres,
 * observations }`. Passer par un fichier plutôt que par un argument évite qu'une
 * apostrophe française fasse dérailler le shell au milieu d'une phrase rédigée.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { appliquerPreparation } from "@/lib/audit/appliquer-preparation";

function chargerEnv(): void {
  const chemin = resolve(process.cwd(), ".env.local");
  if (!existsSync(chemin)) return;
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function main(): Promise<void> {
  chargerEnv();
  const entrepriseId = Number(process.argv[2]);
  const fichier = process.argv[3];
  if (!Number.isFinite(entrepriseId) || !fichier) {
    throw new Error("Usage : preparer.ts <entrepriseId> <fichier.json>");
  }

  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
    /^https?:\/\//.test(v ?? ""),
  );
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error("Adresse Supabase valide et clé de service requises.");
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  const { data: opp } = await sb
    .from("opportunites")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  if (!opp) throw new Error(`Aucune opportunité pour l'entreprise ${entrepriseId}.`);

  const res = await appliquerPreparation(sb, {
    opportuniteId: (opp as { id: string }).id,
    entrepriseId,
    preparation: JSON.parse(readFileSync(resolve(fichier), "utf8")),
  });

  if (res.erreur) throw new Error(res.erreur.message);

  // Les rejets d'abord : ce sont eux qui disent quoi corriger, et les lire
  // après un « appliqué » vert reviendrait à ne pas les lire.
  for (const r of res.rejets as Array<{ regle?: string; pourquoi?: string; cle?: string }>) {
    console.log(`   ✗ ${r.cle ?? "?"} — ${r.pourquoi ?? r.regle ?? JSON.stringify(r)}`);
  }
  console.log(
    res.applique
      ? `   ✓ ${res.cartes?.length ?? 0} carte(s) écrite(s)${res.lien_rouvert ? " · lien rouvert" : ""}`
      : `   ✗ ${res.motif}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
