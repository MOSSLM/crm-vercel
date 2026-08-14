/**
 * L'audit en PDF A4, déposé en base, prêt à être joint à un e-mail.
 *
 * POURQUOI CE SCRIPT PLUTÔT QU'UNE ROUTE. Le PDF se fabriquait à la main :
 * « Enregistrer l'audit » ouvre la fenêtre d'impression et l'opérateur choisit
 * « Enregistrer en PDF ». Ça marche pour un dossier, pas pour une vague — et
 * surtout le fichier reste sur le disque, donc `audits.pdf_url` demeure nul et
 * aucune séquence ne peut le joindre. Ici, le fichier atterrit dans le bucket
 * `audits-pdf` et la colonne est écrite : la chaîne d'envoi devient possible.
 *
 * Rendre du Chromium dans une fonction Vercel demanderait `@sparticuz/chromium`,
 * une cinquantaine de mégaoctets embarqués et des démarrages à froid, pour un
 * geste qui accompagne une passe de préparation déjà locale. Le script tourne
 * donc là où la passe tourne. Le jour où l'audit se prépare sans opérateur, la
 * route reprendra ce fichier presque tel quel : tout ce qu'il fait de spécifique
 * tient dans `renduPdf`.
 *
 * LE MÊME HTML QUE L'ÉCRAN. `documentAudit(corpsCompact(...))` est ce que
 * l'éditeur affiche et ce que la fenêtre d'impression imprime. Aucune seconde
 * implémentation à maintenir, donc aucune divergence possible entre ce que
 * l'opérateur relit et ce que le prospect reçoit.
 *
 *   npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
 *     scripts/audit/pdf.ts <entrepriseId>
 *
 * Les secrets viennent de `.env.local`, lu par le script lui-même : rien n'est
 * passé en argument, donc rien n'apparaît dans un historique de shell.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer";
import { lireAudit } from "@/lib/audit-site/lecture";
import { lireMedianeParc } from "@/lib/audit/mediane-parc";
import { construireMesures, mesuresVides } from "@/lib/audit/mesures";
import { corpsCompact } from "@/utils/audit/htmlCompact";
import { documentAudit } from "@/utils/audit/compactCss";
import type { AuditContent } from "@/types";

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

const BUCKET = "audits-pdf";

async function main(): Promise<void> {
  chargerEnv();

  const entrepriseId = Number(process.argv[2]);
  if (!Number.isFinite(entrepriseId)) {
    throw new Error("Usage : pdf.ts <entrepriseId>");
  }

  /**
   * Deux variables portent l'adresse, et l'une des deux peut mentir.
   *
   * Sur la machine où ce script a été écrit, `NEXT_PUBLIC_SUPABASE_URL` contenait
   * une valeur de soixante-quatre caractères qui n'est pas une adresse — un
   * copier-coller ancien, sans conséquence pour Next qui prend la sienne de
   * Vercel. On retient donc celle qui EST une adresse, plutôt que la première
   * trouvée : un script qui échoue sur « Invalid URL » ne dit pas où regarder.
   */
  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
    /^https?:\/\//.test(v ?? ""),
  );
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) {
    throw new Error(
      "Une adresse Supabase valide (SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY sont requises dans .env.local.",
    );
  }
  const sb = createClient(url, cle, { auth: { persistSession: false } });

  const { data: opp } = await sb
    .from("opportunites")
    .select("id")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  if (!opp) throw new Error(`Aucune opportunité pour l'entreprise ${entrepriseId}.`);

  const { data: audit } = await sb
    .from("audits")
    .select("id, content")
    .eq("opportunite_id", (opp as { id: string }).id)
    .maybeSingle();
  if (!audit) throw new Error(`Aucun audit pour l'entreprise ${entrepriseId}.`);

  // Le relevé passe par le même chemin que l'aperçu : `lireAudit` applique la
  // règle de publication (un axe en confiance faible n'existe pas) et calcule la
  // note. Recomposer ces valeurs ici les ferait diverger au premier changement.
  const lu = await lireAudit(sb, entrepriseId);
  const mesures =
    lu.disponible && lu.audit
      ? construireMesures(lu.audit, await lireMedianeParc(sb))
      : mesuresVides();

  const contenu = (audit as { content: AuditContent }).content;
  const html = documentAudit(
    `Audit — ${contenu.page1?.client_name ?? "entreprise"}`,
    corpsCompact(contenu, mesures),
  );

  const pdf = await renduPdf(html);

  const chemin = `${entrepriseId}/audit-${new Date().toISOString().slice(0, 10)}.pdf`;
  const { error: erreurDepot } = await sb.storage.from(BUCKET).upload(chemin, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (erreurDepot) throw new Error(`Dépôt impossible : ${erreurDepot.message}`);

  const { error: erreurEcriture } = await sb
    .from("audits")
    .update({ pdf_url: chemin, pdf_generated_at: new Date().toISOString() })
    .eq("id", (audit as { id: string }).id);
  if (erreurEcriture) throw new Error(`Écriture impossible : ${erreurEcriture.message}`);

  console.log(`${chemin} — ${(pdf.length / 1024).toFixed(0)} Ko`);
}

/**
 * Le rendu lui-même. Trois précautions, toutes payées d'expérience.
 *
 * `document.fonts.ready` : la fenêtre d'impression attendait déjà les polices,
 * parce qu'une seconde de délai suffit d'habitude et pas toujours — et quand
 * elle ne suffit pas, le document sort en Times New Roman, ce que personne ne
 * voit avant le prospect.
 *
 * `printBackground` : sans lui, le navigateur retire les aplats sombres et la
 * couverture nuit sort en blanc.
 *
 * `preferCSSPageSize` : la feuille déclare `@page{size:A4;margin:0}`, et c'est
 * elle qui doit décider. Passer le format en option ici rouvrirait la porte au
 * format US Letter et aux marges par défaut du navigateur — les trois symptômes
 * déjà vécus sur ce document.
 */
async function renduPdf(html: string): Promise<Buffer> {
  const navigateur = await puppeteer.launch({ headless: true });
  try {
    const page = await navigateur.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(
      await page.pdf({ printBackground: true, preferCSSPageSize: true, pageRanges: "1-3" }),
    );
  } finally {
    await navigateur.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
