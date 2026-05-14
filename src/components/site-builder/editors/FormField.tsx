"use client";

import React from "react";
import type { SectionFormField, FormFieldValue } from "@/types";

interface FormFieldProps {
  setting: SectionFormField;
  value: FormFieldValue;
  onChange: (val: FormFieldValue) => void;
  variables?: Record<string, string>;
}

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 px-2.5 py-1.5";
const labelCls = "text-[10px] text-white/40 block mb-1";

export function FormField({ setting, value = {}, onChange, variables }: FormFieldProps) {
  const v = value ?? {};
  const update = (patch: Partial<FormFieldValue>) => onChange({ ...v, ...patch });

  return (
    <div className="space-y-2 border border-white/10 rounded-lg p-2.5 bg-white/[0.02]">
      <div>
        <label className={labelCls}>Action (URL de soumission)</label>
        <VarInput
          value={v.action ?? ""}
          onChange={(action) => update({ action })}
          placeholder="/api/contact"
          variables={variables}
        />
      </div>
      <div>
        <label className={labelCls}>Méthode</label>
        <select
          value={v.method ?? "POST"}
          onChange={(e) => update({ method: e.target.value as "GET" | "POST" })}
          className="w-full bg-white/5 border border-white/10 rounded text-white text-xs px-2.5 py-1.5 focus:outline-none focus:border-white/30"
        >
          <option value="POST" className="bg-gray-900">POST</option>
          <option value="GET" className="bg-gray-900">GET</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Label bouton de soumission</label>
        <VarInput
          value={v.submit_label ?? ""}
          onChange={(submit_label) => update({ submit_label })}
          placeholder="Envoyer"
          variables={variables}
        />
      </div>
      <div>
        <label className={labelCls}>Message de succès</label>
        <VarInput
          value={v.success_message ?? ""}
          onChange={(success_message) => update({ success_message })}
          placeholder="Merci, votre message a été envoyé !"
          variables={variables}
        />
      </div>
    </div>
  );
}

function VarInput({
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
        className={inputCls}
      />
      {hasVars && (
        <div className="flex justify-end mt-0.5 relative">
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
