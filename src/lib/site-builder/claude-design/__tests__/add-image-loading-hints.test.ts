import { addImageLoadingHints } from "../add-image-loading-hints";

describe("addImageLoadingHints", () => {
  it("makes the first image eager (fetchpriority=high) and the rest lazy", () => {
    const html = `<img src="a.webp"><p>x</p><img src="b.webp"><img src="c.webp">`;
    const out = addImageLoadingHints(html);
    expect(out).toBe(
      `<img src="a.webp" decoding="async" fetchpriority="high">` +
        `<p>x</p>` +
        `<img src="b.webp" decoding="async" loading="lazy">` +
        `<img src="c.webp" decoding="async" loading="lazy">`,
    );
  });

  it("preserves existing loading / decoding / fetchpriority attributes", () => {
    const html = `<img src="a.webp" loading="eager"><img src="b.webp" decoding="sync" loading="lazy">`;
    const out = addImageLoadingHints(html);
    // First img: keeps its eager loading, gains decoding + high fetchpriority.
    expect(out).toContain(`<img src="a.webp" loading="eager" decoding="async" fetchpriority="high">`);
    // Second img: nothing added (decoding + loading already present).
    expect(out).toContain(`<img src="b.webp" decoding="sync" loading="lazy">`);
  });

  it("handles self-closing tags", () => {
    const html = `<img src="a.webp"/><img src="b.webp"/>`;
    const out = addImageLoadingHints(html);
    expect(out).toBe(
      `<img src="a.webp" decoding="async" fetchpriority="high"/>` +
        `<img src="b.webp" decoding="async" loading="lazy"/>`,
    );
  });

  it("does not break when '>' appears inside an attribute value", () => {
    const html = `<img src="a.webp" alt="a > b"><img src="b.webp">`;
    const out = addImageLoadingHints(html);
    expect(out).toBe(
      `<img src="a.webp" alt="a > b" decoding="async" fetchpriority="high">` +
        `<img src="b.webp" decoding="async" loading="lazy">`,
    );
  });

  it("leaves markup without images unchanged", () => {
    const html = `<div class="hero"><p>No images here</p></div>`;
    expect(addImageLoadingHints(html)).toBe(html);
  });
});
