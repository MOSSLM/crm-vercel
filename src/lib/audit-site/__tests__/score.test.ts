import { scorer, issueKeysDepuisSignaux, libelleDeNote, SEUILS } from "../score";
import type { SignauxSite } from "../types";

/**
 * Ces tests protègent une promesse commerciale, pas seulement du code : chaque
 * note affichée à un prospect doit être justifiable par une mesure qu'on peut
 * lui montrer. Les cas les plus importants ici sont donc les cas où l'analyseur
 * doit se TAIRE — site injoignable, coquille de SPA, avis dans un widget.
 */

/** Un site correct, servant de base à modifier cas par cas. */
function signauxSains(): SignauxSite {
  return {
    joignable: true,
    bloque: false,
    httpStatus: 200,
    https: true,
    ttfbMs: 200,
    chargementMs: 900,
    poidsOctets: 300_000,
    compression: true,
    cacheControl: true,
    longueurTexteVisible: 4000,
    nbScripts: 4,
    nbScriptsBloquants: 0,
    nbCssBloquants: 1,
    ressembleSpa: false,
    title: "Menuiserie Berthier — agencement sur mesure à Antibes",
    metaDescription:
      "Menuiserie et agencement sur mesure à Antibes depuis 1998. Devis gratuit sous 48 h.",
    nbH1: 1,
    canonical: true,
    lang: "fr",
    noindex: false,
    robotsTxt: true,
    sitemapXml: true,
    jsonLdLocalBusiness: true,
    napNom: true,
    napAdresse: true,
    napTelephone: true,
    nbImages: 10,
    nbImagesSansAlt: 0,
    nbImagesSansLazy: 1,
    viewport: true,
    viewportZoomBloque: false,
    nbMediaQueries: 6,
    nbLargeursFixes: 0,
    nbPolicesTropPetites: 0,
    cssLisible: true,
    telCliquable: true,
    telephoneEnTexte: true,
    formulaire: true,
    mailto: true,
    avisDansLaPage: true,
    widgetAvis: null,
    mentionsLegales: true,
    bandeauCookies: true,
    nbReseauxSociaux: 2,
    nbCta: 5,
  };
}

/** Tout à null / false : ce que rapporte `collecter` sur un domaine mort. */
function signauxInjoignables(): SignauxSite {
  return {
    ...signauxSains(),
    joignable: false,
    httpStatus: null,
    https: false,
    ttfbMs: null,
    chargementMs: null,
    poidsOctets: null,
    compression: false,
    cacheControl: false,
    robotsTxt: null,
    sitemapXml: null,
  };
}

describe("scorer — cas nominal", () => {
  it("note haut un site sain et lui fait confiance", () => {
    const r = scorer(signauxSains(), { nombreAvis: 42 });
    expect(r.noteGlobale).toBeGreaterThanOrEqual(85);
    expect(r.libelle).toBe("Excellent");
    expect(r.issueKeys).toEqual([]);
    for (const axe of Object.values(r.axes)) {
      expect(axe.confiance).toBe("haute");
    }
  });

  it("attache à chaque preuve la valeur mesurée ET son seuil", () => {
    const r = scorer(signauxSains());
    const chargement = r.axes.vitesse.preuves.find((p) => p.cle === "chargement");
    expect(chargement).toBeDefined();
    expect(chargement?.valeur).toBe("0,9 s");
    expect(chargement?.seuil).toBe("2,5 s");
    expect(chargement?.verdict).toBe("ok");
  });
});

describe("scorer — site injoignable", () => {
  it("ne publie aucune note et n'émet que la clé « pas de site »", () => {
    const r = scorer(signauxInjoignables());
    expect(r.noteGlobale).toBe(0);
    expect(r.issueKeys).toEqual(["no_site_or_unreachable"]);
    for (const axe of Object.values(r.axes)) {
      expect(axe.confiance).toBe("faible");
    }
  });

  it("ne reproche rien d'autre : aucune clé sur une page jamais lue", () => {
    const keys = issueKeysDepuisSignaux(signauxInjoignables(), { nombreAvis: 10 });
    expect(keys).not.toContain("phone_not_clickable");
    expect(keys).not.toContain("weak_cta");
    expect(keys).not.toContain("no_reviews_on_site");
  });
});

describe("scorer — coquille de SPA", () => {
  it("baisse la CONFIANCE des axes de contenu, pas leur note à zéro", () => {
    const spa: SignauxSite = {
      ...signauxSains(),
      ressembleSpa: true,
      longueurTexteVisible: 120,
      title: null,
      metaDescription: null,
      nbH1: 0,
      jsonLdLocalBusiness: false,
      napAdresse: false,
    };
    const r = scorer(spa, { nombreAvis: 10 });
    expect(r.axes.seo.confiance).toBe("faible");
    expect(r.axes.conversion.confiance).toBe("faible");
    // La vitesse se chronomètre quel que soit le mode de rendu.
    expect(r.axes.vitesse.confiance).toBe("haute");
  });

  it("exclut les axes non concluants de la note globale", () => {
    const spa: SignauxSite = { ...signauxSains(), ressembleSpa: true };
    const r = scorer(spa);
    // Restent vitesse (30) et mobile (20), tous deux excellents ici.
    expect(r.noteGlobale).toBeGreaterThanOrEqual(85);
    expect(r.alertes.join(" ")).toContain("JavaScript");
  });
});

