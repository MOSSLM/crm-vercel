import sharp from "sharp";
import { versJpegSousLimite } from "../vers-jpeg";

/**
 * Ce test protège la découverte la plus coûteuse du chantier : WhatsApp ne se
 * contente pas d'ignorer une carte trop lourde, il la RÉTROGRADE en vignette
 * carrée minuscule. La composition entière est perdue, et le symptôme ne
 * ressemble pas à une erreur — juste à un affichage raté.
 *
 * `ImageResponse` ne sait sortir que du PNG, sans perte : sur une carte
 * contenant une capture de site, il pèse près de 2 Mo. La conversion en JPEG
 * n'est donc pas une optimisation, c'est ce qui fait exister la grande carte.
 */

/** Une image aussi difficile à compresser qu'une vraie capture de site. */
async function cartePhotographique(): Promise<Uint8Array> {
  const W = 1200;
  const H = 630;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const bande = Math.floor(y / 90) % 2;
      px[i] = (30 + x * 0.12 + (bande ? 90 : 0) + ((x * y) % 23)) % 256;
      px[i + 1] = (45 + y * 0.2 + ((x + y) % 31)) % 256;
      px[i + 2] = (90 + x * 0.05 + ((x * 7 + y * 3) % 19)) % 256;
    }
  }
  const png = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  return new Uint8Array(png);
}

describe("versJpegSousLimite", () => {
  it("fait passer une carte photographique très en dessous de la cible", async () => {
    const png = await cartePhotographique();
    // Le point de départ : c'est ce qu'on envoyait à WhatsApp.
    expect(png.byteLength).toBeGreaterThan(1_000_000);

    const { bytes } = await versJpegSousLimite(png);
    expect(bytes.length).toBeLessThan(280 * 1024);
  });

  it("garde la meilleure qualité possible quand elle tient dans la cible", async () => {
    const { qualite } = await versJpegSousLimite(await cartePhotographique());
    expect(qualite).toBe(88);
  });

  it("descend en qualité quand la cible est sévère, sans jamais rien rendre de vide", async () => {
    const { bytes, qualite } = await versJpegSousLimite(await cartePhotographique(), 40 * 1024);
    expect(qualite).toBeLessThan(88);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("préserve les dimensions OpenGraph annoncées dans les métadonnées", async () => {
    const { bytes } = await versJpegSousLimite(await cartePhotographique());
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
    expect(meta.format).toBe("jpeg");
  });
});
