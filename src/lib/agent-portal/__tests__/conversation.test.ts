import { stepIsInConversation, type ConversationStep } from "../conversation";

/**
 * La frontière premier contact / discussion.
 *
 * Ce qui est vérifié ici, surtout, c'est qu'elle ne bouge PAS dans le temps :
 * un premier contact envoyé le matin doit rester un premier contact quand le
 * prospect répond l'après-midi, sinon la journée se rouvre toute seule et
 * l'agent récupère des places qu'il a déjà consommées.
 */

/** Séquence type : accroche → on attend sa réponse → on envoie le site démo. */
const SEQ: ConversationStep[] = [
  { kind: "whatsapp" },
  { kind: "wait", waitMode: "reply" },
  { kind: "whatsapp" },
];

describe("stepIsInConversation", () => {
  it("classe le premier contact hors discussion", () => {
    expect(stepIsInConversation(SEQ, 0, { "1": "2026-08-14T09:00:00Z" })).toBe(false);
  });

  it("le laisse hors discussion même une fois que le prospect a répondu", () => {
    // LE cas qui compte. Il a répondu à 14 h : l'accroche de 9 h a bel et bien
    // consommé une place du démarchage du jour, et doit continuer de la
    // consommer. Sinon le compteur « 3/20 » redescend tout seul.
    const apresReponse = { "1": "2026-08-14T14:00:00Z" };
    expect(stepIsInConversation(SEQ, 0, apresReponse)).toBe(false);
  });

  it("classe en discussion l'étape qui suit une attente-réponse levée", () => {
    expect(stepIsInConversation(SEQ, 2, { "1": "2026-08-14T14:00:00Z" })).toBe(true);
  });

  it("ne la classe PAS en discussion tant que personne n'a répondu", () => {
    // L'attente a expiré (`replyTimeoutDays`) et la séquence a repris seule :
    // ce message est une relance à froid, il rentre dans le quota.
    expect(stepIsInConversation(SEQ, 2, {})).toBe(false);
  });

  it("ignore une attente qui n'attend PAS une réponse", () => {
    const delai: ConversationStep[] = [
      { kind: "whatsapp" },
      { kind: "wait", waitMode: "days" },
      { kind: "whatsapp" },
    ];
    expect(stepIsInConversation(delai, 2, { "1": "2026-08-14T14:00:00Z" })).toBe(false);
  });

  it("reconnaît une étape de la branche « il a répondu », sans rien lire d'autre", () => {
    const branche: ConversationStep[] = [
      { kind: "whatsapp" },
      { kind: "wait", waitMode: "reply" },
      { kind: "whatsapp", branch: { waitId: "w1", on: "reply" } },
      { kind: "whatsapp", branch: { waitId: "w1", on: "timeout" } },
    ];
    expect(stepIsInConversation(branche, 2, {})).toBe(true);
    // La branche « il n'a pas répondu » reste du démarchage : c'est une relance.
    expect(stepIsInConversation(branche, 3, {})).toBe(false);
  });

  it("ne regarde que les attentes SITUÉES AVANT l'étape", () => {
    const deuxAttentes: ConversationStep[] = [
      { kind: "whatsapp" },
      { kind: "wait", waitMode: "reply" },
      { kind: "whatsapp" },
      { kind: "wait", waitMode: "reply" },
    ];
    // La réponse enregistrée est celle de l'attente n° 3, qui vient APRÈS
    // l'étape 0 : elle ne peut pas la rétro-classer.
    expect(stepIsInConversation(deuxAttentes, 0, { "3": "2026-08-14T14:00:00Z" })).toBe(false);
  });

  it("répond faux sur une étape introuvable plutôt que de deviner", () => {
    expect(stepIsInConversation(SEQ, -1, { "1": "x" })).toBe(false);
    expect(stepIsInConversation(SEQ, 99, { "1": "x" })).toBe(false);
    expect(stepIsInConversation([], 0, {})).toBe(false);
  });
});
