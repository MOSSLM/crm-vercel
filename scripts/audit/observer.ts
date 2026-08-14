/**
 * Écrire ce que l'agent a relevé lui-même, sous le contrôle du catalogue.
 *
 * CE QUE CE SCRIPT NE PERMET PAS, et c'est sa raison d'être : écrire n'importe
 * quoi. `validerObservations` refuse une clé absente du catalogue, une valeur
 * dans la mauvaise unité, une valeur hors des bornes de plausibilité. Ce qui
 * passe devient une preuve pesée dans son axe ; ce qui ne passe pas est NOMMÉ,
 * jamais corrigé — corriger une valeur qu'on juge fausse reviendrait à en
 * inventer une autre.
 *
 * L'agent fournit un COMPTAGE. Le poids vient du catalogue. C'est ce qui sépare
 * « j'ai relevé un fait » de « j'ai décidé d'une note », et c'est la seule forme
 * sous laquelle un jugement humain peut entrer dans un chiffre montré au
 * prospect.
 *
 *   … scripts/audit/observer.ts <entrepriseId> '[{"cle":"numeros_differents","valeur":3}]'
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { validerObservations } from "@/lib/audit/observations";
import { lireAudit } from "@/lib/audit-site/lecture";

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
  const brut = process.argv[3];
  if (!Number.isFinite(entrepriseId) || !brut) {
    throw new Error("Usage : observer.ts <entrepriseId> '<json>'");
  }

  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
    /^https?:\/\//.test(v ?? ""),
  );
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error("Adresse Supabase valide et clé de service requises.");
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  const verdict = validerObservations(JSON.parse(brut));
  for (const r of verdict.rejets) console.log(`   ✗ ${r.cle} — ${r.pourquoi}`);
  for (const o of verdict.retenues) {
    console.log(
      `   ✓ ${o.cle} = ${o.valeur}${o.seuil ? ` (seuil ${o.seuil})` : ""} · ${o.verdict}` +
        `${o.poids ? ` · pèse ${o.poids} sur « ${o.axe} »` : " · ne pèse pas"}`,
    );
  }
  if (verdict.retenues.length === 0) throw new Error("Aucune observation retenue : rien n'est écrit.");

  const { data: ligne } = await sb
    .from("entreprises_audit_site")
    .select("detail")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  const detail = ((ligne as { detail?: Record<string, unknown> } | null)?.detail ?? {}) as Record<
    string,
    unknown
  >;

  const { error } = await sb
    .from("entreprises_audit_site")
    .update({ detail: { ...detail, observations: verdict.retenues } })
    .eq("entreprise_id", entrepriseId);
  if (error) throw new Error(error.message);

  const lu = await lireAudit(sb, entrepriseId);
  if (lu.disponible && lu.audit) {
    const a = lu.audit;
    console.log(`   → note du document ${a.note_document ?? "—"} · ${a.libelle ?? ""}`);
    console.log(`     axes : ${a.axes.map((x) => `${x.id} ${x.note}`).join(" · ")}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
