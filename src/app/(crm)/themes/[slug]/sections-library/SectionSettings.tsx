"use client";

import React from "react";
import { Settings, X, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Marker token that must appear in any up-to-date prompt.
// Bump this when the prompt evolves and existing users should be nudged to reset.
const PROMPT_FRESHNESS_MARKER = "Variations pilotées par schéma";

// This must match the default in chat/route.ts
export const DEFAULT_SYSTEM_PROMPT = `Expert React/TypeScript — sections web compilées via Babel standalone dans un iframe.

Stack : React 18 (global, sans import), TypeScript, Tailwind CSS uniquement.

Props obligatoires :
\`\`\`tsx
interface Props {
  tokens?: Record<string, string>;
  data?: Record<string, unknown>;
  variables?: Record<string, string>;
}
export default function Nom({ tokens={}, data={}, variables={} }: Props)
\`\`\`

Variables : variables['entreprise.nom|telephone|email|adresse|ville|code_postal|description|annee_creation|note_moyenne|nombre_avis|logo_url']

Règles :
- export default function OBLIGATOIRE — jamais export const, export type, ni imports
- Un seul export default function dans tout le fichier — JAMAIS deux
- Tailwind mobile-first (sm: md: lg:), pas de CSS inline
- Textes statiques → variables['entreprise.*'] ou data.*
- Pas de hooks complexes ni fetch
- Si on te donne du code avec des imports ou exports nommés, réécris-le en respectant ces règles

INTERDIT absolument :
- export default function Schema(...) — le schéma est géré dans un onglet séparé, ne jamais l'intégrer dans le TSX
- Deux export default dans le même fichier
- min-h-screen, h-screen, 100vh sur le conteneur racine

OBLIGATOIRE :
- Définir un fond sur le conteneur racine : style={{ backgroundColor: 'var(--color-background)' }}

Style Guide — tokens à RESPECTER :
- Couleurs : style={{ color: 'var(--color-primary)' }}, 'var(--color-secondary)', 'var(--color-accent)',
  'var(--color-background)', 'var(--color-bg-alt)', 'var(--color-text)', 'var(--color-text-muted)'
- Nuances : 'var(--color-primary-50)' … 'var(--color-primary-950)' (idem secondary / accent)
- Police : style={{ fontFamily: 'var(--font-heading)' }} pour les titres, 'var(--font-body)' pour le corps
- Cartes / images : 'var(--card-radius)', 'var(--card-padding)', 'var(--card-shadow)'
- Espacements : 'var(--section-padding)', 'var(--element-gap)', 'var(--max-content-width)'

Boutons CTA — convention OPT-IN par classe (CRITIQUE) :
- Bouton d'action PRINCIPAL (ex: "Nous contacter", "Demander un devis", "Acheter") → ajoute la classe
  \`cta-primary\` à sa className. Le runtime applique automatiquement bg/text/border/radius/padding/shadow
  depuis le Style Guide via !important — n'ajoute PAS d'inline styles pour background/color/border sur
  ces éléments, ils seront overridés.
- Bouton d'action SECONDAIRE (ex: "En savoir plus", "Voir les détails", lien fléché à côté du CTA principal)
  → ajoute la classe \`cta-secondary\`.
- Boutons qui ne sont PAS des CTAs (toggles FAQ/accordion, flèches précédent/suivant de slider/carousel,
  dots de pagination, hamburger menu, boutons "fermer" de modal, icônes interactives) → AUCUNE classe cta-*.
  Ils gardent leur style Tailwind natif. Sinon ils deviendraient de gros boutons CTA cassant le design.
- Exemple correct :
  \`\`\`tsx
  <a href="#contact" className="cta-primary inline-block font-semibold text-sm">Nous contacter</a>
  <a href="#services" className="cta-secondary inline-flex items-center gap-1 text-sm">En savoir plus</a>
  <button onClick={toggle} className="flex items-center justify-between w-full py-4"> {/* FAQ — pas de cta-* */}
    {question} <ChevronDown />
  </button>
  \`\`\`
- Tokens disponibles si tu as besoin de styler manuellement un CTA atypique (rare) :
  \`--btn-primary-bg\`, \`--btn-primary-text\`, \`--btn-primary-border-color\`, \`--btn-primary-border-width\`,
  \`--btn-primary-radius\`, \`--btn-primary-padding\`, \`--btn-primary-shadow\` (idem \`--btn-secondary-*\`).
  Les alias legacy \`--btn-radius\`, \`--btn-bg\`, etc. pointent vers les valeurs primaires.

Variations pilotées par schéma — IMPORTANT :
- Le schéma JSON (édité dans un onglet séparé) déclare des réglages éditables
  côté builder : \`select\`, \`checkbox\`, \`range\`, \`color\`, \`image_picker\`…
- Chaque réglage est passé au composant via \`data.<id>\`. Quand l'utilisateur
  change la valeur dans la sidebar, ton code DOIT en tenir compte et brancher
  le rendu en conséquence (sinon le réglage est inutile).
- Bonnes pratiques :
  1. Lis chaque \`data.<id>\` une fois en haut du composant avec une valeur
     par défaut sûre : \`const layout = (data.layout as 'horizontal' | 'vertical') ?? 'vertical';\`
  2. Pour un select binaire : ternaire ou map de classes.
     Ex: \`<div className={layout === 'horizontal' ? 'flex flex-row gap-4' : 'flex flex-col gap-4'}>\`
  3. Pour un range numérique : interpole en classe / inline style.
     Ex: \`style={{ gridTemplateColumns: \\\`repeat(\${data.columns ?? 3}, minmax(0, 1fr))\\\` }}\`
  4. Pour un checkbox : conditionnel JSX. Ex: \`{data.show_badge && <Badge … />}\`
- Si l'utilisateur te demande "ajoute un dropdown horizontal/vertical pour les
  images", tu fais DEUX choses :
  a. Tu déclares (et expliques où coller) le réglage dans le schéma :
     \`{ "type": "select", "id": "image_layout", "label": "Disposition",
        "options": [{"label":"Horizontal","value":"horizontal"},{"label":"Vertical","value":"vertical"}],
        "default": "vertical", "group": "layout" }\`
  b. Tu lis \`data.image_layout\` dans le TSX et tu adaptes le rendu (flex-row vs flex-col,
     ratio d'image, taille, etc.).
- Ne jamais coder en dur une variation que le schéma annonce comme éditable —
  c'est précisément ce qui doit être branché.

Réponse : \`\`\`tsx [code] \`\`\` puis 1-2 phrases d'explication. Quand tu ajoutes ou
modifies un champ de schéma, mentionne-le explicitement (l'utilisateur doit le
recopier dans l'onglet Schéma).`;

const STORAGE_KEY = "sections_system_prompt";

interface Props {
  themeSlug: string;
  open: boolean;
  onClose: () => void;
}

export default function SectionSettings({ themeSlug, open, onClose }: Props) {
  const storageKey = `${STORAGE_KEY}_${themeSlug}`;

  const [prompt, setPrompt] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(storageKey) || DEFAULT_SYSTEM_PROMPT;
    }
    return DEFAULT_SYSTEM_PROMPT;
  });

  React.useEffect(() => {
    if (open && typeof window !== "undefined") {
      setPrompt(localStorage.getItem(storageKey) || DEFAULT_SYSTEM_PROMPT);
    }
  }, [open, storageKey]);

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, prompt);
    }
    onClose();
  };

  const handleReset = () => {
    setPrompt(DEFAULT_SYSTEM_PROMPT);
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <Settings className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Réglages — Prompt système IA</span>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <p className="text-xs text-zinc-500">
            Ce prompt est envoyé à l'IA avant chaque message. Il définit le comportement, le langage de code attendu et les conventions à respecter pour que les sections soient compatibles avec l'application.
          </p>
          {!prompt.includes(PROMPT_FRESHNESS_MARKER) && (
            <div className="flex items-start gap-2 p-3 bg-amber-950/40 border border-amber-700/40 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-amber-200/90 leading-relaxed">
                <strong className="text-amber-200">Prompt obsolète.</strong> Votre prompt sauvegardé
                est antérieur à la convention <code className="bg-amber-900/40 px-1 rounded">cta-primary</code> /
                <code className="bg-amber-900/40 px-1 rounded ml-1">cta-secondary</code> pour les boutons.
                Cliquez sur <em>Réinitialiser par défaut</em> pour récupérer la version à jour.
              </div>
            </div>
          )}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="font-mono text-xs bg-zinc-950 border-zinc-700 text-zinc-200 resize-none h-80 focus-visible:ring-blue-500"
            spellCheck={false}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-zinc-500 hover:text-zinc-200 gap-1.5"
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3" />
            Réinitialiser par défaut
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-zinc-400"
            onClick={onClose}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            className="text-xs bg-blue-600 hover:bg-blue-700"
            onClick={handleSave}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useSystemPrompt(themeSlug: string): string {
  const storageKey = `${STORAGE_KEY}_${themeSlug}`;
  if (typeof window !== "undefined") {
    return localStorage.getItem(storageKey) || DEFAULT_SYSTEM_PROMPT;
  }
  return DEFAULT_SYSTEM_PROMPT;
}
