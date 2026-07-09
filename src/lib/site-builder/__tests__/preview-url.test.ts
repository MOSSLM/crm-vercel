import { buildPreviewUrl, isPreviewSubdomain } from "../preview-url";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("isPreviewSubdomain", () => {
  it("matches a canonical UUID subdomain", () => {
    expect(isPreviewSubdomain(UUID)).toBe(true);
    expect(isPreviewSubdomain(UUID.toUpperCase())).toBe(true);
  });

  it("rejects slugified published labels (never UUID-shaped)", () => {
    expect(isPreviewSubdomain("ecotherme")).toBe(false);
    expect(isPreviewSubdomain("plombier-paris-2")).toBe(false);
    expect(isPreviewSubdomain("app")).toBe(false);
    // A near-miss that isn't the full 8-4-4-4-12 layout must not match.
    expect(isPreviewSubdomain("3f2504e0-4f89-41d3-9a0c")).toBe(false);
  });
});

describe("buildPreviewUrl", () => {
  it("builds an unguessable subdomain URL in production", () => {
    expect(buildPreviewUrl(UUID, "/", { siteDomain: "samadigitalstudio.fr" })).toBe(
      `https://${UUID}.samadigitalstudio.fr`,
    );
    expect(
      buildPreviewUrl(UUID, "/services/clim", { siteDomain: "samadigitalstudio.fr", currentHost: "app.samadigitalstudio.fr" }),
    ).toBe(`https://${UUID}.samadigitalstudio.fr/services/clim`);
  });

  it("routes a UUID subdomain the same way the middleware does", () => {
    // The subdomain half of the URL must be something the middleware recognises.
    const url = new URL(buildPreviewUrl(UUID, "/", { siteDomain: "samadigitalstudio.fr" }));
    const sub = url.hostname.slice(0, -".samadigitalstudio.fr".length);
    expect(isPreviewSubdomain(sub)).toBe(true);
  });

  it("falls back to the path-based preview on local dev (no wildcard DNS)", () => {
    expect(buildPreviewUrl(UUID, "/", { siteDomain: "samadigitalstudio.fr", currentHost: "localhost:3000" })).toBe(
      `/preview/${UUID}`,
    );
    expect(buildPreviewUrl(UUID, "/contact", { siteDomain: "samadigitalstudio.fr", currentHost: "127.0.0.1:3000" })).toBe(
      `/preview/${UUID}/contact`,
    );
  });
});
