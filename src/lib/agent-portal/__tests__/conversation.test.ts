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
      { id: "s0", kind: "whatsapp" },
      { id: "w1", kind: "wait", waitMode: "reply" },
      { id: "s2", kind: "whatsapp", branch: { waitId: "w1", on: "reply" } },
      { id: "s3", kind: "whatsapp", branch: { waitId: "w1", on: "timeout" } },
    ];
    expect(stepIsInConversation(branche, 2, {})).toBe(true);
    // La branche « il n'a pas répondu » reste du démarchage : c'est une relance.
    expect(stepIsInConversation(branche, 3, {})).toBe(false);
  });

  /* ── `on` est un nom de sortie, pas un sens ─────────────────────────────── */

  it("ne prend PAS la voie « oui » d'une condition pour une réponse du prospect", () => {
    // LE bug du 28/08/2026. « S1 — Premier contact » commence par une condition
    // (« a-t-il un mobile ? ») dont la voie oui porte `on: 'reply'` — c'est le
    // nom de la première sortie, pas une réponse. Le tout premier WhatsApp était
    // donc classé « en discussion » : rangé dans l'onglet des relances, et
    // exempté du quota du jour.
    const s1: ConversationStep[] = [
      { id: "waQ", kind: "condition" },
      { id: "wa1", kind: "whatsapp", branch: { waitId: "waQ", on: "reply" } },
    ];
    expect(stepIsInConversation(s1, 1, {})).toBe(false);
  });

  it("ne prend pas davantage un cas d'aiguillage pour une réponse", () => {
    const aiguillage: ConversationStep[] = [
      { id: "q", kind: "condition" },
      { id: "c1", kind: "whatsapp", branch: { waitId: "q", on: "reply" } },
      { id: "c2", kind: "call", branch: { waitId: "q", on: "c2" } },
      { id: "cs", kind: "email", branch: { waitId: "q", on: "sinon" } },
    ];
    expect(stepIsInConversation(aiguillage, 1, {})).toBe(false);
    expect(stepIsInConversation(aiguillage, 2, {})).toBe(false);
    expect(stepIsInConversation(aiguillage, 3, {})).toBe(false);
  });

  it("classe en premier contact une voie dont la fourche a disparu", () => {
    // Voie orpheline : le cas a été supprimé de la séquence. On ne devine pas —
    // et le défaut prudent est « premier contact », qui consomme une place. Ne
    // pas la compter fausserait la cadence sans que rien ne le dise.
    const orpheline: ConversationStep[] = [
      { id: "s0", kind: "whatsapp" },
      { id: "s1", kind: "whatsapp", branch: { waitId: "disparue", on: "reply" } },
    ];
    expect(stepIsInConversation(orpheline, 1, {})).toBe(false);
  });

  it("reste vrai sur la voie « il a répondu » d'une attente imbriquée dans une condition", () => {
    // Une attente peut vivre DANS la voie d'une condition : ce qui la suit sur
    // sa sortie « reply » reste une vraie discussion.
    const imbriquee: ConversationStep[] = [
      { id: "q", kind: "condition" },
      { id: "wa", kind: "whatsapp", branch: { waitId: "q", on: "reply" } },
      { id: "w", kind: "wait", waitMode: "reply", branch: { waitId: "q", on: "reply" } },
      { id: "suite", kind: "whatsapp", branch: { waitId: "w", on: "reply" } },
    ];
    expect(stepIsInConversation(imbriquee, 1, {})).toBe(false);
    expect(stepIsInConversation(imbriquee, 3, {})).toBe(true);
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
