import { niveauDeNote, LIBELLE_NIVEAU } from "../mesures";
import { libelleDeNote } from "@/lib/audit-site/score";

/**
 * Les axes disent OÙ ça coince, plus DE COMBIEN.
 *
 * Six notes sur 100 autour d'une septième invitaient à une addition qui ne
 * retombait pas sur le grand nombre — et le prospect fait cette addition, c'est
 * même la première chose qu'il fait. Un seul chiffre vit désormais sur la page.
 *
 * LA RÈGLE EST STRUCTURELLE, et c'est elle que ces tests protègent : soit tous
 * les axes portent un chiffre, soit aucun. Le retirer des seuls axes flatteurs
 * ferait du document un argumentaire, ce qui se voit à la première question.
 */
describe("niveauDeNote", () => {
  it("range chaque note dans les quatre niveaux", () => {
    expect(niveauDeNote(100)).toBe("bon");
    expect(niveauDeNote(85)).toBe("bon");
    expect(niveauDeNote(84)).toBe("correct");
    expect(niveauDeNote(70)).toBe("correct");
    expect(niveauDeNote(69)).toBe("mediocre");
    expect(niveauDeNote(50)).toBe("mediocre");
    expect(niveauDeNote(49)).toBe("mauvais");
    expect(niveauDeNote(0)).toBe("mauvais");
  });

  /**
   * Un seul barème, deux vocabulaires. `libelleDeNote` sert au badge du CRM et
   * découpe en cinq ; le document en montre quatre. Les frontières doivent
   * rester les mêmes, sinon un site « Perfectible » côté CRM s'afficherait
   * « Correct » côté prospect, et on ne saurait plus lequel croire.
   */
  it("partage ses frontières avec le libellé du CRM", () => {
    expect(libelleDeNote(85)).toBe("Excellent");
    expect(libelleDeNote(70)).toBe("Bon");
    expect(libelleDeNote(50)).toBe("Perfectible");
    // Sous 50, le CRM distingue « Faible » de « Critique » ; le document s'arrête
    // à « Mauvais ». Une nuance de plus ne changerait rien à ce qu'on en fait.
    expect(niveauDeNote(49)).toBe(niveauDeNote(10));
  });

  it("nomme les niveaux en mots que l'artisan lit sans traduction", () => {
    expect(Object.values(LIBELLE_NIVEAU)).toEqual(["Bon", "Correct", "Médiocre", "Mauvais"]);
  });
});
