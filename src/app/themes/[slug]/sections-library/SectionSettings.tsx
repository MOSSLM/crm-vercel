"use client";

import React from "react";
import { Settings, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
- export default function obligatoire, pas d'imports React
- Tailwind mobile-first (sm: md: lg:), pas de CSS inline
- Textes statiques → variables['entreprise.*'] ou data.*
- Pas de hooks complexes ni fetch

Réponse : \`\`\`tsx [code] \`\`\` puis 1-2 phrases d'explication.`;

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
