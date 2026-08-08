/**
 * Les pièges des API publiques, verrouillés par des tests.
 *
 * Chaque cas ici vient d'une réponse RÉELLE observée sur les API, pas d'une
 * hypothèse. Ce sont les erreurs qui ne lèvent aucune exception et qu'on ne
 * découvre qu'en voyant « CA : 0 € » sur la démo d'un client.
 */

import { parseFinances, parseUniteLegale, etablissementsCandidats } from "../recherche-entreprises";
import { parseLine, estValide } from "../ademe-rge";
import { trancheEffectifLabel, trancheEffectif } from "../effectif";
import { isValidSiret, isValidSiren, normalizeSiret, normalizeSiren } from "../siret";
import { similariteNom, variantesDeRecherche, scoreCandidat, classer } from "../score";

// ---------------------------------------------------------------------------
// Finances : le piège le plus coûteux
// ---------------------------------------------------------------------------
describe("parseFinances", () => {
  it("convertit ca:0 en null — 0 signifie « non publié », pas « zéro »", () => {
    // Cas réel : COTTAZ SARL, exercice 2024.
    const r = parseFinances({ "2024": { ca: 0, resultat_net: 140998 } });
    expect(r.chiffreAffaires).toBeNull();
    expect(r.resultatNet).toBe(140998);
    expect(r.exerciceAnnee).toBe(2024);
  });

  it("conserve un résultat net NÉGATIF — c'est une vraie valeur signée", () => {
    // Cas réel : 2AMR CONSEILS, exercice 2024.
    const r = parseFinances({ "2024": { ca: 0, resultat_net: -59769 } });
    expect(r.resultatNet).toBe(-59769);
    expect(r.chiffreAffaires).toBeNull();
  });

  it("conserve un résultat net à 0 — contrairement au CA, ce n'est pas un code", () => {
    const r = parseFinances({ "2024": { ca: 1000, resultat_net: 0 } });
    expect(r.resultatNet).toBe(0);
    expect(r.chiffreAffaires).toBe(1000);
  });

  it("garde un CA réel", () => {
    // Cas réel : SOLVAC, exercice 2022.
    const r = parseFinances({ "2022": { ca: 9611495, resultat_net: 652979 } });
    expect(r.chiffreAffaires).toBe(9611495);
  });

  it("retient l'exercice le plus récent et garde l'historique", () => {
    const r = parseFinances({
      "2022": { ca: 100, resultat_net: 10 },
      "2024": { ca: 300, resultat_net: 30 },
      "2023": { ca: 200, resultat_net: 20 },
    });
    expect(r.exerciceAnnee).toBe(2024);
    expect(r.chiffreAffaires).toBe(300);
    expect(Object.keys(r.financesHistorique).sort()).toEqual(["2022", "2023", "2024"]);
    // Le mapping du 0 vaut aussi dans l'historique, pas seulement sur le dernier.
    expect(parseFinances({ "2020": { ca: 0, resultat_net: 5 } }).financesHistorique["2020"].ca).toBeNull();
  });

  it("supporte l'absence totale de finances (63 % des fiches)", () => {
    expect(parseFinances(null).exerciceAnnee).toBeNull();
    expect(parseFinances(undefined).chiffreAffaires).toBeNull();
    expect(parseFinances({}).resultatNet).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Identité
// ---------------------------------------------------------------------------
describe("parseUniteLegale", () => {
  // Extrait fidèle de la réponse réelle pour ECLEIS (35137835100040).
  const ECLEIS = {
    siren: "351378351",
    nom_complet: "ECLEIS",
    nom_raison_sociale: "ECLEIS",
    date_creation: "1989-07-01",
    etat_administratif: "A",
    activite_principale: "43.22B",
    activite_principale_naf25: "43.22H",
    categorie_entreprise: "PME",
    tranche_effectif_salarie: "NN",
    siege: {
      siret: "35137835100040",
      date_creation: "2020-10-15",
      code_postal: "31600",
      libelle_commune: "MURET",
      adresse: "18 RUE LATECOERE 31600 MURET",
      caractere_employeur: "N",
      liste_idcc: ["1596"],
      est_siege: true,
    },
    finances: { "2023": { ca: 258663, resultat_net: 33670 } },
    complements: { est_rge: false },
    tva: ["FR78351378351"],
  };

  it("distingue la création de l'UNITÉ LÉGALE de celle de l'établissement", () => {
    const r = parseUniteLegale(ECLEIS)!;
    // 1989 fait l'ancienneté commerciale ; 2020 n'est que l'ouverture du siège.
    expect(r.dateCreation).toBe("1989-07-01");
    expect(r.dateCreationEtablissement).toBe("2020-10-15");
  });

  it("garde la tranche d'effectif comme CODE, jamais comme nombre", () => {
    const r = parseUniteLegale({ ...ECLEIS, tranche_effectif_salarie: "12" })!;
    expect(r.trancheEffectifCode).toBe("12");
    expect(typeof r.trancheEffectifCode).toBe("string");
  });

  it("ne retient est_rge que comme indicatif", () => {
    expect(parseUniteLegale(ECLEIS)!.estRgeIndicatif).toBe(false);
  });

  it("extrait le SIRET du siège et la TVA", () => {
    const r = parseUniteLegale(ECLEIS)!;
    expect(r.siret).toBe("35137835100040");
    expect(r.tvaIntracommunautaire).toBe("FR78351378351");
    expect(r.idcc).toEqual(["1596"]);
  });
});

describe("etablissementsCandidats", () => {
  // Cas réel : la fiche « CLIMIZ » à Paris 75011 est TOP CLIMATISATION, dont le
  // siège est à Paris 75017.
  const TOP_CLIM = {
    siren: "888295102",
    nom_complet: "TOP CLIMATISATION",
    nom_raison_sociale: "TOP CLIMATISATION",
    etat_administratif: "A",
    activite_principale: "43.22B",
    siege: { siret: "88829510200030", code_postal: "75017", libelle_commune: "PARIS", est_siege: true },
    matching_etablissements: [
      {
        siret: "88829510200014",
        code_postal: "75011",
        libelle_commune: "PARIS",
        adresse: "109 BOULEVARD RICHARD LENOIR 75011 PARIS",
        est_siege: false,
      },
    ],
  };

  it("propose l'établissement qui a matché, pas le siège", () => {
    const cands = etablissementsCandidats(TOP_CLIM);
    expect(cands).toHaveLength(1);
    expect(cands[0].siret).toBe("88829510200014");
    expect(cands[0].codePostal).toBe("75011");
    expect(cands[0].estSiege).toBe(false);
  });

  it("retombe sur le siège quand aucun établissement n'a matché", () => {
    const cands = etablissementsCandidats({ ...TOP_CLIM, matching_etablissements: [] });
    expect(cands[0].siret).toBe("88829510200030");
    expect(cands[0].estSiege).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Effectif : un code, pas un nombre
// ---------------------------------------------------------------------------
describe("trancheEffectif", () => {
  it("traduit le code en fourchette et jamais en entier", () => {
    expect(trancheEffectifLabel("12")).toBe("20 à 49 salariés");
    expect(trancheEffectifLabel("01")).toBe("1 à 2 salariés");
    expect(trancheEffectif("12")!.min).toBe(20);
    expect(trancheEffectif("12")!.max).toBe(49);
  });

  it("rend null pour NN et pour l'absence, sans fabriquer de texte", () => {
    expect(trancheEffectifLabel("NN")).toBeNull();
    expect(trancheEffectifLabel(null)).toBeNull();
    expect(trancheEffectifLabel("")).toBeNull();
    expect(trancheEffectifLabel("zz")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SIRET / SIREN
// ---------------------------------------------------------------------------
describe("siret", () => {
  it("valide des SIRET et SIREN réels", () => {
    expect(isValidSiret("35137835100040")).toBe(true); // ECLEIS
    expect(isValidSiret("74989284000028")).toBe(true); // CHALEUR ET CONFORT
    expect(isValidSiren("351378351")).toBe(true);
  });

  it("rejette une clé de contrôle fausse", () => {
    expect(isValidSiret("35137835100041")).toBe(false);
    expect(isValidSiren("351378352")).toBe(false);
  });

  it("ne fabrique JAMAIS un SIRET à partir d'un SIREN", () => {
    // Le numéro d'établissement n'est pas devinable : le siège n'est pas
    // toujours 00001. Compléter par des zéros interrogerait un établissement
    // qui n'existe pas.
    expect(normalizeSiret("351378351")).toBeNull();
    expect(normalizeSiret("35137835100000")).toBeNull();
  });

  it("accepte les séparateurs d'une saisie humaine", () => {
    expect(normalizeSiret("351 378 351 00040")).toBe("35137835100040");
    expect(normalizeSiren("351.378.351")).toBe("351378351");
  });

  it("déduit le SIREN d'un SIRET", () => {
    expect(normalizeSiren("35137835100040")).toBe("351378351");
  });
});

// ---------------------------------------------------------------------------
// ADEME
// ---------------------------------------------------------------------------
describe("ademe parseLine", () => {
  // Ligne réelle de CHALEUR ET CONFORT.
  const LIGNE = {
    siret: "74989284000028",
    code_qualification: "43",
    nom_certificat: "QualiPAC module Chauffage et ECS",
    nom_qualification: "QualiPAC Chauffage - Pose de chauffe-eau thermodynamique (43)",
    organisme: "qualitenr",
    domaine: "Chauffe-Eau Thermodynamique",
    meta_domaine: "Installations d'énergies renouvelables",
    particulier: true,
    url_qualification: "https://www.qualypso.fr/download_file.php?id=1a5c9ffd",
    lien_date_debut: "2023-05-09",
    lien_date_fin: "2027-05-09",
    email: "adm.chaleuretconfort@gmail.com",
  };

  it("lit les dates de validité, qui sont l'accroche d'appel", () => {
    const q = parseLine(LIGNE)!;
    expect(q.dateDebut).toBe("2023-05-09");
    expect(q.dateFin).toBe("2027-05-09");
    expect(q.nomCertificat).toBe("QualiPAC module Chauffage et ECS");
  });

  it("écarte une ligne sans clé naturelle plutôt que de créer un doublon", () => {
    expect(parseLine({ ...LIGNE, code_qualification: undefined })).toBeNull();
    expect(parseLine({ ...LIGNE, siret: undefined })).toBeNull();
  });

  it("juge la validité par rapport à une date", () => {
    expect(estValide({ dateFin: "2027-05-09" }, new Date("2026-08-08"))).toBe(true);
    expect(estValide({ dateFin: "2026-05-09" }, new Date("2026-08-08"))).toBe(false);
    // Sans date de fin, on ne déclare pas une qualification expirée.
    expect(estValide({ dateFin: null }, new Date("2026-08-08"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Résolution d'identité
// ---------------------------------------------------------------------------
describe("variantesDeRecherche", () => {
  it("isole la raison sociale d'un titre Google Maps", () => {
    const v = variantesDeRecherche(
      "Eco Solutions 44 - Climatisation & Pompe à chaleur Nantes",
      "Saint-Herblain",
    );
    // La requête complète rend 0 résultat sur l'API : il FAUT une variante courte.
    expect(v[0]).toBe("Eco Solutions 44 - Climatisation & Pompe à chaleur Nantes");
    expect(v).toContain("Eco Solutions 44");
  });

  it("retire les mots de service qui ne sont pas dans la raison sociale", () => {
    const v = variantesDeRecherche("Quali fluide - climatisation, chauffage et plomberie");
    expect(v).toContain("Quali fluide");
  });

  it("ne produit pas de doublons", () => {
    const v = variantesDeRecherche("CLIMIZ");
    expect(new Set(v).size).toBe(v.length);
  });
});

describe("similariteNom", () => {
  it("rapproche un nom contenu dans un titre plus long", () => {
    expect(
      similariteNom("Eco Solutions 44 - Climatisation & Pompe à chaleur Nantes", "ECO SOLUTIONS 44"),
    ).toBeGreaterThan(0.9);
  });

  it("ignore la forme juridique et les accents", () => {
    expect(similariteNom("Chaleur et Confort", "SARL CHALEUR ET CONFORT")).toBeGreaterThan(0.9);
  });

  it("ne rapproche PAS une enseigne d'une raison sociale sans rapport", () => {
    // Le cas qui interdit toute automatisation : CLIMIZ est immatriculée
    // TOP CLIMATISATION. Aucune mesure textuelle ne peut le deviner.
    expect(similariteNom("CLIMIZ", "TOP CLIMATISATION")).toBeLessThan(0.6);
  });
});

describe("scoreCandidat", () => {
  const base = {
    identite: {
      denomination: "TOP CLIMATISATION",
      nomComplet: "TOP CLIMATISATION",
      sigle: null,
      enseignes: [] as string[],
      nafCode: "43.22B",
      etatAdministratif: "A" as const,
      dateFermeture: null,
    },
    siret: "88829510200014",
    estSiege: false,
    adresse: "109 BOULEVARD RICHARD LENOIR 75011 PARIS",
    codePostal: "75011",
    ville: "PARIS",
    enseignes: [] as string[],
    etatAdministratif: "A",
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cand = base as any;

  it("récompense un code postal exact et une activité cohérente", () => {
    const r = scoreCandidat({ nom: "TOP CLIMATISATION", ville: "Paris", codePostal: "75011" }, cand);
    expect(r.detail.codePostal).toBe(25);
    expect(r.detail.activite).toBe(10);
    expect(r.score).toBeGreaterThan(90);
  });

  it("signale un département différent au lieu de l'enfouir", () => {
    const r = scoreCandidat({ nom: "TOP CLIMATISATION", codePostal: "31600" }, cand);
    expect(r.detail.codePostal).toBe(0);
    expect(r.detail.alertes.join(" ")).toMatch(/Département différent/);
  });

  it("n'élimine pas une entreprise cessée mais l'annonce", () => {
    // Une entreprise morte est peut-être LA bonne : c'est un renseignement
    // commercial, pas un candidat à cacher.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const morte = { ...cand, etatAdministratif: "C", identite: { ...cand.identite, etatAdministratif: "C", dateFermeture: "2026-05-27" } } as any;
    const r = scoreCandidat({ nom: "TOP CLIMATISATION", codePostal: "75011" }, morte);
    expect(r.detail.etat).toBe(0);
    expect(r.detail.alertes.join(" ")).toMatch(/CESSÉE le 2026-05-27/);
    expect(r.score).toBeGreaterThan(0);
  });

  it("dit à quoi le nom a été comparé", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avecEnseigne = { ...cand, enseignes: ["CLIMIZ"] } as any;
    const r = scoreCandidat({ nom: "CLIMIZ", codePostal: "75011" }, avecEnseigne);
    expect(r.detail.nomCompareA).toBe("enseigne : CLIMIZ");
  });

  it("classe par score décroissant et dédoublonne par SIRET", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autre = { ...cand, siret: "88829510200030", codePostal: "75017" } as any;
    const r = classer({ nom: "TOP CLIMATISATION", codePostal: "75011" }, [cand, autre, cand]);
    expect(r).toHaveLength(2);
    expect(r[0].candidat.siret).toBe("88829510200014");
    expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
  });
});
