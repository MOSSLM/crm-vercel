import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assurerJetonsPlaquette,
  fonctionPlaquetteAbsente,
  marquerPlaquetteVue,
  urlPlaquette,
} from "../plaquette";
import { jetonDansLeTexte } from "../plaquette-lien";

/**
 * Le jeton de plaquette — ce qui doit rester vrai le 20 août.
 *
 * Ce fichier ne teste PAS le document (c'est `plaquette.test.ts` qui le fait) :
 * il teste la seule chose que le jeton ajoute, à savoir la capacité de dire QUI
 * a ouvert. Les trois propriétés gardées ici correspondent chacune à une panne
 * qu'on ne verrait pas avant qu'il soit trop tard :
 *
 *   1. rejouer le lot ne remplace jamais un jeton — un lien déjà parti par
 *      WhatsApp qui cesse d'ouvrir ne se signale que par un prospect perdu ;
 *   2. une entreprise disparue ne fait pas échouer les 299 autres ;
 *   3. un jeton mal formé n'atteint pas la base — la page publique est sur une
 *      route ouverte, et `/plaquette/{n'importe quoi}` est appelable par
 *      n'importe qui.
 */

/** Un faux client Supabase réduit à ce que ces fonctions utilisent : `rpc`. */
const clientAvecRpc = (rpc: jest.Mock): SupabaseClient => ({ rpc }) as unknown as SupabaseClient;

const LIGNE = (id: number, jeton: string, deja = false) => ({
  entreprise_id: id,
  jeton,
  deja_prete: deja,
});

describe("urlPlaquette", () => {
  it("sans jeton, rend le lien collectif — celui qu'on colle dans un WhatsApp non préparé", () => {
    expect(urlPlaquette()).toMatch(/\/plaquette$/);
    expect(urlPlaquette(null)).toMatch(/\/plaquette$/);
  });

  it("avec jeton, rend l'URL du prospect", () => {
    expect(urlPlaquette("a1b2c3d4e5f60718293a4b5c6d7e8f90")).toMatch(
      /\/plaquette\/a1b2c3d4e5f60718293a4b5c6d7e8f90$/,
    );
  });

  it("reste sur l'hôte du CRM, jamais sur le sous-domaine des rapports", () => {
    // `rapport.{SITE_DOMAIN}` est réécrit vers `/rapport` par le middleware :
    // une plaquette servie là-bas tomberait sur la page du rapport d'audit.
    expect(urlPlaquette("ff00ff00ff00ff00ff00ff00ff00ff00")).not.toContain("rapport.");
  });
});

describe("assurerJetonsPlaquette", () => {
  it("passe le lot et l'auteur à la fonction SQL, et rend les jetons", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [LIGNE(1, "aaaa1111aaaa1111"), LIGNE(2, "bbbb2222bbbb2222", true)],
      error: null,
    });

    const { jetons, erreur } = await assurerJetonsPlaquette(clientAvecRpc(rpc), [1, 2], "agent-1");

    expect(erreur).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("assurer_jetons_plaquette", {
      p_entreprise_ids: [1, 2],
      p_cree_par: "agent-1",
    });
    expect(jetons).toEqual([
      { entrepriseId: 1, jeton: "aaaa1111aaaa1111", dejaPrete: false },
      { entrepriseId: 2, jeton: "bbbb2222bbbb2222", dejaPrete: true },
    ]);
  });

  it("distingue ce qui vient d'être créé de ce qui existait déjà", async () => {
    // C'est TOUTE l'idempotence rendue visible : sans `deja_prete`, un agent qui
    // reclique lit « 300 plaquettes créées » et croit avoir refait des liens.
    const rpc = jest.fn().mockResolvedValue({
      data: [LIGNE(1, "aaaa1111aaaa1111", true), LIGNE(2, "bbbb2222bbbb2222", true)],
      error: null,
    });
    const { jetons } = await assurerJetonsPlaquette(clientAvecRpc(rpc), [1, 2], null);
    expect(jetons.every((j) => j.dejaPrete)).toBe(true);
  });

  it("laisse tomber les identifiants que la base n'a pas rendus", async () => {
    // La fonction SQL joint sur `entreprises` : une entreprise supprimée entre
    // l'affichage du board et le clic manque simplement du résultat, au lieu de
    // faire échouer le lot entier sur une clé étrangère.
    const rpc = jest.fn().mockResolvedValue({ data: [LIGNE(1, "aaaa1111aaaa1111")], error: null });
    const { jetons } = await assurerJetonsPlaquette(clientAvecRpc(rpc), [1, 2, 3], null);
    expect(jetons.map((j) => j.entrepriseId)).toEqual([1]);
  });

  it("ne rend jamais une ligne sans jeton — une URL sans jeton n'attribue rien", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ entreprise_id: 7, jeton: null, deja_prete: false }],
      error: null,
    });
    const { jetons } = await assurerJetonsPlaquette(clientAvecRpc(rpc), [7], null);
    expect(jetons).toEqual([]);
  });

  it("n'appelle pas la base pour une sélection vide", async () => {
    const rpc = jest.fn();
    const { jetons } = await assurerJetonsPlaquette(clientAvecRpc(rpc), [], null);
    expect(rpc).not.toHaveBeenCalled();
    expect(jetons).toEqual([]);
  });

  it("remonte l'erreur au lieu de rendre une liste vide silencieuse", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const { jetons, erreur } = await assurerJetonsPlaquette(clientAvecRpc(rpc), [1], null);
    expect(jetons).toEqual([]);
    expect(erreur?.message).toBe("boom");
  });
});

