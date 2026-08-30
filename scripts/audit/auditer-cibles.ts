// Auditer le site d'une population choisie — regarder, sans rien créer.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI IL EXISTE
// ─────────────────────────────────────────────────────────────────────────────
// La règle du propriétaire, le 30/08/2026 : « on attribue que les qualifiés […]
// ne crée pas d'opportunités aux non qualifiés, c'est-à-dire ceux que t'as
// regardé leur site etc. et à qui tu t'es assuré que refaire leur site serait
// cohérent. »
//
// Il fallait donc un moyen de REGARDER un site sans engager la fiche. Les deux
// chemins habituels ne conviennent pas : l'enrichissement passe par
// `lead_magnet_projects`, qui pend à une opportunité, et l'attribution EN CRÉE
// une en plus de qualifier. `audit-site`, lui, part d'« une entreprise portant
// une URL », écrit dans `entreprises_audit_site`, et ne touche à rien d'autre.
// Il est gratuit — fetch direct et Wayback, aucun PageSpeed, aucun LLM.
//
// C'est donc lui qui porte le jugement « son site vaut-il d'être refait ». Ce
// que le cron `audit-site-tick` fait déjà chaque heure sur sa propre file ; ce
// script fait la même chose sur une population NOMMÉE, sans attendre son tour.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QU'IL N'ÉCRIT PAS
// ─────────────────────────────────────────────────────────────────────────────
// Ni `qualifie`, ni `owner_id`, ni `hidden_in_qualification`, ni la moindre
// opportunité. Il MESURE. Le verdict est un geste séparé, et c'est ce qui permet
// de le relire avant qu'il engage quoi que ce soit.
//
// ⚠️ UN SITE INJOIGNABLE N'EST PAS UNE PANNE, C'EST UN RÉSULTAT — et l'un des
// plus vendables. Le prospect dont le site répond 500 depuis trois mois est
// justement celui qu'on veut appeler. Ne pas traiter ces lignes en erreur.
//
// ─────────────────────────────────────────────────────────────────────────────
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   ./scripts/audit/run.sh scripts/audit/auditer-cibles.ts --lot <nom|id> [--naf-cibles] [--taille 25]
//
// `--naf-cibles` restreint aux NAF que le propriétaire a nommés le 30/08 :
// 43.22B (chauffage/clim/ventilation/PAC), 43.22A (plomberie), 43.21A
// (électricité/IRVE). Sans lui, tout le lot est audité.
//
// `--part i/n` découpe la population en n tranches et n'en traite qu'une. Chaque
// audit est un aller-retour réseau vers un hôte DIFFÉRENT : en séquentiel on
// tourne à trois sites la minute, donc trois heures pour six cents. Quatre
// processus sur quatre tranches ramènent ça à moins d'une heure sans marteler
// personne — la tranche est prise modulo l'identifiant, donc deux processus ne
// se croisent jamais sur la même fiche.

import * as fs from "fs";
import * as path from "path";

/** `.env.local` avant tout import de production — cf. `attribuer-lot.ts`. */
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

/** Les NAF nommés par le propriétaire le 30/08. Voir l'en-tête. */
const NAF_CIBLES = ["43.22A", "43.22B", "43.21A"];

