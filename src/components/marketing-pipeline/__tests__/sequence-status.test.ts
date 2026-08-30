/**
 * L'écran doit poser la MÊME condition que le moteur : `status === 'on'`.
 *
 * C'est la moitié qui manquait — le tableau proposait un brouillon comme une
 * séquence en service, et l'inscription mourait sur un 409 que rien ne
 * traduisait. Ces tests tiennent les deux bouts : la règle, et ce qu'on en dit.
 */
import { aDemarcher, inscriptionFinLabel, inscriptionVivante, rienRecu, sequenceEtatLabel, sequenceLancable, sequenceOptionLabel } from "../types";
import { errorLabel } from "@/lib/sales-pipeline/error-labels";

describe("sequenceLancable", () => {
  it("n'accepte que les séquences activées", () => {
    expect(sequenceLancable({ status: "on" })).toBe(true);
    for (const status of ["draft", "paused", "off", "error", ""]) {
      expect(sequenceLancable({ status })).toBe(false);
    }
  });
});

describe("inscriptionVivante", () => {
  /**
   * La régression qui a motivé ces deux fonctions : un prospect passé en
   * rendez-vous sort de sa séquence, son inscription passe à `finished`, et le
   * tableau — qui ne lisait que les vivantes — le remettait dans « pas encore
   * en séquence », le stock qu'on attribue à un agent. Il repartait donc en
   * démarchage le lendemain de sa dernière relance.
   */
  it("ne compte que ce qui travaille encore", () => {
    expect(inscriptionVivante({ status: "active" })).toBe(true);
    expect(inscriptionVivante({ status: "paused" })).toBe(true);
  });

  it("une séquence terminée n'est pas une séquence en cours", () => {
    for (const status of ["finished", "replied", "exited"]) {
      expect(inscriptionVivante({ status })).toBe(false);
    }
  });

  it("mais « terminée » n'est pas « jamais inscrite » — c'est tout le sujet", () => {
    const finie = { status: "finished" };
    expect(inscriptionVivante(finie)).toBe(false);
    expect(finie).not.toBeNull();
    expect(inscriptionVivante(null)).toBe(false);
    expect(inscriptionVivante(undefined)).toBe(false);
  });
});

describe("inscriptionFinLabel", () => {
  it("se tait tant que l'inscription court", () => {
    expect(inscriptionFinLabel("active")).toBeNull();
    expect(inscriptionFinLabel("paused")).toBeNull();
  });

  it("distingue les trois fins — elles ne se relancent pas pareil", () => {
    expect(inscriptionFinLabel("finished")).toBe("séquence terminée");
    expect(inscriptionFinLabel("replied")).toBe("a répondu");
    expect(inscriptionFinLabel("exited")).toBe("sortie de séquence");
  });

  it("nomme le motif de sortie quand on le connaît", () => {
    expect(inscriptionFinLabel("exited", "hors_canal")).toBe("pas joignable sur ce canal");
    expect(inscriptionFinLabel("exited", "stop")).toBe("arrêtée — le prospect a dit non");
    expect(inscriptionFinLabel("exited", "reattribution")).toBe("retirée à son agent");
  });
});

