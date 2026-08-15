import {
  COOKIE_TRAFIC_INTERNE,
  PARAM_TRAFIC_INTERNE,
  chaineCookie,
  decisionDeLUrl,
  decisionDuCookie,
  domaineCookie,
  estCapture,
  estTraficInterne,
  lienNonMesure,
} from "../trafic-interne";

const DOMAINE = "samadigitalstudio.fr";

describe("decisionDeLUrl", () => {
  it("marque le navigateur sur le paramètre affirmatif", () => {
    expect(decisionDeLUrl("?sama_interne=1")).toBe(true);
    expect(decisionDeLUrl("sama_interne=1")).toBe(true);
    expect(decisionDeLUrl("?a=b&sama_interne=1&c=d")).toBe(true);
  });

  it("compte le paramètre nu comme un oui", () => {
    // `?sama_interne` est la forme qu'on tape à la main : la lire comme un
    // « non » ferait l'exact contraire de ce qu'on demande.
    expect(decisionDeLUrl("?sama_interne")).toBe(true);
    expect(decisionDeLUrl("?sama_interne=")).toBe(true);
  });

  it("sait démarquer — un poste partagé doit pouvoir redevenir un visiteur", () => {
    expect(decisionDeLUrl("?sama_interne=0")).toBe(false);
    expect(decisionDeLUrl("?sama_interne=false")).toBe(false);
    expect(decisionDeLUrl("?sama_interne=NON")).toBe(false);
  });

  it("ne décide rien quand l'URL ne dit rien", () => {
    expect(decisionDeLUrl("")).toBeNull();
    expect(decisionDeLUrl("?utm_source=whatsapp")).toBeNull();
  });

  it("traite la capture de vignette comme du trafic maison", () => {
    // Le robot de capture ouvre un vrai navigateur sur la vraie démo : sans
    // ça, chaque vignette régénérée valait une session de plus sur l'hôte du
    // prospect, à une heure choisie par un cron.
    expect(decisionDeLUrl("?sama_shot=1")).toBe(true);
    expect(estCapture("?sama_shot=1")).toBe(true);
    expect(estCapture("?sama_interne=1")).toBe(false);
    expect(estCapture("")).toBe(false);
  });
});

describe("decisionDuCookie", () => {
  it("lit le marquage posé par une visite précédente", () => {
    expect(decisionDuCookie("sama_interne=1")).toBe(true);
    expect(decisionDuCookie("theme=dark; sama_interne=1; autre=x")).toBe(true);
    expect(decisionDuCookie(" sama_interne=1 ")).toBe(true);
  });

  it("laisse passer par défaut — un prospect n'a pas ce cookie", () => {
    expect(decisionDuCookie("")).toBe(false);
    expect(decisionDuCookie("theme=dark")).toBe(false);
    expect(decisionDuCookie("sama_interne=0")).toBe(false);
    expect(decisionDuCookie("sama_interne=")).toBe(false);
  });

  it("ne confond pas un cookie dont le nom commence pareil", () => {
    expect(decisionDuCookie("sama_interne_autre=1")).toBe(false);
    expect(decisionDuCookie("x_sama_interne=1")).toBe(false);
  });
});

describe("domaineCookie", () => {
  it("couvre tout le parc depuis n'importe quelle démo", () => {
    // Le point porte tout : sans lui, il faudrait se marquer une fois par
    // prospect, ce qui ne tient pas à 300 sites.
    expect(domaineCookie("plomberie-durand.samadigitalstudio.fr", DOMAINE)).toBe(`.${DOMAINE}`);
    expect(domaineCookie("rapport.samadigitalstudio.fr", DOMAINE)).toBe(`.${DOMAINE}`);
    expect(domaineCookie("app.samadigitalstudio.fr", DOMAINE)).toBe(`.${DOMAINE}`);
    expect(domaineCookie(DOMAINE, DOMAINE)).toBe(`.${DOMAINE}`);
  });

  it("tolère la casse et le port", () => {
    expect(domaineCookie("Demo.SamaDigitalStudio.FR:3000", DOMAINE)).toBe(`.${DOMAINE}`);
  });

  it("n'écrit jamais sur le domaine d'un client ni sur un hôte étranger", () => {
    expect(domaineCookie("plomberie-durand.fr", DOMAINE)).toBeNull();
    expect(domaineCookie("localhost", DOMAINE)).toBeNull();
    expect(domaineCookie("crm-vercel.vercel.app", DOMAINE)).toBeNull();
    // Le piège du suffixe : « pas-samadigitalstudio.fr » n'est pas chez nous.
    expect(domaineCookie("pas-samadigitalstudio.fr", DOMAINE)).toBeNull();
    expect(domaineCookie("", DOMAINE)).toBeNull();
  });
});

