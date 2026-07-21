import sharp from "sharp";
import { optimizeImageUpload, DEFAULT_OPTIMIZE_CONFIG } from "../optimize-image";

/** Random RGB noise — compresses poorly as PNG, so lossy WebP is clearly smaller. */
async function noisePng(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.allocUnsafe(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** Smooth (blurred) photo-like JPEG at high quality — WebP q80 beats it comfortably. */
async function photoJpeg(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.allocUnsafe(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .blur(6)
    .jpeg({ quality: 100 })
    .toBuffer();
}

/** Fully-transparent RGBA PNG (real alpha channel, isOpaque === false). */
async function transparentPng(size = 32): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
}

describe("optimizeImageUpload", () => {
  it("converts an opaque PNG to WebP", async () => {
    const input = await noisePng(400, 400);
    const out = await optimizeImageUpload(input, "image/png");
    expect(out.optimized).toBe(true);
    expect(out.ext).toBe("webp");
    expect(out.contentType).toBe("image/webp");
    expect(out.bytes.length).toBeLessThan(input.length);
  });

  it("converts a JPEG to WebP", async () => {
    const input = await photoJpeg(600, 600);
    const out = await optimizeImageUpload(input, "image/jpeg");
    expect(out.ext).toBe("webp");
    expect(out.contentType).toBe("image/webp");
  });

  it("keeps a transparent PNG as PNG by default", async () => {
    const input = await transparentPng();
    const out = await optimizeImageUpload(input, "image/png");
    expect(out.ext).toBe("png");
    expect(out.contentType).toBe("image/png");
  });

  it("sends a transparent PNG to WebP when keepTransparentPng is false", async () => {
    const input = await transparentPng(256); // large enough that webp wins
    const out = await optimizeImageUpload(input, "image/png", undefined, {
      ...DEFAULT_OPTIMIZE_CONFIG,
      keepTransparentPng: false,
    });
    expect(out.ext).toBe("webp");
  });

  it("downscales images wider than maxWidth", async () => {
    const input = await noisePng(3000, 200);
    const out = await optimizeImageUpload(input, "image/png");
    expect(out.optimized).toBe(true);
    expect(out.width).toBe(DEFAULT_OPTIMIZE_CONFIG.maxWidth);
  });

  it("passes SVG through untouched (never rasterised)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    const out = await optimizeImageUpload(svg, "image/svg+xml");
    expect(out.optimized).toBe(false);
    expect(out.ext).toBe("svg");
    expect(out.bytes).toBe(svg);
  });

  it("passes unreadable / non-image bytes through without throwing", async () => {
    const junk = Buffer.from("not an image at all");
    const out = await optimizeImageUpload(junk, "image/png", "broken.png");
    expect(out.optimized).toBe(false);
    expect(out.bytes).toBe(junk);
  });

  it("falls back to the filename extension for an unknown MIME type", async () => {
    const junk = Buffer.from("whatever");
    const out = await optimizeImageUpload(junk, "", "photo.HEIC");
    expect(out.optimized).toBe(false);
    expect(out.ext).toBe("heic");
  });
});
