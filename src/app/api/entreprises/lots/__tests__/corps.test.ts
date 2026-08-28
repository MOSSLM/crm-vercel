/**
 * @jest-environment node
 */

/**
 * Le corps que chaque écran envoie traverse-t-il la porte ?
 *
 * ── CE QUE CES TESTS EMPÊCHENT DE SE REPRODUIRE ──────────────────────────
 * L'explorateur postait `entreprise_ids` quand la route attend `entrepriseIds`.
 * Zod ne voyait aucun identifiant et rendait 400 « Required ». Rien n'était
 * cassé au sens habituel : la route répondait parfaitement, à une demande que
 * personne ne lui faisait. Deux lots existaient en base, tous deux venus du
 * pipeline marketing — le seul appelant qui écrivait la clé correctement.
 *
 * ── POURQUOI ON RECOPIE LE CORPS PLUTÔT QUE DE L'IMPORTER ────────────────
 * Un test qui appellerait `figerEnLot` demanderait de monter l'explorateur
 * entier, ses filtres et son référentiel, pour vérifier un nom de clé. On écrit
 * donc le corps À LA MAIN, tel qu'il part du navigateur — et c'est justement
 * cette recopie qui a de la valeur : elle échoue le jour où l'un des deux côtés
 * bouge sans l'autre.
 */

import { filtresVides, nettoyer } from "../../explorateur/_filtres";
import { filtresActifs } from "@/lib/entreprises/explorateur";
import type { FiltresExplorateur } from "@/lib/entreprises/explorateur";
import { PLAFOND_LOT, corpsCriteresSchema, corpsExplorateurSchema, corpsSchema } from "../_corps";

describe("figer un lot depuis une sélection", () => {
  it("accepte le corps que l'explorateur envoie", () => {
    // Recopié de `ExplorateurEntreprises.figerEnLot`.
    const lu = corpsSchema.safeParse({ nom: "WordPress abandonnés", entrepriseIds: [12, 34, 56] });
    expect(lu.success).toBe(true);
  });

  it("accepte le corps que le pipeline marketing envoie", () => {
    // Recopié de `MarketingWebPipeline`. Il portait déjà la bonne clé — c'est
    // pour ça que les seuls lots existants viennent de là.
    const lu = corpsSchema.safeParse({ nom: "Froides — démo à fabriquer", entrepriseIds: [1] });
    expect(lu.success).toBe(true);
  });

  it("refuse la clé en serpent, celle qui a fait le bug", () => {
    const lu = corpsSchema.safeParse({ nom: "Peu importe", entreprise_ids: [12, 34] });
    expect(lu.success).toBe(false);
  });

  it("refuse un lot sans nom, et un lot vide", () => {
    expect(corpsSchema.safeParse({ nom: "  ", entrepriseIds: [1] }).success).toBe(false);
    expect(corpsSchema.safeParse({ nom: "Vide", entrepriseIds: [] }).success).toBe(false);
  });

  it("refuse au-delà du plafond, qui n'est plus un lot de travail", () => {
    const trop = Array.from({ length: PLAFOND_LOT + 1 }, (_, i) => i + 1);
    expect(corpsSchema.safeParse({ nom: "Backfill", entrepriseIds: trop }).success).toBe(false);
  });
});

describe("figer un lot depuis des critères", () => {
  it("accepte le corps que l'atelier envoie", () => {
    // Recopié de `CreerLot`. Le total est REPOSTÉ : c'est lui que la fonction
    // SQL compare avant de créer quoi que ce soit.
    const lu = corpsCriteresSchema.safeParse({
      nom: "Sans site — août",
      criteres: { flags: ["vivantes", "sans_site"] },
      totalAttendu: 34633,
    });
    expect(lu.success).toBe(true);
  });

  it("exige le total attendu — c'est toute la garde de cette porte", () => {
    const lu = corpsCriteresSchema.safeParse({
      nom: "Sans site — août",
      criteres: { flags: ["sans_site"] },
    });
    expect(lu.success).toBe(false);
  });

  it("laisse passer le vocabulaire du pipeline marketing, que la route refuse ensuite", () => {
    // Accepté À LA LECTURE pour que la route puisse répondre « ces critères ne
    // se tranchent pas » plutôt que « corps invalide » — les deux refus
    // n'appellent pas le même geste.
    const lu = corpsCriteresSchema.safeParse({
      nom: "Depuis un segment",
      criteres: { services: ["couverture"], filtres: ["sans_site"] },
      totalAttendu: 120,
    });
    expect(lu.success).toBe(true);
  });

  it("se distingue de l'autre porte par son champ, pas par un drapeau de mode", () => {
    // La route choisit la porte sur la présence de `criteres`. Un corps qui
    // porterait les deux serait ambigu : les schémas doivent donc rester
    // mutuellement exclusifs de fait.
    const parIds = { nom: "x", entrepriseIds: [1] };
    const parCriteres = { nom: "x", criteres: { flags: ["sans_site"] }, totalAttendu: 1 };
    expect(corpsCriteresSchema.safeParse(parIds).success).toBe(false);
    expect(corpsSchema.safeParse(parCriteres).success).toBe(false);
  });
});

