import { missingForSite } from "../_board";

/**
 * Ce que le board considère comme « prêt pour créer le site ». La règle tenue
 * ici : tout ce que la page AFFICHE est obligatoire — logo et chiffres clés
 * compris — sinon la démo sort avec des blocs vides.
 *
 * Doit rester aligné sur `SITE_REQUIRED` dans MarketingWebPipeline.tsx.
 */

type Ent = Parameters<typeof missingForSite>[0];
type Proj = Parameters<typeof missingForSite>[1];

const ent = (over: Partial<NonNullable<Ent>> = {}): Ent =>
  ({
    id: 1,
    name: "Plomberie Durand",
    canonical_url: null,
    site_web_canonique: null,
    logo_url: "https://cdn/logo.png",
    ville: "Annecy",
    code_postal: "74000",
    telephone: "0450000000",
    service_tags: ["plomberie"],
    note_moyenne: 4.8,
    nombre_avis: 120,
    owner_id: null,
    ...over,
  }) as Ent;

const project = (over: Partial<NonNullable<Proj>> = {}): Proj =>
  ({
    id: "p1",
    opportunite_id: "o1",
    entreprise_id: 1,
    statut: "framer",
    pret_pour_lm: true,
    override_city: "Annecy",
    logo_url: "https://cdn/logo.png",
    stat_years_experience: "15",
    stat_satisfied_clients: "800",
    stat_installations_completed: "1200",
    stat_rge_count: "3",
    ...over,
  }) as Proj;

describe("missingForSite", () => {
  it("ne réclame rien quand la fiche est complète", () => {
    expect(missingForSite(ent(), project())).toEqual([]);
  });

  it("exige le logo — le site l'affiche en en-tête", () => {
    expect(missingForSite(ent({ logo_url: null }), project({ logo_url: null }))).toEqual(["Logo"]);
  });

  it("accepte le logo de l'entreprise quand le projet n'en a pas", () => {
    expect(missingForSite(ent({ logo_url: "https://cdn/l.png" }), project({ logo_url: null }))).toEqual([]);
  });

  it("exige les quatre chiffres clés", () => {
    expect(
      missingForSite(
        ent(),
        project({
          stat_years_experience: "",
          stat_satisfied_clients: null,
          stat_installations_completed: "0",
          stat_rge_count: "—",
        }),
      ),
    ).toEqual([
      "Années d'expérience",
      "Clients satisfaits",
      "Installations",
      "Qualifications (RGE)",
    ]);
  });

  it("traite « 0 » comme vide : le bloc chiffres clés ne l'affiche pas", () => {
    expect(missingForSite(ent(), project({ stat_satisfied_clients: "0" }))).toEqual(["Clients satisfaits"]);
  });

  it("n'exige ni ville SEO ni stats tant qu'il n'y a pas de projet lead magnet", () => {
    // Ces champs vivent sur `lead_magnet_projects` : sans projet, ils n'ont
    // nulle part où être saisis, la fiche serait impossible à compléter.
    expect(missingForSite(ent(), null)).toEqual([]);
  });

  it("continue de réclamer l'identité et les avis", () => {
    expect(
      missingForSite(ent({ ville: null, telephone: "", note_moyenne: 0, service_tags: [] }), project()),
    ).toEqual(["Ville", "Téléphone", "Service tags", "Note moyenne"]);
  });
});
