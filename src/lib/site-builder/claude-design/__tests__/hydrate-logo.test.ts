/**
 * 296 des 300 entreprises de la cohorte de démarchage n'ont aucun logo. Ces
 * tests verrouillent ce qu'elles obtiennent à la place : leur nom, composé —
 * jamais un emplacement vide, jamais une image cassée, jamais un mot coupé en
 * deux.
 */

import { composerSignature, hydrateLogo, porteUneMarque } from "../hydrate-logo";

/**
 * L'en-tête tel que les designs le livrent réellement (482 sections sur 492 en
 * base), token déjà résolu à vide faute de logo. Le menu mobile et le pied de
 * page, eux, composent DÉJÀ le nom à côté de l'image.
 */
const DESIGN = `
<header class="site-header">
  <div class="wrap header-inner">
    <a href="/" class="brand" aria-label="Plomberie Durand : accueil">
      <img class="brand-img" src="" alt="Plomberie Durand" style="height:42px;width:auto;object-fit:contain;" decoding="async">
    </a>
    <ul class="nav-main"><li><a href="/">Accueil</a></li></ul>
  </div>
</header>
<div class="mobile-menu">
  <div class="mm-head">
    <span class="brand"><img class="brand-img" src="" alt="Plomberie Durand"><span class="brand-name" data-cdp="1.0.0">Plomberie Durand</span></span>
  </div>
</div>`;

/** L'en-tête seul — pour isoler le cas où le design ne compose le nom nulle part. */
const ENTETE_SEULE = `
<a href="/" class="brand" aria-label="X : accueil">
  <img class="brand-img" src="" alt="X" style="height:42px">
</a>`;

/** Le premier bloc de marque du rendu, c'est-à-dire l'en-tête. */
const entete = (html: string): string => html.slice(0, html.indexOf("nav-main"));

describe("hydrateLogo — un logo vérifié", () => {
  it("pose le vrai logo à la place de celui du design", () => {
    const out = hydrateLogo(DESIGN, {
      nom: "Plomberie Durand",
      logoUrl: "https://cdn.exemple.fr/logo.webp",
    });
    expect(out).toContain('src="https://cdn.exemple.fr/logo.webp"');
    expect(out).toContain('alt="Plomberie Durand"');
    // La mise en forme du design survit : c'est elle qui tient la hauteur de
    // l'en-tête.
    expect(out).toContain("height:42px;width:auto;object-fit:contain;");
  });

  it("ne compose aucune signature quand il y a un logo", () => {
    const out = hydrateLogo(ENTETE_SEULE, { nom: "X SARL", logoUrl: "https://cdn/l.png" });
    expect(out).toContain("<img");
    expect(out).not.toContain("brand-name");
  });
});

describe("hydrateLogo — aucun logo : la signature typographique", () => {
  it("remplace l'image vide de l'en-tête par le nom", () => {
    const out = hydrateLogo(DESIGN, { nom: "Plomberie Durand", logoUrl: null });
    // L'image cassée disparaît de l'en-tête…
    expect(entete(out)).not.toContain("<img");
    // …et le nom prend sa place, à l'endroit où l'œil cherche l'identité.
    expect(entete(out)).toContain("Plomberie Durand");
    expect(entete(out)).toContain("brand-name");
  });

  it("reprend la classe du design, jamais une police choisie ici", () => {
    // `.brand-name` porte `font-family: var(--serif)` dans la feuille partagée
    // des 128 sites. Poser une police ici la contredirait sur chacun d'eux.
    const out = hydrateLogo(ENTETE_SEULE, { nom: "Durand", logoUrl: "" });
    expect(out).toContain('class="brand-name"');
    expect(out).not.toContain("font-family");
  });

  it("laisse l'en-tête annonçable : le lien de marque n'est jamais vide", () => {
    const out = hydrateLogo(ENTETE_SEULE, { nom: "Durand", logoUrl: "" });
    expect(out).toContain('aria-label="X : accueil"');
    // Un <a> dont on aurait retiré la seule image sans rien remettre serait un
    // lien sans nom accessible.
    expect(out.replace(/<[^>]*>/g, "").trim()).toBe("Durand");
  });

  it("garde la signature que le design compose déjà, et retire l'image vide", () => {
    const out = hydrateLogo(DESIGN, { nom: "Plomberie Durand", logoUrl: "" });
    // Menu mobile : le nom était déjà là, on ne le double pas — une signature
    // pour l'en-tête, une pour le menu, pas trois.
    expect(out).not.toContain('<img class="brand-img"');
    expect((out.match(/class="brand-name"/g) ?? []).length).toBe(2);
  });

  it("le clone de gabarit ne rapporte pas le tampon `data-cdp` du modèle", () => {
    // Deux nœuds portant le même chemin rendraient la résolution des overrides
    // ambiguë (cf. dom-paths.ts).
    const out = hydrateLogo(DESIGN, { nom: "Plomberie Durand", logoUrl: "" });
    expect((out.match(/data-cdp="1\.0\.0"/g) ?? []).length).toBe(1);
    expect(entete(out)).not.toContain("data-cdp");
  });
});

