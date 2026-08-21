/**
 * Pourquoi une entreprise n'avance pas — et l'ORDRE de lecture des causes.
 *
 * Le test qui compte est celui de la priorité : une inscription retenue par une
 * séquence en brouillon ne doit pas s'annoncer « il manque la démo ». Les deux
 * sont vrais, mais un seul est le blocage du jour, et se tromper envoie
 * fabriquer un site pour rien.
 */
import { blocageDe, parUrgence, piecesManquantes, type LigneContenu } from "@/lib/lots/contenu";

const ligne = (over: Partial<LigneContenu> = {}): LigneContenu => ({
  entreprise_id: 1,
  nom: "2B Clim",
  ville: "Mions",
  a_siret: true,
  a_donnees: true,
  a_constat: true,
  a_demo: true,
  a_audit: true,
  proprietaire: "Matteo Sallami",
  sequence: "S1 — Premier contact",
  etape: "wa1",
  etape_genre: "whatsapp",
  rang: 1,
  inscription_statut: "active",
  hold_reason: null,
  next_run_at: "2026-08-22T09:00:00Z",
  garee: false,
  tache_genre: null,
  tache_echeance: null,
  ...over,
});

describe("blocageDe", () => {
  it("annonce la tâche ouverte avant tout le reste", () => {
    // Elle attend un geste aujourd'hui : c'est la seule chose à dire.
    const b = blocageDe(ligne({ tache_genre: "whatsapp", hold_reason: "sequence_paused" }));
    expect(b.marche).toBe("a_faire");
    expect(b.libelle).toContain("whatsapp");
  });

  it("préfère le motif du régulateur à la pièce manquante", () => {
    // LE test du fichier. Les deux sont vrais ; seul le premier est le blocage
    // du jour, et l'autre enverrait fabriquer un site pour rien.
    const b = blocageDe(ligne({ hold_reason: "sequence_paused", a_demo: false, garee: true }));
    expect(b.marche).toBe("bloquee");
    expect(b.libelle).toBe("séquence en pause");
    expect(b.quoiFaire).toContain("Activer la séquence");
  });

  it("distingue l'attente de réponse d'un blocage", () => {
    // La séquence fait exactement ce qu'on lui a demandé : ce n'est pas une panne.
    expect(blocageDe(ligne({ hold_reason: "awaiting_reply" })).marche).toBe("attente");
  });

  it("nomme la pièce manquante quand rien d'autre ne retient", () => {
    const b = blocageDe(ligne({ garee: true, a_demo: false }));
    expect(b.marche).toBe("garee");
    expect(b.libelle).toContain("démo");
    expect(b.quoiFaire).toContain("Fabriquer les démos");
  });

  it("dit « hors séquence » avant toute autre lecture", () => {
    // Sans inscription, ni étape ni motif n'existent : parler d'un blocage de
    // séquence sur une entreprise qui n'y est pas serait un contresens.
    const b = blocageDe(ligne({ sequence: null, tache_genre: "call", hold_reason: "no_email" }));
    expect(b.marche).toBe("hors_sequence");
  });

  it("ne conseille rien sur un motif qui se règle tout seul", () => {
    // « Plafond du jour atteint » se résout demain matin ; y écrire un conseil
    // ferait chercher une action là où il faut attendre.
    expect(blocageDe(ligne({ hold_reason: "daily_cap" })).quoiFaire).toBe("");
  });

  it("laisse « en file » ce qui avance normalement", () => {
    expect(blocageDe(ligne()).marche).toBe("en_file");
    expect(blocageDe(ligne()).quoiFaire).toBe("");
  });
});

describe("piecesManquantes", () => {
  it("rend les manques dans l'ordre du plan", () => {
    expect(piecesManquantes(ligne({ a_demo: false, a_siret: false }))).toEqual(["siret", "demo"]);
  });

  it("compte l'absence de propriétaire et de séquence", () => {
    expect(piecesManquantes(ligne({ proprietaire: null, sequence: null }))).toEqual([
      "proprietaire",
      "sequence",
    ]);
  });

  it("ne rend rien quand tout est là", () => {
    expect(piecesManquantes(ligne())).toEqual([]);
  });
});

describe("parUrgence", () => {
  it("met ce qui demande un geste devant ce qui tourne tout seul", () => {
    const faire = { nom: "Zèbre", blocage: blocageDe(ligne({ tache_genre: "call" })) };
    const file = { nom: "Alpha", blocage: blocageDe(ligne()) };
    const bloque = { nom: "Bravo", blocage: blocageDe(ligne({ hold_reason: "no_email" })) };
    expect(parUrgence([file, bloque, faire]).map((x) => x.nom)).toEqual(["Zèbre", "Bravo", "Alpha"]);
  });

  it("départage à égalité par le nom, en français", () => {
    const a = { nom: "Élan", blocage: blocageDe(ligne()) };
    const b = { nom: "Eagle", blocage: blocageDe(ligne()) };
    expect(parUrgence([a, b]).map((x) => x.nom)).toEqual(["Eagle", "Élan"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const entree = [{ nom: "B", blocage: blocageDe(ligne()) }, { nom: "A", blocage: blocageDe(ligne()) }];
    const copie = [...entree];
    parUrgence(entree);
    expect(entree).toEqual(copie);
  });
});
