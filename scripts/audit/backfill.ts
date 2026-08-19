/**
 * L'analyse de site en masse, depuis ta machine.
 *
 * POURQUOI CE SCRIPT EXISTE
 * Le cron `/api/cron/audit-site` plafonne à 30 sites par heure. Ce n'est ni un
 * quota d'API ni une limite de politesse : l'analyse ne consomme AUCUN service
 * payant (des `fetch` HTTP, plus une requête gratuite à web.archive.org). C'est
 * `maxDuration = 60` sur Vercel — 50 s de budget utile — qui fixe le lot. Hors
 * du serverless, cette contrainte n'existe pas.
 *
 * Et `analyserLot` est SÉQUENTIEL, ce qui est le bon choix sous un budget de
 * 50 s mais le mauvais pour vider 24 000 sites. Ici, un pool de workers fait le
 * même travail avec exactement le même code d'analyse — `analyserEntreprise`,
 * la fonction qu'appellent la route et le cron. Aucune seconde implémentation.
 *
 * ORDRE DE GRANDEUR MESURÉ (18/08/2026, non extrapolé) : 0,4 site/s à
 * `--concurrence 3`, soit ~2,5 s par site et par worker — c'est web.archive.org
 * qui domine, pas le site lui-même. Le parc de 24 000 demande donc ~8 h à
 * `--concurrence 6` et ~4 h à 12. Ce n'est pas une soirée, c'est une nuit : le
 * lancer avant d'aller dormir plutôt que d'attendre devant.
 *
 * POURQUOI 6 EN PARALLÈLE ET PAS 50
 * web.archive.org est gratuit et lent (parfois plusieurs secondes), et c'est
 * lui qui donne l'ancienneté du site. Le marteler, c'est se faire jeter et
 * perdre la donnée la plus vendable du rapport. Six requêtes de front tiennent
 * la cadence sans que ça se voie. À ajuster vers le haut en connaissance de
 * cause, pas par optimisme.
 *
 * DEUX FILES, PARCE QUE CE NE SONT PAS LES MÊMES ENTREPRISES
 *   (défaut)        la vue `v_audit_site_a_rafraichir` — jamais analysées, ou
 *                   dont l'URL a changé. C'est le rattrapage du parc.
 *   --sans-techno   les lignes DÉJÀ analysées dont les `signaux` n'ont pas la
 *                   clé `cms` : elles ont été écrites avant que la détection de
 *                   technologie existe. La vue ne les rend plus (leur URL n'a
 *                   pas changé), et pourtant ce sont elles qui manquent au
 *                   rapport technique de la fiche.
 *
 * USAGE
 *   ./scripts/audit/run.sh scripts/audit/backfill.ts --simulation
 *   ./scripts/audit/run.sh scripts/audit/backfill.ts --sans-techno --max 200
 *   ./scripts/audit/run.sh scripts/audit/backfill.ts --concurrence 8
 *
 * Interrompre avec Ctrl+C ne casse rien : chaque entreprise est écrite dès
 * qu'elle est analysée, il n'y a pas de transaction d'ensemble à perdre.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  analyserEntreprise,
  chargerCibles,
  chargerDetailConserve,
  type CibleAudit,
} from "@/lib/audit-site/service";

function chargerEnv(): void {
  const chemin = resolve(process.cwd(), ".env.local");
  if (!existsSync(chemin)) return;
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function client(): SupabaseClient {
  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
    /^https?:\/\//.test(v ?? ""),
  );
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error("Adresse Supabase valide et clé de service requises (.env.local).");
  return createClient(url, cle, { auth: { persistSession: false } });
}

/** Un drapeau `--nom valeur`, ou son défaut. */
function option(nom: string, defaut: number): number {
  const i = process.argv.indexOf(`--${nom}`);
  if (i < 0) return defaut;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : defaut;
}

const aDrapeau = (nom: string): boolean => process.argv.includes(`--${nom}`);

