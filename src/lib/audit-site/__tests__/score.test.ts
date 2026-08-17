import { scorer, issueKeysDepuisSignaux, libelleDeNote, SEUILS } from "../score";
import type { SignauxSite } from "../types";
import { AUDIT_ISSUE_CATALOG } from "@/data/auditIssues";

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
    villeDansTitre: true,
    mentionneRge: null,
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
    // Rien n'a été lu : les signaux qui viennent de la page sont indéterminés.
    villeDansTitre: null,
    mentionneRge: null,
  };
}

describe("scorer — cas nominal", () => {
  it("note haut un site sain et lui fait confiance", () => {
    const r = scorer(signauxSains(), { nombreAvis: 42 });
    expect(r.noteGlobale).toBeGreaterThanOrEqual(85);
    expect(r.libelle).toBe("Excellent");
    expect(r.issueKeys).toEqual([]);
    // Les quatre axes qui notent LE SITE. La popularité se juge à part : elle ne
    // dépend pas de la page et n'entre pas dans la note globale.
    for (const id of ["vitesse", "seo", "mobile", "conversion"] as const) {
      expect(r.axes[id].confiance).toBe("haute");
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
    for (const id of ["vitesse", "seo", "mobile", "conversion"] as const) {
      expect(r.axes[id].confiance).toBe("faible");
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

describe("popularité locale — le seul axe qui parle sans site", () => {
  it("ne pèse rien dans la note globale", () => {
    // Une réputation catastrophique ne doit pas faire baisser la note du SITE :
    // « votre site : 62/100 » doit rester une phrase sur le site.
    const base = signauxSains();
    const sansContexte = scorer(base);
    const avecMauvaiseReputation = scorer(base, { nombreAvis: 1, noteMoyenne: 2.4 });
    expect(avecMauvaiseReputation.noteGlobale).toBe(sansContexte.noteGlobale);
  });

  it("émet ses constats même quand le site est injoignable", () => {
    // Le cas des 760 entreprises sans site : c'est tout ce qu'on a à leur dire,
    // et ce sont les plus faciles à convaincre.
    const r = scorer(signauxInjoignables(), { nombreAvis: 2, noteMoyenne: 3.1 });
    expect(r.issueKeys).toContain("no_site_or_unreachable");
    expect(r.issueKeys).toContain("too_few_reviews");
    expect(r.issueKeys).toContain("low_rating");
  });

  it("ne reproche pas une page qu'on n'a pas lue", () => {
    // `rge_affiche` et `seo_local` viennent de la page : sans page, ils sont
    // indéterminés et ne déclenchent rien.
    const r = scorer(signauxInjoignables(), { nombreAvis: 2 });
    expect(r.issueKeys).not.toContain("rge_not_highlighted");
    expect(r.issueKeys).not.toContain("no_local_seo");
  });

  it("se tait sur les qualifications d'une entreprise qui n'en a pas", () => {
    const sansRge: SignauxSite = { ...signauxSains(), mentionneRge: null };
    const p = scorer(sansRge).axes.popularite.preuves.find((x) => x.cle === "rge_affiche");
    expect(p?.verdict).toBe("inconnu");
    expect(scorer(sansRge).issueKeys).not.toContain("rge_not_highlighted");
  });

  it("constate une qualification détenue et jamais citée", () => {
    const rgeCache: SignauxSite = { ...signauxSains(), mentionneRge: false };
    const r = scorer(rgeCache);
    expect(r.issueKeys).toContain("rge_not_highlighted");
    expect(r.axes.popularite.preuves.find((x) => x.cle === "rge_affiche")?.valeur).toBe(
      "détenue mais absente du site",
    );
  });

  it("lit `undefined` comme « non mesuré », pas comme « absent »", () => {
    // Les signaux relus depuis la base, écrits avant l'ajout d'un champ,
    // arrivent en `undefined`. Les traiter comme un manque produirait des
    // reproches inventés sur toutes les analyses existantes.
    const ancien = { ...signauxSains() } as Record<string, unknown>;
    delete ancien.mentionneRge;
    delete ancien.villeDansTitre;
    const r = scorer(ancien as unknown as SignauxSite);
    expect(r.issueKeys).not.toContain("rge_not_highlighted");
    expect(r.issueKeys).not.toContain("no_local_seo");
  });
});

describe("intégrité catalogue ↔ preuves", () => {
  // Le catalogue déclare les preuves qui le déclenchent. Rien dans le typage ne
  // garantit que ces clés existent réellement : une faute de frappe rendrait un
  // constat silencieusement indétectable. Ce test est le seul garde-fou.
  it("toute preuve citée par un constat existe dans le barème", () => {
    const connues = new Set(
      Object.values(scorer(signauxSains()).axes).flatMap((a) => a.preuves.map((p) => p.cle)),
    );

    const inconnues: string[] = [];
    for (const constat of AUDIT_ISSUE_CATALOG) {
      for (const d of constat.declencheurs ?? []) {
        for (const cle of d.preuves) {
          if (!connues.has(cle)) inconnues.push(`${constat.key} → ${cle}`);
        }
      }
    }

    expect(inconnues).toEqual([]);
  });

  it("tout constat détectable porte un pilier", () => {
    for (const constat of AUDIT_ISSUE_CATALOG) {
      expect(["technique", "contenu", "popularite"]).toContain(constat.pilier);
    }
  });

  /**
   * UN CONSTAT SANS DÉCLENCHEUR DOIT DIRE QUI LE RELÈVE.
   *
   * L'invariant d'origine n'en tolérait qu'un — `no_site_or_unreachable`, qui se
   * décide avant toute mesure, quand rien ne répond. Sept constats relevés à la
   * main l'ont rejoint : une entrée de menu qui tombe dans le vide, un « Titre
   * de la diapositive » resté dans un bouton, une année vieille de sept ans.
   * L'analyseur ne voit rien de tout ça.
   *
   * Ce que le test protège n'est donc plus « il n'y en a qu'un » mais « aucun
   * n'y est par oubli » : sans déclencheur ET sans `releve`, un constat ne
   * pourrait jamais être émis, et personne ne s'en apercevrait.
   */
  it("tout constat sans déclencheur déclare qui le relève", () => {
    const orphelins = AUDIT_ISSUE_CATALOG.filter(
      (c) => !c.declencheurs && !c.releve && c.key !== "no_site_or_unreachable",
    ).map((c) => c.key);
    expect(orphelins).toEqual([]);
  });

  it("un constat relevé à la main n'a pas de déclencheur automatique", () => {
    // L'inverse compte autant : un constat qui porte les deux se déclencherait
    // tout seul ET se relèverait à la main, donc apparaîtrait deux fois.
    const doubles = AUDIT_ISSUE_CATALOG.filter((c) => c.releve && c.declencheurs).map((c) => c.key);
    expect(doubles).toEqual([]);
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

/**
 * L'axe contenu — celui qui répond au site vide qui charge vite.
 *
 * LE DÉFAUT QU'IL CORRIGE, mesuré sur le parc : PageSpeed récompense
 * mécaniquement le vide. Moins de pages, moins d'images, moins de scripts, donc
 * meilleur affichage. Un site de trois pages bâclé battait un vrai site de
 * quarante, et nos axes maison ne rattrapaient rien — ce sont des contrôles de
 * présence qu'un site squelettique passe haut la main.
 */
describe("l'axe contenu", () => {
  const site = (over: Partial<SignauxSite> = {}): SignauxSite =>
    ({
      joignable: true,
      coquille: false,
      nbPagesSitemap: 24,
      longueurTexteVisible: 4200,
      nbImages: 14,
      avisDansLaPage: true,
      widgetAvis: null,
      ...over,
    }) as unknown as SignauxSite;

  const contenu = (s: SignauxSite, ctx = { nombreAvis: 62 }) =>
    scorer(s, ctx).axes.contenu;

  it("note haut un site fourni", () => {
    expect(contenu(site()).note).toBeGreaterThanOrEqual(85);
  });

  it("effondre la note d'un site vide, même impeccable par ailleurs", () => {
    const vide = site({ nbPagesSitemap: 3, longueurTexteVisible: 400, nbImages: 1, avisDansLaPage: false });
    expect(contenu(vide).note).toBeLessThan(30);
  });

  it("ne reproche pas des avis absents à qui n'en a pas reçu", () => {
    // Même règle que l'axe conversion : on ne reproche pas de ne pas montrer ce
    // qu'on n'a pas. Sans avis Google connus, la preuve sort du dénominateur.
    const sansAvisNulle = site({ avisDansLaPage: false });
    const avec = contenu(sansAvisNulle, { nombreAvis: 0 });
    const sans = contenu(sansAvisNulle, { nombreAvis: 62 });
    expect(avec.note).toBeGreaterThan(sans.note);
  });

  it("ne conclut pas sans plan du site : une absence de plan n'est pas une absence de pages", () => {
    const sansPlan = contenu(site({ nbPagesSitemap: null }));
    expect(sansPlan.preuves.find((p) => p.cle === "pages_site")?.verdict).toBe("inconnu");
  });

  it("passe en confiance faible sur une coquille", () => {
    // Une page rendue côté JavaScript n'a presque pas de texte servi : compter
    // ce qu'on n'a pas reçu donnerait 10/100 à des sites très corrects.
    expect(contenu(site({ coquille: true })).confiance).toBe("faible");
  });

  it("dit le texte en mots, pas en caractères", () => {
    // « 1 500 caractères » ne dit rien à personne ; « environ 250 mots » se
    // compare à une page qu'on a déjà lue.
    const p = contenu(site({ longueurTexteVisible: 600 })).preuves.find((x) => x.cle === "texte_accueil");
    expect(p?.valeur).toMatch(/mots?$/);
    expect(p?.seuil).toMatch(/mots?$/);
  });
});