describe("chaineCookie", () => {
  const lire = (chaine: string, cle: string) =>
    chaine.split("; ").find((p) => p.toLowerCase().startsWith(`${cle.toLowerCase()}=`))?.split("=")[1];

  it("pose un marquage de deux ans, partagé par tout le parc", () => {
    const c = chaineCookie(true, "demo.samadigitalstudio.fr", { siteDomain: DOMAINE });
    expect(c.startsWith(`${COOKIE_TRAFIC_INTERNE}=1`)).toBe(true);
    expect(lire(c, "Domain")).toBe(`.${DOMAINE}`);
    expect(Number(lire(c, "Max-Age"))).toBe(60 * 60 * 24 * 730);
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
  });

  it("efface en posant un âge nul — sinon démarquer serait irréversible", () => {
    const c = chaineCookie(false, "demo.samadigitalstudio.fr", { siteDomain: DOMAINE });
    expect(c.startsWith(`${COOKIE_TRAFIC_INTERNE}=0`)).toBe(true);
    expect(lire(c, "Max-Age")).toBe("0");
  });

  it("omet Secure en http, sinon le navigateur refuse le cookie en dev", () => {
    const c = chaineCookie(true, "localhost", { secure: false, siteDomain: DOMAINE });
    expect(c).not.toContain("Secure");
    expect(c).not.toContain("Domain=");
  });

  it("produit une chaîne que le lecteur sait relire", () => {
    const pose = chaineCookie(true, "demo.samadigitalstudio.fr", { siteDomain: DOMAINE });
    expect(decisionDuCookie(pose.split(";")[0])).toBe(true);
    const efface = chaineCookie(false, "demo.samadigitalstudio.fr", { siteDomain: DOMAINE });
    expect(decisionDuCookie(efface.split(";")[0])).toBe(false);
  });
});

describe("estTraficInterne", () => {
  it("laisse l'URL trancher avant le cookie, dans les deux sens", () => {
    expect(estTraficInterne("?sama_interne=1", "")).toBe(true);
    expect(estTraficInterne("?sama_interne=0", "sama_interne=1")).toBe(false);
  });

  it("retombe sur le cookie quand l'URL est muette", () => {
    expect(estTraficInterne("", "sama_interne=1")).toBe(true);
    expect(estTraficInterne("?utm_source=wa", "")).toBe(false);
  });

  it("laisse passer le prospect — le cas qui doit rester mesuré", () => {
    expect(estTraficInterne("", "")).toBe(false);
  });
});

describe("lienNonMesure", () => {
  it("habille l'adresse que l'agent ouvre", () => {
    expect(lienNonMesure("https://demo.samadigitalstudio.fr")).toBe(
      `https://demo.samadigitalstudio.fr/?${PARAM_TRAFIC_INTERNE}=1`,
    );
  });

  it("respecte une adresse qui a déjà des paramètres", () => {
    const r = lienNonMesure("https://demo.samadigitalstudio.fr/contact?utm_source=wa");
    expect(r).toContain("utm_source=wa");
    expect(r).toContain(`${PARAM_TRAFIC_INTERNE}=1`);
  });

  it("garde l'ancre en dernier — sinon elle atterrit dans la valeur", () => {
    const r = lienNonMesure("https://demo.samadigitalstudio.fr/#contact");
    expect(r.endsWith("#contact")).toBe(true);
    expect(r).toContain(`${PARAM_TRAFIC_INTERNE}=1`);
    // Même exigence sur le chemin de repli (adresse non absolue).
    const relatif = lienNonMesure("/rapport/abc#axes");
    expect(relatif).toBe(`/rapport/abc?${PARAM_TRAFIC_INTERNE}=1#axes`);
  });

  it("ne double pas le marqueur si on l'applique deux fois", () => {
    const une = lienNonMesure("https://demo.samadigitalstudio.fr");
    const deux = lienNonMesure(une);
    expect(deux).toBe(une);
  });

  it("rend une adresse vide telle quelle plutôt qu'un « ?sama_interne=1 » orphelin", () => {
    expect(lienNonMesure("")).toBe("");
  });

  it("produit une adresse que le lecteur reconnaît", () => {
    const url = new URL(lienNonMesure("https://demo.samadigitalstudio.fr/tarifs"));
    expect(decisionDeLUrl(url.search)).toBe(true);
  });
});
