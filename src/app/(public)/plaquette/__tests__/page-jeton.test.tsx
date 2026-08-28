/**
 * @jest-environment node
 *
 * `/plaquette/{jeton}` — ce que le jeton personnalise, et ce qu'il ne
 * personnalise toujours pas.
 *
 *   1. LES DEUX FORMATS SONT NOMINATIFS, ET LE JETON EST CE QUI LES AUTORISE. Il
 *      désigne UNE entreprise : c'est la garantie qui permet de porter son nom
 *      et la capture de sa démo sur la couverture. Sans jeton, aucun prospect
 *      n'est chargé — le verrou est là, et c'est cette page-ci qui part à trois
 *      cents.
 *   2. L'IMPRESSION EST UN GESTE À NOUS, DANS LES DEUX FORMATS. `?imprimer`
 *      ouvre la boîte du navigateur pour qu'on enregistre le PDF — A4 pour le
 *      mail, sept pages de téléphone pour WhatsApp — donc aucune des deux
 *      demandes ne compte une ouverture. Le seul rendu compté est le mobile nu,
 *      celui qu'on ne demande jamais soi-même.
 *   3. UN JETON MORT NE FAIT PAS D'ERREUR. Le document reste public et
 *      générique : il n'y a rien à protéger, donc rien à refuser. Chaque repli
 *      — jeton inconnu, prospect introuvable, compteur en panne — rend le
 *      dépliant, jamais une page d'erreur.
 */
import React from "react";

const mockMarquer = jest.fn();
const mockCharger = jest.fn();
const CLIENT = { tag: "service-client" };

jest.mock("@/app/api/_lib/service-client", () => ({ getServiceClient: () => CLIENT }));

jest.mock("@/lib/audit/plaquette", () => ({
  marquerPlaquetteVue: (...args: unknown[]) => mockMarquer(...args),
  chargerProspectPlaquette: (...args: unknown[]) => mockCharger(...args),
}));

// Le rendu est testé chez lui (`src/lib/audit/__tests__/plaquette.test.ts`) :
// ici on ne vérifie que ce que les pages en font.
jest.mock("../rendu", () => ({
  estA4: (sp: Record<string, unknown> | undefined) => sp?.a4 !== undefined,
  veutImprimer: (sp: Record<string, unknown> | undefined) => sp?.imprimer !== undefined,
  metadonneesPlaquette: async () => ({}),
  viewportPlaquette: () => ({}),
  RenduPlaquette: function RenduPlaquette() {
    return null;
  },
}));

import PageAvecJeton from "../[jeton]/page";
import PageCollective from "../page";

type Props = { a4: boolean; imprimer?: boolean; prospect?: unknown };
type Element = React.ReactElement<Props>;

const ouvrir = (jeton: string, sp: Record<string, string> = {}) =>
  PageAvecJeton({
    params: Promise.resolve({ jeton }),
    searchParams: Promise.resolve(sp),
  }) as Promise<Element>;

const collective = (sp: Record<string, string> = {}) =>
  PageCollective({ searchParams: Promise.resolve(sp) }) as Promise<Element>;

const JETON = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

const PROSPECT = {
  nom: "Clim Ouest",
  meta: "Climatisation · Rennes",
  serviceTags: ["climatisation", "plomberie"],
  demoUrl: "https://clim-ouest.exemple.fr",
  captureDemo: "https://cdn.exemple/shot.jpg",
};

beforeEach(() => {
  mockMarquer.mockReset();
  mockCharger.mockReset();
  mockCharger.mockResolvedValue(null);
});

describe("le rendu mobile est nominatif lui aussi", () => {
  // IL NE L'ÉTAIT PAS, et le renversement est daté du 21/08/2026. Le mobile
  // restait le dépliant neutre parce qu'un message WhatsApp se transfère. La
  // maquette porte désormais la capture de la démo dans LES DEUX formats —
  // c'est ce qui met notre travail en avant — et ce qui part n'est plus un lien
  // mais un PDF que l'agent joint lui-même. Ce que le prospect peut transférer
  // se limite à son propre nom et à son propre aperçu.
  it("passe le prospect au rendu, sans attendre le A4", async () => {
    mockCharger.mockResolvedValue(PROSPECT);
    const el = await ouvrir(JETON);

    expect(mockCharger).toHaveBeenCalledTimes(1);
    expect(el.props).toMatchObject({ a4: false, prospect: PROSPECT });
  });

  it("retombe sur le dépliant collectif quand le jeton ne nomme personne", async () => {
    const attendu = await collective();
    const el = await ouvrir(JETON);

    expect(el.type).toBe(attendu.type);
    expect(el.props).toEqual(attendu.props);
  });
});

