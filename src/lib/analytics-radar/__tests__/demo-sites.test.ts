import type { SupabaseClient } from "@supabase/supabase-js";
import { listDemoSites } from "../demo-sites";
import { SITE_DOMAIN } from "@/lib/site-domain";

const fakeSb = (rows: Array<Record<string, unknown>>) =>
  ({
    from: () => ({
      select: () => ({
        not: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  }) as unknown as SupabaseClient;

const row = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  published_subdomain: "plomberie-durand",
  published_domain: null,
  published_at: "2026-08-01T00:00:00Z",
  enterprise_id: 1,
  entreprises: { name: "Plomberie Durand", ville: "Nantes", service_tags: ["plomberie"] },
  ...over,
});

describe("listDemoSites", () => {
  it("expose le sous-domaine comme hôte principal", async () => {
    const [s] = await listDemoSites(fakeSb([row()]));
    expect(s.hostname).toBe(`plomberie-durand.${SITE_DOMAIN}`);
    expect(s.hostnames).toEqual([`plomberie-durand.${SITE_DOMAIN}`]);
  });

  it("rattache aussi le domaine personnalisé, avec et sans www", async () => {
    // Sans ça, un site publié sur le domaine du client recevait de vraies
    // visites mais était classé « livré, jamais ouvert ».
    const [s] = await listDemoSites(fakeSb([row({ published_domain: "plomberie-durand.fr" })]));
    expect(s.hostnames).toContain(`plomberie-durand.${SITE_DOMAIN}`);
    expect(s.hostnames).toContain("plomberie-durand.fr");
    expect(s.hostnames).toContain("www.plomberie-durand.fr");
  });

  it("normalise un domaine saisi avec un schéma ou un chemin", async () => {
    const [s] = await listDemoSites(fakeSb([row({ published_domain: "https://Plomberie-Durand.FR/accueil" })]));
    expect(s.hostnames).toContain("plomberie-durand.fr");
    expect(s.hostnames.some((h) => h.includes("/") || h.startsWith("http"))).toBe(false);
  });

  it("dérive la variante nue quand le domaine est déjà en www", async () => {
    const [s] = await listDemoSites(fakeSb([row({ published_domain: "www.plomberie-durand.fr" })]));
    expect(s.hostnames).toContain("www.plomberie-durand.fr");
    expect(s.hostnames).toContain("plomberie-durand.fr");
  });

  it("ne produit pas de doublon d'hôte", async () => {
    const [s] = await listDemoSites(fakeSb([row({ published_domain: "plomberie-durand.fr" })]));
    expect(new Set(s.hostnames).size).toBe(s.hostnames.length);
  });

  it("retombe sur le sous-domaine quand l'entreprise n'a pas de nom", async () => {
    const [s] = await listDemoSites(fakeSb([row({ entreprises: null })]));
    expect(s.companyName).toBe("plomberie-durand");
    expect(s.city).toBeNull();
  });
});
