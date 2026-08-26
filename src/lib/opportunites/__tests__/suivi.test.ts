/**
 * Ce que la politique de suivi doit dire — et surtout ce qu'elle ne doit PAS dire.
 *
 * Les deux pièges que ces tests verrouillent :
 *   1. une opportunité jamais touchée n'est pas « qui pourrit » (elle serait
 *      majoritaire, et la liste deviendrait illisible dès le premier jour) ;
 *   2. le seuil suit l'étape (un devis muet depuis six jours est une alerte,
 *      une piste froide muette depuis six jours ne l'est pas).
 */

import {
  classer,
  seuilDeSilence,
  trierParUrgence,
  type LigneSuivi,
} from "../suivi";

const ligne = (over: Partial<LigneSuivi> = {}): LigneSuivi => ({
  opportunite_id: "o1",
  entreprise_id: 1,
  entreprise_nom: "Plomberie Dupont",
  ville: "Toulon",
  intitule: "Site vitrine",
  stage_id: 1,
  etape_nom: "Qualifié",
  etape_ordre: 10,
  montant: 1500,
  mrr: null,
  priorite: "moyenne",
  owner_id: null,
  prochaine_action: null,
  date_prochain_suivi: null,
  dernier_echange_le: "2026-08-20T10:00:00Z",
  jours_sans_echange: 2,
  jours_de_retard: null,
  creee_le: "2026-01-01T00:00:00Z",
  ...over,
});

describe("seuilDeSilence", () => {
  it("resserre le seuil à mesure que le prospect s'engage", () => {
    expect(seuilDeSilence("Lead trouvé")).toBe(30);
    expect(seuilDeSilence("Qualifié")).toBe(21);
    expect(seuilDeSilence("Approche")).toBe(7);
    expect(seuilDeSilence("Devis")).toBe(4);
    expect(seuilDeSilence("Négociation")).toBe(3);
  });

  it("lit le nom sans se laisser arrêter par les accents ni la casse", () => {
    expect(seuilDeSilence("NÉGOCIATION")).toBe(3);
    expect(seuilDeSilence("Rendez-vous pris")).toBe(5);
  });

  it("retombe sur un seuil moyen pour une étape que l'utilisateur a renommée", () => {
    // Les étapes sont modifiables : une étape inconnue doit être surveillée,
    // pas ignorée.
    expect(seuilDeSilence("Étape maison")).toBe(14);
    expect(seuilDeSilence(null)).toBe(14);
  });

  it("donne au nom composé le seuil de sa partie la plus engageante", () => {
    // « Relance devis » vaut un devis (4), pas une relance générique (14).
    expect(seuilDeSilence("Relance devis")).toBe(4);
  });
});

describe("classer", () => {
  it("place le retard sur échéance avant tout le reste", () => {
    expect(classer(ligne({ jours_de_retard: 3, jours_sans_echange: 0 }))).toBe("en_retard");
  });

  it("ne compte pas comme un retard une échéance encore à venir", () => {
    expect(classer(ligne({ jours_de_retard: -4, prochaine_action: "Rappeler" }))).toBe("ok");
  });

  it("signale le silence selon l'étape et pas selon une durée unique", () => {
    // Six jours de silence : alerte sur un devis, normal sur une piste froide.
    expect(classer(ligne({ etape_nom: "Devis", jours_sans_echange: 6 }))).toBe("qui_pourrit");
    expect(classer(ligne({ etape_nom: "Lead trouvé", jours_sans_echange: 6 }))).toBe("ok");
  });

  it("ne traite JAMAIS une opportunité jamais touchée comme pourrissante", () => {
    // `jours_sans_echange` nul = aucun échange n'a jamais eu lieu. C'est le cas
    // de la grande majorité du fichier : le confondre avec un abandon noierait
    // les vraies alertes.
    const jamaisTouchee = ligne({ etape_nom: "Devis", jours_sans_echange: null });
    expect(classer(jamaisTouchee)).toBe("ok");
  });

  it("réclame une prochaine action sur une affaire engagée, pas sur une piste", () => {
    expect(classer(ligne({ etape_nom: "Devis", jours_sans_echange: 1 }))).toBe(
      "sans_prochaine_action",
    );
    expect(classer(ligne({ etape_nom: "Lead trouvé", jours_sans_echange: 1 }))).toBe("ok");
  });

  it("tient une affaire pour suivie dès qu'une prochaine action est posée", () => {
    expect(
      classer(ligne({ etape_nom: "Devis", jours_sans_echange: 1, prochaine_action: "Rappeler" })),
    ).toBe("ok");
    // La date seule suffit aussi : c'est déjà un engagement daté.
    expect(
      classer(ligne({ etape_nom: "Devis", jours_sans_echange: 1, date_prochain_suivi: "2099-01-01" })),
    ).toBe("ok");
  });
});

describe("trierParUrgence", () => {
  it("ordonne par état, puis par retard, puis par ce qu'on perdrait", () => {
    const trie = trierParUrgence([
      ligne({ opportunite_id: "ok", etape_nom: "Devis", jours_sans_echange: 1, prochaine_action: "x" }),
      ligne({ opportunite_id: "retard-petit", jours_de_retard: 1, montant: 500 }),
      ligne({ opportunite_id: "retard-gros", jours_de_retard: 9, montant: 500 }),
      ligne({ opportunite_id: "silence", etape_nom: "Devis", jours_sans_echange: 20 }),
    ]);

    expect(trie.map((l) => l.opportunite_id)).toEqual([
      "retard-gros",
      "retard-petit",
      "silence",
      "ok",
    ]);
  });

  it("départage deux retards identiques par la valeur, récurrent compris", () => {
    const trie = trierParUrgence([
      ligne({ opportunite_id: "ponctuel", jours_de_retard: 2, montant: 3000, mrr: null }),
      // 100 € par mois pèsent 1200 € sur l'année : plus qu'un ponctuel à 3000 ?
      // Non — et le test fige ce choix plutôt que de le laisser à l'intuition.
      ligne({ opportunite_id: "abonnement", jours_de_retard: 2, montant: 0, mrr: 100 }),
    ]);

    expect(trie.map((l) => l.opportunite_id)).toEqual(["ponctuel", "abonnement"]);
  });
});