describe("le A4 est nominatif — et seulement avec un jeton", () => {
  it("passe le prospect au rendu quand il est trouvé", async () => {
    mockCharger.mockResolvedValue(PROSPECT);
    const el = await ouvrir(JETON, { a4: "" });

    expect(mockCharger).toHaveBeenCalledWith(CLIENT, JETON);
    expect(el.props.a4).toBe(true);
    expect(el.props.prospect).toEqual(PROSPECT);
  });

  it("retombe sur le dépliant quand le prospect n'a pas de démo montrable", async () => {
    mockCharger.mockResolvedValue(null);
    expect((await ouvrir(JETON, { a4: "" })).props.prospect).toBeNull();
  });

  it("ne charge aucun prospect sur la route sans jeton, même en A4", async () => {
    // LE VERROU : sans jeton, on ne sait pas à qui on parle, donc le document ne
    // peut pas nommer quelqu'un. C'est cette page-là qui part à trois cents.
    const el = await collective({ a4: "" });
    expect(el.props.prospect).toBeNull();
    expect(mockCharger).not.toHaveBeenCalled();
  });
});

describe("l'impression", () => {
  it("ne se déclenche que si on la demande explicitement", async () => {
    // On relit une plaquette en A4 pour la vérifier avant de l'envoyer : une
    // boîte d'impression qui s'ouvrirait à chaque relecture serait insupportable.
    expect((await ouvrir(JETON, { a4: "" })).props.imprimer).toBe(false);
    expect((await ouvrir(JETON, { a4: "", imprimer: "" })).props.imprimer).toBe(true);
    expect((await collective({ a4: "", imprimer: "" })).props.imprimer).toBe(true);
  });

  it("s'ouvre aussi sur le rendu mobile — c'est le PDF de WhatsApp", async () => {
    // ELLE NE S'Y OUVRAIT PAS JUSQU'AU 28/08/2026, et c'était le défaut : le
    // gabarit mobile nominatif est paginé pour l'impression (sept écrans, un par
    // page), donc dessiné pour faire un PDF — mais `veutImprimer` exigeait `?a4`,
    // et ce PDF-là n'avait aucun chemin depuis le CRM.
    const el = await ouvrir(JETON, { imprimer: "" });
    expect(el.props.imprimer).toBe(true);
    expect(el.props.a4).toBe(false);
  });
});

describe("l'ouverture est comptée", () => {
  it("passe le jeton au compteur, sans attendre sa réponse", async () => {
    // Best-effort : le compteur est un signal commercial, jamais une raison de
    // retarder l'affichage du document.
    mockMarquer.mockReturnValue(new Promise(() => {}));
    const el = await ouvrir(JETON);
    expect(mockMarquer).toHaveBeenCalledWith(CLIENT, JETON);
    expect(el.props.a4).toBe(false);
  });

  /**
   * L'A4 EST NOTRE FEUILLE, PAS CELLE DU PROSPECT — et depuis que la plaquette
   * part en PDF, l'agent l'ouvre à CHAQUE envoi pour l'enregistrer. La compter
   * attribuerait au prospect une ouverture faite par nous, et `vueQ` (S2)
   * aiguille précisément sur « a vu la plaquette » : chaque envoi aurait
   * basculé le prospect vers l'appel chaud sans qu'il ait rien lu.
   */
  it("ne compte pas la feuille A4, ni sa version imprimable", async () => {
    for (const sp of [{ a4: "" }, { a4: "", imprimer: "" }]) {
      mockMarquer.mockReset();
      const el = await ouvrir(JETON, sp);
      expect(mockMarquer).not.toHaveBeenCalled();
      expect(el.props.a4).toBe(true);
    }
  });

  /**
   * LE PDF MOBILE NON PLUS — et c'est le même geste, sur une URL sans `?a4`.
   * Depuis qu'on peut l'enregistrer, la demande d'impression arrive en mobile :
   * s'en tenir au seul `a4` aurait compté une ouverture à CHAQUE PDF fabriqué,
   * c'est-à-dire exactement ce que l'exclusion de l'A4 existe pour éviter.
   */
  it("ne compte pas le PDF mobile, qu'on fabrique nous-mêmes", async () => {
    const el = await ouvrir(JETON, { imprimer: "" });
    expect(mockMarquer).not.toHaveBeenCalled();
    expect(el.props).toMatchObject({ a4: false, imprimer: true });
  });

  it("compte le mobile nu — celui que le prospect ouvre", async () => {
    // La contrepartie du test précédent : c'est le seul rendu qu'on ne demande
    // jamais nous-mêmes, donc le seul dont l'ouverture soit celle du prospect.
    await ouvrir(JETON);
    expect(mockMarquer).toHaveBeenCalledWith(CLIENT, JETON);
  });
});

describe("un jeton mort, révoqué ou inconnu", () => {
  it("rend le document quand même", async () => {
    const attendu = await collective();
    for (const jeton of ["inconnu", "", "../../etc/passwd", "0".repeat(32)]) {
      const el = await ouvrir(jeton);
      expect(el.type).toBe(attendu.type);
      expect(el.props).toEqual(attendu.props);
    }
  });

  it("sert le document même si le compteur est en panne", async () => {
    // La mesure est perdue, la visite ne l'est pas. C'est le bon arbitrage : le
    // prospect a cliqué, et il n'a rien à faire de notre entonnoir.
    mockMarquer.mockImplementation(() => {
      throw new Error("migration non jouée");
    });
    const attendu = await collective();
    const el = await ouvrir(JETON);
    expect(el.type).toBe(attendu.type);
    expect(el.props).toEqual(attendu.props);
  });
});
