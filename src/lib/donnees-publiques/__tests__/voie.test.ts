/**
 * Ce que ce test tient : la voie comme critère d'identité.
 *
 * Le barème d'origine comparait la COMMUNE et rien de plus fin. La fiche 834
 * « Électricien Perpignan | CÉRÉLEC » avait trois candidats au-dessus du seuil
 * de proposition, aucun n'était CERELEC — dont le siège est au même numéro de
 * la même rue. Les cas ci-dessous sont écrits sur les adresses réelles qui ont
 * fait ajouter la composante, et sur celles qui la font taire.
 */
import { initialesDe, motsDeVoie, siglesDeLaFiche, similariteVoie, scoreCandidat } from "../score";
import { requeteDAdresse, SEUIL_ADRESSE_PARTAGEE } from "../resolution";
import { concordance, identiteProbable, libelleAdresse } from "@/lib/lissage/choix-siret";

describe("motsDeVoie — ce qui NOMME la voie", () => {
  it("retire le numéro, le type de voie, les articles, le code postal et la commune", () => {
    expect(motsDeVoie("823 RUE JEAN-BAPTISTE BIOT 66000 PERPIGNAN")).toEqual([
      "JEAN", "BAPTISTE", "BIOT",
    ]);
  });

  it("retire aussi le complément de localisation en tête", () => {
    expect(motsDeVoie("ZAE Cap Nord, 30 Rue de Cracovie, 21850 Saint-Apollinaire")).toEqual([
      "CAP", "NORD", "CRACOVIE",
    ]);
  });

  it("ne rend rien d'une adresse qui n'en est pas une", () => {
    // Fiche 913 : « 5,0(11) » est une note Google tombée dans la colonne adresse.
    expect(motsDeVoie("5,0(11)")).toEqual([]);
  });
});

describe("similariteVoie — le numéro fait la différence", () => {
  it("rend 1 sur la même voie au même numéro, malgré la ponctuation et la casse", () => {
    expect(similariteVoie("823 Rue Jean Baptiste Biot, 66000 Perpignan", "823 RUE JEAN-BAPTISTE BIOT 66000 PERPIGNAN")).toBe(1);
  });

  it("rend 1 malgré un complément de localisation d'un seul côté", () => {
    // La ZAE est sur la fiche Google, jamais dans l'immatriculation.
    expect(similariteVoie("ZAE Cap Nord, 30 Rue de Cracovie, 21850 Saint-Apollinaire", "30 RUE DE CRACOVIE 21000 DIJON")).toBe(1);
  });

  it("NE REND PAS 1 au voisin : même voie, autre numéro", () => {
    // Dans une zone artisanale, l'autre numéro est une autre entreprise.
    expect(similariteVoie("37 Chemin Dubac, 31270 Cugnaux", "36 CHEMIN DUBAC 31270 CUGNAUX")).toBe(0.5);
  });

  it("rend 0,7 quand un numéro manque — même voie, on ne peut pas trancher plus", () => {
    expect(similariteVoie("Rte des Combes, 38200 Luzinay", "ROUTE DES COMBES 38200 LUZINAY")).toBe(0.7);
  });

  it("rend 0 sur deux voies différentes de la même commune", () => {
    expect(similariteVoie("10 Rue de Montmorency, 75003 Paris", "11 PLACE DU GENERAL CATROUX 75017 PARIS")).toBe(0);
  });

  it("rend 0 quand un côté n'a pas d'adresse lisible", () => {
    expect(similariteVoie("5,0(11)", "823 RUE JEAN-BAPTISTE BIOT 66000 PERPIGNAN")).toBe(0);
  });
});

