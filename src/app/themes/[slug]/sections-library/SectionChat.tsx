"use client";

import React from "react";
import {
  Send,
  Loader2,
  CheckCheck,
  X,
  ChevronDown,
  Bot,
  User,
  Code2,
  Sparkles,
  Smartphone,
  Braces,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AI_MODELS, type AIModel, type ChatMessage } from "./types";
import { useSystemPrompt } from "./SectionSettings";

interface Props {
  themeSlug: string;
  sectionId: string | null;
  currentCode: string;
  onApplyCode: (code: string) => void;
  onApplySchema?: (schema: Record<string, unknown>) => void;
}

const QUICK_ACTIONS = [
  { id: "responsive", label: "Optimiser responsive", icon: Smartphone, prompt: "Optimise ce composant pour qu'il soit pleinement responsive (mobile-first). Ajoute les classes Tailwind nécessaires pour les breakpoints sm:, md:, lg:." },
  { id: "dynamic", label: "Rendre dynamique", icon: Braces, prompt: "Remplace les textes statiques par des variables entreprise appropriées (variables['entreprise.nom'], variables['entreprise.telephone'], etc.) et les données par des props data." },
  { id: "html", label: "Coller du HTML", icon: Code2, prompt: "" },
];

export default function SectionChat({
  themeSlug,
  sectionId,
  currentCode,
  onApplyCode,
  onApplySchema,
}: Props) {
  const systemPrompt = useSystemPrompt(themeSlug);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [model, setModel] = React.useState<AIModel>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sections_ai_model") as AIModel) || "claude-sonnet-4-6";
    }
    return "claude-sonnet-4-6";
  });
  const [htmlPasteMode, setHtmlPasteMode] = React.useState(false);
  const [pastedHtml, setPastedHtml] = React.useState("");
  const [htmlPasteMessage, setHtmlPasteMessage] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  };

  const handleModelChange = (m: AIModel) => {
    setModel(m);
    if (typeof window !== "undefined") {
      localStorage.setItem("sections_ai_model", m);
    }
  };

  const sendMessage = React.useCallback(
    async (messageText: string) => {
      if (!sectionId || !messageText.trim() || loading) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: messageText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      scrollToBottom();

      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch(
          `/api/themes/${themeSlug}/sections/${sectionId}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              currentCode,
              message: messageText,
              history,
              systemPrompt,
            }),
          }
        );

        if (!res.ok) {
          const e = await res.json();
          throw new Error(e.error || "Erreur du serveur");
        }

        const { newCode, newSchema, explanation } = await res.json();

        const aiMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: explanation || "Code modifié avec succès.",
          newCode,
          newSchema: newSchema ?? undefined,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMsg]);
        scrollToBottom();
      } catch (e: unknown) {
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Erreur : ${e instanceof Error ? e.message : "Inconnue"}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
        toast.error("Erreur IA");
      } finally {
        setLoading(false);
      }
    },
    [sectionId, loading, messages, model, currentCode, themeSlug]
  );

  const handleHtmlPaste = () => {
    if (!pastedHtml.trim()) return;
    const extra = htmlPasteMessage.trim();
    const prompt = `Convertis ce HTML en composant React TSX avec les props (tokens, data, variables). Adapte les classes CSS en Tailwind. Remplace les textes par des variables entreprise appropriées.${extra ? `\n\nInstructions : ${extra}` : ""}\n\nHTML à convertir :\n\`\`\`html\n${pastedHtml}\n\`\`\``;
    setHtmlPasteMode(false);
    setPastedHtml("");
    setHtmlPasteMessage("");
    sendMessage(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!sectionId) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Sélectionnez une section pour utiliser l'IA
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Chat header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 flex-shrink-0">
        <Bot className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
        <span className="text-xs text-zinc-400 flex-1">
          Assistant IA —{" "}
          <span className="font-mono text-zinc-500">{sectionId}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs text-zinc-500 hover:text-white px-2"
          onClick={() => setMessages([])}
          title="Effacer la conversation"
        >
          Effacer
        </Button>
        <Select value={model} onValueChange={(v) => handleModelChange(v as AIModel)}>
          <SelectTrigger className="h-6 text-[11px] bg-zinc-800 border-zinc-700 text-zinc-300 w-44 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-white text-xs">
            {(["anthropic", "openai"] as const).map((provider) => (
              <React.Fragment key={provider}>
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                  {provider === "anthropic" ? "Claude" : "ChatGPT"}
                </div>
                {AI_MODELS.filter((m) => m.provider === provider).map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${provider === "anthropic" ? "bg-orange-400" : "bg-green-500"}`} />
                      {m.label}
                    </span>
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-600">
            <Sparkles className="h-6 w-6" />
            <p className="text-xs text-center">
              Décrivez les modifications souhaitées.
              <br />
              L'IA proposera le code modifié.
            </p>
            {/* Quick actions */}
            <div className="flex gap-2 flex-wrap justify-center mt-2">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-full text-xs transition-colors"
                  onClick={() => {
                    if (a.id === "html") {
                      setHtmlPasteMode(true);
                    } else {
                      sendMessage(a.prompt);
                    }
                  }}
                >
                  <a.icon className="h-3 w-3" />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onApply={(code) => {
              onApplyCode(code);
              toast.success("Code appliqué dans l'éditeur");
            }}
            onApplySchema={onApplySchema ? (schema) => {
              onApplySchema(schema);
              toast.success("Schéma appliqué automatiquement");
            } : undefined}
          />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            L'IA génère le code…
          </div>
        )}
      </div>

      {/* HTML paste mode */}
      {htmlPasteMode && (
        <div className="border-t border-zinc-800 p-2 bg-zinc-900 flex-shrink-0 space-y-1.5">
          <p className="text-xs text-zinc-400">Collez votre HTML :</p>
          <Textarea
            value={pastedHtml}
            onChange={(e) => setPastedHtml(e.target.value)}
            placeholder="<section class='...'>...</section>"
            className="font-mono text-xs bg-zinc-800 border-zinc-700 text-zinc-300 resize-none h-24"
          />
          <p className="text-xs text-zinc-500">Instructions (optionnel) :</p>
          <Textarea
            value={htmlPasteMessage}
            onChange={(e) => setHtmlPasteMessage(e.target.value)}
            placeholder="Ex : adapte les couleurs, ajoute une animation…"
            className="text-xs bg-zinc-800 border-zinc-700 text-zinc-300 resize-none h-12"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-6 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={handleHtmlPaste}
              disabled={!pastedHtml.trim() || loading}
            >
              Convertir en TSX
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-zinc-400"
              onClick={() => { setHtmlPasteMode(false); setPastedHtml(""); setHtmlPasteMessage(""); }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-zinc-800 p-2 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez les modifications… (Entrée pour envoyer)"
            className="flex-1 text-xs bg-zinc-900 border-zinc-700 text-zinc-200 resize-none min-h-[40px] max-h-32"
            rows={2}
            disabled={loading}
          />
          <Button
            size="icon"
            className="h-10 w-10 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {/* Quick actions when there are messages */}
        {messages.length > 0 && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.id}
                className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 rounded text-[10px] transition-colors"
                onClick={() => {
                  if (a.id === "html") {
                    setHtmlPasteMode(true);
                  } else {
                    sendMessage(a.prompt);
                  }
                }}
                disabled={loading}
              >
                <a.icon className="h-2.5 w-2.5" />
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onApply,
  onApplySchema,
}: {
  message: ChatMessage;
  onApply: (code: string) => void;
  onApplySchema?: (schema: Record<string, unknown>) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
          isUser ? "bg-zinc-700" : "bg-blue-600"
        }`}
      >
        {isUser ? (
          <User className="h-3 w-3 text-zinc-300" />
        ) : (
          <Bot className="h-3 w-3 text-white" />
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {/* Message content */}
        {message.content && (
          <div
            className={`inline-block max-w-full text-xs px-3 py-2 rounded-lg ${
              isUser
                ? "bg-zinc-700 text-zinc-200 text-left"
                : "bg-zinc-900 text-zinc-300 text-left w-full"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        )}

        {/* Code proposal */}
        {message.newCode && (
          <div className="mt-2 border border-zinc-700 rounded-lg overflow-hidden">
            {/* Code header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
              <Code2 className="h-3 w-3 text-zinc-400" />
              <span className="text-xs text-zinc-400 flex-1">Code proposé</span>
              <button
                className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Masquer" : "Voir le code"}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            {/* Code preview */}
            {expanded && (
              <pre className="text-[11px] font-mono text-zinc-300 p-3 bg-zinc-900 overflow-x-auto max-h-48 overflow-y-auto">
                {message.newCode}
              </pre>
            )}

            {/* Actions */}
            <div className="flex gap-2 px-3 py-1.5 bg-zinc-800 flex-wrap">
              <Button
                size="sm"
                className="h-6 text-xs bg-green-700 hover:bg-green-600 text-white"
                onClick={() => {
                  onApply(message.newCode!);
                  if (message.newSchema && onApplySchema) onApplySchema(message.newSchema);
                }}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                {message.newSchema ? "Appliquer code + schéma" : "Appliquer"}
              </Button>
              {message.newSchema && onApplySchema && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => onApply(message.newCode!)}
                >
                  Code seulement
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="text-[10px] text-zinc-600 mt-1">
          {message.timestamp.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
