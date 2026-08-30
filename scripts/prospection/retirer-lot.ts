// Retirer d'un agent les fiches d'un lot — le miroir de `attribuer-lot.ts`.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI IL EXISTE
// ─────────────────────────────────────────────────────────────────────────────
// Le 30/08/2026, une attribution lancée sur le lot « Renfort Bilal » a été
// INTERROMPUE par le propriétaire — mais l'interruption tue le processus, pas
// les écritures déjà faites : 123 fiches sur 500 étaient passées. Elles se sont
// retrouvées qualifiées, attribuées et pourvues d'une affaire sans avoir été
// qualifiées à la main, ce qui était précisément la consigne à ne pas enfreindre.
//
// ⚠️ LA LEÇON, POUR LA PROCHAINE FOIS : un script qui écrit par paquets n'est
// pas annulable en l'arrêtant. Ce fichier est ce qui rend l'arrêt réparable.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QU'IL FAIT, ET DANS CET ORDRE
// ─────────────────────────────────────────────────────────────────────────────
//   1. `unassignProspectsFromAgent` — la fonction de production, pas un update
//      brut : elle rend le propriétaire, libère les affaires, ÉCARTE les tâches
//      en attente (jamais ne les supprime) et sort les inscriptions vivantes
//      avec le motif `reattribution`, qui veut dire « reste à démarcher ».
//   2. `qualifie` remis à false SEULEMENT sur les fiches sans marqueur
//      `claude_qualification` : celles que j'ai qualifiées à la main gardent
//      leur verdict, elles ont été vues.
//   3. Les affaires créées par l'attribution sont ARCHIVÉES avec un motif —
//      jamais supprimées : l'historique d'une fiche ne se réécrit pas.
//
// USAGE
//   ./scripts/audit/run.sh scripts/prospection/retirer-lot.ts \
//     --lot "Semaine 36 — Renfort Bilal" --agent <uuid> [--dry-run]

import * as fs from "fs";
import * as path from "path";

function chargerEnv(): void {
  const fichier = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(fichier)) throw new Error(".env.local introuvable");
  for (const ligne of fs.readFileSync(fichier, "utf8").split("\n")) {
    const t = ligne.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const cle = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(cle in process.env)) process.env[cle] = v;
  }
}

const arg = (nom: string): string | null => {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const nombre = (n: number) => n.toLocaleString("fr-FR");

async function main(): Promise<void> {
  chargerEnv();
  const lotArg = arg("lot");
  const agentId = arg("agent");
  const dryRun = process.argv.includes("--dry-run");
  if (!lotArg || !agentId) {
    console.error("Usage : --lot <nom|id> --agent <uuid> [--dry-run]");
    process.exit(1);
  }

  const { getServiceClient } = await import("@/app/api/_lib/service-client");
  const { unassignProspectsFromAgent } = await import("@/app/api/admin/_assign");
  const sc = getServiceClient();

  const { data: lot } = await (/^\d+$/.test(lotArg)
    ? sc.from("lots").select("id, nom").eq("id", Number(lotArg)).maybeSingle()
    : sc.from("lots").select("id, nom").eq("nom", lotArg).maybeSingle());
  if (!lot) throw new Error(`Aucun lot « ${lotArg} »`);

  // Seulement celles réellement chez cet agent : le lot en compte 500, une
  // centaine seulement est passée avant l'arrêt.
  const { data: membres } = await sc
    .from("lots_entreprises").select("entreprise_id").eq("lot_id", lot.id);
  const idsDuLot = (membres ?? []).map((m) => Number((m as { entreprise_id: number }).entreprise_id));

  const aRetirer: number[] = [];
  const gardentLeurVerdict: number[] = [];
  for (let i = 0; i < idsDuLot.length; i += 500) {
    const { data } = await sc
      .from("entreprises").select("id, sources")
      .in("id", idsDuLot.slice(i, i + 500))
      .eq("owner_id", agentId);
    for (const r of (data ?? []) as { id: number; sources: string[] | null }[]) {
      aRetirer.push(Number(r.id));
      if ((r.sources ?? []).includes("claude_qualification")) gardentLeurVerdict.push(Number(r.id));
    }
  }

  console.log(`\nLot ${lot.id} « ${lot.nom} »${dryRun ? "   [DRY RUN]" : ""}`);
  console.log(`  ${nombre(aRetirer.length)} fiches à retirer de cet agent`);
  console.log(`  dont ${nombre(gardentLeurVerdict.length)} qualifiées à la main : elles gardent leur verdict\n`);
  if (dryRun || aRetirer.length === 0) return;

  // 1. Le retrait, par la fonction de production.
  let releases = 0;
  const echecs: { entreprise_id: number; error: string }[] = [];
  for (let i = 0; i < aRetirer.length; i += 200) {
    const res = await unassignProspectsFromAgent(aRetirer.slice(i, i + 200), agentId);
    releases += res.released.length;
    echecs.push(...res.failed);
    console.log(`  … ${nombre(releases)} retirées`);
  }

  // 2. `qualifie` remis à false — sauf verdict humain.
  const aDequalifier = aRetirer.filter((id) => !gardentLeurVerdict.includes(id));
  for (let i = 0; i < aDequalifier.length; i += 200) {
    await sc.from("entreprises").update({ qualifie: false }).in("id", aDequalifier.slice(i, i + 200));
  }

  // 3. Les affaires nées de l'attribution : archivées, jamais supprimées.
  for (let i = 0; i < aDequalifier.length; i += 200) {
    await sc
      .from("opportunites")
      .update({
        archived_at: new Date().toISOString(),
        archive_reason: "autre",
        archive_note:
          "Affaire ouverte par une attribution interrompue le 30/08/2026, sur une fiche non qualifiée. " +
          "Retirée pour que la fiche repasse par la qualification avant tout démarchage.",
      })
      .in("entreprise_id", aDequalifier.slice(i, i + 200))
      .is("archived_at", null);
  }

  console.log(`\n  ${nombre(releases)} retirées, ${nombre(aDequalifier.length)} déqualifiées, leurs affaires archivées.`);
  if (echecs.length) console.log(`  ${nombre(echecs.length)} échecs (dont ${echecs[0].error}).`);
  console.log("");
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
