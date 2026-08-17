/**
 * Relecture À L'ŒIL des villes à prospecter — ce n'est pas un test.
 *
 * Deux choses ne se vérifient pas en jsdom, et ce sont les deux qui comptent :
 *  1. le CLASSEMENT sur de vraies données — un rattachement d'adresse qui
 *     dérape n'échoue nulle part, il affiche seulement Bordeaux comme vierge ;
 *  2. le RENDU — jetons de couleur, chevauchement des noms sur la carte de
 *     France, tenue des cartes sur le thème sombre.
 *
 * Ce fichier lit la vraie base (via `.env.local`, comme l'application), écrit
 * le classement dans la console et la page rendue sur disque.
 *
 *     npx jest --testMatch='**\/villes-a-prospecter.manual.tsx'
 *     METIER=plomberie npx jest --testMatch='**\/villes-a-prospecter.manual.tsx'
 *
 * Sans `.env.local` lisible, le fichier se rabat sur un jeu de démonstration :
 * il reste exécutable ailleurs, et le rendu reste relisible.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { act, render } from "@testing-library/react";
import { createClient } from "@supabase/supabase-js";
import { VillesAProspecter } from "../VillesAProspecter";
import { METIER_PAR_DEFAUT, METIERS, metierParTag } from "@/lib/gmaps/metiers";
import {
  classerVilles,
  compterFiches,
  densiteReference,
  indexerCommunes,
  type CommuneCandidate,
  type FicheBrute,
  type RecherchePassee,
} from "@/lib/gmaps/prospection";

const RACINE = path.resolve(__dirname, "../../../..");
const SORTIE = path.join(os.tmpdir(), "apercu-villes-a-prospecter.html");

/** Ce que la route rendrait ; rempli avant le rendu, lu par le faux fetch. */
let reponseSuggestions: unknown = null;

jest.mock("@/utils/authedFetch", () => ({
  authedFetch: jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => reponseSuggestions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any,
}));

beforeAll(() => {
  // Le fond de carte est servi depuis public/ dans l'application : ici, du
  // disque. Ce faux `fetch` n'a pas à savoir joindre le réseau — le client
  // Supabase reçoit le sien (`node-fetch`), jsdom n'en fournissant aucun.
  global.fetch = jest.fn(async (url: unknown) => {
    const fichier = path.join(RACINE, "public", String(url));
    if (!fs.existsSync(fichier)) return { ok: false, status: 404 } as Response;
    return {
      ok: true,
      json: async () => JSON.parse(fs.readFileSync(fichier, "utf8")),
    } as Response;
  }) as unknown as typeof fetch;
});

