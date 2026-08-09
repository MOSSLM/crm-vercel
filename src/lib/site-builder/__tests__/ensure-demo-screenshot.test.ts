/**
 * Ce que ces tests protègent : la vignette part dans des emails et des WhatsApp
 * envoyés automatiquement, sans personne devant l'écran pour la regarder. Les
 * défauts visés ici ne se voient donc pas — ils se lisent chez le prospect.
 *
 *   - un téléphone absent une fois, absent pour toujours ;
 *   - un « Refaire » qui, en cas d'échec, DÉGRADE une carte correcte ;
 *   - une colonne de migration récente qui fait échouer l'écriture entière.
 */

import sharp from "sharp";
import { ensureDemoScreenshot } from "../ensure-demo-screenshot";

jest.mock("@/lib/site-builder/render-provider", () => ({
  renderViewportShot: jest.fn(),
}));
jest.mock("@/lib/og/storage", () => ({
  putOgAsset: jest.fn(),
}));
jest.mock("@/lib/images/image-quasi-vide", () => ({
  imageQuasiVide: jest.fn(async () => false),
}));

import { renderViewportShot } from "@/lib/site-builder/render-provider";
import { putOgAsset } from "@/lib/og/storage";
import { imageQuasiVide } from "@/lib/images/image-quasi-vide";

const capture = renderViewportShot as jest.MockedFunction<typeof renderViewportShot>;
const depot = putOgAsset as jest.MockedFunction<typeof putOgAsset>;
const quasiVide = imageQuasiVide as jest.MockedFunction<typeof imageQuasiVide>;

const SITE = "site-1";
const ANCIENNE_ORDI = "https://cdn/og/site-1/shot-aaa.jpg";
const ANCIENNE_MOBILE = "https://cdn/og/site-1/shot-mobile-bbb.jpg";

/** Une vraie image : `normaliser` passe par sharp, sans mock. */
let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({
    create: { width: 900, height: 1400, channels: 3, background: { r: 30, g: 90, b: 160 } },
  })
    .png()
    .toBuffer();
});

const commeArrayBuffer = () => ({
  bytes: PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength) as ArrayBuffer,
  contentType: "image/png",
});

/** Client réduit aux `update` sur `sites` que le module effectue. */
function fakeSupabase(colonnesAbsentes: string[] = []) {
  const patches: Record<string, unknown>[] = [];

  const client = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        patches.push({ ...patch });
        const manquante = colonnesAbsentes.find((c) => c in patch);
        const res = manquante
          ? { data: null, error: { code: "42703", message: `column sites.${manquante} does not exist` } }
          : { data: null, error: null };
        return { eq: () => ({ then: (r: (v: unknown) => unknown) => r(res) }) };
      },
    }),
  };

  return { client: client as never, patches };
}

beforeEach(() => {
  capture.mockReset();
  depot.mockReset();
  quasiVide.mockReset().mockResolvedValue(false);
  capture.mockResolvedValue(commeArrayBuffer());
  let n = 0;
  depot.mockImplementation(async (_c, opts) => ({
    ok: true,
    publicUrl: `https://cdn/og/${opts.prefix}/${opts.name}-neuf${++n}.jpg`,
    path: `og/${opts.prefix}/${opts.name}.jpg`,
    bytes: 1,
  }));
});

