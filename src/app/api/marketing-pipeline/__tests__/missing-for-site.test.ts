import { SITE_REQUIRED_WITH_PROJECT } from "@/components/marketing-pipeline/required-fields";
import { missingForSite } from "../_board";

/**
 * Ce que le board considère comme « prêt pour créer le site ». La règle tenue
 * ici : tout ce que la page AFFICHE est obligatoire — logo et chiffres clés
 * compris — sinon la démo sort avec des blocs vides.
 *
 * Avec une limite que la première version ignorait : une exigence doit être
 * SATISFIABLE. Réclamer les avis Google d'une entreprise qui n'a pas de fiche
 * Google (1210 sur 2797) ou zéro avis (217) laissait sa fiche définitivement
 * incomplète, sans autre issue que d'inventer une note.
 *
 * Doit rester aligné sur `SITE_REQUIRED` (`components/marketing-pipeline/
 * required-fields.ts`) — le dernier test de ce fichier compare les deux listes
 * au lieu de s'en remettre à ce commentaire.
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

/** Projet dont AUCUNE estimation n'est remplie — seul l'officiel peut le sauver. */
const projectSansEstimation = (over: Partial<NonNullable<Proj>> = {}): Proj =>
  project({
    stat_years_experience: "",
    stat_satisfied_clients: "",
    stat_installations_completed: "",
    ...over,
  });

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

  it("exige les trois chiffres clés obligatoires", () => {
    expect(
      missingForSite(
        ent(),
        project({
          stat_years_experience: "",
          stat_satisfied_clients: null,
          stat_installations_completed: "0",
        }),
      ),
    ).toEqual(["Années d'expérience", "Clients satisfaits", "Installations"]);
  });

  it("n'exige pas les qualifications RGE — toutes les entreprises n'en ont pas", () => {
    // Vide, « 0 » ou « — » : dans les trois cas la fiche reste complète, le bloc
    // « chiffres clés » se contente alors de trois colonnes.
    for (const value of ["", "0", "—", null]) {
      expect(missingForSite(ent(), project({ stat_rge_count: value }))).toEqual([]);
    }
  });

  it("traite « 0 » comme vide : le bloc chiffres clés ne l'affiche pas", () => {
    expect(missingForSite(ent(), project({ stat_satisfied_clients: "0" }))).toEqual(["Clients satisfaits"]);
  });

  it("n'exige ni ville SEO ni stats tant qu'il n'y a pas de projet lead magnet", () => {
    // Ces champs vivent sur `lead_magnet_projects` : sans projet, ils n'ont
    // nulle part où être saisis, la fiche serait impossible à compléter.
    expect(missingForSite(ent(), null)).toEqual([]);
  });

  it("continue de réclamer l'identité", () => {
    expect(
      missingForSite(ent({ ville: null, telephone: "", note_moyenne: 0, service_tags: [] }), project()),
    ).toEqual(["Ville", "Téléphone", "Service tags", "Note moyenne"]);
  });
});

/**
 * Les avis Google ne sont pas saisissables partout : sans fiche Google, il n'y a
 * ni note ni compte à fournir. L'exigence porte donc sur leur COHÉRENCE, pas sur
 * leur présence.
 */
describe("missingForSite — avis Google facultatifs", () => {
  it("n'exige jamais le nombre d'avis", () => {
    for (const nombre_avis of [0, null, undefined]) {
      const miss = missingForSite(ent({ nombre_avis, note_moyenne: null }), project());
      expect(miss).not.toContain("Nombre d'avis");
    }
  });

  it("laisse la fiche complète sans aucun avis ni note", () => {
    expect(missingForSite(ent({ nombre_avis: 0, note_moyenne: null }), project())).toEqual([]);
    expect(missingForSite(ent({ nombre_avis: null, note_moyenne: 0 }), project())).toEqual([]);
  });

  it("exige la note dès qu'il y a des avis à noter", () => {
    expect(missingForSite(ent({ nombre_avis: 120, note_moyenne: null }), project())).toEqual([
      "Note moyenne",
    ]);
    expect(missingForSite(ent({ nombre_avis: 120, note_moyenne: 0 }), project())).toEqual([
      "Note moyenne",
    ]);
  });

  it("accepte une note sans avis — la donnée existe en base, elle ne bloque pas", () => {
    // 25 fiches sont dans cet état : note relevée sur Google, compte non capturé
    // par le scraping. Ce n'est pas à la validation de la fiche de le corriger.
    expect(missingForSite(ent({ nombre_avis: 0, note_moyenne: 4.8 }), project())).toEqual([]);
  });

  it("reste complète quand les avis sont là et cohérents", () => {
    expect(missingForSite(ent({ nombre_avis: 120, note_moyenne: 4.8 }), project())).toEqual([]);
  });
});

