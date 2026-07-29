/**
 * Hydratation des chiffres clés pour le HTML brut d'un design Claude.
 *
 * Jusqu'ici les chiffres clés reposaient uniquement sur des tokens
 * `{{ entreprise.annee_experience }}` : un token mal orthographié — ou une
 * entreprise dont l'enrichissement n'a pas rempli la colonne — rendait une
 * chaîne VIDE, sans le moindre avertissement, laissant un libellé orphelin sous
 * un chiffre absent. C'est exactement le mode d'échec que les avis clients
 * évitent depuis longtemps grâce à leurs marqueurs `data-*`.
 *
 * Même contrat que `hydrate-reviews`, donc :
 *   - `data-stats`      → conteneur de la grille
 *   - `data-stat-item`  → carte-modèle (la 1re sert de gabarit, dupliquée)
 *   - `data-stat-value` → le chiffre
 *   - `data-stat-label` → le libellé
 *   - `data-stat-suffix`→ suffixe décoratif optionnel ("+", "ans"), conservé
 *
 * La source est `variables["__stats"]` (déjà résolu et trié par les deux
 * résolveurs : stats du projet → overrides du site → stats de l'entreprise).
 * Aucune stat exploitable → on laisse les cartes d'exemple du design en place :
 * un repli lisible vaut mieux qu'une grille vide.
 *
 * Même pipeline que `hydrate-reviews` (node-html-parser), pur, isomorphe.
 */
import { parse } from "node-html-parser";
import { stripDomPathStamps } from "./dom-paths";

interface StatData {
  label?: string;
  value?: string;
  display_order?: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Une stat est exploitable si elle a un chiffre ET un libellé. */
function usable(s: StatData): boolean {
  return typeof s?.value === "string" && s.value.trim() !== ""
    && typeof s?.label === "string" && s.label.trim() !== "";
}

function fillCard(cardHtml: string, stat: StatData): string {
  const root = parse(cardHtml);
  const value = (stat.value ?? "").trim();
  const label = (stat.label ?? "").trim();
  for (const el of root.querySelectorAll("[data-stat-value]")) el.set_content(escapeHtml(value));
  for (const el of root.querySelectorAll("[data-stat-label]")) el.set_content(escapeHtml(label));
  // `data-stat-suffix` est purement décoratif : on le laisse tel que le design
  // l'a écrit ("+", "ans", "%").
  return root.toString();
}

/**
 * Remplit chaque grille `[data-stats]` avec les chiffres fournis. Retourne le
 * HTML inchangé s'il n'y a pas de grille, pas de carte-modèle, ou aucune stat
 * exploitable.
 */
export function hydrateStats(html: string, statsJson: string | undefined | null): string {
  if (!html || !html.includes("data-stats")) return html;

  let stats: StatData[] = [];
  if (statsJson) {
    try {
      const parsed = JSON.parse(statsJson);
      if (Array.isArray(parsed)) stats = (parsed as StatData[]).filter(usable);
    } catch {
      /* JSON invalide → on garde les cartes d'exemple */
    }
  }
  if (stats.length === 0) return html;

  const root = parse(html);
  const grids = root.querySelectorAll("[data-stats]");
  if (grids.length === 0) return html;

  for (const grid of grids) {
    const template = grid.querySelector("[data-stat-item]");
    if (!template) continue;
    const templateHtml = template.toString();
    // Seule la 1re carte garde les tampons `data-cdp` du gabarit : deux nœuds ne
    // peuvent pas porter le même chemin (cf. claude-design/dom-paths.ts).
    const cards = stats
      .map((s, i) => (i === 0 ? fillCard(templateHtml, s) : stripDomPathStamps(fillCard(templateHtml, s))))
      .join("");
    grid.set_content(cards);
  }
  return root.toString();
}
