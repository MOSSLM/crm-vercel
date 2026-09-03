/**
 * Enrichit les dossiers JAMAIS enrichis du portefeuille Bilal + Matteo.
 *
 * ⚠️ SEULEMENT LES NEUFS. Sur un dossier déjà traité il faut passer par
 * `reenrich`, qui remet `statut` à `draft` avant d'appeler — sans quoi
 * `shouldProcess` refuse avec `already_ready`. Ce script ne remet rien à zéro :
 * il ne prend que ce qui n'a jamais été tenté, exactement comme `enrichir-lot`.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function chargerEnv(): void {
  const c = resolve(process.cwd(), ".env.local");
  if (!existsSync(c)) return;
  for (const l of readFileSync(c, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
async function main() {
  chargerEnv();
  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) => /^https?:\/\//.test(v ?? ""));
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !cle) throw new Error("env");
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc("portefeuille_bm_a_enrichir");
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r: { projet_id: string }) => r.projet_id);
  console.log(`${ids.length} dossier(s) à enrichir (mobile d'abord)`);
  if (ids.length === 0) return;

  // Par paquets de 3, comme `enrichir-lot` : l'edge function a son propre
  // budget de temps et rend ce qu'elle n'a pas traité.
  let ok = 0, ko = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const lot = ids.slice(i, i + 3);

    // ⚠️ MARQUER « PRÊT » AVANT D'APPELER. `shouldProcess` refuse par
    // `not_ready` tant que `pret_pour_lm` est faux — 53 appels sont revenus
    // ainsi, sans coût mais sans effet. C'est ce que fait `enrich-prepare`
    // (`pret_pour_lm: true, statut: 'draft'`), et c'est le geste « Marquer
    // prêt pour le lead magnet » de l'écran.
    const { error: errPret } = await sb
      .from("lead_magnet_projects")
      .update({ pret_pour_lm: true, statut: "draft" })
      .in("id", lot);
    if (errPret) { ko += lot.length; console.log(`  lot ${i / 3 + 1} : ${errPret.message}`); continue; }

    // Le réseau lâche : une coupure a tué la première passe au 53e dossier.
    // Deux essais, puis on passe — un lot perdu se rejoue, la sélection est
    // recalculée à chaque lancement.
    let res: Response | null = null;
    for (let essai = 0; essai < 2 && !res; essai++) {
      try {
        res = await fetch(`${url}/functions/v1/enrich-lead-magnet`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cle}`, apikey: cle, "Content-Type": "application/json" },
          body: JSON.stringify({ project_ids: lot, source: "portefeuille-bm" }),
        });
      } catch (e) {
        if (essai === 1) { console.log(`  lot ${i / 3 + 1} : réseau — ${(e as Error).message}`); }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!res) { ko += lot.length; continue; }
    if (!res.ok) {
      ko += lot.length;
      console.log(`  lot ${i / 3 + 1} : HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
      continue;
    }
    const p = (await res.json().catch(() => ({}))) as { results?: { project_id: string; status?: string; outcome_reason?: string }[] };
    for (const r of p.results ?? []) {
      if (r.status === "ok" || r.status === "success") ok += 1;
      else { ko += 1; console.log(`  ✗ ${r.project_id} — ${r.status ?? "?"} ${r.outcome_reason ?? ""}`); }
    }
    if ((i / 3 + 1) % 4 === 0) console.log(`  … ${i + lot.length}/${ids.length}`);
  }
  console.log(`\nenrichis : ${ok} · en échec : ${ko}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