describe("hydrateLogo — ce qu'on ne touche pas", () => {
  it("laisse une image réellement garnie, même sans logo en base", () => {
    // Logo en dur du gabarit ou édition inline posée à la main : elle gagne.
    const html = '<a class="brand"><img class="brand-img" src="/images/logo-maison.png"></a>';
    expect(hydrateLogo(html, { nom: "Durand", logoUrl: "" })).toBe(html);
  });

  it("traite un token non résolu comme un emplacement vide", () => {
    // L'aperçu de l'éditeur n'a pas toujours toutes les variables : le token
    // survit et produit exactement la même image cassée qu'un `src=""`.
    const html = '<a class="brand"><img class="brand-img" src="{{ entreprise.logo_url }}"></a>';
    const out = hydrateLogo(html, { nom: "Durand", logoUrl: "" });
    expect(out).not.toContain("<img");
    expect(out).toContain("Durand");
  });

  it("ne touche à rien sans nom ni logo — un lien vide serait pire", () => {
    expect(hydrateLogo(DESIGN, { nom: "", logoUrl: "" })).toBe(DESIGN);
    expect(hydrateLogo(DESIGN, {})).toBe(DESIGN);
  });

  it("laisse intact un markup sans bloc de marque", () => {
    const html = "<section><h1>Nos services</h1></section>";
    expect(hydrateLogo(html, { nom: "Durand", logoUrl: "" })).toBe(html);
  });

  it("n'invente pas de logo manquant à un bloc de marque sans image", () => {
    // Monogramme SVG du design : rien n'était vide, rien ne doit bouger.
    const html = '<a class="brand"><span class="brand-mark"><svg></svg></span></a>';
    expect(hydrateLogo(html, { nom: "Durand", logoUrl: "" })).toBe(html);
  });
});

describe("hydrateLogo — les raisons sociales telles qu'elles sont en base", () => {
  it("échappe le nom : 8 fiches de la cohorte portent un `&`", () => {
    const out = hydrateLogo(ENTETE_SEULE, { nom: 'A & B <"Clim">', logoUrl: "" });
    expect(out).toContain("A &amp; B &lt;\"Clim\"&gt;");
    expect(out).not.toContain("<\"Clim\">");
  });

  it("ouvre l'interlettrage des noms tout en capitales — 175 sur 300", () => {
    // Le design applique `letter-spacing: -0.01em`, taillé pour du bas-de-casse.
    // Sur « ECLATS ANTIVOLS » il colle les fûts et le mot cesse de se lire.
    const out = hydrateLogo(ENTETE_SEULE, { nom: "ECLATS ANTIVOLS", logoUrl: "" });
    expect(out).toContain("letter-spacing:0.05em");
  });

  it("laisse l'interlettrage du design aux noms en bas-de-casse", () => {
    const out = hydrateLogo(ENTETE_SEULE, { nom: "Plomberie Durand", logoUrl: "" });
    expect(out).not.toContain("letter-spacing");
  });

  it("ne redimensionne pas les noms courts — 213 fiches sur 300", () => {
    const out = hydrateLogo(ENTETE_SEULE, { nom: "Durand", logoUrl: "" });
    expect(out).not.toContain("font-size");
    expect(out).not.toContain("white-space");
  });

  it("réduit le corps et autorise deux lignes sur un nom long", () => {
    const out = hydrateLogo(ENTETE_SEULE, {
      nom: "Societe De Montage Aeraulique Climatisation",
      logoUrl: "",
    });
    expect(out).toContain("font-size:");
    // Sans ça, le `white-space: nowrap` du design pousse la signature hors de
    // l'en-tête.
    expect(out).toContain("white-space:normal");
    expect(out).toContain("max-width:24ch");
    // Et le retour à la ligne ne doit jamais casser un mot en deux.
    expect(out).toContain("overflow-wrap:normal");
  });
});

/**
 * `entreprises.name` vient de la fiche Google, et une fiche Google se référence.
 * Le plus long de la cohorte fait 123 caractères, dont 107 d'argumentaire.
 */
