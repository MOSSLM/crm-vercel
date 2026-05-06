"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

export const AI_MODELS = [
  { provider: "claude" as const, id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { provider: "claude" as const, id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { provider: "claude" as const, id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { provider: "openai" as const, id: "gpt-4o", label: "GPT-4o" },
  { provider: "openai" as const, id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { provider: "openai" as const, id: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

export type AIModelId = typeof AI_MODELS[number]["id"];
export type AIProvider = "claude" | "openai";

export function ModelSelector({ value, onChange }: { value: AIModelId; onChange: (v: AIModelId) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = AI_MODELS.find((m) => m.id === value) ?? AI_MODELS[1];
  const claudeModels = AI_MODELS.filter((m) => m.provider === "claude");
  const openaiModels = AI_MODELS.filter((m) => m.provider === "openai");

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selected.provider === "claude" ? "bg-purple-500" : "bg-green-500"}`} />
          <span className="text-gray-700 truncate font-medium">{selected.label}</span>
        </div>
        <ChevronDown size={11} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
          <div className="px-2.5 py-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Anthropic</div>
          {claudeModels.map((m) => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left transition-colors ${value === m.id ? "bg-purple-50 text-purple-700" : "text-gray-700 hover:bg-gray-50"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
              {m.label}
              {value === m.id && <span className="ml-auto text-purple-500 text-[10px]">✓</span>}
            </button>
          ))}
          <div className="px-2.5 py-1 mt-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider border-t border-gray-100">OpenAI</div>
          {openaiModels.map((m) => (
            <button
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left transition-colors ${value === m.id ? "bg-green-50 text-green-700" : "text-gray-700 hover:bg-gray-50"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
              {m.label}
              {value === m.id && <span className="ml-auto text-green-500 text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
