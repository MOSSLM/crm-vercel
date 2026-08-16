import {
  EMPTY_REQUIRED_VALUES,
  SITE_REQUIRED,
  SITE_REQUIRED_WITH_PROJECT,
  filledStat,
  missingFields,
  ruleApplies,
  ruleMet,
  siteRequiredFor,
  toArr,
  type RequiredValues,
} from "../required-fields";

/**
 * Les règles côté écran, éprouvées sur les mêmes cas limites que leur pendant
 * serveur (`missing-for-site.test.ts`). Elles décident du rouge dans la fiche,
 * des colonnes de la grille de complétion, et du bouton « créer le site » : une
 * exigence qui se déclenche à tort n'est pas un détail d'affichage, elle rend la
 * fiche impossible à valider.
 */

/** Fiche complète — chaque test n'en creuse qu'un champ. */
const values = (over: Partial<RequiredValues> = {}): RequiredValues => ({
  ...EMPTY_REQUIRED_VALUES,
  name: "Plomberie Durand",
  ville: "Annecy",
  code_postal: "74000",
  telephone: "0450000000",
  service_tags: "plomberie, chauffage",
  note_moyenne: "4.8",
  nombre_avis: "120",
  lm_override_city: "Annecy",
  lm_logo_url: "https://cdn/logo.png",
  lm_stat_years: "15",
  lm_stat_clients: "800",
  lm_stat_installations: "1200",
  ...over,
});

/**
 * Ce que l'écran réclame — posé comme l'écran le pose, par `ruleMet`. Filtrer
 * sur `ok` seul testerait une question que plus personne ne pose : une exigence
 * qui n'a pas lieu d'être est tenue d'office, et c'est `ruleMet` qui le sait.
 */
const missing = (over: Partial<RequiredValues> = {}, hasProject = true): string[] =>
  siteRequiredFor(hasProject)
    .filter((r) => !ruleMet(r, values(over)))
    .map((r) => r.label);

describe("règles de complétude", () => {
  it("ne réclame rien quand la fiche est complète", () => {
    expect(missing()).toEqual([]);
  });

  it("réclame chaque champ d'identité laissé vide", () => {
    expect(missing({ name: "" })).toEqual(["Nom"]);
    expect(missing({ ville: "   " })).toEqual(["Ville"]);
    expect(missing({ code_postal: "" })).toEqual(["Code postal"]);
    expect(missing({ telephone: "" })).toEqual(["Téléphone"]);
    expect(missing({ service_tags: " , , " })).toEqual(["Service tags"]);
  });

  it("réclame ce que porte le dossier lead magnet", () => {
    expect(missing({ lm_override_city: "" })).toEqual(["Ville SEO"]);
  });
});

/**
 * Le logo a cessé d'être une exigence le jour où son absence a eu un rendu
 * correct : `hydrate-logo` compose le nom de l'entreprise à sa place, dans la
 * police du design. 296 des 300 entreprises de la cohorte de démarchage n'ont
 * aucun logo — le réclamer ne produisait pas 296 logos, seulement 296 fiches
 * définitivement rouges.
 *
 * Mais le CHAMP reste, et ces tests tiennent les deux moitiés ensemble : sans le
 * second, un futur nettoyage supprimerait la règle « inutile » et emporterait
 * avec elle le seul téléversement de logo du CRM.
 */
describe("logo — champ conservé, exigence levée", () => {
  it("ne réclame plus rien sans logo", () => {
    expect(missing({ lm_logo_url: "" })).toEqual([]);
    expect(missing({ lm_logo_url: "   " })).toEqual([]);
  });

  it("garde sa règle, donc son contrôle de saisie et son libellé", () => {
    const regle = SITE_REQUIRED_WITH_PROJECT.find((r) => r.field === "lm_logo_url");
    expect(regle).toBeDefined();
    expect(regle?.facultatif).toBe(true);
    // Pas d'astérisque : `ruleApplies` est ce que lit l'habillage du champ.
    expect(ruleApplies(regle!, values({ lm_logo_url: "" }))).toBe(false);
  });
});

/**
 * Les avis Google forment une paire FACULTATIVE : 1 210 entreprises sur 2 797
 * n'ont pas de fiche Google, 217 en ont une sans le moindre avis. Leur réclamer
 * une note ne produisait pas une fiche plus complète, seulement une fiche
 * impossible à valider autrement qu'en inventant un chiffre.
 */
