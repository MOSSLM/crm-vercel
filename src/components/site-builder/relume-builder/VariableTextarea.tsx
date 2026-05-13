"use client";

import React from "react";
import { ChevronDown, Variable } from "lucide-react";

interface VariableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  variables?: Record<string, string>;
  variant?: "light" | "dark";
  autoFocus?: boolean;
}

export function VariableTextarea({
  value, onChange, placeholder, rows = 4, className,
  variables = {}, variant = "light", autoFocus,
}: VariableTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [showVars, setShowVars] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const hasVars = Object.keys(variables).length > 0;

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!showVars) return;
    const handleClick = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setShowVars(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showVars]);

  const insertVariable = (key: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const token = `{{ ${key} }}`;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
    setShowVars(false);
  };

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={className}
      />
      {hasVars && (
        <div className="flex justify-end mt-1">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowVars((v) => !v)}
              className={`flex items-center gap-1 text-[10px] transition-colors ${
                variant === "dark"
                  ? "text-white/30 hover:text-white/60"
                  : "text-purple-500/60 hover:text-purple-600"
              }`}
            >
              <Variable size={10} />
              Variables
              <ChevronDown size={9} className={`transition-transform ${showVars ? "rotate-180" : ""}`} />
            </button>

            {showVars && (
              <div className="absolute right-0 bottom-full mb-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto py-1">
                <div className="px-3 py-1.5 border-b border-gray-100">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                    Cliquer pour insérer au curseur
                  </p>
                </div>
                {Object.entries(variables)
                  .filter(([key]) => !key.startsWith("company."))
                  .map(([key, val]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => insertVariable(key)}
                      className="w-full flex flex-col items-start px-3 py-1.5 text-left hover:bg-purple-50 transition-colors"
                    >
                      <span className="text-[11px] font-mono text-purple-700">{`{{ ${key} }}`}</span>
                      {val && (
                        <span className="text-[10px] text-gray-400 truncate max-w-full">{val}</span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
