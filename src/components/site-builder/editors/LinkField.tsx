"use client";

import React from "react";
import type { SectionLinkField, LinkFieldValue } from "@/types";

interface LinkFieldProps {
  setting: SectionLinkField;
  value: LinkFieldValue;
  onChange: (val: LinkFieldValue) => void;
  variables?: Record<string, string>;
}

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 px-2.5 py-1.5";
const labelCls = "text-[10px] text-white/40 block mb-1";

export function LinkField({ setting, value = {}, onChange, variables }: LinkFieldProps) {
  const v = value ?? {};
  const update = (patch: Partial<LinkFieldValue>) => onChange({ ...v, ...patch });

  return (
    <div className="space-y-2 border border-white/10 rounded-lg p-2.5 bg-white/[0.02]">
      <div>
        <label className={labelCls}>Texte du lien</label>
        <FieldWithVars
          value={v.label ?? ""}
          onChange={(label) => update({ label })}
          placeholder={setting.label ?? "Texte"}
          variables={variables}
        />
      </div>
      <div>
        <label className={labelCls}>URL</label>
        <FieldWithVars
          value={v.href ?? ""}
          onChange={(href) => update({ href })}
          placeholder="https://..."
          variables={variables}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className={labelCls + " mb-0"}>Nouvel onglet</span>
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
    </div>
  );
}

function FieldWithVars({
  value,
  onChange,
  placeholder,
  variables,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  variables?: Record<string, string>;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
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
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 px-2.5 py-1.5"
      />
      {hasVars && (
        <div className="flex justify-end mt-0.5">
          <button
            type="button"
            onClick={() => setShowVars(!showVars)}
            className="text-[9px] text-white/25 hover:text-white/50 transition-colors"
          >
            {"{ } Variables"}
          </button>
          {showVars && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 max-h-44 overflow-y-auto py-1">
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
