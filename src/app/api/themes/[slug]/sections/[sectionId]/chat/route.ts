import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Role = "user" | "assistant";
interface HistoryItem {
  role: Role;
  content: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const DEFAULT_SYSTEM_PROMPT = (sectionId: string) =>
  `Expert React/TypeScript — sections web compilées via Babel standalone dans un iframe.
Section en cours : "${sectionId}".

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

Style Guide — tokens à RESPECTER (sinon les réglages utilisateur ne s'appliquent pas) :
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; sectionId: string }> }
) {
  const { sectionId } = await params;

  let body: {
    model?: string;
    currentCode: string;
    message: string;
    history?: HistoryItem[];
    systemPrompt?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { currentCode, message, history = [], model = "claude-sonnet-4-6", systemPrompt } = body;

  if (!currentCode || !message) {
    return NextResponse.json(
      { error: "currentCode and message are required" },
      { status: 400 }
    );
  }

  const recentHistory = history.slice(-10);
  const resolvedSystemPrompt = systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT(sectionId);
  const userMessage = `Code actuel de la section "${sectionId}" :\n\`\`\`tsx\n${currentCode}\n\`\`\`\n\nDemande : ${message}`;

  const isGpt = model.startsWith("gpt-");

  try {
    if (isGpt) {
      const gptMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: resolvedSystemPrompt },
        ...recentHistory.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: userMessage },
      ];

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: resolveGptModel(model),
          max_tokens: 4096,
          messages: gptMessages,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!openaiRes.ok) {
        const err = await openaiRes.json();
        throw new Error(err.error?.message ?? "Erreur OpenAI");
      }

      const gptData = await openaiRes.json();
      const rawContent = gptData.choices?.[0]?.message?.content ?? "";
      const { newCode, explanation } = extractCodeAndExplanation(rawContent);
      return NextResponse.json({ newCode, explanation });
    }

    // Anthropic
    const anthropicModel = resolveAnthropicModel(model);
    const messages: Anthropic.MessageParam[] = [
      ...recentHistory.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userMessage },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await anthropic.messages.create(
        {
          model: anthropicModel,
          max_tokens: 4096,
          system: resolvedSystemPrompt,
          messages,
        },
        { signal: controller.signal }
      );

      clearTimeout(timeout);
      const rawContent =
        response.content[0]?.type === "text" ? response.content[0].text : "";
      const { newCode, explanation } = extractCodeAndExplanation(rawContent);
      return NextResponse.json({ newCode, explanation });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      return NextResponse.json(
        { error: "Timeout: l'IA n'a pas répondu dans les 30 secondes" },
        { status: 504 }
      );
    }
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function resolveAnthropicModel(model: string): string {
  const map: Record<string, string> = {
    "claude-sonnet-4-6": "claude-sonnet-4-6",
    "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3-opus": "claude-3-opus-20240229",
    "claude-opus-4-7": "claude-opus-4-7",
  };
  return map[model] ?? "claude-sonnet-4-6";
}

function resolveGptModel(model: string): string {
  const map: Record<string, string> = {
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-4-turbo": "gpt-4-turbo",
  };
  return map[model] ?? "gpt-4o";
}

function extractCodeAndExplanation(raw: string): {
  newCode: string;
  explanation: string;
} {
  const match = raw.match(/```(?:tsx?|jsx?|typescript)?\n?([\s\S]*?)```/);
  if (!match) {
    return { newCode: raw.trim(), explanation: "" };
  }
  const newCode = match[1].trim();
  const explanation = raw
    .slice(raw.indexOf(match[0]) + match[0].length)
    .trim();
  return { newCode, explanation };
}
