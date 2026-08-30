// Créer une passe de lissage sur un lot, et la faire tourner jusqu'au bout.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI IL EXISTE
// ─────────────────────────────────────────────────────────────────────────────
// `/api/lissage/tick` avance la file, et son en-tête donne même le cron à poser
// — mais ce cron N'EXISTE PAS en production (vérifié le 30/08/2026 : huit jobs
// `cron.job`, aucun nommé `lissage`). Créer une passe et s'en aller laisserait
// donc mille lignes en `a_faire` que rien ne reprendrait jamais : exactement le
// genre de file morte qu'on vient de passer une journée à réparer.
//
// Ce script fait les deux gestes d'affilée — il peuple, puis il tourne — et il
// le fait depuis ce poste, ce qui est cohérent avec la moitié locale du
// lissage. Il ne remplace pas le cron : le jour où une passe doit tourner en
// continu, c'est le cron qu'il faut poser.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE PLAN PAR DÉFAUT EST GRATUIT ET SERVEUR, ET C'EST VOULU
// ─────────────────────────────────────────────────────────────────────────────
// `sujets: ['identite', 'rge']`, `facture: false`, `local: false`. Ces deux
// sujets sont ceux qui répondent à « quels métiers fait cette entreprise » sans
// dépenser un centime : `donnees-publiques` rend le NAF et l'état au registre,
// `ademe-rge` rend les qualifications RGE — c'est-à-dire les métiers DÉCLARÉS,
// souvent plusieurs, là où le NAF n'en donne qu'un seul.
//
// Les deux sujets qu'on n'active pas par défaut coûtent : `fiche_google` passe
// par Places (facturé), `site_web` par le dossier web (local, Playwright, et un
// CAPTCHA qui ne se résout jamais). On les demande explicitement ou pas du tout.
//
// ─────────────────────────────────────────────────────────────────────────────
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   ./scripts/audit/run.sh scripts/lissage/passe-serveur.ts \
//     --lot "Semaine 36 — Renfort à enrichir" [--sujets identite,rge] [--taille 20]
//
// Rejouable : `peuplerPasse` ignore les doublons et ne réinitialise personne.

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
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

  const lotNom = arg("lot");
  if (!lotNom) {
    console.error("Usage : --lot <nom|id> [--sujets identite,rge] [--taille 20]");
    process.exit(1);
  }
  const sujets = (arg("sujets") ?? "identite,rge").split(",").map((s) => s.trim());
  const taille = Number(arg("taille") ?? 20);

  const { getServiceClient } = await import("@/app/api/_lib/service-client");
  const { creerPasse, peuplerPasse } = await import("@/lib/lissage/passe-db");
  const { tickLissage } = await import("@/lib/lissage/moteur");
  const sc = getServiceClient();

  const { data: lot } = await (/^\d+$/.test(lotNom)
    ? sc.from("lots").select("id, nom").eq("id", Number(lotNom)).maybeSingle()
    : sc.from("lots").select("id, nom").eq("nom", lotNom).maybeSingle());
  if (!lot) throw new Error(`Aucun lot « ${lotNom} »`);

  const { data: lignes, error } = await sc
    .from("lots_entreprises")
    .select("entreprise_id")
    .eq("lot_id", lot.id)
    .order("entreprise_id", { ascending: true });
  if (error) throw new Error(error.message);
  const ids = (lignes ?? []).map((l) => Number((l as { entreprise_id: number }).entreprise_id));

  console.log(`\nLot ${lot.id} « ${lot.nom} » — ${nombre(ids.length)} fiches`);
  console.log(`Sujets : ${sujets.join(", ")} · serveur seulement, aucun outil facturé\n`);

  const passe = await creerPasse(sc, {
    nom: `${lot.nom} — ${sujets.join("+")}`,
    criteres: { lot_id: lot.id, lot_nom: lot.nom },
    // `facture: false` et `local: false` : le moteur écarte alors les outils qui
    // coûtent ou qui attendent une machine, et la ligne le DIT au lieu de rester
    // en attente d'un exécuteur qui ne viendra pas.
    plan: { sujets: sujets as never, exigence: "moyenne", facture: false, local: false },
  });
  const ajoutes = await peuplerPasse(sc, passe.id, ids);
  console.log(`Passe ${passe.id} créée — ${nombre(ajoutes)} fiches en file.\n`);

  // ON TOURNE JUSQU'À CE QU'IL NE RESTE RIEN DE PRENABLE. Le garde-fou n'est pas
  // un compteur d'itérations mais `prises === 0` : le moteur rend le nombre de
  // lignes qu'il a pu réclamer, et zéro veut dire que la file serveur est vide —
  // que tout soit réglé ou que le reste attende le local.
  let tours = 0;
  let complets = 0;
  let pannes = 0;
  for (;;) {
    const bilan = await tickLissage(sc, { passeId: passe.id, taille, par: "poste-local" });
    tours += 1;
    complets += bilan.complets;
    pannes += bilan.pannes.length;
    if (tours % 5 === 0 || bilan.prises === 0) {
      console.log(
        `  tour ${tours} — ${nombre(complets)} réglées, ${nombre(pannes)} pannes · ` +
          `reste serveur ${nombre(bilan.reste.serveur)}, local ${nombre(bilan.reste.local)}, humain ${nombre(bilan.reste.humain)}`,
      );
    }
    if (bilan.prises === 0) break;
  }
  console.log(`\n  Terminé en ${nombre(tours)} tours — ${nombre(complets)} fiches réglées.\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
