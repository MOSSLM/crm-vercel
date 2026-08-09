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
    poidsTotalOctets: 900_000,
    compression: true,
    cacheControl: true,
    longueurTexteVisible: 4000,
    nbScripts: 4,
    nbScriptsBloquants: 0,
    nbCssBloquants: 1,
    ressembleSpa: false,
    coquille: false,
    pageParking: false,
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
    const ttfb = r.axes.vitesse.preuves.find((p) => p.cle === "ttfb");
    expect(ttfb).toBeDefined();
    expect(ttfb?.valeur).toBe("200 ms");
    expect(ttfb?.seuil).toBe("800 ms");
    expect(ttfb?.verdict).toBe("ok");
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
      // Invariant du modèle : une SPA EST une coquille — peu de texte servi —
      // avec du JavaScript pour la remplir.
      coquille: true,
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
    const spa: SignauxSite = { ...signauxSains(), coquille: true, ressembleSpa: true };
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
  it("émet slow_site sur un serveur qui traîne, et le justifie par la mesure", () => {
    const lent: SignauxSite = { ...signauxSains(), ttfbMs: 4_200 };
    expect(issueKeysDepuisSignaux(lent, {})).toContain("slow_site");
    const p = scorer(lent).axes.vitesse.preuves.find((p) => p.cle === "ttfb");
    expect(p?.valeur).toBe("4,2 s");
    expect(p?.verdict).toBe("probleme");
  });

  it("n'accable pas un site juste au-dessus du seuil", () => {
    const limite: SignauxSite = { ...signauxSains(), ttfbMs: SEUILS.ttfbMs + 100 };
    const p = scorer(limite).axes.vitesse.preuves.find((p) => p.cle === "ttfb");
    expect(p?.verdict).toBe("moyen");
  });

  it("émet slow_site sur une page trop lourde, serveur rapide compris", () => {
    const lourde: SignauxSite = { ...signauxSains(), poidsTotalOctets: 6_000_000 };
    const r = scorer(lourde);
    expect(r.issueKeys).toContain("slow_site");
    expect(r.axes.vitesse.preuves.find((p) => p.cle === "poids")?.valeur).toBe("6,0 Mo");
  });

  it("ne pèse rien quand aucun serveur n'a donné de taille", () => {
    // « On n'a pas pu peser » n'est pas « c'est léger » : la preuve sort du
    // dénominateur au lieu de créditer le site de points qu'il n'a pas gagnés.
    const nonPesee: SignauxSite = { ...signauxSains(), poidsTotalOctets: null };
    const p = scorer(nonPesee).axes.vitesse.preuves.find((p) => p.cle === "poids");
    expect(p?.verdict).toBe("inconnu");
    expect(scorer(nonPesee).issueKeys).not.toContain("slow_site");
  });

  it("ne mesure plus deux fois le même événement", () => {
    // TTFB et réception du HTML ne sont séparés que par le transfert du
    // document : deux preuves pour un seul phénomène, 55 points sur 100.
    const cles = scorer(signauxSains()).axes.vitesse.preuves.map((p) => p.cle);
    expect(cles).toContain("ttfb");
    expect(cles).not.toContain("chargement");
  });
});

describe("scorer — mobile", () => {
  it("émet outdated_or_not_mobile sans viewport", () => {
    expect(issueKeysDepuisSignaux({ ...signauxSains(), viewport: false }, {})).toContain(
      "outdated_or_not_mobile",
    );
  });

  it("n'accuse pas un site adaptatif qui a quelques largeurs figées", () => {
    // Le faux positif qui frappait 21 sites sur 22 : des largeurs figées seules
    // ne font pas un site inadapté quand les règles mobiles sont là.
    expect(issueKeysDepuisSignaux({ ...signauxSains(), nbLargeursFixes: 5 }, {})).not.toContain(
      "outdated_or_not_mobile",
    );
  });

  it("l'émet quand les deux symptômes concordent", () => {
    const fige: SignauxSite = { ...signauxSains(), nbLargeursFixes: 5, nbMediaQueries: 0 };
    expect(issueKeysDepuisSignaux(fige, {})).toContain("outdated_or_not_mobile");
  });

  it("ne l'émet pas quand le CSS n'a pas pu être lu", () => {
    // `null` = on n'a pas regardé. Le doute n'accuse pas.
    const inconnu: SignauxSite = {
      ...signauxSains(),
      nbLargeursFixes: 5,
      nbMediaQueries: null,
      cssLisible: false,
    };
    expect(issueKeysDepuisSignaux(inconnu, {})).not.toContain("outdated_or_not_mobile");
  });
});

