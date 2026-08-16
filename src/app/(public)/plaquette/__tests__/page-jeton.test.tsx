/**
 * @jest-environment node
 *
 * `/plaquette/{jeton}` — deux promesses, et rien d'autre.
 *
 *   1. LE MÊME DOCUMENT. Le jeton dit qui a ouvert ; il ne personnalise rien.
 *      Le jour où les deux routes ne rendent plus le même composant avec les
 *      mêmes réglages, la moitié de la cohorte reçoit un autre document — et
 *      personne ne le voit avant le prospect.
 *   2. UN JETON MORT NE FAIT PAS D'ERREUR. Le document est public et générique :
 *      il n'y a rien à protéger, donc rien à refuser. La page ne demande jamais
 *      si le jeton existe ; elle le tend au compteur, qui ne trouve rien.
 */
import React from "react";

const mockMarquer = jest.fn();
const CLIENT = { tag: "service-client" };

jest.mock("@/app/api/_lib/service-client", () => ({ getServiceClient: () => CLIENT }));

jest.mock("@/lib/audit/plaquette", () => ({
  marquerPlaquetteVue: (...args: unknown[]) => mockMarquer(...args),
}));

// Le rendu est testé chez lui (`src/lib/audit/__tests__/plaquette.test.ts`) :
// ici on ne vérifie que ce que les pages en font.
jest.mock("../rendu", () => ({
  estA4: (sp: Record<string, unknown> | undefined) => sp?.a4 !== undefined,
  metadonneesPlaquette: async () => ({}),
  viewportPlaquette: () => ({}),
  RenduPlaquette: function RenduPlaquette() {
    return null;
  },
}));

import PageAvecJeton from "../[jeton]/page";
import PageCollective from "../page";

type Element = React.ReactElement<{ a4: boolean }>;

const ouvrir = (jeton: string, sp: Record<string, string> = {}) =>
  PageAvecJeton({
    params: Promise.resolve({ jeton }),
    searchParams: Promise.resolve(sp),
  }) as Promise<Element>;

const JETON = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

beforeEach(() => mockMarquer.mockReset());

describe("le document ne change pas d'un prospect à l'autre", () => {
  it("rend exactement ce que rend `/plaquette` sans jeton", async () => {
    const collective = (await PageCollective({ searchParams: Promise.resolve({}) })) as Element;
    const nominative = await ouvrir(JETON);

    expect(nominative.type).toBe(collective.type);
    expect(nominative.props).toEqual(collective.props);
  });

  it("garde le rendu A4 sur demande, comme la version collective", async () => {
    expect((await ouvrir(JETON)).props.a4).toBe(false);
    expect((await ouvrir(JETON, { a4: "" })).props.a4).toBe(true);
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
});

describe("un jeton mort, révoqué ou inconnu", () => {
  it("rend le document quand même", async () => {
    const attendu = (await PageCollective({ searchParams: Promise.resolve({}) })) as Element;
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
    const attendu = (await PageCollective({ searchParams: Promise.resolve({}) })) as Element;
    const el = await ouvrir(JETON);
    expect(el.type).toBe(attendu.type);
    expect(el.props).toEqual(attendu.props);
  });
});