describe("figer un lot depuis les filtres de l'explorateur", () => {
  it("accepte le corps que l'explorateur envoie sans rien de coché", () => {
    // Recopié de `ExplorateurEntreprises.figerEnLot`, porte « ce résultat ».
    const lu = corpsExplorateurSchema.safeParse({
      nom: "WordPress abandonnés — Gironde",
      filtres: { masquees: "exclure", archivees: "exclure", departements: ["33"], technologies: ["wordpress"] },
      totalAttendu: 412,
    });
    expect(lu.success).toBe(true);
  });

  it("exige le total attendu — sans lui, la garde n'existe plus", () => {
    const lu = corpsExplorateurSchema.safeParse({
      nom: "x",
      filtres: { departements: ["33"] },
    });
    expect(lu.success).toBe(false);
  });

  it("refuse un filtre que l'explorateur ne connaît pas", () => {
    // `.strict()` : un filtre inconnu passerait sinon en critère muet, et le
    // lot serait plus large que son nom ne le promet.
    const lu = corpsExplorateurSchema.safeParse({
      nom: "x",
      filtres: { chiffre_daffaires_mini: 100 },
      totalAttendu: 1,
    });
    expect(lu.success).toBe(false);
  });

  it("ne se confond pas avec les deux autres portes", () => {
    // La route lit la clé À LA RACINE. Un corps « critères » porte lui aussi un
    // `filtres`, mais imbriqué — il ne doit pas prendre cette porte-ci.
    const parCriteres = {
      nom: "x",
      criteres: { flags: ["sans_site"], filtres: ["quelque_chose"] },
      totalAttendu: 1,
    };
    expect(Object.keys(parCriteres)).not.toContain("filtres");
    expect(corpsExplorateurSchema.safeParse(parCriteres).success).toBe(false);
  });
});

describe("« ce jeu de filtres désigne-t-il quelque chose ? »", () => {
  /**
   * LA COUTURE QUI COMPTE. L'écran décide s'il ACTIVE le bouton avec
   * `filtresActifs` ; la route décide si elle ACCEPTE avec `filtresVides`. Si
   * les deux comptaient autrement, l'écran proposerait un geste que la route
   * refuse — ou pire, l'inverse.
   */
  const cas: { quoi: string; filtres: FiltresExplorateur }[] = [
    { quoi: "rien du tout", filtres: {} },
    { quoi: "les deux périmètres au défaut", filtres: { masquees: "exclure", archivees: "exclure" } },
    { quoi: "un département", filtres: { masquees: "exclure", archivees: "exclure", departements: ["33"] } },
    { quoi: "les archivées seulement", filtres: { masquees: "exclure", archivees: "seulement" } },
    { quoi: "les masquées incluses", filtres: { masquees: "inclure", archivees: "exclure" } },
    { quoi: "une recherche", filtres: { masquees: "exclure", archivees: "exclure", q: "toiture" } },
    { quoi: "un tableau vide, qui ne filtre rien", filtres: { masquees: "exclure", archivees: "exclure", villes: [] } },
  ];

  it.each(cas)("dit la même chose des deux côtés : $quoi", ({ filtres }) => {
    const cote_ecran = filtresActifs(filtres) === 0;
    const cote_route = filtresVides(nettoyer(filtres as Record<string, unknown>));
    expect(cote_route).toBe(cote_ecran);
  });

  it("« archivées seulement » est un vrai critère, pas un défaut", () => {
    // Un lot d'archivées est une demande légitime : le compter comme « aucun
    // filtre » le refuserait pour la mauvaise raison.
    expect(filtresVides(nettoyer({ masquees: "exclure", archivees: "seulement" }))).toBe(false);
  });
});
