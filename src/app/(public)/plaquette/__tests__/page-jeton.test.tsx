/**
 * @jest-environment node
 *
 * `/plaquette/{jeton}` — ce que le jeton personnalise, et ce qu'il ne
 * personnalise toujours pas.
 *
 *   1. LE RENDU MOBILE RESTE LE DÉPLIANT COLLECTIF, MOT POUR MOT. C'est celui
 *      qui part par WhatsApp, donc celui qui se transfère : un document qui
 *      nommerait son lecteur atterrirait chez des tiers avec son nom dessus.
 *      Le jour où les deux routes ne rendent plus la même chose en mobile, la
 *      moitié de la cohorte reçoit un autre document — et personne ne le voit
 *      avant le prospect.
 *   2. LE A4 EST NOMINATIF, ET SEULEMENT LUI. Le jeton désigne UNE entreprise :
 *      c'est ce qui autorise sa couverture à porter son nom et la capture de sa
 *      démo. Sans jeton, aucun prospect n'est chargé — le verrou est là.
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
  veutImprimer: (sp: Record<string, unknown> | undefined) =>
    sp?.a4 !== undefined && sp?.imprimer !== undefined,
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

  it("ne s'ouvre jamais sur le rendu mobile", async () => {
    expect((await ouvrir(JETON, { imprimer: "" })).props.imprimer).toBe(false);
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
