/**
 * Les plaquettes du jour, en PDF, fabriquées d'un coup.
 *
 * LE BESOIN, DIT PAR MATTEO : « il faudra créer au préalable les PDF, comme on
 * crée les sites à l'avance sauf que là c'est un fichier ». La plaquette ne part
 * plus en lien mais en pièce jointe ; sans fichier prêt, chaque envoi ouvre une
 * boîte d'impression, et quarante-neuf boîtes d'impression ne se téléchargent
 * pas en lot. Cette passe transforme quarante-neuf dialogues en quarante-neuf
 * fichiers.
 *
 * POURQUOI UN SCRIPT ET PAS UNE ROUTE — la même raison que `scripts/audit/pdf.ts`
 * et elle n'a pas bougé : Chromium ne tient pas dans une fonction Vercel sans
 * `@sparticuz/chromium`, une cinquantaine de mégaoctets et des démarrages à
 * froid. La passe accompagne une préparation déjà locale ; elle tourne où la
 * préparation tourne.
 *
 * CE QUI DIFFÈRE DU SCRIPT D'AUDIT, ET C'EST VOULU. L'audit reconstruit son HTML
 * dans le script (`documentAudit(corpsCompact(...))`). Ici on NAVIGUE vers la
 * page réelle, `/plaquette/{jeton}?a4`. Le rendu A4 de la plaquette est un
 * composant serveur qui lit les offres du jour, la capture de la démo et le prix
 * du prospect : le recopier ici créerait un second document qui divergerait du
 * premier au premier changement de tarif. Une seule vérité, celle que le
 * prospect verrait.
 *
 * `?a4` ET PAS `?a4&imprimer` : la version imprimable ouvre la boîte du
 * navigateur, dont Chromium sans tête n'a que faire — et `page.pdf()` fait déjà
 * le travail. Le `?a4` seul ne compte pas d'ouverture (cf. la page) : la passe
 * ne fabrique donc pas quarante-neuf fausses lectures au nom des prospects.
 *
 * CE QUE LE FICHIER FIGE, ET QU'IL FAUT SAVOIR. La plaquette servie en ligne
 * relit les prix du catalogue à CHAQUE ouverture — c'est ce qui l'empêche
 * d'annoncer un tarif périmé. Un PDF, lui, est une photo. Le nom du fichier
 * porte donc sa date, et la règle qui va avec : on refabrique avant chaque
 * vague, on ne réutilise pas les fichiers du mois dernier.
 *
 *   npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
 *     scripts/prospection/plaquettes-pdf.ts [--refaire]
 *
 * Sans `--refaire`, les tâches qui ont déjà un PDF sont sautées : relancer la
 * passe après une coupure reprend là où elle s'est arrêtée au lieu de tout
 * refabriquer.
 *
 * Les secrets viennent de `.env.local`, lu par le script lui-même.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import puppeteer, { type Browser } from "puppeteer";

/** Charge `.env.local` sans dépendance : le format est trivial, la lire l'est aussi. */
function chargerEnv(): void {
  const chemin = resolve(process.cwd(), ".env.local");
  if (!existsSync(chemin)) return;
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, cle, brut] = m;
    if (process.env[cle]) continue;
    process.env[cle] = brut.trim().replace(/^["']|["']$/g, "");
  }
}

export const BUCKET_PLAQUETTES = "plaquettes-pdf";

type Ligne = {
  id: string;
  entreprise_id: number | null;
  payload: Record<string, unknown> | null;
  entreprise: { name: string | null } | { name: string | null }[] | null;
};

/** L'embed PostgREST rend tantôt un objet, tantôt un tableau d'un élément. */
const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Le rendu : on ouvre la page réelle et on l'imprime.
 *
 * Trois précautions, toutes reprises du script d'audit parce qu'elles ont
 * chacune été payées là-bas :
 *   · `document.fonts.ready` — sans lui le document sort en police de repli, et
 *     personne ne le voit avant le prospect ;
 *   · `printBackground` — sans lui le navigateur retire les aplats et la
 *     couverture sombre sort en blanc ;
 *   · `preferCSSPageSize` — la feuille déclare `@page{size:A4;margin:0}`, et
 *     c'est elle qui doit décider. Sinon on retrouve du US Letter et des marges.
 */