/** Lit `.env.local` sans jamais l'afficher : seules les clés sortent d'ici. */
function lireEnv(): Record<string, string> {
  const fichier = path.join(RACINE, ".env.local");
  if (!fs.existsSync(fichier)) return {};
  const env: Record<string, string> = {};
  for (const ligne of fs.readFileSync(fichier, "utf8").split("\n")) {
    const trouve = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne.trim());
    if (trouve) env[trouve[1]] = trouve[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const DEMO = {
  communes: [
    { code: "13055", nom: "Marseille", population: 886040, lat: 43.28, lon: 5.38, codesPostaux: ["13001"] },
    { code: "06088", nom: "Nice", population: 357737, lat: 43.7, lon: 7.25, codesPostaux: ["06000"] },
    { code: "44109", nom: "Nantes", population: 327734, lat: 47.24, lon: -1.56, codesPostaux: ["44000"] },
    { code: "67482", nom: "Strasbourg", population: 293771, lat: 48.57, lon: 7.76, codesPostaux: ["67000"] },
    { code: "59350", nom: "Lille", population: 238246, lat: 50.63, lon: 3.05, codesPostaux: ["59000"] },
    { code: "66136", nom: "Perpignan", population: 120000, lat: 42.7, lon: 2.9, codesPostaux: ["66000"] },
  ] as CommuneCandidate[],
  fiches: Array.from({ length: 60 }, () => ({
    adresse: "1 rue A, 66000 Perpignan",
    keyword: "climatisation",
  })) as FicheBrute[],
  recherches: [
    { lieu: "Nice, France", motsCles: ["climatisation"], rapide: true },
  ] as RecherchePassee[],
};

async function lireLaBase(): Promise<typeof DEMO | null> {
  const env = lireEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const clef = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clef) return null;
  const client = createClient(url, clef, {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    global: { fetch: require("node-fetch") as any },
  });

  const communes = await client
    .from("communes_fr")
    .select("code_insee, nom, population, lat, lon, codes_postaux")
    .gte("population", 20000)
    .order("population", { ascending: false })
    .limit(1000);
  if (communes.error) throw new Error(communes.error.message);

  const fiches: FicheBrute[] = [];
  for (let debut = 0; debut < 60_000; debut += 1000) {
    const lot = await client
      .from("entreprises_raw")
      .select("adresse, keyword")
      .not("adresse", "is", null)
      .order("id", { ascending: true })
      .range(debut, debut + 999);
    if (lot.error) throw new Error(lot.error.message);
    fiches.push(...(lot.data ?? []).map((l) => ({ adresse: l.adresse, keyword: l.keyword })));
    if ((lot.data ?? []).length < 1000) break;
  }

  const jobs = await client.from("crawl_jobs").select("status, metadata").limit(1000);
  if (jobs.error) throw new Error(jobs.error.message);

  return {
    communes: (communes.data ?? []).map((c) => ({
      code: String(c.code_insee),
      nom: String(c.nom),
      population: Number(c.population) || 0,
      lat: Number(c.lat),
      lon: Number(c.lon),
      codesPostaux: Array.isArray(c.codes_postaux) ? c.codes_postaux.map(String) : [],
    })),
    fiches,
    recherches: (jobs.data ?? [])
      .filter((j) => String(j.status) !== "error")
      .map((j) => {
        const meta = (j.metadata ?? {}) as Record<string, unknown>;
        return {
          lieu: String(meta.location ?? ""),
          motsCles: Array.isArray(meta.businessTypes) ? meta.businessTypes.map(String) : [],
          rapide: meta.exploration === "rapide" || Number(meta.tuilesMax ?? 0) > 0,
        };
      })
      .filter((r) => r.lieu !== ""),
  };
}

it("écrit un aperçu des villes à prospecter", async () => {
  const metier = metierParTag(process.env.METIER ?? "") ?? METIER_PAR_DEFAUT;
  let source = "démonstration";
  let donnees = DEMO;
  try {
    const reelles = await lireLaBase();
    if (reelles) {
      donnees = reelles;
      source = "base réelle";
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("base injoignable, repli sur le jeu de démonstration :", err);
  }

  const villes = classerVilles({ ...donnees, metier });
  const index = indexerCommunes(donnees.communes);
  const parCommune = compterFiches(donnees.fiches, index, metier);
  const densite = densiteReference(parCommune, donnees.communes);

  /* eslint-disable no-console */
  console.log(
    `\n=== ${metier.tag} (${source}) — ${donnees.communes.length} communes, ` +
      `${donnees.fiches.length} fiches, ${donnees.recherches.length} recherches passées`,
  );
  console.log(
    `étalon : ${densite === null ? "aucun" : densite.toFixed(1)} fiches / 100 000 hab., ` +
      `sur ${parCommune.size} villes couvertes`,
  );
  console.log(
    `classement : ${villes.length} villes, soit ${Math.ceil(villes.length / 12)} pages de 12 ` +
      `(${new Set(villes.map((v) => v.departement)).size} départements)`,
  );
  console.table(
    villes.slice(0, 12).map((v) => ({
      ville: v.nom,
      dep: v.departement,
      hab: v.population,
      fiches: v.fiches,
      attendu: v.attendu,
      manque: v.manque,
      passage: v.passage,
    })),
  );
  // Contrôle de bon sens : les villes qu'on SAIT couvertes ne doivent pas
  // remonter en tête. Affiché plutôt qu'asserté — c'est une relecture.
  const temoins = ["Perpignan", "Toulouse", "Reims", "Dijon", "Clermont-Ferrand", "Limoges"];
  console.log(
    "témoins déjà couverts présents dans le classement :",
    villes.filter((v) => temoins.includes(v.nom)).map((v) => `${v.nom}(${v.fiches})`).join(", ") ||
      "aucun",
  );
  /* eslint-enable no-console */

  reponseSuggestions = {
    metier: { tag: metier.tag, motCle: metier.motCle },
    metiers: METIERS.map((m) => ({ tag: m.tag, motCle: m.motCle })),
    villes,
    total: villes.length,
    etalon: {
      densite: densite === null ? null : Math.round(densite * 10) / 10,
      villesCouvertes: parCommune.size,
      fiches: [...parCommune.values()].reduce((s, n) => s + n, 0),
    },
    tronque: false,
  };

  const { container } = render(
    <VillesAProspecter onLancer={() => {}} lieuxEnFile={new Set()} />,
  );

  // Les suggestions ET le fond de carte arrivent par promesse : sans ces tours
  // de boucle on écrirait la page avant que la France ne soit tracée.
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });

  const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");
  const globals = lire("src/app/(crm)/globals.css");
  const jetons = (globals.match(/:root\s*\{[\s\S]*?\}/) ?? [""])[0];
  const jetonsSombres = (globals.match(/\.dark\s*\{[\s\S]*?\}/) ?? [""])[0];

  const page = (theme: "clair" | "sombre") => `<!doctype html><meta charset="utf-8">
<title>Aperçu — villes à prospecter (${theme})</title>
<style>
${jetons}
${jetonsSombres}
body { margin:0; padding:24px; font-family: var(--font-family-base, system-ui, sans-serif);
       background: ${theme === "sombre" ? "#071426" : "var(--bg)"}; }
.volet { max-width: 1120px; margin: 0 auto; }
${lire("src/app/(crm)/carte/carte.css")}
${lire("src/components/gmaps/carte-recherche.css")}
</style>
<body class="${theme === "sombre" ? "dark" : ""}">
<div class="volet">${container.innerHTML}</div>`;

  fs.writeFileSync(SORTIE.replace(".html", "-clair.html"), page("clair"));
  fs.writeFileSync(SORTIE.replace(".html", "-sombre.html"), page("sombre"));
  // eslint-disable-next-line no-console
  console.log("aperçus écrits :", SORTIE.replace(".html", "-{clair,sombre}.html"));
});
