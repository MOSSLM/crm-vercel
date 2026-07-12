import { hydrateReviews, computeInitials } from "../hydrate-reviews";

describe("computeInitials", () => {
  it("prend la 1re lettre des deux premiers mots", () => {
    expect(computeInitials("Marie Lefèvre")).toBe("ML");
    expect(computeInitials("Marie L.")).toBe("ML");
    expect(computeInitials("jean dupont martin")).toBe("JD");
  });
  it("gère un seul mot et le vide", () => {
    expect(computeInitials("Marie")).toBe("M");
    expect(computeInitials("")).toBe("");
    expect(computeInitials("   ")).toBe("");
  });
});

const GRID = `
<div class="reviews-grid" data-reviews>
  <article class="review-card" data-review-item>
    <div class="review-avatar" data-review-initials>XX</div>
    <p class="review-text" data-review-text>Exemple statique</p>
    <p class="review-author" data-review-author>Prénom N.</p>
    <div class="review-rating" data-review-stars>★★★★★</div>
  </article>
</div>`;

describe("hydrateReviews", () => {
  it("génère une carte par avis avec nom, texte et initiales", () => {
    const reviews = JSON.stringify([
      { name: "Marie Lefèvre", text: "Super travail", rating: 5 },
      { name: "Paul D.", text: "Rapide et soigné", rating: 5 },
    ]);
    const out = hydrateReviews(GRID, reviews);
    expect(out.match(/data-review-item/g)?.length).toBe(2);
    expect(out).toContain("Marie Lefèvre");
    expect(out).toContain("Super travail");
    expect(out).toContain(">ML<");
    expect(out).toContain("Paul D.");
    expect(out).toContain(">PD<");
    // Le texte d'exemple statique a été remplacé.
    expect(out).not.toContain("Exemple statique");
  });

  it("échappe le HTML du contenu des avis", () => {
    const reviews = JSON.stringify([{ name: "A B", text: "<script>x</script>", rating: 5 }]);
    const out = hydrateReviews(GRID, reviews);
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>x");
  });

  it("garde les cartes d'exemple s'il n'y a aucun avis", () => {
    expect(hydrateReviews(GRID, JSON.stringify([]))).toBe(GRID);
    expect(hydrateReviews(GRID, undefined)).toBe(GRID);
  });

  it("ne touche pas un HTML sans grille data-reviews", () => {
    const html = "<section><p>Pas d'avis ici</p></section>";
    expect(hydrateReviews(html, JSON.stringify([{ name: "A B", text: "t" }]))).toBe(html);
  });
});
