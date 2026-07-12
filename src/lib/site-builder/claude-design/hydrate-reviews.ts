/**
 * Hydratation des avis clients pour le HTML brut d'un design Claude.
 *
 * Le design marque une grille d'avis avec `data-reviews`, une carte-modèle avec
 * `data-review-item`, et à l'intérieur les emplacements :
 *   - `data-review-author`   → nom affiché (ex. "Marie L.")
 *   - `data-review-text`     → texte de l'avis
 *   - `data-review-initials` → initiales calculées (1re lettre des 2 premiers
 *                              mots du nom) — remplace la photo de profil
 *   - `data-review-stars`    → étoiles pleines selon la note (optionnel)
 *
 * À l'affichage, la 1re `data-review-item` sert de modèle : on génère une carte
 * par avis de `lead_magnet_reviews` (transmis via `variables["__reviews"]`, déjà
 * résolu par resolveEnterpriseVariables). S'il n'y a aucun avis, on laisse les
 * cartes d'exemple statiques du design (repli).
 *
 * Même pipeline que `stripTaggedRegions` (node-html-parser), côté serveur, pur.
 */
import { parse } from "node-html-parser";

interface ReviewData {
  name?: string;
  text?: string;
  rating?: number;
}

/** Initiales : 1re lettre des deux premiers mots du nom, en majuscules.
 *  "Marie Lefèvre" → "ML" ; "Marie L." → "ML" ; "Jean" → "J". */
export function computeInitials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0].charAt(0);
  const second = words.length > 1 ? words[1].charAt(0) : "";
  return (first + second).toUpperCase();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fillCard(cardHtml: string, review: ReviewData): string {
  const root = parse(cardHtml);
  const name = typeof review.name === "string" ? review.name.trim() : "";
  const text = typeof review.text === "string" ? review.text.trim() : "";
  const rating = typeof review.rating === "number" && review.rating > 0
    ? Math.min(5, Math.round(review.rating))
    : 5;

  for (const el of root.querySelectorAll("[data-review-author]")) el.set_content(escapeHtml(name));
  for (const el of root.querySelectorAll("[data-review-text]")) el.set_content(escapeHtml(text));
  for (const el of root.querySelectorAll("[data-review-initials]")) el.set_content(escapeHtml(computeInitials(name)));
  for (const el of root.querySelectorAll("[data-review-stars]")) el.set_content("★".repeat(rating));
  return root.toString();
}

/**
 * Remplit chaque grille `[data-reviews]` avec les avis fournis. Retourne le HTML
 * inchangé s'il n'y a pas de grille, pas de carte-modèle, ou aucun avis.
 */
export function hydrateReviews(html: string, reviewsJson: string | undefined | null): string {
  if (!html.includes("data-reviews")) return html;

  let reviews: ReviewData[] = [];
  if (reviewsJson) {
    try {
      const parsed = JSON.parse(reviewsJson);
      if (Array.isArray(parsed)) reviews = parsed as ReviewData[];
    } catch {
      /* JSON invalide → on garde les exemples statiques */
    }
  }
  if (reviews.length === 0) return html;

  const root = parse(html);
  const grids = root.querySelectorAll("[data-reviews]");
  if (grids.length === 0) return html;

  for (const grid of grids) {
    const template = grid.querySelector("[data-review-item]");
    if (!template) continue;
    const templateHtml = template.toString();
    const cards = reviews.map((r) => fillCard(templateHtml, r)).join("");
    grid.set_content(cards);
  }
  return root.toString();
}