describe("ensureDemoScreenshot", () => {
  it("ne capture rien quand les deux images sont déjà là", async () => {
    const { client } = fakeSupabase();
    const res = await ensureDemoScreenshot(client, SITE, "https://demo", {
      existingUrl: ANCIENNE_ORDI,
      existingMobileUrl: ANCIENNE_MOBILE,
    });

    expect(capture).not.toHaveBeenCalled();
    expect(res).toEqual({ url: ANCIENNE_ORDI, mobileUrl: ANCIENNE_MOBILE });
  });

  it("rattrape le téléphone manquant SANS repayer la capture ordinateur", async () => {
    // Le défaut corrigé : la sortie anticipée ne regardait que l'ordinateur, donc
    // un échec ponctuel du mobile laissait `og_shot_mobile_url` à null pour
    // toujours — le téléphone disparaissait définitivement de cette carte.
    const { client, patches } = fakeSupabase();
    const res = await ensureDemoScreenshot(client, SITE, "https://demo", {
      existingUrl: ANCIENNE_ORDI,
      existingMobileUrl: null,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1]?.viewportWidth).toBe(390);
    expect(res.url).toBe(ANCIENNE_ORDI);
    expect(res.mobileUrl).toMatch(/shot-mobile-neuf/);
    expect(patches[0].og_shot_url).toBe(ANCIENNE_ORDI);
  });

  it("capture les deux images en parallèle quand tout manque", async () => {
    const { client } = fakeSupabase();
    const res = await ensureDemoScreenshot(client, SITE, "https://demo");

    expect(capture).toHaveBeenCalledTimes(2);
    expect(res.url).toMatch(/shot-neuf/);
    expect(res.mobileUrl).toMatch(/shot-mobile-neuf/);
    expect(res.warning).toBeUndefined();
  });

  it("garde l'image précédente quand un « Refaire » échoue", async () => {
    // Le défaut corrigé : l'échec renvoyait null, et la carte se refabriquait
    // SANS mockup par-dessus une carte correcte. Un clic censé l'améliorer la
    // dégradait — et les anciennes images devenaient éligibles au nettoyage.
    capture.mockRejectedValue(new Error("thum.io timeout"));
    const { client, patches } = fakeSupabase();

    const res = await ensureDemoScreenshot(client, SITE, "https://demo", {
      force: true,
      existingUrl: ANCIENNE_ORDI,
      existingMobileUrl: ANCIENNE_MOBILE,
    });

    expect(res.url).toBe(ANCIENNE_ORDI);
    expect(res.mobileUrl).toBe(ANCIENNE_MOBILE);
    expect(res.warning).toContain("conservée");
    // Rien de neuf : ne pas réécrire, sinon `og_shot_at` mentirait sur la
    // fraîcheur d'images qui datent.
    expect(patches).toHaveLength(0);
  });

  it("renvoie null quand la capture échoue et qu'il n'y a rien à conserver", async () => {
    capture.mockRejectedValue(new Error("hôte injoignable"));
    const { client } = fakeSupabase();

    const res = await ensureDemoScreenshot(client, SITE, "https://demo");

    expect(res.url).toBeNull();
    expect(res.mobileUrl).toBeNull();
    expect(res.warning).toContain("hôte injoignable");
    expect(res.warning).not.toContain("conservée");
  });

  it("signale une page pas encore affichée plutôt que de déposer un blanc", async () => {
    quasiVide.mockResolvedValue(true);
    const { client } = fakeSupabase();

    const res = await ensureDemoScreenshot(client, SITE, "https://demo");

    expect(depot).not.toHaveBeenCalled();
    expect(res.url).toBeNull();
    expect(res.warning).toContain("n'a pas fini de s'afficher");
  });

  it("écrit quand même l'URL du mockup si la colonne mobile n'existe pas", async () => {
    // `og_shot_mobile_url` vient d'une migration plus tardive : sans tolérance,
    // son absence emportait `og_shot_url` avec elle.
    const { client, patches } = fakeSupabase(["og_shot_mobile_url"]);

    const res = await ensureDemoScreenshot(client, SITE, "https://demo");

    expect(res.url).toMatch(/shot-neuf/);
    expect(patches).toHaveLength(2);
    expect(patches[1]).not.toHaveProperty("og_shot_mobile_url");
    expect(patches[1].og_shot_url).toMatch(/shot-neuf/);
  });

  it("garde le mockup neuf quand seul le téléphone échoue", async () => {
    capture.mockImplementation(async (_url, opts) => {
      if (opts?.viewportWidth === 390) throw new Error("timeout mobile");
      return commeArrayBuffer();
    });
    const { client } = fakeSupabase();

    const res = await ensureDemoScreenshot(client, SITE, "https://demo");

    expect(res.url).toMatch(/shot-neuf/);
    expect(res.mobileUrl).toBeNull();
    expect(res.warning).toContain("mobile");
  });
});
