/**
 * Les trois exigences de conception, éprouvées sur les fiches RÉELLES du parc.
 *
 *   1. l'absence de donnée est la norme — aucune fonction ne doit fabriquer de
 *      contenu pour un champ vide ;
 *   2. le risque doit sauter aux yeux ;
 *   3. ce qui ouvre une conversation doit remonter.
 */

import {
  accrochesDAppel,
  ancienneteAnnees,
  classerDirigeants,
  estAProscrire,
  evaluerRisques,
  faitsEntreprise,
  finances,
  nomAuRegistre,
  type DossierEntreprise,
} from "../fiche";
import { trancheEffectifLabel } from "../effectif";

const LE_8_AOUT = new Date("2026-08-08T12:00:00Z");

const dossier = (p: Partial<DossierEntreprise> = {}): DossierEntreprise => ({
  entreprise_id: 1,
  nom_crm: "Test",
  siret: "35137835100040",
  denomination: "TEST",
  enseignes: [],
  date_creation: null,
  date_fermeture: null,
  etat_administratif: "A",
  naf_code: null,
  categorie_entreprise: null,
  tranche_effectif_code: null,
  tranche_effectif_annee: null,
  chiffre_affaires: null,
  resultat_net: null,
  exercice_annee: null,
  dirigeants: [],
  qualifications: [],
  identite_rafraichie_le: null,
  rge_rafraichi_le: null,
  ...p,
});

const qualif = (p: Partial<DossierEntreprise["qualifications"][number]> = {}) => ({
  id: "q1",
  code_qualification: "43",
  nom_certificat: "QualiPAC module Chauffage et ECS",
  domaine: "Pompe à chaleur : chauffage",
  meta_domaine: null,
  date_debut: "2023-05-09",
  date_fin: "2027-05-09",
  url_qualification: null,
  ...p,
});

