/**
 * La résolution d'identité PROPOSE, elle ne décide pas.
 *
 * C'est la propriété que ces tests protègent. Un rapprochement faux n'est pas
 * une donnée fausse isolée : le mauvais SIRET amène ensuite la mauvaise
 * identité, les mauvaises finances et les mauvaises qualifications RGE — qui
 * finissent en logos sur un site public qu'on produit.
 */

import { chercherCandidats, extraireIdentifiants } from "../resolution";

const fetchQui = (parUrl: (url: string) => unknown): typeof fetch =>
  (async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => parUrl(String(url)),
  })) as unknown as typeof fetch;

const VIDE = { results: [] };

/** Réponse réelle pour « TOP CLIMATISATION », filtrée sur 75011. */
const TOP_CLIM = {
  results: [
    {
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
    },
  ],
};

describe("extraireIdentifiants", () => {
  it("lit un SIREN étiqueté dans une note écrite à la main", () => {
    // Note réelle de la fiche 30.
    const r = extraireIdentifiants(
      "SIREN 881400980, créée le 07/01/2020. Siège 45 rue Boursault 75017 Paris.",
    );
    expect(r.siren).toBe("881400980");
  });

  it("préfère le SIRET quand la note porte les deux", () => {
    // Note réelle de la fiche 55.
    const r = extraireIdentifiants(
      "Confirmé au registre : SIREN 914827035 / SIRET 91482703500017, créée le 22/06/2022.",
    );
    expect(r.siret).toBe("91482703500017");
    expect(r.siren).toBe("914827035");
  });

  it("ignore un nombre à 9 chiffres qui n'est pas étiqueté", () => {
    // Sans l'étiquette, ce pourrait être un téléphone, un montant, une
    // référence. On ne devine pas un identifiant légal.
    expect(extraireIdentifiants("Rappeler au 0142857396 avant 18h").siren).toBeNull();
    expect(extraireIdentifiants("Devis de 123456789 euros").siren).toBeNull();
  });

  it("rejette un identifiant étiqueté mais dont la clé est fausse", () => {
    expect(extraireIdentifiants("SIREN 123456789").siren).toBeNull();
  });

  it("supporte une note vide", () => {
    expect(extraireIdentifiants(null)).toEqual({ siret: null, siren: null });
    expect(extraireIdentifiants("")).toEqual({ siret: null, siren: null });
  });
});

describe("chercherCandidats", () => {
  it("propose l'établissement de la fiche, pas le siège", async () => {
    // Le cas CLIMIZ : la fiche est au 75011, le siège au 75017.
    const candidats = await chercherCandidats(
      { entreprise_id: 16, name: "CLIMIZ", ville: "Paris", code_postal: "75011" },
      { fetchImpl: fetchQui((u) => (u.includes("TOP") || u.includes("CLIMIZ") ? TOP_CLIM : VIDE)) },
    );
    expect(candidats.length).toBeGreaterThan(0);
    expect(candidats[0].candidat.siret).toBe("88829510200014");
  });

  it("élargit la requête quand le nom complet ne rend rien", async () => {
    const requetes: string[] = [];
    await chercherCandidats(
      {
        entreprise_id: 4,
        name: "Eco Solutions 44 - Climatisation & Pompe à chaleur Nantes",
        ville: "Saint-Herblain",
        code_postal: "44800",
      },
      {
        fetchImpl: fetchQui((u) => {
          // `URLSearchParams` encode les espaces en '+', que
          // `decodeURIComponent` ne défait pas : sans ce remplacement, on
          // chercherait « Eco Solutions 44 » dans « Eco+Solutions+44 ».
          requetes.push(decodeURIComponent(u).replace(/\+/g, " "));
          return VIDE;
        }),
      },
    );
    // Mesuré sur l'API : la requête complète rend 0 résultat. Sans
    // élargissement, la fiche resterait éternellement non résolue.
    expect(requetes.length).toBeGreaterThan(1);
    expect(requetes.some((r) => r.includes("Eco Solutions 44") && !r.includes("Pompe"))).toBe(true);
  });

  it("relâche le filtre code postal seulement après un échec", async () => {
    const requetes: string[] = [];
    await chercherCandidats(
      { entreprise_id: 1, name: "CLIMIZ", ville: "Paris", code_postal: "75011" },
      {
        fetchImpl: fetchQui((u) => {
          // `URLSearchParams` encode les espaces en '+', que
          // `decodeURIComponent` ne défait pas : sans ce remplacement, on
          // chercherait « Eco Solutions 44 » dans « Eco+Solutions+44 ».
          requetes.push(decodeURIComponent(u).replace(/\+/g, " "));
          return VIDE;
        }),
      },
    );
    // Le code postal d'abord : c'est le filtre qui évite de noyer un bon
    // résultat sous les homonymes nationaux.
    expect(requetes[0]).toContain("code_postal=75011");
    expect(requetes.some((r) => !r.includes("code_postal"))).toBe(true);
  });

  it("prend le raccourci quand un SIRET est déjà connu", async () => {
    const requetes: string[] = [];
    const candidats = await chercherCandidats(
      {
        entreprise_id: 2143,
        name: "ECLEIS - Entreprise de Génie Climatique et ENR",
        ville: "Muret",
        code_postal: "31600",
        siret_connu: "35137835100040",
      },
      {
        fetchImpl: fetchQui((u) => {
          requetes.push(u);
          return {
            results: [
              {
                siren: "351378351",
                nom_raison_sociale: "ECLEIS",
                nom_complet: "ECLEIS",
                etat_administratif: "A",
                activite_principale: "43.22B",
                siege: {
                  siret: "35137835100040",
                  code_postal: "31600",
                  libelle_commune: "MURET",
                  est_siege: true,
                },
              },
            ],
          };
        }),
      },
    );
    // Un seul appel : rien à chercher, il n'y a qu'à vérifier.
    expect(requetes).toHaveLength(1);
    expect(candidats[0].candidat.siret).toBe("35137835100040");
  });

  it("ne rend rien plutôt que n'importe quoi", async () => {
    const candidats = await chercherCandidats(
      { entreprise_id: 9, name: "Quali fluide", ville: "Carquefou", code_postal: "44470" },
      { fetchImpl: fetchQui(() => VIDE) },
    );
    expect(candidats).toEqual([]);
  });

  it("écarte les candidats trop faibles au lieu de faire perdre du temps", async () => {
    // Un homonyme lointain : autre département, autre activité.
    const horsSujet = {
      results: [
        {
          siren: "888295102",
          nom_raison_sociale: "BOULANGERIE DUPONT",
          nom_complet: "BOULANGERIE DUPONT",
          etat_administratif: "A",
          activite_principale: "10.71C",
          siege: { siret: "88829510200030", code_postal: "59000", libelle_commune: "LILLE", est_siege: true },
        },
      ],
    };
    const candidats = await chercherCandidats(
      { entreprise_id: 16, name: "CLIMIZ", ville: "Paris", code_postal: "75011" },
      { fetchImpl: fetchQui(() => horsSujet) },
    );
    expect(candidats).toEqual([]);
  });
});
