import {
  formatPlanTexte,
  normaliserChemin,
  parsePlanTexte,
  parseRegles,
  trouverRedirection,
  verifierPlan,
} from "../redirections";

describe("normaliserChemin", () => {
  it("ramène les formes recopiées à la main à une seule", () => {
    // Les trois arrivent réellement : export Search Console, copie navigateur,
    // saisie au clavier.
    expect(normaliserChemin("https://ancien.fr/Nos-Services.html")).toBe("/nos-services.html");
    expect(normaliserChemin("/nos-services.html/")).toBe("/nos-services.html");
    expect(normaliserChemin("nos-services.html")).toBe("/nos-services.html");
  });

  it("garde la racine et écrase les barres doublées", () => {
    expect(normaliserChemin("/")).toBe("/");
    expect(normaliserChemin("")).toBe("/");
    expect(normaliserChemin("//blog//2019/")).toBe("/blog/2019");
  });

  it("décode les accents encodés", () => {
    expect(normaliserChemin("/r%C3%A9alisations")).toBe("/réalisations");
  });
});

describe("trouverRedirection", () => {
  const plan = [
    { de: "/nos-services.html", vers: "/services" },
    { de: "/blog/*", vers: "/actualites/*" },
    { de: "/vieux-truc", vers: "https://exemple.fr/ailleurs" },
  ];

  it("redirige un chemin hérité vers sa page", () => {
    expect(trouverRedirection("/nos-services.html", null, plan)).toEqual({
      vers: "/services",
      permanent: true,
    });
  });

  it("reporte le reste du chemin sous un joker", () => {
    expect(trouverRedirection("/blog/2019/chaudiere", null, plan)?.vers).toBe(
      "/actualites/2019/chaudiere",
    );
  });

  it("laisse passer une cible absolue sans y toucher", () => {
    expect(trouverRedirection("/vieux-truc", null, plan)?.vers).toBe("https://exemple.fr/ailleurs");
  });

  it("rend null quand rien ne matche", () => {
    expect(trouverRedirection("/contact", null, plan)).toBeNull();
  });

  it("préfère le joker le plus long, quel que soit l'ordre de saisie", () => {
    const regles = [
      { de: "/blog/*", vers: "/actualites" },
      { de: "/blog/2019/*", vers: "/archives" },
    ];
    expect(trouverRedirection("/blog/2019/chaudiere", null, regles)?.vers).toBe("/archives");
  });
});

describe("trouverRedirection — la garde anti-masquage", () => {
  // Règle de conception n°1 : une redirection ne masque jamais une page servie.
  // Une seule ligne malheureuse rendrait sinon une page du site inatteignable.
  const plan = [
    { de: "/contact", vers: "/nous-contacter" },
    { de: "/?page_id=12", vers: "/services" },
  ];

  it("ignore une règle sans query quand la page existe", () => {
    expect(trouverRedirection("/contact", null, plan, { cheminsServis: ["/", "/contact"] })).toBeNull();
  });

  it("applique la même règle quand la page n'existe pas", () => {
    expect(trouverRedirection("/contact", null, plan, { cheminsServis: ["/"] })?.vers).toBe(
      "/nous-contacter",
    );
  });

  it("applique une règle à query MÊME sur une page servie", () => {
    // « / » est toujours servi : sans cette exception, les permaliens WordPress
    // hérités (`/?page_id=12`) seraient inatteignables par construction.
    expect(trouverRedirection("/", "page_id=12", plan, { cheminsServis: ["/", "/contact"] })?.vers).toBe("/services");
  });

  it("n'exige pas que la query soit à l'identique, seulement qu'elle couvre", () => {
    expect(
      trouverRedirection("/", "utm_source=mail&page_id=12", plan, { cheminsServis: ["/", "/contact"] })?.vers,
    ).toBe("/services");
    expect(trouverRedirection("/", "page_id=99", plan, { cheminsServis: ["/", "/contact"] })).toBeNull();
  });
});

describe("trouverRedirection — les chaînes", () => {
  it("n'applique pas au milieu d'une chaîne une règle qui masquerait une page servie", () => {
    // Constaté en sonde : `/vieux.html` partait sur `/chauffage` au lieu de
    // `/climatisation`, parce que la règle inerte reprenait vie au second saut.
    const plan = [
      { de: "/vieux.html", vers: "/climatisation" },
      { de: "/climatisation", vers: "/chauffage" },
    ];
    expect(
      trouverRedirection("/vieux.html", null, plan, { cheminsServis: ["/", "/climatisation", "/chauffage"] })?.vers,
    ).toBe("/climatisation");
    // Sans la page servie, la chaîne s'aplatit comme avant.
    expect(trouverRedirection("/vieux.html", null, plan)?.vers).toBe("/chauffage");
  });

  it("aplatit A→B→C en un seul saut", () => {
    const plan = [
      { de: "/a", vers: "/b" },
      { de: "/b", vers: "/c" },
    ];
    expect(trouverRedirection("/a", null, plan)?.vers).toBe("/c");
  });

  it("ne renvoie jamais le visiteur dans une boucle", () => {
    const plan = [
      { de: "/a", vers: "/b" },
      { de: "/b", vers: "/a" },
    ];
    // A→B→A ne mène nulle part : mieux vaut un 404 qu'un navigateur bloqué.
    expect(trouverRedirection("/a", null, plan)).toBeNull();
  });

  it("s'arrête à la dernière cible atteinte quand la boucle est plus loin", () => {
    const plan = [
      { de: "/a", vers: "/b" },
      { de: "/b", vers: "/c" },
      { de: "/c", vers: "/b" },
    ];
    expect(trouverRedirection("/a", null, plan)?.vers).toBe("/c");
  });

  it("une chaîne temporaire contamine le verdict", () => {
    const plan = [
      { de: "/a", vers: "/b", temporaire: true },
      { de: "/b", vers: "/c" },
    ];
    expect(trouverRedirection("/a", null, plan)).toEqual({ vers: "/c", permanent: false });
  });
});