// ---------------------------------------------------------------------------
// Exigence 2 : le risque saute aux yeux
// ---------------------------------------------------------------------------
describe("evaluerRisques", () => {
  it("marque comme bloquante une entreprise cessée — cas réel de la fiche 1494", () => {
    // « EMC Sarl » au CRM, EDDIA NOUVELLE AQUITAINE au registre, cessée.
    const d = dossier({
      nom_crm: "EMC Sarl",
      denomination: "EDDIA NOUVELLE AQUITAINE",
      etat_administratif: "C",
      date_fermeture: "2026-05-27",
    });
    const r = evaluerRisques(d);
    expect(r[0].niveau).toBe("bloquant");
    expect(r[0].titre).toBe("Entreprise cessée");
    expect(r[0].detail).toBe("Fermée le 27/05/2026");
    expect(estAProscrire(d)).toBe(true);
  });

  it("repère une liquidation même quand l'état administratif est encore actif", () => {
    // La radiation suit la liquidation de plusieurs mois : se fier au seul
    // `etat_administratif` laisserait démarcher une entreprise morte.
    const d = dossier({
      etat_administratif: "A",
      dirigeants: [{ nom: "MARTIN", prenoms: "PAUL", qualite: "Liquidateur" }],
    });
    expect(estAProscrire(d)).toBe(true);
    expect(evaluerRisques(d)[0].titre).toBe("Procédure collective");
  });

  it("signale un résultat négatif sans interdire l'appel — cas réel 2AMR Conseils", () => {
    const d = dossier({ resultat_net: -59769, exercice_annee: 2024 });
    const r = evaluerRisques(d);
    expect(r[0].niveau).toBe("avertissement");
    expect(r[0].detail).toContain("59");
    // Un mauvais exercice n'est pas une mort : la fiche reste prospectable.
    expect(estAProscrire(d)).toBe(false);
  });

  it("ne signale rien sur une entreprise saine", () => {
    expect(evaluerRisques(dossier({ resultat_net: 652979 }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Exigence 3 : ce qui ouvre une conversation remonte
// ---------------------------------------------------------------------------
describe("accrochesDAppel", () => {
  it("remonte une échéance RGE proche — cas réel Chaleur et Confort", () => {
    // Trois qualifications au 25/08/2026, soit 17 jours après le 8 août.
    const d = dossier({
      qualifications: [
        qualif({ id: "a", nom_certificat: "Qualisol Combi", date_fin: "2026-08-25" }),
        qualif({ id: "b", nom_certificat: "Qualibois Eau", date_fin: "2026-08-25" }),
        qualif({ id: "c", nom_certificat: "Qualibois Eau", date_fin: "2026-08-25" }),
      ],
    });
    const a = accrochesDAppel(d, LE_8_AOUT);
    expect(a[0].intensite).toBe("chaude");
    // Regroupées par échéance : une accroche, pas trois lignes qui se répètent.
    expect(a).toHaveLength(1);
    expect(a[0].titre).toBe("3 qualifications expirent dans 17 jours");
    expect(a[0].detail).toContain("25/08/2026");
  });

  it("nomme la qualification quand il n'y en a qu'une", () => {
    const d = dossier({
      qualifications: [qualif({ nom_certificat: "QUALIBAT-RGE", date_fin: "2026-09-15" })],
    });
    expect(accrochesDAppel(d, LE_8_AOUT)[0].titre).toBe("QUALIBAT-RGE expire dans 38 jours");
  });

  it("ignore une échéance lointaine", () => {
    const d = dossier({ qualifications: [qualif({ date_fin: "2027-05-09" })] });
    expect(accrochesDAppel(d, LE_8_AOUT)).toEqual([]);
  });

  it("remonte les qualifications déjà expirées, qui sont aussi un motif d'appel", () => {
    const d = dossier({
      qualifications: [qualif({ nom_certificat: "Qualibois Air", date_fin: "2026-01-10" })],
    });
    const a = accrochesDAppel(d, LE_8_AOUT);
    expect(a[0].titre).toBe("1 qualification expirée");
    expect(a[0].intensite).toBe("chaude");
  });

  it("repère un anniversaire rond et une entreprise toute jeune", () => {
    expect(
      accrochesDAppel(dossier({ date_creation: "1996-03-01" }), LE_8_AOUT)[0].titre,
    ).toBe("30 ans d'existence cette année");
    expect(
      accrochesDAppel(dossier({ date_creation: "2026-02-01" }), LE_8_AOUT)[0].titre,
    ).toBe("Créée cette année");
  });

  it("ne fabrique aucune accroche quand il n'y a rien à dire", () => {
    expect(accrochesDAppel(dossier({ date_creation: "2015-06-01" }), LE_8_AOUT)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// À qui parler
// ---------------------------------------------------------------------------
describe("classerDirigeants", () => {
  it("range les commissaires aux comptes APRÈS les décideurs", () => {
    // Appeler l'auditeur externe est un appel perdu ; il y en a 3 dans le parc.
    const r = classerDirigeants(
      [
        { nom: "DUPONT", prenoms: "JEAN", qualite: "Commissaire aux comptes titulaire" },
        { nom: "MARTIN", prenoms: "SOPHIE", qualite: "Gérant" },
      ],
      LE_8_AOUT,
    );
    expect(r[0].nomComplet).toBe("Sophie Martin");
    expect(r[0].estDecideur).toBe(true);
    expect(r[1].estDecideur).toBe(false);
  });

  it("garde le nom légal et recapitalise — cas réel « CREPEAU (ACQUART) »", () => {
    const r = classerDirigeants(
      [{ nom: "CREPEAU (ACQUART)", prenoms: "CELINE", qualite: "Gérant", annee_de_naissance: "1981" }],
      LE_8_AOUT,
    );
    expect(r[0].nomComplet).toBe("Celine Crepeau");
    expect(r[0].age).toBe(45);
  });

  it("gère les noms composés et les particules", () => {
    const r = classerDirigeants([{ nom: "DE PONNAT", prenoms: "JEAN-LIONEL" }], LE_8_AOUT);
    expect(r[0].nomComplet).toBe("Jean-Lionel De Ponnat");
  });

  it("écarte les personnes morales, qu'on ne peut pas appeler", () => {
    const r = classerDirigeants(
      [
        { nom: "HOLDING SAS", qualite: "Président", type_dirigeant: "personne morale" },
        { nom: "MARTIN", prenoms: "PAUL", qualite: "Gérant", type_dirigeant: "personne physique" },
      ],
      LE_8_AOUT,
    );
    expect(r).toHaveLength(1);
    expect(r[0].nomComplet).toBe("Paul Martin");
  });

  it("supporte l'absence de dirigeants", () => {
    expect(classerDirigeants(null)).toEqual([]);
    expect(classerDirigeants([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Exigence 1 : l'absence est la norme — aucune structure à trous
// ---------------------------------------------------------------------------
describe("faitsEntreprise", () => {
  it("ne rend QUE les faits connus", () => {
    // 47 % des fiches n'ont pas d'effectif, 88 % pas de CA : une fiche presque
    // vide doit produire une liste courte, pas une liste de tirets.
    const f = faitsEntreprise(dossier({ date_creation: "2015-06-01" }), trancheEffectifLabel, LE_8_AOUT);
    expect(f).toHaveLength(1);
    expect(f[0].libelle).toBe("Ancienneté");
    expect(f.every((x) => x.valeur !== "" && x.valeur !== "—")).toBe(true);
  });

  it("rend une liste vide plutôt qu'un gabarit quand on ne sait rien", () => {
    expect(faitsEntreprise(dossier(), trancheEffectifLabel, LE_8_AOUT)).toEqual([]);
  });

  it("traduit le code d'effectif en fourchette, jamais en nombre", () => {
    const f = faitsEntreprise(
      dossier({ tranche_effectif_code: "12", tranche_effectif_annee: "2023" }),
      trancheEffectifLabel,
      LE_8_AOUT,
    );
    expect(f[0].valeur).toBe("20 à 49 salariés");
  });

  it("omet l'effectif quand le code vaut NN", () => {
    const f = faitsEntreprise(dossier({ tranche_effectif_code: "NN" }), trancheEffectifLabel, LE_8_AOUT);
    expect(f.some((x) => x.libelle === "Effectif")).toBe(false);
  });
});

describe("finances", () => {
  it("disparaît entièrement quand ni CA ni résultat ne sont publiés", () => {
    // Le cas de 60 % des fiches : le bloc ne doit pas être rendu du tout.
    expect(finances(dossier())).toBeNull();
  });

  it("affiche le résultat seul, cas le plus fréquent", () => {
    // Les artisans déposent des comptes confidentiels : résultat oui, CA non.
    const f = finances(dossier({ chiffre_affaires: null, resultat_net: 140998, exercice_annee: 2024 }))!;
    expect(f.ca).toBeNull();
    expect(f.resultat).toContain("140");
    expect(f.exercice).toBe(2024);
  });

  it("affiche les deux quand les deux existent", () => {
    const f = finances(dossier({ chiffre_affaires: 9611495, resultat_net: 652979, exercice_annee: 2022 }))!;
    expect(f.ca).toContain("9");
    expect(f.resultat).toContain("652");
  });
});

describe("nomAuRegistre", () => {
  it("signale un nom au registre différent de celui du CRM", () => {
    expect(nomAuRegistre(dossier({ nom_crm: "EMC Sarl", denomination: "EDDIA NOUVELLE AQUITAINE" })))
      .toBe("EDDIA NOUVELLE AQUITAINE");
  });

  it("se tait quand c'est le même nom à la casse et la ponctuation près", () => {
    expect(nomAuRegistre(dossier({ nom_crm: "Solvac", denomination: "SOLVAC" }))).toBeNull();
  });
});

describe("ancienneteAnnees", () => {
  it("ne compte pas une année non révolue", () => {
    expect(ancienneteAnnees({ date_creation: "1989-07-01" }, LE_8_AOUT)).toBe(37);
    expect(ancienneteAnnees({ date_creation: "1989-12-01" }, LE_8_AOUT)).toBe(36);
  });

  it("rend null sans date", () => {
    expect(ancienneteAnnees({ date_creation: null })).toBeNull();
  });
});
