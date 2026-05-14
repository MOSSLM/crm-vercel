"use client";

import React from "react";
import type { SectionInputField, InputFieldValue, SectionTextareaInputField, TextareaInputFieldValue } from "@/types";

const inputCls =
  "w-full bg-white/5 border border-white/10 rounded text-white text-xs placeholder-white/20 focus:outline-none focus:border-white/30 px-2.5 py-1.5";
const labelCls = "text-[10px] text-white/40 block mb-1";

// ─── InputField ───────────────────────────────────────────────────────────────

interface InputFieldProps {
  setting: SectionInputField;
  value: InputFieldValue;
  onChange: (val: InputFieldValue) => void;
  variables?: Record<string, string>;
}

const INPUT_TYPES = [
  { value: "text", label: "Texte" },
  { value: "email", label: "Email" },
  { value: "tel", label: "Téléphone" },
  { value: "number", label: "Nombre" },
  { value: "password", label: "Mot de passe" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
];

export function InputField({ setting, value = {}, onChange, variables }: InputFieldProps) {
  const v = value ?? {};
  const update = (patch: Partial<InputFieldValue>) => onChange({ ...v, ...patch });

  return (
    <div className="space-y-2 border border-white/10 rounded-lg p-2.5 bg-white/[0.02]">
      <div>
        <label className={labelCls}>Type</label>
        <select
          value={v.input_type ?? "text"}
          onChange={(e) => update({ input_type: e.target.value as InputFieldValue["input_type"] })}
          className="w-full bg-white/5 border border-white/10 rounded text-white text-xs px-2.5 py-1.5 focus:outline-none focus:border-white/30"
        >
          {INPUT_TYPES.map((t) => (
            <option key={t.value} value={t.value} className="bg-gray-900">
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Label</label>
        <VarInput value={v.label ?? ""} onChange={(label) => update({ label })} placeholder="Email*" variables={variables} />
      </div>
      <div>
        <label className={labelCls}>Placeholder</label>
        <VarInput value={v.placeholder ?? ""} onChange={(placeholder) => update({ placeholder })} placeholder="votre@email.com" variables={variables} />
      </div>
      <div>
        <label className={labelCls}>Valeur par défaut</label>
        <VarInput value={v.default_value ?? ""} onChange={(default_value) => update({ default_value })} placeholder="" variables={variables} />
      </div>
      <div>
        <label className={labelCls}>Attribut name (HTML)</label>
        <input
          type="text"
          value={v.name ?? ""}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="email"
          className={inputCls}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className={labelCls + " mb-0"}>Obligatoire</span>
        <button
          type="button"
          onClick={() => update({ required: !v.required })}
          className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
            v.required ? "bg-blue-500" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              v.required ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ─── TextareaInputField ───────────────────────────────────────────────────────

interface TextareaInputFieldProps {
  setting: SectionTextareaInputField;
  value: TextareaInputFieldValue;
  onChange: (val: TextareaInputFieldValue) => void;
  variables?: Record<string, string>;
}

export function TextareaInputField({ setting, value = {}, onChange, variables }: TextareaInputFieldProps) {
  const v = value ?? {};
  const update = (patch: Partial<TextareaInputFieldValue>) => onChange({ ...v, ...patch });

  return (
    <div className="space-y-2 border border-white/10 rounded-lg p-2.5 bg-white/[0.02]">
      <div>
        <label className={labelCls}>Label</label>
        <VarInput value={v.label ?? ""} onChange={(label) => update({ label })} placeholder="Message" variables={variables} />
      </div>
      <div>
        <label className={labelCls}>Placeholder</label>
        <VarInput value={v.placeholder ?? ""} onChange={(placeholder) => update({ placeholder })} placeholder="Votre message..." variables={variables} />
      </div>
      <div>
        <label className={labelCls}>Valeur par défaut</label>
        <VarInput value={v.default_value ?? ""} onChange={(default_value) => update({ default_value })} placeholder="" variables={variables} />
      </div>
      <div>
        <label className={labelCls}>Nombre de lignes</label>
        <input
          type="number"
          min={2}
          max={12}
          value={v.rows ?? 4}
          onChange={(e) => update({ rows: parseInt(e.target.value) || 4 })}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Attribut name (HTML)</label>
        <input
          type="text"
          value={v.name ?? ""}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="message"
          className={inputCls}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className={labelCls + " mb-0"}>Obligatoire</span>
        <button
          type="button"
          onClick={() => update({ required: !v.required })}
          className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
            v.required ? "bg-blue-500" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              v.required ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ─── Shared VarInput ──────────────────────────────────────────────────────────

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