describe("requeteDAdresse — ce qu'on envoie vraiment à l'annuaire", () => {
  // Les trois formes ont été mesurées sur l'API le 03/09/2026 :
  //   « 30 RUE DE CRACOVIE »                   → RUBIN LACAQUE, 1er résultat
  //   « ZAE CAP NORD 30 RUE DE CRACOVIE »      → 0 résultat
  //   « 30 RUE DE CRACOVIE SAINT-APOLLINAIRE » → 0 résultat
  it("démarre au numéro et coupe le complément de localisation", () => {
    expect(requeteDAdresse("ZAE Cap Nord, 30 Rue de Cracovie, 21850 Saint-Apollinaire")).toBe(
      "30 RUE DE CRACOVIE",
    );
  });

  it("N'AJOUTE PAS la commune — le registre peut la déclarer ailleurs", () => {
    expect(requeteDAdresse("823 Rue Jean Baptiste Biot, 66000 Perpignan")).toBe(
      "823 RUE JEAN BAPTISTE BIOT",
    );
  });

  it("démarre au type de voie quand il n'y a pas de numéro", () => {
    expect(requeteDAdresse("Rte des Combes, 38200 Luzinay")).toBe("RTE DES COMBES");
  });

  it("ne part pas en requête quand rien ne nomme", () => {
    expect(requeteDAdresse("5,0(11)")).toBeNull();
    expect(requeteDAdresse(null)).toBeNull();
  });

  it("le seuil de partage laisse passer l'artisan et sa SCI", () => {
    // Deux SIREN au même numéro est courant et légitime ; trois dit « boîte aux
    // lettres » — mesuré au 46C chemin du Moulin Carron, Dardilly.
    expect(SEUIL_ADRESSE_PARTAGEE).toBe(3);
  });
});