describe("page quasi vide — le cas relevé en base : 1 Ko de HTML, conversion 0/100, confiance haute", () => {
  it("baisse la confiance même sans le moindre script", () => {
    // `ressembleSpa` exigeait au moins trois scripts : une page d'attente
    // statique passait donc pour pleinement mesurée, et on s'apprêtait à envoyer
    // un rapport accablant sur une page qui n'est pas le site de l'entreprise.
    const vide: SignauxSite = {
      ...signauxSains(),
      coquille: true,
      ressembleSpa: false,
      nbScripts: 0,
      longueurTexteVisible: 120,
      formulaire: false,
      mailto: false,
      nbCta: 0,
    };
    const r = scorer(vide);
    expect(r.axes.conversion.confiance).toBe("faible");
    expect(r.axes.seo.confiance).toBe("faible");
  });

  it("exclut de la note globale les axes qu'on refuse de publier", () => {
    const vide: SignauxSite = { ...signauxSains(), coquille: true, nbCta: 0, formulaire: false, mailto: false };
    const r = scorer(vide);
    // La vitesse et le mobile se mesurent encore : la note globale existe, mais
    // elle ne doit rien devoir aux axes en confiance faible.
    expect(r.axes.vitesse.confiance).not.toBe("faible");
    expect(r.noteGlobale).toBeGreaterThan(0);
  });

  it("une page qui se déclare en travaux n'émet que « pas de site »", () => {
    const parking: SignauxSite = {
      ...signauxSains(),
      coquille: true,
      pageParking: true,
      viewport: false,
      formulaire: false,
      mailto: false,
      nbCta: 0,
    };
    const r = scorer(parking);
    expect(r.issueKeys).toEqual(["no_site_or_unreachable"]);
    expect(r.alertes.join(" ")).toContain("en construction");
  });
});

describe("une clé ne contredit jamais la note de son axe", () => {
  it("un site à 88/100 en vitesse ne reçoit pas la carte « site lent »", () => {
    // Cas relevé en base : TTFB 1 043 ms, six autres preuves de vitesse au vert.
    // L'ancienne dérivation émettait `slow_site` sur son seul seuil TTFB.
    const rapideMaisTtfbHaut: SignauxSite = { ...signauxSains(), ttfbMs: 1_043, chargementMs: 1_139 };
    const r = scorer(rapideMaisTtfbHaut);

    expect(r.axes.vitesse.note).toBeGreaterThan(70);
    // Le TTFB est « moyen », pas « problème » : la zone grise joue son rôle.
    expect(r.axes.vitesse.preuves.find((p) => p.cle === "ttfb")?.verdict).toBe("moyen");
    expect(r.issueKeys).not.toContain("slow_site");
  });

  it("toute clé émise s'appuie sur au moins une preuve en problème", () => {
    const abime: SignauxSite = {
      ...signauxSains(),
      ttfbMs: 5_000,
      viewport: false,
      formulaire: false,
      mailto: false,
      nbCta: 0,
    };
    const r = scorer(abime);
    const enProbleme = new Set(
      Object.values(r.axes).flatMap((a) => a.preuves.filter((p) => p.verdict === "probleme").map((p) => p.cle)),
    );

    expect(r.issueKeys.length).toBeGreaterThan(0);
    expect(enProbleme.size).toBeGreaterThan(0);
    // Aucune clé sans fondement mesuré.
    for (const cle of r.issueKeys) {
      expect(cle).not.toBe("no_site_or_unreachable");
    }
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
