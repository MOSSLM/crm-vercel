import { hostCanoniqueDuSite, urlCanonique } from "../host-canonique";
import { buildPageMetadata } from "../build-page-metadata";
import type { ResolvedSite } from "@/lib/site-resolver";

const DOMAIN = "samadigitalstudio.fr";

describe("hostCanoniqueDuSite", () => {
  it("préfère le domaine du client — c'est ce qu'il a acheté", () => {
    expect(
      hostCanoniqueDuSite({ publishedDomain: "plomberie-dupont.fr", publishedSubdomain: "dupont" }),
    ).toBe("https://plomberie-dupont.fr");
  });

  it("retombe sur le sous-domaine publié", () => {
    expect(hostCanoniqueDuSite({ publishedDomain: null, publishedSubdomain: "ecotherme" })).toBe(
      `https://ecotherme.${DOMAIN}`,
    );
  });

  it("tolère un domaine stocké avec son protocole", () => {
    // Forme réellement présente en base : l'écriture n'a longtemps rien normalisé.
    expect(hostCanoniqueDuSite({ publishedDomain: "https://plomberie-dupont.fr" })).toBe(
      "https://plomberie-dupont.fr",
    );
  });

  it("n'invente pas d'adresse pour un site sans destination", () => {
    // Mieux vaut aucun canonical qu'un canonical faux : un aperçu de brouillon
    // qui se déclarerait canonique ferait indexer une URL jetable.
    expect(hostCanoniqueDuSite({})).toBeNull();
    expect(urlCanonique({}, "/contact")).toBeNull();
  });

  it("colle le chemin de la page sans doubler la barre", () => {
    const site = { publishedDomain: "plomberie-dupont.fr" };
    expect(urlCanonique(site, "/")).toBe("https://plomberie-dupont.fr/");
    expect(urlCanonique(site, "contact")).toBe("https://plomberie-dupont.fr/contact");
    expect(urlCanonique(site, "/contact")).toBe("https://plomberie-dupont.fr/contact");
  });
});

describe("buildPageMetadata — l'invariant des deux espaces d'URL", () => {
  const site = {
    siteId: "s1",
    config: {},
    enterpriseVariables: {},
    companyName: "Plomberie Dupont",
    isPublished: true,
    publishedSubdomain: "dupont",
    publishedDomain: "plomberie-dupont.fr",
  } as unknown as ResolvedSite;

  it("émet le MÊME canonical depuis les deux hôtes, mais pas la même metadataBase", () => {
    // C'est tout l'enjeu du lot. `origine` suit l'hôte demandé — il le doit,
    // pour que la carte OpenGraph soit servie depuis la page qui la déclare.
    // Le canonical, lui, ne doit pas bouger : bâti sur l'origine demandée,
    // chaque espace d'URL se déclarerait canonique de lui-même et Google ne
    // dédupliquerait rien.
    const depuisSousDomaine = buildPageMetadata(site, undefined, "dupont", `https://dupont.${DOMAIN}`, "/contact");
    const depuisDomaine = buildPageMetadata(
      site,
      undefined,
      "plomberie-dupont.fr",
      "https://plomberie-dupont.fr",
      "/contact",
    );

    expect(depuisSousDomaine.alternates?.canonical).toBe("https://plomberie-dupont.fr/contact");
    expect(depuisDomaine.alternates?.canonical).toBe("https://plomberie-dupont.fr/contact");

    expect(String(depuisSousDomaine.metadataBase)).toBe(`https://dupont.${DOMAIN}/`);
    expect(String(depuisDomaine.metadataBase)).toBe("https://plomberie-dupont.fr/");
  });

  it("ne titre jamais une page avec l'hôte brut", () => {
    // Le 3e argument reçoit le segment de route, qui porte un hôte complet sur
    // l'espace /site/{host}. Un site sans companyName titrait donc
    // « plomberie-dupont.fr » — dans Google et dans l'unfurl WhatsApp.
    const sansNom = { ...site, companyName: undefined } as unknown as ResolvedSite;
    const meta = buildPageMetadata(sansNom, undefined, "plomberie-dupont.fr", null, "/");
    expect(meta.title).toBe("dupont");
    expect(meta.description).toBe("Site de dupont");
  });

  it("n'émet aucun canonical quand le site n'a pas de destination publiée", () => {
    const brouillon = { ...site, publishedSubdomain: null, publishedDomain: null } as unknown as ResolvedSite;
    const meta = buildPageMetadata(brouillon, undefined, "x", null, "/");
    expect(meta.alternates).toBeUndefined();
  });
});