describe("note moyenne — exigée seulement s'il y a des avis", () => {
  it("ne réclame rien sans avis", () => {
    expect(missing({ nombre_avis: "", note_moyenne: "" })).toEqual([]);
    expect(missing({ nombre_avis: "0", note_moyenne: "" })).toEqual([]);
  });

  it("réclame la note dès qu'un nombre d'avis est annoncé", () => {
    expect(missing({ nombre_avis: "120", note_moyenne: "" })).toEqual(["Note moyenne"]);
  });

  it("ne réclame jamais le nombre d'avis lui-même", () => {
    const labels = SITE_REQUIRED_WITH_PROJECT.map((r) => r.label);
    expect(labels).not.toContain("Nombre d'avis");
    expect(missing({ nombre_avis: "", note_moyenne: "4.8" })).toEqual([]);
  });
});

/**
 * Les chiffres confirmés par le client sont prioritaires à l'affichage et jamais
 * écrits par l'enrichissement : ils satisfont l'exigence exactement comme une
 * estimation. Sans ce « ou », remplacer une estimation par un vrai chiffre
 * aurait rendu la fiche incomplète — l'inverse de l'effet voulu.
 */
describe("chiffres clés", () => {
  const sansEstimation: Partial<RequiredValues> = {
    lm_stat_years: "",
    lm_stat_clients: "",
    lm_stat_installations: "",
  };

  it("un chiffre officiel suffit quand l'estimation est vide", () => {
    expect(
      missing({
        ...sansEstimation,
        lm_stat_years_official: "20",
        lm_stat_clients_official: "900",
        lm_stat_installations_official: "1500",
      }),
    ).toEqual([]);
  });

  it("réclame encore ce qui n'est ni estimé ni confirmé", () => {
    expect(
      missing({
        ...sansEstimation,
        lm_stat_years_official: "20",
        lm_stat_clients_official: "900",
      }),
    ).toEqual(["Installations"]);
  });

  it("traite « 0 », « - » et « — » comme vides", () => {
    for (const value of ["0", "-", "—", " "]) {
      expect(filledStat(value)).toBe(false);
      expect(missing({ lm_stat_years: value, lm_stat_years_official: value })).toEqual([
        "Années d'expérience",
      ]);
    }
  });

  it("ne réclame pas les qualifications RGE", () => {
    const labels = SITE_REQUIRED_WITH_PROJECT.map((r) => r.label);
    expect(labels.some((l) => /RGE/i.test(l))).toBe(false);
  });
});

/**
 * Ville SEO, logo et chiffres clés vivent sur `lead_magnet_projects` : sans
 * dossier, ils n'ont nulle part où être enregistrés. Exiger la ville SEO ou les
 * chiffres clés rendrait donc la fiche définitivement invalidable ; le logo, lui,
 * ne s'exige plus nulle part — ce qui se vérifie ici, c'est qu'il ne se SAISIT
 * pas non plus tant qu'il n'a pas de dossier où atterrir.
 */
describe("sans dossier lead magnet", () => {
  it("n'exige que ce que porte l'entreprise", () => {
    expect(
      missing({ lm_override_city: "", lm_logo_url: "", lm_stat_years: "" }, false),
    ).toEqual([]);
    expect(SITE_REQUIRED.map((r) => r.field)).not.toContain("lm_logo_url");
  });
});

describe("missingFields", () => {
  it("rend les champs dans l'ordre des règles, pas dans celui de la saisie", () => {
    expect(missingFields(values({ ville: "", lm_override_city: "" }), true)).toEqual([
      "ville",
      "lm_override_city",
    ]);
  });

  it("ne remonte jamais un champ facultatif", () => {
    // C'est ce décompte qui commande le bandeau « n manquants » et le bloc « À
    // compléter » remonté en tête de fiche : un facultatif qui s'y glisserait
    // enverrait l'agent chercher un logo qui n'existe pas.
    expect(missingFields(values({ lm_logo_url: "" }), true)).toEqual([]);
  });
});

describe("toArr", () => {
  it("ignore les blancs et les séparateurs vides", () => {
    expect(toArr(" plomberie ,, chauffage , ")).toEqual(["plomberie", "chauffage"]);
  });
});
