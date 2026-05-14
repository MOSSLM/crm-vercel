"use client";

import React from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { SectionButtonField, ButtonFieldValue } from "@/types";

interface ButtonFieldProps {
  setting: SectionButtonField;
  value: ButtonFieldValue;
  onChange: (val: ButtonFieldValue) => void;
  variables?: Record<string, string>;
}

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 px-2.5 py-1.5";

const labelCls = "text-[10px] text-white/40 block mb-1";

export function ButtonField({ setting, value = {}, onChange, variables }: ButtonFieldProps) {
  const [styleOpen, setStyleOpen] = React.useState(false);
  const v = value ?? {};

  const update = (patch: Partial<ButtonFieldValue>) => onChange({ ...v, ...patch });
  const updateStyle = (patch: Partial<NonNullable<ButtonFieldValue["style_overrides"]>>) =>
    onChange({ ...v, style_overrides: { ...(v.style_overrides ?? {}), ...patch } });

  const hasOverrides = v.style_overrides && Object.values(v.style_overrides).some(Boolean);

  return (
    <div className="space-y-2 border border-white/10 rounded-lg p-2.5 bg-white/[0.02]">
      {/* Label */}
      <div>
        <label className={labelCls}>Label</label>
        <HrefWithVariables
          value={v.label ?? ""}
          onChange={(label) => update({ label })}
          placeholder={setting.label ?? "Texte du bouton"}
          variables={variables}
          multiline={false}
        />
      </div>

      {/* URL */}
      <div>
        <label className={labelCls}>URL / Lien</label>
        <HrefWithVariables
          value={v.href ?? ""}
          onChange={(href) => update({ href })}
          placeholder="#contact"
          variables={variables}
          multiline={false}
        />
      </div>

      {/* Target */}
      <div className="flex items-center justify-between">
        <span className={labelCls + " mb-0"}>Ouvrir dans un nouvel onglet</span>
        <button
          type="button"
          onClick={() => update({ target: v.target === "_blank" ? "_self" : "_blank" })}
          className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
            v.target === "_blank" ? "bg-blue-500" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              v.target === "_blank" ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Style overrides accordion */}
      <div>
        <button
          type="button"
          onClick={() => setStyleOpen(!styleOpen)}
          className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors w-full"
        >
          <ChevronDown size={10} className={`transition-transform ${styleOpen ? "rotate-180" : ""}`} />
          Style local
          {hasOverrides && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
        </button>

        {styleOpen && (
          <div className="mt-2 space-y-2 pl-2 border-l border-white/5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Fond</label>
                <input
                  type="color"
                  value={v.style_overrides?.bg ?? "#000000"}
                  onChange={(e) => updateStyle({ bg: e.target.value })}
                  className="w-full h-7 rounded border border-white/10 bg-white/5 cursor-pointer"
                />
              </div>
              <div>
                <label className={labelCls}>Texte</label>
                <input
                  type="color"
                  value={v.style_overrides?.text ?? "#ffffff"}
                  onChange={(e) => updateStyle({ text: e.target.value })}
                  className="w-full h-7 rounded border border-white/10 bg-white/5 cursor-pointer"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Radius</label>
              <input
                type="text"
                value={v.style_overrides?.radius ?? ""}
                onChange={(e) => updateStyle({ radius: e.target.value })}
                placeholder="var(--btn-radius)"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Bordure</label>
              <input
                type="text"
                value={v.style_overrides?.border ?? ""}
                onChange={(e) => updateStyle({ border: e.target.value })}
                placeholder="1px solid transparent"
                className={inputCls}
              />
            </div>
            {hasOverrides && (
              <button
                type="button"
                onClick={() => update({ style_overrides: {} })}
                className="flex items-center gap-1 text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
              >
                <RotateCcw size={9} />
                Réinitialiser au style global
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared: small single-line input with optional variable picker ────────────

function HrefWithVariables({
  value,
  onChange,
  placeholder,
  variables,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  variables?: Record<string, string>;
  multiline: boolean;
}) {
  const ref = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [showVars, setShowVars] = React.useState(false);
  const hasVars = variables && Object.keys(variables).length > 0;

  const insertVar = (key: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const token = `{{ ${key} }}`;
    onChange(value.slice(0, start) + token + value.slice(end));
    setShowVars(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const base =
    "w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 px-2.5 py-1.5";

  return (
    <div className="relative">
      {multiline ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`${base} resize-none`}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={base}
        />
      )}
      {hasVars && (
        <div className="relative mt-0.5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowVars(!showVars)}
            className="text-[9px] text-white/25 hover:text-white/50 transition-colors"
          >
            {"{ } Variables"}
          </button>
          {showVars && (
            <div className="absolute right-0 bottom-full mb-1 w-56 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto py-1">
              {Object.entries(variables ?? {})
                .filter(([k]) => !k.startsWith("company."))
                .map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => insertVar(k)}
                    className="w-full flex flex-col items-start px-3 py-1 hover:bg-white/5 text-left"
                  >
                    <span className="text-[10px] font-mono text-blue-300">{`{{ ${k} }}`}</span>
                    {v && <span className="text-[9px] text-white/30 truncate max-w-full">{v}</span>}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
