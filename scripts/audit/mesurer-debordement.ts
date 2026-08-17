/**
 * Ce que le document coupe, demi-page par demi-page, en chiffres.
 *
 * `.sheet` et `.half` portent tous deux `overflow:hidden` — la feuille de style
 * le dit elle-même : ça fait disparaître SANS RIEN SIGNALER tout bloc qui
 * déborde. Le seul plafond en amont est `MAX_LIGNES_AVANT_APRES = 3` ; rien ne
 * borne les six cartes d'axes, ni la longueur des intros, ni le nombre de
 * livrables. Le symptôme n'apparaît donc qu'au moment le plus coûteux : sur le
 * PDF enregistré depuis la fenêtre d'impression, devant le prospect.
 *
 * On mesure DEUX FOIS la même page : aux dimensions d'écran (794 × 1123 px)
 * puis à celles de l'impression (210 × 296,6 mm), parce que la question posée
 * est justement « pourquoi ça se coupe quand j'enregistre en A4 ». Si les deux
 * relevés coïncident, le débordement n'a rien à voir avec l'impression et se
 * voyait déjà à l'écran, silencieusement.
 *
 *   npx ts-node -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
 *     scripts/audit/mesurer-debordement.ts chemin/vers/document.html
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import puppeteer from "puppeteer";

type Releve = {
  rang: number;
  nom: string;
  boite: number;
  contenu: number;
  coupe: number;
};

const LARGEUR_ECRAN = 794;

async function main(): Promise<void> {
  const fichier = resolve(process.argv[2] ?? "/tmp/audit-pire-cas.html");
  const html = readFileSync(fichier, "utf8");

  const navigateur = await puppeteer.launch({ headless: true });
  try {
    const page = await navigateur.newPage();
    await page.setViewport({ width: LARGEUR_ECRAN, height: 1200, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    // Les polices décident des hauteurs de texte : mesurer avant leur arrivée
    // donnerait le débordement d'un autre document que celui qu'on envoie.
    await page.evaluate(() => document.fonts.ready);

    const mesurer = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".half")].map((h, i) => {
          // `scrollHeight` suffit rarement : un enfant en position absolue ou un
          // `margin-top:auto` ne le gonflent pas. On prend donc aussi le bas du
          // dernier enfant, et le maximum des deux.
          const enfants = [...h.children] as HTMLElement[];
          const bas = enfants.length
            ? Math.max(...enfants.map((e) => e.offsetTop + e.offsetHeight))
            : 0;
          const contenu = Math.max(h.scrollHeight, bas);
          return {
            rang: i + 1,
            nom: h.getAttribute("data-screen-label") ?? h.className,
            boite: Math.round(h.clientHeight),
            contenu: Math.round(contenu),
            coupe: Math.round(contenu - h.clientHeight),
          };
        }),
      );

    const ecran: Releve[] = await mesurer();

    // Les règles exactes du bloc `@media print` de `compactCss`, appliquées à
    // l'écran : c'est la seule façon de comparer les deux mises en page sans
    // dépendre de l'émulation d'impression, qui ne rend pas de mesures.
    await page.addStyleTag({
      content: ".sheet{width:210mm!important;height:296.6mm!important}html,body{width:210mm!important}",
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    const impression: Releve[] = await mesurer();

    const ligne = (r: Releve, autre: Releve) =>
      `${String(r.rang).padStart(2)} │ ${r.nom.padEnd(30).slice(0, 30)} │ ` +
      `${String(r.boite).padStart(5)} │ ${String(r.contenu).padStart(6)} │ ` +
      `${(r.coupe > 0 ? `−${r.coupe} px` : "—").padStart(9)} │ ` +
      `${(autre.coupe > 0 ? `−${autre.coupe} px` : "—").padStart(9)}`;

    console.log("   │ demi-page                      │ boîte │ contenu│  à l'écran│ à l'impr.");
    console.log("───┼────────────────────────────────┼───────┼────────┼───────────┼──────────");
    ecran.forEach((r, i) => console.log(ligne(r, impression[i])));

    const coupees = impression.filter((r) => r.coupe > 0);
    console.log("");
    if (coupees.length === 0) {
      console.log("Aucune demi-page ne déborde sur ce cas.");
    } else {
      console.log(
        `${coupees.length} demi-page(s) coupée(s) à l'impression : ` +
          coupees.map((r) => `${r.nom} (−${r.coupe} px)`).join(", "),
      );
    }
    const ecart = impression.filter((r, i) => r.coupe > 0 && ecran[i].coupe <= 0);
    console.log(
      ecart.length === 0
        ? "Le débordement est le MÊME à l'écran : il ne vient pas de l'impression."
        : `${ecart.length} demi-page(s) ne débordent QU'À l'impression.`,
    );
  } finally {
    await navigateur.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