describe("scorer — avis clients", () => {
  it("n'accuse pas un site dont les avis sont dans un widget", () => {
    const s: SignauxSite = { ...signauxSains(), avisDansLaPage: false, widgetAvis: "trustindex" };
    expect(issueKeysDepuisSignaux(s, { nombreAvis: 87 })).not.toContain("no_reviews_on_site");
    expect(scorer(s, { nombreAvis: 87 }).alertes.join(" ")).toContain("trustindex");
  });

  it("émet la clé quand des avis Google existent et que la page n'en montre aucun", () => {
    const s: SignauxSite = { ...signauxSains(), avisDansLaPage: false, widgetAvis: null };
    expect(issueKeysDepuisSignaux(s, { nombreAvis: 87 })).toContain("no_reviews_on_site");
  });

  it("se tait quand l'entreprise n'a aucun avis Google connu", () => {
    const s: SignauxSite = { ...signauxSains(), avisDansLaPage: false, widgetAvis: null };
    expect(issueKeysDepuisSignaux(s, { nombreAvis: 0 })).not.toContain("no_reviews_on_site");
    // La question ne se posant pas, la preuve est « inconnue » et sort du calcul.
    const avis = scorer(s, { nombreAvis: 0 }).axes.conversion.preuves.find((p) => p.cle === "avis");
    expect(avis?.verdict).toBe("inconnu");
    expect(avis?.valeur).toBeNull();
  });
});

describe("scorer — téléphone", () => {
  it("ne dit « non cliquable » que si un numéro est bien présent en texte", () => {
    const sansNumero: SignauxSite = {
      ...signauxSains(),
      telCliquable: false,
      telephoneEnTexte: false,
    };
    expect(issueKeysDepuisSignaux(sansNumero, {})).not.toContain("phone_not_clickable");

    const enTexteSeul: SignauxSite = {
      ...signauxSains(),
      telCliquable: false,
      telephoneEnTexte: true,
    };
    expect(issueKeysDepuisSignaux(enTexteSeul, {})).toContain("phone_not_clickable");
  });
});

describe("scorer — HTTP sans TLS", () => {
  it("pénalise l'absence de HTTPS sans faire tomber tout l'axe SEO", () => {
    const r = scorer({ ...signauxSains(), https: false });
    const https = r.axes.seo.preuves.find((p) => p.cle === "https");
    expect(https?.verdict).toBe("probleme");
    expect(https?.valeur).toBe("absente");
    expect(r.axes.seo.note).toBeLessThan(scorer(signauxSains()).axes.seo.note);
    expect(r.axes.seo.note).toBeGreaterThan(50);
  });
});

describe("scorer — noindex", () => {
  it("pèse lourd : un site invisible sur Google est le pire cas SEO", () => {
    const r = scorer({ ...signauxSains(), noindex: true });
    const p = r.axes.seo.preuves.find((p) => p.cle === "noindex");
    expect(p?.valeur).toBe("bloquée (noindex)");
    expect(p?.poids).toBeGreaterThanOrEqual(20);
    expect(r.axes.seo.note).toBeLessThan(85);
  });
});

describe("scorer — site lent", () => {
  it("émet slow_site au-delà du seuil et le justifie par la mesure", () => {
    const lent: SignauxSite = { ...signauxSains(), chargementMs: 4_200 };
    expect(issueKeysDepuisSignaux(lent, {})).toContain("slow_site");
    const p = scorer(lent).axes.vitesse.preuves.find((p) => p.cle === "chargement");
    expect(p?.valeur).toBe("4,2 s");
    expect(p?.verdict).toBe("probleme");
  });

  it("n'accable pas un site juste au-dessus du seuil", () => {
    const limite: SignauxSite = { ...signauxSains(), chargementMs: SEUILS.chargementMs + 200 };
    const p = scorer(limite).axes.vitesse.preuves.find((p) => p.cle === "chargement");
    expect(p?.verdict).toBe("moyen");
  });
});

describe("scorer — mobile", () => {
  it("émet outdated_or_not_mobile sans viewport", () => {
    expect(issueKeysDepuisSignaux({ ...signauxSains(), viewport: false }, {})).toContain(
      "outdated_or_not_mobile",
    );
  });

  it("l'émet aussi sur des largeurs figées, viewport présent", () => {
    expect(issueKeysDepuisSignaux({ ...signauxSains(), nbLargeursFixes: 5 }, {})).toContain(
      "outdated_or_not_mobile",
    );
  });
});

describe("preuves non mesurées", () => {
  it("sont retirées du dénominateur au lieu d'être comptées comme des manques", () => {
    // Sondes annexes indisponibles : la note SEO ne doit pas en souffrir.
    const sansSondes: SignauxSite = { ...signauxSains(), robotsTxt: null, sitemapXml: null };
    expect(scorer(sansSondes).axes.seo.note).toBe(scorer(signauxSains()).axes.seo.note);

    // Mais les deux absentes pour de bon, elles, coûtent des points.
    const sansFichiers: SignauxSite = { ...signauxSains(), robotsTxt: false, sitemapXml: false };
    expect(scorer(sansFichiers).axes.seo.note).toBeLessThan(scorer(signauxSains()).axes.seo.note);
  });
});

describe("libelleDeNote", () => {
  it("couvre les cinq niveaux", () => {
    expect(libelleDeNote(95)).toBe("Excellent");
    expect(libelleDeNote(75)).toBe("Bon");
    expect(libelleDeNote(55)).toBe("Perfectible");
    expect(libelleDeNote(35)).toBe("Faible");
    expect(libelleDeNote(10)).toBe("Critique");
  });
});