describe("composerSignature", () => {
  it("rend intact un nom qui tient", () => {
    expect(composerSignature("ECLATS ANTIVOLS")).toBe("ECLATS ANTIVOLS");
    expect(composerSignature("  TOURE   ET FILS ")).toBe("TOURE ET FILS");
  });

  it("garde entier un nom long qui est vraiment un nom", () => {
    // 43 caractères, sans un mot-clé : c'est sa raison sociale. On la compose
    // plus petit, on ne lui en retire rien.
    const nom = "Societe De Montage Aeraulique Climatisation";
    expect(composerSignature(nom)).toBe(nom);
  });

  it("coupe le titre Google là où le nom s'arrête", () => {
    expect(
      composerSignature(
        "Atlantic Service | Plombier - Chauffagiste - Spécialiste Pompe à chaleur - Climatisation",
      ),
    ).toBe("Atlantic Service");
    expect(composerSignature("HIP Services : Plombier Vienne (Pompe à chaleur, Climatisation)")).toBe(
      "HIP Services",
    );
    expect(composerSignature("TL CLIM -Climatisation-Photovoltaique-Gainable, RGE en Gironde.")).toBe(
      "TL CLIM",
    );
    expect(composerSignature("Groupe Verlaine Champagne Au Mont D'or 69- isolation par l'extérieur")).toBe(
      "Groupe Verlaine Champagne Au Mont D'or 69",
    );
  });

  it("ne coupe pas un trait d'union collé : ce n'est pas un séparateur", () => {
    // La virgule tranche, le trait d'union de « Dupont-Martin » non — sinon la
    // moitié de la raison sociale partirait avec l'argumentaire.
    expect(
      composerSignature("Etablissements Dupont-Martin et Associes, chauffage et climatisation"),
    ).toBe("Etablissements Dupont-Martin et Associes");
  });

  it("coupe au mot, jamais dedans", () => {
    const long = "SAS CHAMPAC Pompes à Chaleur Chauffage Climatisation Depannage EPERNAY REIMS";
    const signature = composerSignature(long);
    expect(long.startsWith(signature)).toBe(true);
    // Deux lignes de 24ch, pas une de plus.
    expect(signature.length).toBeLessThanOrEqual(48);
    // Le mot suivant est entier ou absent — jamais amputé.
    expect(long.charAt(signature.length)).toMatch(/^\s?$/);
  });

  it("garde un premier mot plus long que la limite plutôt qu'un moignon", () => {
    const mot = "Etablissementsdemontageaerauliqueetclimatisationgenerale";
    expect(composerSignature(mot)).toBe(mot);
  });

  it("reste toujours un préfixe du nom, mot à mot", () => {
    // Le lien de marque porte `aria-label="{{ entreprise.nom }} : accueil"`.
    // Tant que le texte visible est contenu dans le nom accessible, « clique sur
    // Atlantic Service » atteint le lien (WCAG 2.5.3).
    const noms = [
      "Atlantic Service | Plombier - Chauffagiste - Spécialiste Pompe à chaleur",
      "THERM'ESSONNE Lisses (Pôle Thermique) : Chauffage - Climatisation",
      "Entretien et Dépannage de Climatisation et Chauffage - Genius Maintenance Toulouse",
      "Pac&Sun - Serran Climatisation - Installateur panneaux solaires",
    ];
    for (const nom of noms) {
      expect(nom.startsWith(composerSignature(nom))).toBe(true);
    }
  });

  it("rend le nom entier quand la coupe ne laisserait rien d'identifiable", () => {
    const nom = "AB - Installation et entretien de pompes à chaleur en Haute-Savoie";
    // « AB » ne nomme personne : mieux vaut le libellé complet, réduit.
    expect(composerSignature(nom).startsWith("AB - Installation")).toBe(true);
  });
});

describe("porteUneMarque", () => {
  it("reconnaît les deux conventions", () => {
    expect(porteUneMarque('<a class="brand"><img class="brand-img"></a>')).toBe(true);
    expect(porteUneMarque("<div data-brand><img data-brand-logo></div>")).toBe(true);
    expect(porteUneMarque("<span class='brand-name'>X</span>")).toBe(true);
  });

  it("est faux sur un markup sans marque — c'est ce qui évite le parsing", () => {
    expect(porteUneMarque("<section><h1>Nos services</h1></section>")).toBe(false);
  });

  it("ne laisse rien passer que `hydrateLogo` aurait traité", () => {
    // Un filtre plus étroit que la fonction laisserait le site publié afficher
    // l'image cassée que l'aperçu, lui, aurait réparée.
    for (const html of [DESIGN, ENTETE_SEULE]) {
      expect(porteUneMarque(html)).toBe(true);
      expect(hydrateLogo(html, { nom: "Durand", logoUrl: "" })).not.toBe(html);
    }
  });
});