/** `--ids 5,8,42` — rejouer des fiches précises, quelle que soit leur file. */
function idsDemandes(): number[] {
  const i = process.argv.indexOf("--ids");
  if (i < 0) return [];
  return (process.argv[i + 1] ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Les entreprises déjà analysées à qui il manque la détection de technologie.
 *
 * On reconstruit la cible à la main — la vue ne les rend plus — en reprenant
 * les mêmes colonnes qu'elle : sans `nom`/`ville`/`note_moyenne`, les preuves
 * du pilier « popularité » repasseraient en « inconnu » et la ré-analyse
 * appauvrirait la fiche au lieu de l'enrichir.
 */
async function ciblesSansTechno(sb: SupabaseClient, max: number): Promise<CibleAudit[]> {
  const { data: lignes, error } = await sb
    .from("entreprises_audit_site")
    .select("entreprise_id")
    .is("signaux->>cms", null)
    .gt("http_status", 0)
    .limit(max);
  if (error) throw new Error(`sélection sans-techno : ${error.message}`);

  return ciblesDepuisIds(
    sb,
    (lignes ?? []).map((l) => Number((l as { entreprise_id: number }).entreprise_id)),
  );
}

/** Les mêmes colonnes que la vue, pour un ensemble d'id donné. */
async function ciblesDepuisIds(sb: SupabaseClient, ids: number[]): Promise<CibleAudit[]> {
  if (ids.length === 0) return [];

  const { data: ents, error: e2 } = await sb
    .from("entreprises")
    .select("id, name, ville, site_web_canonique, nombre_avis, note_moyenne, telephone")
    .in("id", ids)
    .is("archived_at", null);
  if (e2) throw new Error(`lecture entreprises : ${e2.message}`);

  const { data: rge } = await sb
    .from("entreprise_rge_qualifications")
    .select("entreprise_id, nom_qualification, code_qualification")
    .in("entreprise_id", ids)
    .is("retiree_le", null);

  const parEntreprise = new Map<number, string[]>();
  for (const q of (rge ?? []) as Array<{
    entreprise_id: number;
    nom_qualification: string | null;
    code_qualification: string | null;
  }>) {
    const libelle = q.nom_qualification ?? q.code_qualification;
    if (!libelle) continue;
    const liste = parEntreprise.get(q.entreprise_id) ?? [];
    if (!liste.includes(libelle)) liste.push(libelle);
    parEntreprise.set(q.entreprise_id, liste);
  }

  return ((ents ?? []) as Array<{
    id: number;
    name: string | null;
    ville: string | null;
    site_web_canonique: string | null;
    nombre_avis: number | null;
    note_moyenne: number | null;
    telephone: string | null;
  }>)
    // Sans URL il n'y a rien à mesurer : ces lignes-là ne gagneront jamais de
    // technologie, les reprendre serait tourner à vide.
    .filter((e) => (e.site_web_canonique ?? "").trim() !== "")
    .map((e) => ({
      entreprise_id: e.id,
      url: e.site_web_canonique,
      nom: e.name,
      ville: e.ville,
      nombre_avis: e.nombre_avis,
      note_moyenne: e.note_moyenne,
      telephone: e.telephone,
      qualifications_rge: parEntreprise.get(e.id) ?? null,
    }));
}

/** Exécute `travail` sur chaque élément, `n` de front, sans rien accumuler. */
async function enParallele<T>(
  items: T[],
  n: number,
  travail: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let curseur = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = curseur++;
        if (i >= items.length) return;
        await travail(items[i], i);
      }
    }),
  );
}

async function main(): Promise<void> {
  chargerEnv();
  const sb = client();

  const concurrence = option("concurrence", 6);
  const max = option("max", Number.MAX_SAFE_INTEGER);
  const sansTechno = aDrapeau("sans-techno");
  const simulation = aDrapeau("simulation");

  const ids = idsDemandes();
  const cibles = ids.length
    ? await ciblesDepuisIds(sb, ids)
    : sansTechno
      ? await ciblesSansTechno(sb, Math.min(max, 5000))
      : await chargerCibles(sb, Math.min(max, 5000));

  const file = ids.length
    ? "id demandés"
    : sansTechno
      ? "déjà analysées, sans technologie"
      : "jamais analysées ou URL changée";
  console.log(`File « ${file} » : ${cibles.length} entreprise(s) à traiter.`);

  if (cibles.length === 0) return;
  if (simulation) {
    for (const c of cibles.slice(0, 10)) console.log(`  ${c.entreprise_id}  ${c.nom ?? "?"}  ${c.url}`);
    if (cibles.length > 10) console.log(`  … et ${cibles.length - 10} autres.`);
    console.log("\nSimulation — rien n'a été écrit. Relancer sans --simulation pour analyser.");
    return;
  }

  // Une requête pour tout le lot, comme le fait `analyserLot` : à l'intérieur
  // de la boucle, chaque aller-retour se paierait sur chaque entreprise.
  const detailConserve = await chargerDetailConserve(sb, cibles.map((c) => c.entreprise_id));

  const debut = Date.now();
  let faites = 0;
  const compte = { ok: 0, injoignable: 0, erreur: 0, ignore: 0 };

  await enParallele(cibles, concurrence, async (cible) => {
    const r = await analyserEntreprise(sb, cible, { detailConserve, declencheur: "backfill" });
    compte[r.statut] = (compte[r.statut] ?? 0) + 1;
    faites += 1;
    if (faites % 25 === 0 || faites === cibles.length) {
      const parSeconde = faites / ((Date.now() - debut) / 1000);
      const reste = Math.round((cibles.length - faites) / Math.max(parSeconde, 0.01));
      console.log(
        `  ${faites}/${cibles.length}  ·  ${parSeconde.toFixed(1)}/s  ·  reste ~${Math.ceil(reste / 60)} min`,
      );
    }
  });

  const duree = Math.round((Date.now() - debut) / 1000);
  console.log(
    `\nTerminé en ${duree} s — ok ${compte.ok}, injoignables ${compte.injoignable}, ` +
      `erreurs ${compte.erreur}, ignorées ${compte.ignore}.`,
  );
  if (cibles.length >= 5000) {
    console.log("Lot plafonné à 5000 : relancer pour continuer.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