describe("la voie remonte jusqu'au critère du registre", () => {
  const candidat = (adresse: string, ville: string, cp: string) => ({
    identite: {
      denomination: "CERELEC", nomComplet: "CERELEC", sigle: null, enseignes: [],
      nafCode: "43.21A", etatAdministratif: "A" as const, dateFermeture: null,
    },
    siret: "31664533200019", estSiege: true, adresse, codePostal: cp, ville,
    enseignes: [], etatAdministratif: "A",
  });

  it("crédite la voie et la fait valoir comme adresse", () => {
    const note = scoreCandidat(
      { nom: "CÉRÉLEC", ville: "Perpignan", codePostal: "66000", adresse: "823 Rue Jean Baptiste Biot, 66000 Perpignan" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidat("823 RUE JEAN-BAPTISTE BIOT 66000 PERPIGNAN", "PERPIGNAN", "66000") as any,
    );
    expect(note.detail.rue).toBe(20);
    expect(concordance(note.detail).adresse).toBe(true);
    expect(libelleAdresse(note.detail)).toBe("adresse exacte");
  });

  it("ne crédite rien quand la fiche n'a pas d'adresse — et ne pénalise pas", () => {
    const note = scoreCandidat(
      { nom: "CÉRÉLEC", ville: "Perpignan", codePostal: "66000" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidat("823 RUE JEAN-BAPTISTE BIOT 66000 PERPIGNAN", "PERPIGNAN", "66000") as any,
    );
    expect(note.detail.rue).toBe(0);
    // La commune tient encore le critère, comme avant le 03/09.
    expect(concordance(note.detail).adresse).toBe(true);
  });

  it("le voisin obtient des points mais PAS le critère", () => {
    const note = scoreCandidat(
      { nom: "AR CLIM", ville: "Cugnaux", codePostal: "31270", adresse: "37 Chemin Dubac, 31270 Cugnaux" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candidat("36 CHEMIN DUBAC 31270 CUGNAUX", "CUGNAUX", "31270") as any,
    );
    expect(note.detail.rue).toBe(10);
    expect(libelleAdresse(note.detail)).toBe("même voie");
  });

  it("une ligne notée AVANT le 03/09 se juge exactement comme avant", () => {
    // Pas de clé `rue` : c'est l'état de toutes les lignes déjà en base.
    expect(concordance({ nom: 40, codePostal: 25, ville: 15, activite: 10 }).adresse).toBe(true);
    expect(concordance({ nom: 40, codePostal: 25, ville: 0, activite: 10 }).adresse).toBe(false);
    expect(libelleAdresse({ nom: 40, codePostal: 25, ville: 15 })).toBe("commune");
  });
});

describe("ce qui DISTINGUE, par opposition à ce qui situe", () => {
  // Les trois cas ci-dessous sont les trois écritures fausses de la passe du
  // 03/09, reprises telles quelles depuis `score_detail`.
  const fiche = (nom: string, cands: Array<{ siret: string; detail: Record<string, number>; etat?: string }>) => ({
    fiche: { entrepriseId: 1, nom, ville: null, codePostal: null },
    entreprises: cands.map((c) => ({
      siren: c.siret.slice(0, 9),
      retenu: {
        id: c.siret, entrepriseId: 1, siret: c.siret, denomination: null, enseignes: [],
        adresse: null, codePostal: null, ville: null, etatAdministratif: c.etat ?? "A",
        nafCode: null, score: Object.values(c.detail).reduce((a, b) => a + b, 0),
        detail: c.detail, siren: c.siret.slice(0, 9), alertes: [],
        concordance: concordance(c.detail),
      },
      autres: [], etablissements: 1,
    })),
    meilleurScore: 0, evidente: false, serree: false, memeEntreprise: false,
    siren: null, etablissements: cands.length,
  });

  it("REFUSE code postal + commune + métier — c'est un voisinage, pas une identité", () => {
    // Fiche 452 « GTR LOC » → Agence locale de l'énergie, 13 rue Viala Lyon.
    const f = fiche("GTR LOC", [
      { siret: "84426442400012", detail: { nom: 6, ville: 15, codePostal: 25, activite: 10, etat: 5 } },
      { siret: "84830804500014", detail: { nom: 45, ville: 2, codePostal: 0, activite: 0, etat: 0 } },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(identiteProbable(f as any)).toBeNull();
  });

  it("REFUSE un nom qui ne concorde que par sa ville", () => {
    // Fiche 21 « Climatisation Paris 2 » → Planning familial, 10 rue Vivienne.
    // Le nom vaut désormais 0 : `motsHorsVille` ne laisse rien à comparer.
    const f = fiche("Climatisation Paris 2", [
      { siret: "30343275100012", detail: { nom: 0, ville: 15, codePostal: 25, activite: 0, etat: 5 } },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(identiteProbable(f as any)).toBeNull();
  });

  it("ACCEPTE quand la voie tient le dossier à la place du nom", () => {
    // Fiche 202 « RUBIN LACAQUE », 30 rue de Cracovie — le registre la déclare
    // à Dijon, la fiche à Saint-Apollinaire : seule la voie les relie.
    const f = fiche("RUBIN LACAQUE", [
      { siret: "53542027700035", detail: { nom: 45, rue: 20, ville: 0, codePostal: 10, activite: 0, etat: 5 } },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(identiteProbable(f as any)?.candidat.siret).toBe("53542027700035");
  });

  it("ACCEPTE le nom seul quand il concorde vraiment, sans la voie", () => {
    const f = fiche("THERM'ESSONNE", [
      { siret: "32178424100036", detail: { nom: 45, ville: 15, codePostal: 25, activite: 0, etat: 5 } },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(identiteProbable(f as any)?.candidat.siret).toBe("32178424100036");
  });
});

describe("l'artisan derrière ses initiales", () => {
  const personne = (nomComplet: string, avecDenomination = false) => ({
    identite: {
      denomination: avecDenomination ? nomComplet : null,
      nomComplet, sigle: null, enseignes: [], dirigeants: [],
      nafCode: "43.22B", etatAdministratif: "A" as const, dateFermeture: null,
    },
    siret: "44043340700011", estSiege: true,
    adresse: "37 CHEMIN DUBAC 31270 CUGNAUX", codePostal: "31270", ville: "CUGNAUX",
    enseignes: [], etatAdministratif: "A",
  });

  const noter = (nom: string, cand: ReturnType<typeof personne>, avis?: string[]) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoreCandidat({ nom, ville: "Cugnaux", codePostal: "31270", avis }, cand as any);

  it("lit les initiales dans les deux sens", () => {
    expect(initialesDe("ADRIEN RODRIGUEZ")).toEqual(["AR", "RA"]);
    // Le registre écrit tantôt PRÉNOM NOM, tantôt NOM PRÉNOM, sans règle.
    expect(initialesDe("REILHAC ARNAUD")).toEqual(["RA", "AR"]);
  });

  it("ne prend pas une forme juridique ni un mot du métier pour un sigle", () => {
    expect(siglesDeLaFiche("SARL AIR ECO Climatisation", "Cugnaux")).toEqual([]);
  });

  it("rapproche « AR CLIM » d'ADRIEN RODRIGUEZ, sans aller jusqu'à la certitude", () => {
    const n = noter("AR CLIM", personne("ADRIEN RODRIGUEZ"));
    // 0,8 × 45 = 36, très exactement le seuil du critère : une concordance, pas
    // une preuve. Deux lettres se partagent entre artisans d'une même ville.
    expect(n.detail.nom).toBe(36);
    expect(n.detail.alertes.some((a) => /INITIALES seules/.test(a))).toBe(true);
  });

  it("va jusqu'à la certitude quand les avis nomment la personne", () => {
    const n = noter("AR CLIM", personne("ADRIEN RODRIGUEZ"), [
      "Adrien est intervenu le jour même, travail impeccable.",
    ]);
    expect(n.detail.nom).toBe(45);
    expect(n.detail.nomCompareA).toContain("nommé dans les avis");
  });

  it("N'UTILISE PAS le nom de l'auteur d'un avis — c'est le client", () => {
    // Le texte ne nomme personne ; seul un `author_name` s'appellerait Adrien,
    // et `textesDesAvis` ne le fait jamais remonter jusqu'ici.
    const n = noter("Clim du Sud", personne("ADRIEN RODRIGUEZ"), ["Très bon travail, rien à redire."]);
    expect(n.detail.nom).toBeLessThan(36);
    expect(n.detail.nomCompareA).not.toContain("avis");
  });

  it("ne cherche pas d'initiales à une SOCIÉTÉ — son nom se compare comme un nom", () => {
    const n = noter("AR CLIM", personne("ADRIEN RODRIGUEZ SAS", true));
    expect(n.detail.alertes.some((a) => /INITIALES/.test(a))).toBe(false);
  });

  it("ne confond pas un prénom avec un mot qui le contient", () => {
    const n = noter("MC Froid", personne("MARC CHEVALIER"), ["Le marché du froid est compliqué."]);
    // « MARC » est dans « MARCHÉ » : sans la frontière de mot, l'avis validerait.
    expect(n.detail.nomCompareA).not.toContain("nommé dans les avis");
  });
});

describe("la voie ne remplace le nom que pour une personne", () => {
  const cas = (nomFiche: string, denomination: string | null, detail: Record<string, number>) => ({
    fiche: { entrepriseId: 1, nom: nomFiche, ville: null, codePostal: null },
    entreprises: [
      {
        siren: "377777651",
        retenu: {
          id: "1", entrepriseId: 1, siret: "37777765100037", denomination, enseignes: [],
          adresse: null, codePostal: null, ville: null, etatAdministratif: "A",
          nafCode: null, score: 90, detail, siren: "377777651", alertes: [],
          concordance: concordance(detail),
        },
        autres: [], etablissements: 1,
      },
    ],
    meilleurScore: 90, evidente: false, serree: false, memeEntreprise: false,
    siren: "377777651", etablissements: 1,
  });

  const detailAdresseSeule = { nom: 8, rue: 20, ville: 15, codePostal: 25, activite: 10, etat: 5 };

  it("REFUSE une SOCIÉTÉ dont la raison sociale ne concorde pas", () => {
    // « Axima Equans » → SURCOF, bien réelle au 11 rue du Champ aux Prêtres.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(identiteProbable(cas("Axima Equans", "SURCOF", detailAdresseSeule) as any)).toBeNull();
  });

  it("ACCEPTE une ENTREPRISE INDIVIDUELLE, qui n'a que l'état civil de son patron", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = identiteProbable(cas("GARAGE P.J MOTORS", null, detailAdresseSeule) as any);
    expect(r?.regle).toContain("entreprise individuelle");
  });
});
