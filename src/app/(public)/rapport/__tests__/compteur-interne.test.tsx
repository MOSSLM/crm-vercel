/**
 * @jest-environment node
 *
 * `/rapport/{jeton}` — nos propres ouvertures ne comptent pas.
 *
 * CE QUI MANQUAIT, ET CE QUE ÇA COÛTAIT
 * La page de la plaquette exclut depuis un moment les ouvertures qu'on fait
 * nous-mêmes (`?a4`, `?imprimer`), et son commentaire dit pourquoi : l'agent
 * ouvre le document à chaque envoi, et une condition de séquence aiguille sur
 * « a vu ». Le rapport n'avait AUCUNE garde équivalente, alors que trois
 * écrans du CRM l'ouvrent — la file des séquences, le panneau lead magnets
 * (qui affiche le compteur juste à côté du bouton qui l'incrémente), et la
 * fiche entreprise.
 *
 * LE PIÈGE ÉTAIT PIRE QU'UN OUBLI : deux de ces trois liens passaient déjà par
 * `lienNonMesure()`. Un relecteur voyait la fonction et concluait que c'était
 * couvert. Ça ne l'était pas — ce paramètre n'éteint que les tags GA4 et
 * Clarity du layout public, et rien, côté serveur, ne le lisait.
 *
 * CE QUE CE FICHIER TIENT : le paramètre est lu, et il ne l'est QUE pour le
 * compteur. Le document doit rester servi à l'identique dans les deux cas —
 * une garde qui changerait aussi le contenu serait une seconde faute.
 */
import React from "react";

const mockMarquer = jest.fn();
const mockResoudre = jest.fn();
const CLIENT = { tag: "service-client" };

jest.mock("@/app/api/_lib/service-client", () => ({ getServiceClient: () => CLIENT }));

// Le rendu est testé chez lui : ici on ne juge que le compteur.
jest.mock("@/utils/audit/htmlMobile", () => ({
  renderAuditMobile: () => "<html><body>rapport</body></html>",
}));

jest.mock("@/lib/audit-site/rapport", () => ({
  marquerVu: (...args: unknown[]) => mockMarquer(...args),
  resoudreRapport: (...args: unknown[]) => mockResoudre(...args),
}));

import Page from "../[token]/page";
import { PARAM_TRAFIC_INTERNE } from "@/lib/analytics/trafic-interne";

const JETON = "ecceead91456fbd56e808e5fd5f2338e";

const ouvrir = (sp: Record<string, string> = {}) =>
  Page({ params: Promise.resolve({ token: JETON }), searchParams: Promise.resolve(sp) });

beforeEach(() => {
  mockMarquer.mockReset();
  mockResoudre.mockReset();
  // La forme réelle rendue par `resoudreRapport` : la page lit `res.donnees`.
  // Le rendu lui-même est testé chez lui — ici on ne juge que le compteur.
  mockResoudre.mockResolvedValue({
    ok: true,
    donnees: { nomEntreprise: "Clim Ouest", audit: {}, content: {}, siteUrl: null },
  });
});

describe("/rapport/{jeton} — le compteur de vues", () => {
  it("compte l’ouverture d’une URL NUE : c’est celle qui part chez le prospect", async () => {
    await ouvrir();
    expect(mockMarquer).toHaveBeenCalledTimes(1);
    expect(mockMarquer).toHaveBeenCalledWith(CLIENT, JETON);
  });

  it("ne compte PAS une ouverture marquée interne — le cas des trois écrans du CRM", async () => {
    await ouvrir({ [PARAM_TRAFIC_INTERNE]: "1" });
    expect(mockMarquer).not.toHaveBeenCalled();
  });

  it("ne compte pas non plus quand le marqueur vaut 0 : la présence suffit à dire « c’est nous »", async () => {
    // `?sama_interne=0` sert à SE DÉMARQUER sur un poste partagé ; il n'arrive
    // jamais sur un lien envoyé. Le compter serait un piège pour l'agent qui
    // vient précisément de dire « ne me compte pas ».
    await ouvrir({ [PARAM_TRAFIC_INTERNE]: "0" });
    expect(mockMarquer).not.toHaveBeenCalled();
  });

  it("sert le même document dans les deux cas — la garde ne touche QUE le compteur", async () => {
    const nu = await ouvrir();
    const interne = await ouvrir({ [PARAM_TRAFIC_INTERNE]: "1" });
    expect(React.isValidElement(nu)).toBe(true);
    expect(React.isValidElement(interne)).toBe(true);
    expect((interne as React.ReactElement).type).toBe((nu as React.ReactElement).type);
  });

  it("`?complet` reste lu, et il ne dispense pas de compter", async () => {
    await ouvrir({ complet: "" });
    expect(mockMarquer).toHaveBeenCalledTimes(1);
  });

  it("un jeton mort ne compte rien et ne jette pas", async () => {
    mockResoudre.mockResolvedValue({ ok: false, raison: "introuvable" });
    const rendu = await ouvrir();
    expect(mockMarquer).not.toHaveBeenCalled();
    expect(React.isValidElement(rendu)).toBe(true);
  });
});