describe("fonctionPlaquetteAbsente", () => {
  it("reconnaît la migration non jouée, quel que soit le chemin d'appel", () => {
    expect(fonctionPlaquetteAbsente({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(fonctionPlaquetteAbsente({ code: "42883", message: "function does not exist" })).toBe(true);
  });

  it("ne prend pas une panne ordinaire pour une migration manquante", () => {
    // Répondre « joue la migration » sur un incident réseau enverrait chercher
    // le problème à l'endroit exact où il n'est pas.
    expect(fonctionPlaquetteAbsente({ code: "57014", message: "canceling statement" })).toBe(false);
    expect(fonctionPlaquetteAbsente(null)).toBe(false);
  });
});

describe("marquerPlaquetteVue", () => {
  it("compte l'ouverture d'un jeton bien formé", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    await marquerPlaquetteVue(clientAvecRpc(rpc), "a1b2c3d4e5f60718293a4b5c6d7e8f90");
    expect(rpc).toHaveBeenCalledWith("plaquette_vue", {
      p_token: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    });
  });

  it("n'atteint pas la base sur un chemin qui n'a pas la forme d'un jeton", async () => {
    // `/plaquette/{n'importe quoi}` est une route publique : sans ce filtre,
    // chaque robot d'indexation ferait tourner une requête d'écriture.
    const rpc = jest.fn();
    await marquerPlaquetteVue(clientAvecRpc(rpc), "../../etc/passwd");
    await marquerPlaquetteVue(clientAvecRpc(rpc), "");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ne laisse jamais une panne du compteur empêcher la lecture du document", async () => {
    const rpc = jest.fn().mockRejectedValue(new Error("fonction absente"));
    await expect(
      marquerPlaquetteVue(clientAvecRpc(rpc), "a1b2c3d4e5f60718293a4b5c6d7e8f90"),
    ).resolves.toBeUndefined();
  });
});

describe("jetonDansLeTexte", () => {
  it("retrouve le jeton d'un message rendu par le moteur", () => {
    const corps =
      "Voici ce que ça coûte, en une page :\n\n" +
      "https://crm.samadigitalstudio.fr/plaquette/2283512e590c691c7434be2bb149b97f\n\nMatteo";
    expect(jetonDansLeTexte(corps)).toBe("2283512e590c691c7434be2bb149b97f");
  });

  it("ignore le lien collectif — il ne désigne personne", () => {
    expect(jetonDansLeTexte("https://crm.samadigitalstudio.fr/plaquette")).toBeNull();
    expect(jetonDansLeTexte("https://crm.samadigitalstudio.fr/plaquette/")).toBeNull();
  });

  it("accepte un ancien domaine : de vieux messages en base en portent", () => {
    expect(jetonDansLeTexte("http://ancien.exemple/plaquette/a1b2c3d4e5f60718")).toBe(
      "a1b2c3d4e5f60718",
    );
  });

  it("ignore le lien du rapport d'audit, qui n'est pas une plaquette", () => {
    expect(
      jetonDansLeTexte("https://rapport.samadigitalstudio.fr/81700d3b175ad23b5a49c3273ff5d578"),
    ).toBeNull();
  });

  it("ne rend rien sur un message sans lien", () => {
    expect(jetonDansLeTexte("Bonjour, je suis bien avec AthermiK ?")).toBeNull();
    expect(jetonDansLeTexte(null)).toBeNull();
    expect(jetonDansLeTexte("")).toBeNull();
  });

  it("normalise la casse, comme la base l'écrit", () => {
    expect(jetonDansLeTexte("/plaquette/A1B2C3D4E5F60718")).toBe("a1b2c3d4e5f60718");
  });
});