describe("trouverRedirection — ce qu'une cible n'a pas le droit d'être", () => {
  it("refuse un schéma qui n'est pas http(s)", () => {
    // `javascript://x%0aalert(1)` passait pour une URL absolue et partait tel
    // quel en `Location`. Non exploitable côté navigateur, mais c'est une garde
    // qui ne tient que par la clémence du client.
    for (const vers of ["javascript://x%0aalert(1)", "data:text/html,<script>1</script>", "mailto:a@b.fr", "file:///etc/passwd"]) {
      expect(trouverRedirection("/vieux", null, [{ de: "/vieux", vers }])).toBeNull();
    }
  });

  it("laisse passer http et https", () => {
    expect(trouverRedirection("/vieux", null, [{ de: "/vieux", vers: "https://exemple.fr/x" }])?.vers).toBe(
      "https://exemple.fr/x",
    );
  });

  it("ne laisse pas une cible protocole-relative sortir du site", () => {
    // « //evil.fr » est une URL absolue pour un navigateur. Ramenée à un chemin,
    // elle reste chez nous.
    expect(trouverRedirection("/vieux", null, [{ de: "/vieux", vers: "//evil.fr/x" }])?.vers).toBe("/evil.fr/x");
  });

  it("retire les caractères de contrôle avant qu'ils atteignent l'en-tête", () => {
    const cible = trouverRedirection("/vieux", null, [{ de: "/vieux", vers: "/ok\r\nSet-Cookie: a=b" }]);
    expect(cible?.vers).not.toMatch(/[\r\n]/);
  });
});

describe("parsePlanTexte", () => {
  it("accepte les séparateurs qu'on colle réellement", () => {
    const { regles, erreurs } = parsePlanTexte(
      [
        "/nos-services.html → /services",
        "/contact.php -> /contact",
        "/a-propos,/qui-sommes-nous",
        "/vieux;/neuf",
        "/tab\t/onglet",
        "  ",
        "# un commentaire",
      ].join("\n"),
    );
    expect(erreurs).toEqual([]);
    expect(regles.map((r) => r.vers)).toEqual([
      "/services",
      "/contact",
      "/qui-sommes-nous",
      "/neuf",
      "/onglet",
    ]);
  });

  it("marque le temporaire par un « ! » final", () => {
    const { regles } = parsePlanTexte("/promo → /offre !");
    expect(regles[0]).toEqual({ de: "/promo", vers: "/offre", temporaire: true });
  });

  it("signale une ligne sans cible plutôt que de l'avaler", () => {
    const { regles, erreurs } = parsePlanTexte("/orpheline");
    expect(regles).toEqual([]);
    expect(erreurs[0]).toMatch(/Ligne 1/);
  });

  it("fait l'aller-retour avec formatPlanTexte", () => {
    const texte = "/a → /b\n/c → /d !";
    expect(formatPlanTexte(parsePlanTexte(texte).regles)).toBe(texte);
  });
});

describe("parseRegles", () => {
  it("ignore ce qui n'a pas la forme attendue sans jeter le reste", () => {
    // Le plan dort en JSONB : une ligne abîmée ne doit pas priver le site de
    // TOUTES ses redirections.
    const regles = parseRegles([
      { de: "/a", vers: "/b" },
      { de: "/c" },
      null,
      "n'importe quoi",
      { de: "/d", vers: "/e", temporaire: true },
    ]);
    expect(regles).toEqual([
      { de: "/a", vers: "/b" },
      { de: "/d", vers: "/e", temporaire: true },
    ]);
  });

  it("rend un tableau vide sur une valeur absente", () => {
    expect(parseRegles(null)).toEqual([]);
    expect(parseRegles({})).toEqual([]);
  });
});

describe("verifierPlan", () => {
  const servis = ["/", "/services", "/contact"];

  it("signale une cible qui n'est pas une page du site", () => {
    const diags = verifierPlan([{ de: "/vieux.html", vers: "/prestations" }], servis);
    expect(diags[0].gravite).toBe("avertissement");
    expect(diags[0].message).toMatch(/404/);
  });

  it("signale une règle inerte parce que la source est déjà servie", () => {
    const diags = verifierPlan([{ de: "/contact", vers: "/services" }], servis);
    expect(diags.some((d) => /ne s'appliquera pas/.test(d.message))).toBe(true);
  });

  it("signale une source et une cible identiques", () => {
    const diags = verifierPlan([{ de: "/a", vers: "/a" }], servis);
    expect(diags[0]).toMatchObject({ gravite: "erreur" });
  });

  it("signale un doublon", () => {
    const diags = verifierPlan(
      [
        { de: "/vieux.html", vers: "/services" },
        { de: "/VIEUX.html/", vers: "/contact" },
      ],
      servis,
    );
    expect(diags.some((d) => /Doublon/.test(d.message))).toBe(true);
  });

  it("signale une boucle", () => {
    const diags = verifierPlan(
      [
        { de: "/a", vers: "/b" },
        { de: "/b", vers: "/a" },
      ],
      servis,
    );
    expect(diags.some((d) => d.gravite === "erreur" && /Boucle/.test(d.message))).toBe(true);
  });

  it("ne dit rien d'un plan sain", () => {
    expect(verifierPlan([{ de: "/nos-services.html", vers: "/services" }], servis)).toEqual([]);
  });
});