/**
 * Garde-fou anti-dérive. Les exigences existent en DEUX exemplaires — cette
 * fonction côté API, `SITE_REQUIRED_WITH_PROJECT` côté écran — et les deux
 * commentaires se contentaient de demander qu'elles restent alignées. Elles ne
 * l'étaient plus dès qu'on touchait à l'une : l'écran a réclamé « Nombre
 * d'avis » que l'API n'exigeait plus, ou l'inverse, et la fiche affichait un
 * astérisque sur un champ que rien ne bloquait.
 *
 * La liste de l'écran est IMPORTÉE, plus recopiée : tant qu'elle vivait dans un
 * composant `"use client"`, ce test ne pouvait que la retranscrire à la main —
 * c'est-à-dire ajouter une troisième liste à tenir alignée.
 */
describe("alignement avec les règles de l'écran", () => {
  /** Tous les libellés que `missingForSite` peut produire, sondés champ par champ. */
  const labelsFromApi = (): Set<string> => {
    const found = new Set<string>();
    const blanks: Array<Partial<NonNullable<Ent>>> = [
      { name: "" },
      { ville: null },
      { code_postal: null },
      { telephone: "" },
      { service_tags: [] },
      { note_moyenne: null, nombre_avis: 120 },
      { logo_url: null },
    ];
    for (const over of blanks) {
      for (const l of missingForSite(ent(over), project({ logo_url: null }))) found.add(l);
    }
    for (const over of [
      { override_city: "" },
      { stat_years_experience: "" },
      { stat_satisfied_clients: "" },
      { stat_installations_completed: "" },
    ] as Array<Partial<NonNullable<Proj>>>) {
      for (const l of missingForSite(ent(), project(over))) found.add(l);
    }
    return found;
  };

  it("produit exactement les libellés de l'écran", () => {
    // Lus sur les règles de l'écran elles-mêmes. Toute divergence doit casser
    // ici, pas en production.
    const ecran = new Set(SITE_REQUIRED_WITH_PROJECT.map((r) => r.label));
    expect([...labelsFromApi()].sort()).toEqual([...ecran].sort());
  });

  it("ne réclame plus « Nombre d'avis » nulle part", () => {
    expect(labelsFromApi().has("Nombre d'avis")).toBe(false);
  });
});

/**
 * Les chiffres confirmés par le client (migration 20260805) sont prioritaires à
 * l'affichage et jamais écrits par l'enrichissement. Ils doivent donc satisfaire
 * l'exigence exactement comme une estimation : sans ce « ou », remplacer une
 * estimation par un vrai chiffre aurait rendu la fiche incomplète — l'inverse de
 * l'effet voulu.
 */
describe("missingForSite — chiffres officiels", () => {
  it("un chiffre officiel suffit quand l'estimation est vide", () => {
    expect(
      missingForSite(
        ent(),
        projectSansEstimation({
          stat_years_experience_official: "20",
          stat_satisfied_clients_official: "900",
          stat_installations_completed_official: "1500",
        }),
      ),
    ).toEqual([]);
  });

  it("réclame encore ce qui n'est ni estimé ni confirmé", () => {
    expect(
      missingForSite(
        ent(),
        projectSansEstimation({
          stat_years_experience_official: "20",
          stat_satisfied_clients_official: "900",
        }),
      ),
    ).toEqual(["Installations"]);
  });

  it("l'estimation seule reste suffisante — rien ne devient obligatoire", () => {
    expect(missingForSite(ent(), project())).toEqual([]);
  });

  it("traite « 0 » et « — » officiels comme vides, comme les estimations", () => {
    for (const value of ["0", "—", "", null]) {
      expect(
        missingForSite(
          ent(),
          projectSansEstimation({
            stat_years_experience_official: value,
            stat_satisfied_clients_official: "900",
            stat_installations_completed_official: "1500",
          }),
        ),
      ).toEqual(["Années d'expérience"]);
    }
  });

  it("les qualifications RGE officielles ne sont pas davantage requises", () => {
    expect(missingForSite(ent(), project({ stat_rge_count: "", stat_rge_count_official: "" }))).toEqual(
      [],
    );
  });
});