describe("aDemarcher", () => {
  /** Un prospect qu'on n'a jamais touché — le cas ordinaire du stock. */
  const intact = (sequence: { status: string; exitReason?: string | null } | null) => ({
    sequence,
    premiereTouche: null,
  });

  /**
   * LA LIGNE DE PARTAGE. Ce n'est pas « a une inscription », c'est « a reçu
   * quelque chose ». Un numéro sans compte WhatsApp sort de la séquence sans
   * qu'un seul message soit parti : ce prospect est intact, il appartient au
   * stock qu'on attribue. Celui qui a dit non, non.
   */
  it("le stock, c'est jamais inscrite ET sortie sans que rien ne parte", () => {
    expect(aDemarcher(intact(null))).toBe(true);
    expect(aDemarcher({ sequence: null })).toBe(true);
    expect(aDemarcher(intact({ status: "exited", exitReason: "hors_canal" }))).toBe(true);
    expect(aDemarcher(intact({ status: "exited", exitReason: "reattribution" }))).toBe(true);
  });

  it("un prospect qui a dit non n'y retourne pas", () => {
    expect(aDemarcher(intact({ status: "exited", exitReason: "stop" }))).toBe(false);
    expect(aDemarcher(intact({ status: "exited", exitReason: "archive" }))).toBe(false);
  });

  it("une séquence menée à son terme n'est pas du stock", () => {
    expect(aDemarcher(intact({ status: "finished", exitReason: null }))).toBe(false);
    expect(aDemarcher(intact({ status: "replied", exitReason: null }))).toBe(false);
  });

  it("une inscription vivante non plus — elle travaille", () => {
    expect(aDemarcher(intact({ status: "active", exitReason: null }))).toBe(false);
    expect(aDemarcher(intact({ status: "paused", exitReason: null }))).toBe(false);
  });

  it("un motif inconnu vaut arrêt — on préfère oublier que relancer un refus", () => {
    expect(aDemarcher(intact({ status: "exited", exitReason: null }))).toBe(false);
    expect(aDemarcher(intact({ status: "exited", exitReason: "motif_futur" }))).toBe(false);
  });

  /**
   * LE TEST QUI COMPTE, et le motif de la correction du 20/08/2026.
   *
   * `reattribution` dit qu'on a retiré le prospect à son agent. Il ne dit RIEN
   * de ce qui était parti avant : un lead à sa quatrième relance en ressort
   * avec exactement le même motif qu'un lead jamais contacté. Sans
   * `premiereTouche`, on lui réenverrait l'accroche.
   *
   * Le cas ne mord pas encore — aucune inscription n'est en `reattribution` en
   * base — mais il mordra dès la première désattribution.
   */
  it("un prospect déjà touché ne retourne JAMAIS au stock, quel que soit le motif", () => {
    const touche = "2026-08-12T09:30:00.000Z";
    expect(aDemarcher({ sequence: { status: "exited", exitReason: "reattribution" }, premiereTouche: touche })).toBe(false);
    expect(aDemarcher({ sequence: { status: "exited", exitReason: "hors_canal" }, premiereTouche: touche })).toBe(false);
    // Même sans aucune inscription : les 640 appels du parc n'appartiennent à
    // aucune séquence, et ils ont pourtant bien eu lieu.
    expect(aDemarcher({ sequence: null, premiereTouche: touche })).toBe(false);
  });

  /** Une réponse d'API antérieure au 20/08 ne porte pas le champ. */
  it("sans la trace de touche, la règle d'avant s'applique telle quelle", () => {
    expect(aDemarcher({ sequence: { status: "exited", exitReason: "hors_canal" } })).toBe(true);
  });
});

/**
 * « RIEN REÇU » N'EST PAS « À DÉMARCHER » INVERSÉ, et c'est tout l'objet de
 * cette fonction. Le dégel du 30/08/2026 l'a rendu visible : 431 inscriptions
 * actives, toutes à l'étape 0, zéro e-mail, zéro message. `aDemarcher` les
 * sortait du stock — elles ont une inscription vivante — alors que personne ne
 * leur avait jamais rien dit. L'écran montrait 141 lignes « à démarcher » quand
 * 581 fiches n'avaient rien reçu.
 */
describe("rienRecu", () => {
  it("une inscription vivante qui n'a rien envoyé n'a RIEN envoyé", () => {
    const gelee = { sequence: { status: "active", lastEmailAt: null }, premiereTouche: null };
    expect(rienRecu(gelee)).toBe(true);
    // Et c'est bien là que les deux réponses divergent.
    expect(aDemarcher(gelee)).toBe(false);
  });

  /**
   * LA PREUVE QUI PORTE AUJOURD'HUI. Aucun e-mail de séquence n'est encore
   * parti (0 `last_email_at` en base au 30/08/2026) alors que 193 entreprises
   * ont reçu quelque chose : tout passe par la main des agents, donc par
   * `email_logs`. Un `rienRecu` qui ne lirait que l'inscription se réduirait à
   * `premiereTouche` et raterait chaque WhatsApp envoyé hors tâche.
   */
  it("un WhatsApp sortant compte, même sans inscription ni tâche bouclée", () => {
    expect(rienRecu({ sequence: null, premierEnvoiLe: "2026-08-19T14:02:00.000Z" })).toBe(false);
  });

  it("un e-mail de séquence compte, même si elle court encore", () => {
    expect(rienRecu({ sequence: { status: "active", lastEmailAt: "2026-08-21T08:00:00.000Z" } })).toBe(false);
  });

  it("un geste d'agent compte, même sans aucune inscription", () => {
    expect(rienRecu({ sequence: null, premiereTouche: "2026-08-12T09:30:00.000Z" })).toBe(false);
  });

  it("sans inscription, sans touche et sans envoi, rien n'est parti", () => {
    expect(rienRecu({ sequence: null, premiereTouche: null, premierEnvoiLe: null })).toBe(true);
  });

  /**
   * Une réponse d'API antérieure au 30/08 ne porte pas `lastEmailAt`. On ne
   * fabrique pas un envoi qu'on ne sait pas prouver : le champ absent se lit
   * comme « pas d'e-mail », et c'est `premiereTouche` qui tranche seule.
   */
  it("sans les champs récents, la touche d'agent tranche seule", () => {
    expect(rienRecu({ sequence: { status: "active" } })).toBe(true);
    expect(rienRecu({ sequence: { status: "active" }, premiereTouche: "2026-08-12T09:30:00.000Z" })).toBe(false);
  });
});
