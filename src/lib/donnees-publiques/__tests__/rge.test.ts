/**
 * La règle qui protège un site démo d'une allégation trompeuse.
 *
 * Un logo RGE affiché pour une entreprise qui ne détient pas la qualification
 * est une allégation trompeuse sur un site qu'on produit. Mais retirer un bloc
 * parce qu'on n'a pas regardé est une erreur symétrique — et plus fréquente.
 */

import {
  afficherBlocCertifications,
  explicationRge,
  verdictRge,
  type EtatVerificationRge,
} from "../rge-compteur";
import { logoRge, logoPourCertificat, logosDistincts, NB_CERTIFICATS_MAPPES } from "../rge-logos";

const etat = (p: Partial<EtatVerificationRge> = {}): EtatVerificationRge => ({
  aSiret: true,
  rgeInterroge: true,
  qualificationsValides: 0,
  ...p,
});

describe("verdictRge", () => {
  it("laisse toujours gagner le chiffre confirmé par le client", () => {
    // §A5 : `stat_rge_count_official` prime et ne se touche pas — y compris
    // contre l'ADEME, parce que le client sait ce qu'il détient.
    const v = verdictRge(etat({ qualificationsValides: 6 }), "3", "4");
    expect(v.source).toBe("official");
    expect(v.valeur).toBe("4");
  });

  it("compte les qualifications quand l'ADEME a répondu", () => {
    const v = verdictRge(etat({ qualificationsValides: 6 }), "2", null);
    expect(v.source).toBe("ademe");
    expect(v.valeur).toBe("6");
    expect(v.verifie).toBe(true);
  });

  it("efface le compteur quand l'ADEME rend 0 — absence VÉRIFIÉE", () => {
    // Le cas ECLEIS : son site affiche des logos RGE, l'ADEME rend 0 ligne.
    // C'est précisément ce que le contrôle doit retirer, malgré la saisie.
    const v = verdictRge(etat({ qualificationsValides: 0 }), "3", null);
    expect(v.source).toBe("aucune");
    expect(v.valeur).toBe("");
    expect(afficherBlocCertifications(v)).toBe(false);
  });

  it("CONSERVE la saisie quand la fiche n'a pas de SIRET — ignorance ≠ absence", () => {
    const v = verdictRge(etat({ aSiret: false, rgeInterroge: false }), "3", null);
    expect(v.source).toBe("saisie");
    expect(v.valeur).toBe("3");
    // Le drapeau est ce qui permet au CRM de dire « non vérifié ».
    expect(v.verifie).toBe(false);
    expect(afficherBlocCertifications(v)).toBe(true);
  });

  it("CONSERVE la saisie quand le SIRET existe mais que l'ADEME n'a pas été interrogée", () => {
    // Un SIRET tout juste résolu ne prouve rien tant que la question n'a pas
    // été posée : c'est le plus gros groupe du parc après une passe de
    // résolution.
    const v = verdictRge(etat({ aSiret: true, rgeInterroge: false }), "5", null);
    expect(v.source).toBe("saisie");
    expect(v.verifie).toBe(false);
  });

  it("n'affiche rien quand on ne sait rien ET que rien n'a été saisi", () => {
    const v = verdictRge(etat({ aSiret: false, rgeInterroge: false }), null, null);
    expect(afficherBlocCertifications(v)).toBe(false);
  });

  it("traite « 0 », « - » et « — » comme des saisies vides", () => {
    for (const saisie of ["0", "-", "—", "", "  "]) {
      const v = verdictRge(etat({ aSiret: false, rgeInterroge: false }), saisie, null);
      expect(afficherBlocCertifications(v)).toBe(false);
    }
  });

  it("explique au CRM pourquoi il affiche ce qu'il affiche", () => {
    expect(explicationRge(verdictRge(etat({ aSiret: false, rgeInterroge: false }), "3", null), etat({ aSiret: false })))
      .toMatch(/Sans SIRET/);
    expect(explicationRge(verdictRge(etat(), "3", null), etat()))
      .toMatch(/ne rend aucune qualification/);
  });
});

describe("logos RGE", () => {
  it("relie un certificat ADEME à son fichier normalisé", () => {
    const l = logoRge("QualiPAC module Chauffage et ECS")!;
    expect(l.cle).toBe("qualipac");
    expect(l.src).toBe("/rge/qualipac.png");
    expect(l.srcSet).toContain("/rge/qualipac@2x.png 2x");
    // Gabarit unique : les images sont déjà équilibrées optiquement, on ne les
    // redimensionne pas une par une.
    expect(l.width).toBe(360);
    expect(l.height).toBe(180);
  });

  it("nomme la qualification en alt, pas « logo RGE »", () => {
    // Un lecteur d'écran doit entendre LAQUELLE des qualifications est détenue.
    expect(logoRge("QUALIBAT-RGE")!.alt).toBe("QUALIBAT-RGE");
  });

  it("rend null pour un certificat d'audit nominatif, sans que ce soit une erreur", () => {
    // L'ADEME compte 40 `nom_certificat`, le mapping 16. Les CERTIFICAT_* sont
    // des certificats délivrés à un bureau d'études précis : pas de logo public,
    // et la qualification reste valide pour autant.
    expect(logoPourCertificat("CERTIFICAT_CABINET_DENIZOU")).toBeNull();
    expect(logoRge("Tableau de l´Ordre")).toBeNull();
    expect(logoRge(null)).toBeNull();
  });

  it("couvre les 16 certificats du mapping", () => {
    expect(NB_CERTIFICATS_MAPPES).toBe(16);
  });

  it("dédoublonne les logos — cas réel Chaleur et Confort", () => {
    // 6 qualifications réelles, mais QualiPAC apparaît deux fois (chauffage ET
    // chauffe-eau) et Qualibois Eau deux fois : 4 logos distincts attendus.
    const logos = logosDistincts([
      { nom_certificat: "Qualisol Combi" },
      { nom_certificat: "Qualibois Eau" },
      { nom_certificat: "Qualibois Eau" },
      { nom_certificat: "Ventilation +" },
      { nom_certificat: "QualiPAC module Chauffage et ECS" },
      { nom_certificat: "QualiPAC module Chauffage et ECS" },
    ]);
    expect(logos.map((l) => l.cle)).toEqual(["qualisol", "qualibois", "ventilation-plus", "qualipac"]);
  });

  it("ignore les qualifications sans logo sans casser la liste", () => {
    const logos = logosDistincts([
      { nom_certificat: "CERTIFICAT_GEXPERTISE" },
      { nom_certificat: "QUALIBAT-RGE" },
      { nom_certificat: null },
    ]);
    expect(logos.map((l) => l.cle)).toEqual(["qualibat"]);
  });
});
