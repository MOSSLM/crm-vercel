/**
 * Le barème du boost SEO local — et les trois fautes qu'il doit rendre
 * impossibles sur un document qui chiffre un devis chez le prospect.
 *
 *   1. UN PRIX QUI BAISSE QUAND ON AJOUTE DES PAGES. C'est ce que produit un
 *      barème appliqué « en bloc au prix de la dernière tranche » : la 51e page
 *      ferait retomber les cinquante premières à un tarif plus bas, et le
 *      prospect qui compare deux formules verrait la plus grosse coûter moins
 *      cher. Le cumul par tranches l'interdit, et c'est le test qui le tient.
 *   2. UN COMPTE DE MÉTIERS QUI N'EST PAS CELUI DU PRIX DU SITE. Les deux
 *      écrans se suivent dans le document : « 3 métiers » page 4 et « 5 »
 *      page 5 se verrait au premier coup d'œil.
 *   3. UN BARÈME QUI S'ARRÊTE. Neuf métiers sur trente communes font 270 pages ;
 *      une dernière tranche plafonnée rendrait un montant faux sans le dire.
 */
import {
  boostSeoLocal,
  COMMUNES_DES_BUNDLES,
  prixPagesSeoLocal,
  TRANCHES_SEO_LOCAL,
} from "@/lib/audit/prix-seo-local";
import { pagesServiceFacturables } from "@/lib/audit/prix-site";

describe("le barème par tranches", () => {
  it("cumule les tranches au lieu de retenir la dernière", () => {
    // 50 × 8 = 400, puis 40 × 6 = 240.
    expect(prixPagesSeoLocal(30)).toBe(240);
    expect(prixPagesSeoLocal(50)).toBe(400);
    expect(prixPagesSeoLocal(60)).toBe(460);
    expect(prixPagesSeoLocal(90)).toBe(640);
    expect(prixPagesSeoLocal(100)).toBe(700);
  });

  it("ne baisse jamais quand le nombre de pages monte", () => {
    // LA GARDE CENTRALE : un barème plat par palier casse ici dès qu'un palier
    // est mieux négocié que le précédent, et le document devient un argument
    // contre nous — « prenez-en moins, ça vous coûtera plus cher ».
    let precedent = 0;
    for (let pages = 0; pages <= 400; pages += 1) {
      const montant = prixPagesSeoLocal(pages);
      expect(montant).toBeGreaterThanOrEqual(precedent);
      precedent = montant;
    }
  });

  it("continue de chiffrer au-delà de la dernière borne", () => {
    // 9 métiers × 30 communes : le cas qui plafonnerait un barème borné.
    expect(prixPagesSeoLocal(270)).toBe(400 + 100 * 6 + 120 * 4);
  });

  it("rend zéro pour zéro page, sans négatif ni NaN", () => {
    expect(prixPagesSeoLocal(0)).toBe(0);
    expect(prixPagesSeoLocal(-5)).toBe(0);
  });

  it("garde une dernière tranche sans plafond", () => {
    const derniere = TRANCHES_SEO_LOCAL[TRANCHES_SEO_LOCAL.length - 1];
    expect(Number.isFinite(derniere.jusqua)).toBe(false);
  });
});

describe("le boost d'un prospect", () => {
  const troisMetiers = ["Climatisation", "plomberie", "Chauffage"];

  it("compte ses métiers comme le prix du site, pas autrement", () => {
    const boost = boostSeoLocal(troisMetiers);
    expect(boost.pagesService).toBe(pagesServiceFacturables(troisMetiers));
    expect(boost.pagesService).toBe(3);
  });

  it("multiplie ses métiers par les communes de chaque formule", () => {
    const boost = boostSeoLocal(troisMetiers);
    expect(boost.paliers.map((p) => p.communes)).toEqual([...COMMUNES_DES_BUNDLES]);
    expect(boost.paliers.map((p) => p.pages)).toEqual([30, 60, 90]);
    expect(boost.paliers.map((p) => p.montant)).toEqual([240, 460, 640]);
  });

  it("s'adapte au prospect : plus de métiers, plus de pages", () => {
    // C'est toute la raison d'être du calcul — un montant unique afficherait le
    // même devis à un carreleur seul et à une entreprise à cinq métiers.
    const cinq = boostSeoLocal(["climatisation", "plomberie", "chauffage", "électricité", "ventilation"]);
    expect(cinq.paliers[0].pages).toBe(50);
    expect(cinq.paliers[0].montant).toBe(400);
  });

  it("chiffre quand même une fiche sans étiquette reconnue", () => {
    // `pagesServiceFacturables` ne descend jamais sous un métier : le document
    // n'a donc aucune variante vide à porter.
    const rien = boostSeoLocal(["Magasin d'électroménager", null, 42]);
    expect(rien.pagesService).toBe(1);
    expect(rien.paliers.map((p) => p.pages)).toEqual([10, 20, 30]);
  });

  it("écrit ses montants avec les insécables du prix du site", () => {
    const boost = boostSeoLocal(troisMetiers);
    expect(boost.paliers[0].texte).toBe("240\u00A0\u20AC");
    // Le millier se prend sur une fiche qui l'atteint : les insécables sont ce
    // qui empêche le document de couper sa ligne entre 1 et 480.
    const neuf = boostSeoLocal([
      ...troisMetiers, "ventilation", "pompe à chaleur", "photovoltaïque",
      "rénovation générale", "bornes IRVE", "électricité",
    ]);
    expect(neuf.paliers[2].pages).toBe(270);
    expect(neuf.paliers[2].texte).toBe("1\u00A0480\u00A0\u20AC");
  });
});
