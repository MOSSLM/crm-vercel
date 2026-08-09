import sharp from "sharp";
import { imageQuasiVide } from "../image-quasi-vide";

/**
 * Ce filet existe parce qu'une capture blanche passe TOUS les contrôles réseau :
 * HTTP 200, bonne taille, vraie image. Seul son contenu la trahit. Ces tests
 * fixent le comportement des deux côtés du seuil, parce que se tromper coûte
 * cher dans les deux sens — rejeter la capture d'un site sobre nous fait perdre
 * le mockup, accepter un écran d'attente met une page blanche sous les yeux du
 * prospect.
 */

/** Un aplat uni : ce que rend un service de capture sur une page pas encore peinte. */
async function aplat(couleur: string): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: couleur } })
    .png()
    .toBuffer();
}

const bloc = (w: number, h: number, couleur: string) =>
  sharp({ create: { width: w, height: h, channels: 3, background: couleur } }).png().toBuffer();

const surBlanc = (calques: sharp.OverlayOptions[]) =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: "#ffffff" } })
    .composite(calques)
    .png()
    .toBuffer();

/**
 * L'écran d'attente de thum.io : fond blanc, une roue et un logo au centre.
 * C'est CETTE image qui s'est retrouvée dans la première carte envoyée en vrai.
 */
async function ecranDAttente(): Promise<Buffer> {
  return surBlanc([
    { input: await bloc(90, 90, "#c9c9c9"), top: 130, left: 255 },
    { input: await bloc(160, 44, "#2b6cb0"), top: 250, left: 220 },
  ]);
}

/** Un site volontairement minimal — le cas le plus dur à ne PAS rejeter. */
async function siteTresSobre(): Promise<Buffer> {
  const ligne = await bloc(420, 16, "#4a4a4a");
  return surBlanc([
    { input: await bloc(600, 70, "#1a2b4c"), top: 0, left: 0 },
    { input: ligne, top: 140, left: 60 },
    { input: ligne, top: 175, left: 60 },
    { input: ligne, top: 210, left: 60 },
    { input: await bloc(170, 46, "#2f6fd0"), top: 270, left: 60 },
  ]);
}

/** Un site avec une image de héros — le cas courant. */
async function siteAvecHero(): Promise<Buffer> {
  return surBlanc([
    { input: await bloc(600, 70, "#1a2b4c"), top: 0, left: 0 },
    { input: await bloc(600, 240, "#7c5a3a"), top: 70, left: 0 },
    { input: await bloc(420, 16, "#4a4a4a"), top: 330, left: 60 },
  ]);
}

describe("imageQuasiVide", () => {
  it("rejette une page entièrement blanche", async () => {
    expect(await imageQuasiVide(await aplat("#ffffff"))).toBe(true);
  });

  it("rejette un aplat de couleur, pas seulement le blanc", async () => {
    expect(await imageQuasiVide(await aplat("#1a2b3c"))).toBe(true);
  });

  it("rejette l'écran d'attente d'un service de capture", async () => {
    // Le cas qui a produit le défaut : une carte parfaite, avec une page
    // blanche dans le cadre navigateur.
    expect(await imageQuasiVide(await ecranDAttente())).toBe(true);
  });

  it("accepte un site volontairement minimal", async () => {
    // Le cas le plus dur : peu de contenu, beaucoup de blanc. Le rejeter nous
    // ferait perdre le mockup sur les sites les plus épurés — donc les plus
    // beaux.
    expect(await imageQuasiVide(await siteTresSobre())).toBe(false);
  });

  it("accepte un site avec une image de héros", async () => {
    expect(await imageQuasiVide(await siteAvecHero())).toBe(false);
  });

  it("ne rejette pas ce qu'elle ne sait pas lire", async () => {
    // Illisible n'est pas vide : l'appelant doit pouvoir décider sur d'autres
    // critères plutôt que de jeter une capture peut-être bonne.
    expect(await imageQuasiVide(Buffer.from("pas une image"))).toBe(false);
  });
});
