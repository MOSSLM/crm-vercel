import { normalizeSiteDomain, extractSubdomain, DEFAULT_SITE_DOMAIN } from "../site-domain";

const DOMAIN = "samadigitalstudio.fr";
const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("normalizeSiteDomain", () => {
  it("passes a bare apex domain through", () => {
    expect(normalizeSiteDomain(DOMAIN)).toBe(DOMAIN);
    expect(normalizeSiteDomain(`  ${DOMAIN.toUpperCase()}  `)).toBe(DOMAIN);
  });

  it("strips the CRM host label so app.<domain> can't break subdomain routing", () => {
    // The regression this module exists for: NEXT_PUBLIC_APP_DOMAIN set to the
    // CRM host made extractSubdomain reject every client subdomain.
    expect(normalizeSiteDomain(`app.${DOMAIN}`)).toBe(DOMAIN);
    expect(normalizeSiteDomain(`www.${DOMAIN}`)).toBe(DOMAIN);
  });

  it("tolerates a protocol, a port, a path and stray dots", () => {
    expect(normalizeSiteDomain(`https://${DOMAIN}/`)).toBe(DOMAIN);
    expect(normalizeSiteDomain(`http://app.${DOMAIN}:3000/site`)).toBe(DOMAIN);
    expect(normalizeSiteDomain(`.${DOMAIN}.`)).toBe(DOMAIN);
  });

  it("returns null for empty values so the caller can fall through", () => {
    expect(normalizeSiteDomain(undefined)).toBeNull();
    expect(normalizeSiteDomain("")).toBeNull();
    expect(normalizeSiteDomain("   ")).toBeNull();
  });
});

describe("extractSubdomain", () => {
  it("extracts published labels and UUID previews alike", () => {
    expect(extractSubdomain(`ecotherme.${DOMAIN}`, DOMAIN)).toBe("ecotherme");
    expect(extractSubdomain(`${UUID}.${DOMAIN}`, DOMAIN)).toBe(UUID);
    // The host header may carry a port and odd casing.
    expect(extractSubdomain(`ECOTHERME.${DOMAIN}:443`, DOMAIN)).toBe("ecotherme");
    // Fully-qualified form with the root dot.
    expect(extractSubdomain(`ecotherme.${DOMAIN}.`, DOMAIN)).toBe("ecotherme");
  });

  it("returns CRM subdomains for the caller to filter", () => {
    expect(extractSubdomain(`app.${DOMAIN}`, DOMAIN)).toBe("app");
    expect(extractSubdomain(`www.${DOMAIN}`, DOMAIN)).toBe("www");
  });

  it("returns null for the apex, localhost and raw IPs", () => {
    expect(extractSubdomain(DOMAIN, DOMAIN)).toBeNull();
    expect(extractSubdomain("localhost", DOMAIN)).toBeNull();
    expect(extractSubdomain("site.localhost:3000", DOMAIN)).toBeNull();
    expect(extractSubdomain("127.0.0.1:3000", DOMAIN)).toBeNull();
  });

  it("returns null for a custom domain (resolved by published_domain instead)", () => {
    expect(extractSubdomain("plombier-dupont.fr", DOMAIN)).toBeNull();
    // A bare endsWith() would have matched this and yielded a bogus subdomain.
    expect(extractSubdomain(`not${DOMAIN}`, DOMAIN)).toBeNull();
  });

  it("defaults to the configured site domain", () => {
    expect(extractSubdomain(`ecotherme.${DEFAULT_SITE_DOMAIN}`)).toBe("ecotherme");
  });
});