const arg = (nom: string): string | null => {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const nombre = (n: number) => n.toLocaleString("fr-FR");

async function main(): Promise<void> {
  chargerEnv();
  const lotArg = arg("lot");
  if (!lotArg) {
    console.error("Usage : --lot <nom|id> [--naf-cibles] [--taille 25]");
    process.exit(1);
  }
  const nafSeulement = process.argv.includes("--naf-cibles");
  const taille = Number(arg("taille") ?? 25);
  const partArg = arg("part");
  const [partIdx, partTot] = partArg ? partArg.split("/").map(Number) : [1, 1];
  if (!Number.isFinite(partIdx) || !Number.isFinite(partTot) || partIdx < 1 || partIdx > partTot) {
    console.error("--part doit s'écrire i/n, avec 1 <= i <= n");
    process.exit(1);
  }

  const { getServiceClient } = await import("@/app/api/_lib/service-client");
  const { analyserLot } = await import("@/lib/audit-site/service");
  const sc = getServiceClient();

  const { data: lot } = await (/^\d+$/.test(lotArg)
    ? sc.from("lots").select("id, nom").eq("id", Number(lotArg)).maybeSingle()
    : sc.from("lots").select("id, nom").eq("nom", lotArg).maybeSingle());
  if (!lot) throw new Error(`Aucun lot « ${lotArg} »`);

  const { data: membres, error } = await sc
    .from("lots_entreprises")
    .select("entreprise_id")
    .eq("lot_id", lot.id)
    .order("entreprise_id", { ascending: true });
  if (error) throw new Error(error.message);
  const ids = (membres ?? []).map((m) => Number((m as { entreprise_id: number }).entreprise_id));

  // La population, par paquets de 500 : un `in()` de mille identifiants passe
  // mal, et on a besoin des colonnes du contexte pour que le score soit juste.
  const cibles: {
    entreprise_id: number; url: string | null; nom: string | null; ville: string | null;
    telephone: string | null; note_moyenne: number | null; nombre_avis: number | null;
  }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const tranche = ids.slice(i, i + 500);
    let q = sc
      .from("entreprises")
      .select("id, name, ville, telephone, note_moyenne, nombre_avis, site_web_canonique, canonical_url")
      .in("id", tranche);
    const { data, error: e2 } = await q;
    if (e2) throw new Error(e2.message);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      cibles.push({
        entreprise_id: Number(r.id),
        url: (r.site_web_canonique as string) || (r.canonical_url as string) || null,
        nom: (r.name as string) ?? null,
        ville: (r.ville as string) ?? null,
        telephone: (r.telephone as string) ?? null,
        note_moyenne: (r.note_moyenne as number) ?? null,
        nombre_avis: (r.nombre_avis as number) ?? null,
      });
    }
  }

  // Le filtre NAF se pose ICI et pas dans la requête : `naf_code` vit dans
  // `entreprises_donnees_publiques`, une autre table, et la jointure PostgREST
  // sur mille identifiants coûte plus qu'une lecture séparée.
  let retenus = cibles;
  if (nafSeulement) {
    const nafs = new Map<number, string | null>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await sc
        .from("entreprises_donnees_publiques")
        .select("entreprise_id, naf_code, etat_administratif")
        .in("entreprise_id", ids.slice(i, i + 500));
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const actif = (r.etat_administratif as string | null) ?? "A";
        nafs.set(Number(r.entreprise_id), actif === "A" ? ((r.naf_code as string) ?? null) : null);
      }
    }
    retenus = cibles.filter((c) => NAF_CIBLES.includes(nafs.get(c.entreprise_id) ?? ""));
  }

  // Le modulo est pris sur l'identifiant et non sur le rang : le rang dépend de
  // l'ordre de lecture, l'identifiant non. Deux tranches restent donc disjointes
  // même si une fiche entre ou sort du lot entre deux lancements.
  if (partTot > 1) retenus = retenus.filter((c) => c.entreprise_id % partTot === partIdx % partTot);

  console.log(`\nLot ${lot.id} « ${lot.nom} »${partTot > 1 ? `  [tranche ${partIdx}/${partTot}]` : ""}`);
  console.log(`  ${nombre(cibles.length)} fiches, ${nombre(retenus.length)} retenues${nafSeulement ? ` (NAF ${NAF_CIBLES.join("/")})` : ""}`);
  console.log(`  audit gratuit — aucune opportunité, aucun LLM, aucun PageSpeed\n`);

  let faits = 0;
  for (let i = 0; i < retenus.length; i += taille) {
    const paquet = retenus.slice(i, i + taille);
    // Budget large : ici on n'est pas sous la contrainte d'une requête HTTP,
    // et rendre la main au milieu d'un paquet ne servirait qu'à le refaire.
    const { traitees } = await analyserLot(sc, paquet, { budgetMs: 10 * 60_000 });
    faits += traitees.length;
    console.log(`  ${nombre(faits)} / ${nombre(retenus.length)} auditées`);
  }
  console.log(`\n  Terminé — ${nombre(faits)} sites mesurés. Aucun verdict écrit.\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
