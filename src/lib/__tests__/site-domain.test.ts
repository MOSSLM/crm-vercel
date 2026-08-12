import {
  normalizeSiteDomain,
  normalizeHost,
  isInfrastructureHost,
  deciderDestination,
  extractSubdomain,
  DEFAULT_SITE_DOMAIN,
} from "../site-domain";

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

describe("normalizeHost", () => {
  it("réduit l'hôte à sa forme comparable", () => {
    expect(normalizeHost("Exemple.FR")).toBe("exemple.fr");
    expect(normalizeHost("exemple.fr:3000")).toBe("exemple.fr");
    // Forme pleinement qualifiée : légale, et émise par certains clients.
    expect(normalizeHost("exemple.fr.")).toBe("exemple.fr");
    expect(normalizeHost("  EXEMPLE.FR.:443  ")).toBe("exemple.fr");
  });

  it("ne casse pas un IPv6 littéral sur le séparateur de port", () => {
    // `split(":")[0]` rendrait "[" et l'hôte partirait en réécriture.
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
    expect(normalizeHost("[2001:db8::1]")).toBe("[2001:db8::1]");
  });

  it("rend une chaîne vide plutôt que null, pour un appelant qui compare", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("isInfrastructureHost", () => {
  it("reconnaît le dev local et les IP nues", () => {
    expect(isInfrastructureHost("localhost:3000")).toBe(true);
    expect(isInfrastructureHost("site.localhost")).toBe(true);
    expect(isInfrastructureHost("127.0.0.1:3000")).toBe(true);
    expect(isInfrastructureHost("[::1]:3000")).toBe(true);
    expect(isInfrastructureHost("")).toBe(true);
  });

  it("reconnaît les hôtes de plateforme, y compris les aperçus par PR", () => {
    // Régression majeure évitée : `crm-vercel.vercel.app` est un hôte de
    // PRODUCTION (trois migrations pg_cron tapent dessus) et l'accès de secours
    // quand le DNS de SITE_DOMAIN casse. Le réécrire vers /site/{host} rendrait
    // le CRM injoignable hors DNS, et casserait toute relecture de PR.
    expect(isInfrastructureHost("crm-vercel.vercel.app")).toBe(true);
    expect(isInfrastructureHost("crm-vercel-git-ma-branche-sama.vercel.app")).toBe(true);
  });

  it("laisse passer les vrais hôtes de site", () => {
    expect(isInfrastructureHost(DOMAIN)).toBe(false);
    expect(isInfrastructureHost(`ecotherme.${DOMAIN}`)).toBe(false);
    expect(isInfrastructureHost("plomberie-dupont.fr")).toBe(false);
    // Un domaine client qui CONTIENT le mot, sans être sous le suffixe.
    expect(isInfrastructureHost("vercel.app.plomberie-dupont.fr")).toBe(false);
  });
});

describe("deciderDestination", () => {
  const ou = (host: string, pathname = "/") => deciderDestination(host, pathname, DOMAIN);

  it("sert le CRM sur l'apex, ses sous-domaines et l'infrastructure", () => {
    expect(ou(DOMAIN)).toEqual({ kind: "next" });
    // L'apex pleinement qualifié n'est pas égal à SITE_DOMAIN sans normalisation
    // : sans elle il échappait à la garde « ni l'apex » et la vitrine de
    // l'agence partait en /site/samadigitalstudio.fr.
    expect(ou(`${DOMAIN}.`)).toEqual({ kind: "next" });
    expect(ou(`app.${DOMAIN}`)).toEqual({ kind: "next" });
    expect(ou(`www.${DOMAIN}`)).toEqual({ kind: "next" });
    expect(ou(`admin.${DOMAIN}`)).toEqual({ kind: "next" });
    expect(ou("localhost:3000")).toEqual({ kind: "next" });
    expect(ou("crm-vercel.vercel.app", "/dashboard")).toEqual({ kind: "next" });
  });

  it("réécrit un sous-domaine client vers /site/{label}", () => {
    expect(ou(`ecotherme.${DOMAIN}`)).toEqual({ kind: "site", segment: "ecotherme" });
    expect(ou(`ECOTHERME.${DOMAIN}:443`)).toEqual({ kind: "site", segment: "ecotherme" });
  });

  it("réécrit un domaine client vers /site/{host}", () => {
    expect(ou("plomberie-dupont.fr")).toEqual({ kind: "site", segment: "plomberie-dupont.fr" });
    // `www.` arrive comme un hôte distinct : c'est la moitié du trafic entrant.
    // Le résolveur accepte les deux formes, la réécriture doit donc passer.
    expect(ou("www.plomberie-dupont.fr")).toEqual({ kind: "site", segment: "www.plomberie-dupont.fr" });
    // Sans normalisation, la casse ne matcherait pas la valeur stockée.
    expect(ou("PLOMBERIE-DUPONT.FR")).toEqual({ kind: "site", segment: "plomberie-dupont.fr" });
  });

  it("distingue l'aperçu brouillon du site publié", () => {
    expect(ou(`${UUID}.${DOMAIN}`)).toEqual({ kind: "preview", segment: UUID });
  });

  it("sert les sous-domaines publics avant le cas « site client »", () => {
    // Sinon le rapport serait réécrit vers /site/rapport et rendrait un 404.
    expect(ou(`rapport.${DOMAIN}`)).toEqual({ kind: "public", path: "/rapport" });
    expect(deciderDestination(`rapport.${DOMAIN}`, "/abc", DOMAIN)).toEqual({
      kind: "public",
      path: "/rapport",
    });
  });

  it("conserve le suffixe de chemin", () => {
    expect(deciderDestination(`ecotherme.${DOMAIN}`, "/contact", DOMAIN)).toEqual({
      kind: "site",
      segment: "ecotherme",
    });
  });

  it("laisse passer les chemins servis à l'identique quel que soit l'hôte", () => {
    for (const p of ["/_next/data/x", "/api/forms/1/submit", "/logo.png"]) {
      expect(deciderDestination("plomberie-dupont.fr", p, DOMAIN)).toEqual({ kind: "next" });
    }
  });

  it("renvoie le portail de gestion sur l'hôte du CRM", () => {
    // Il s'affichait jusqu'ici sous la marque du client. Redirection et non 404 :
    // un lien de portail déjà partagé continue de fonctionner.
    expect(deciderDestination("plomberie-dupont.fr", "/portail/jeton", DOMAIN)).toEqual({
      kind: "redirect",
      to: `https://app.${DOMAIN}/portail/jeton`,
    });
    expect(deciderDestination(`ecotherme.${DOMAIN}`, "/portail/jeton", DOMAIN)).toEqual({
      kind: "redirect",
      to: `https://app.${DOMAIN}/portail/jeton`,
    });
    // Sur les hôtes du CRM, rien ne change.
    expect(deciderDestination(`app.${DOMAIN}`, "/portail/jeton", DOMAIN)).toEqual({ kind: "next" });
    expect(deciderDestination("localhost:3000", "/portail/jeton", DOMAIN)).toEqual({ kind: "next" });
  });

  it("ne réécrit pas un hôte absent", () => {
    expect(deciderDestination(null, "/", DOMAIN)).toEqual({ kind: "next" });
  });
});

describe("deciderDestination — chemins SEO", () => {
  it("réécrit robots.txt et sitemap.xml par tenant", () => {
    // Deux verrous indépendants les rendaient inatteignables : le matcher les
    // excluait, et la garde `pathname.includes(".")` les traitait en statiques.
    for (const p of ["/robots.txt", "/sitemap.xml"]) {
      expect(deciderDestination("plomberie-dupont.fr", p, DOMAIN)).toEqual({
        kind: "site",
        segment: "plomberie-dupont.fr",
      });
      expect(deciderDestination(`ecotherme.${DOMAIN}`, p, DOMAIN)).toEqual({
        kind: "site",
        segment: "ecotherme",
      });
    }
  });

  it("laisse l'apex de l'agence à ses routes racine", () => {
    // Sans ça, débloquer ces chemins pour les tenants ferait servir le fichier
    // de l'agence sous chaque hôte — le domaine du client compris.
    expect(deciderDestination(DOMAIN, "/robots.txt", DOMAIN)).toEqual({ kind: "next" });
    expect(deciderDestination(`www.${DOMAIN}`, "/sitemap.xml", DOMAIN)).toEqual({ kind: "next" });
  });

  it("laisse l'aperçu de brouillon au robots.txt racine", () => {
    // /preview/{uuid}/robots.txt tomberait dans l'attrape-tout de l'aperçu et
    // rendrait du HTML sous un content-type de texte.
    expect(deciderDestination(`${UUID}.${DOMAIN}`, "/robots.txt", DOMAIN)).toEqual({ kind: "next" });
    // Le rendu de l'aperçu, lui, ne bouge pas.
    expect(deciderDestination(`${UUID}.${DOMAIN}`, "/", DOMAIN)).toEqual({
      kind: "preview",
      segment: UUID,
    });
  });

  it("ne débloque QUE ces deux chemins", () => {
    // La garde des statiques est ce qui laisse passer les assets des 36 sites
    // publiés : l'exception doit être une liste, pas un assouplissement.
    for (const p of ["/logo.png", "/styles.css", "/a/robots.txt", "/robots.txt.bak", "/sitemap.xml/x"]) {
      expect(deciderDestination("plomberie-dupont.fr", p, DOMAIN)).toEqual({ kind: "next" });
    }
  });
});