async function renduPdf(navigateur: Browser, url: string): Promise<Buffer> {
  const page = await navigateur.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(
      await page.pdf({ printBackground: true, preferCSSPageSize: true }),
    );
  } finally {
    await page.close();
  }
}

/** Le nom du fichier : lisible dans un dossier de téléchargements, et daté. */
export function nomDeFichier(nomEntreprise: string | null, jour = new Date()): string {
  const propre = (nomEntreprise ?? "plaquette")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  return `${propre || "plaquette"}-${jour.toISOString().slice(0, 10)}.pdf`;
}

async function main(): Promise<void> {
  chargerEnv();
  const refaire = process.argv.includes("--refaire");

  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
    /^https?:\/\//.test(v ?? ""),
  );
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) {
    throw new Error(
      "Une adresse Supabase valide (SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY sont requises dans .env.local.",
    );
  }
  const sb: SupabaseClient = createClient(url, cle, { auth: { persistSession: false } });

  // Les tâches qui joignent une plaquette : c'est `plaquette_url` dans le
  // payload qui le dit, posé par le moteur quand l'étape porte
  // `attachPlaquette`. On ne devine rien depuis le texte du message.
  const { data, error } = await sb
    .from("prospection_tasks")
    .select("id, entreprise_id, payload, entreprise:entreprises(name)")
    .in("status", ["pending", "snoozed"])
    .not("payload->>plaquette_url", "is", null)
    .order("due_at");
  if (error) throw new Error(`Lecture impossible : ${error.message}`);

  const lignes = (data ?? []) as Ligne[];
  const aFaire = refaire ? lignes : lignes.filter((l) => !l.payload?.plaquette_pdf);
  if (aFaire.length === 0) {
    console.log(
      lignes.length === 0
        ? "Aucune tâche ne joint de plaquette."
        : `Les ${lignes.length} plaquettes sont déjà fabriquées (--refaire pour les refaire).`,
    );
    return;
  }

  console.log(`${aFaire.length} plaquette(s) à fabriquer.`);
  const navigateur = await puppeteer.launch({ headless: true });
  let faites = 0;
  const rates: string[] = [];

  try {
    for (const ligne of aFaire) {
      const nom = un(ligne.entreprise)?.name ?? `entreprise ${ligne.entreprise_id}`;
      const lien = String(ligne.payload?.plaquette_url ?? "");
      if (!lien) {
        rates.push(`${nom} — aucune adresse de plaquette`);
        continue;
      }
      try {
        const pdf = await renduPdf(navigateur, `${lien}${lien.includes("?") ? "&" : "?"}a4`);
        const fichier = nomDeFichier(nom);
        const chemin = `${ligne.entreprise_id ?? "sans-entreprise"}/${fichier}`;
        const { error: erreurDepot } = await sb.storage
          .from(BUCKET_PLAQUETTES)
          .upload(chemin, pdf, { contentType: "application/pdf", upsert: true });
        if (erreurDepot) throw new Error(erreurDepot.message);

        // Le chemin ET le nom voyagent avec la tâche : le premier pour signer un
        // lien, le second pour que le fichier arrive dans les téléchargements
        // sous un nom qu'on reconnaît sans l'ouvrir.
        const { error: erreurEcriture } = await sb
          .from("prospection_tasks")
          .update({
            payload: {
              ...(ligne.payload ?? {}),
              plaquette_pdf: chemin,
              plaquette_pdf_nom: fichier,
              plaquette_pdf_le: new Date().toISOString(),
            },
          })
          .eq("id", ligne.id);
        if (erreurEcriture) throw new Error(erreurEcriture.message);

        faites++;
        console.log(`  ${faites}/${aFaire.length}  ${nom} — ${(pdf.length / 1024).toFixed(0)} Ko`);
      } catch (e) {
        // UNE PLAQUETTE QUI ÉCHOUE N'ARRÊTE PAS LA VAGUE. On la nomme en fin de
        // passe : relancer le script reprendra celles qui manquent.
        rates.push(`${nom} — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await navigateur.close();
  }

  console.log(`\n${faites} plaquette(s) fabriquée(s).`);
  if (rates.length > 0) {
    console.log(`${rates.length} en échec :`);
    for (const r of rates) console.log(`  · ${r}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
