"use client";

import React from "react";
import { ColorInput } from "./shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Code2, AlertCircle } from "lucide-react";
import type { EditorElement, CustomCodeContent } from "@/types";
import type { EditorAction } from "@/types";

type PropSchema = Record<string, { type: "string" | "color" | "number" | "boolean"; label?: string; default?: string | number | boolean }>;

function isCustomCodeContent(c: unknown): c is CustomCodeContent {
  return typeof c === "object" && c !== null && !Array.isArray(c) && "code" in c;
}

interface CustomCodeSectionProps {
  sel: EditorElement;
  dispatch: React.Dispatch<EditorAction>;
}

const CustomCodeSection: React.FC<CustomCodeSectionProps> = ({ sel, dispatch }) => {
  const content = isCustomCodeContent(sel.content) ? sel.content : { code: "", schema: "{}", propValues: {} };

  const [schemaError, setSchemaError] = React.useState<string | null>(null);

  const parsedSchema = React.useMemo((): PropSchema => {
    try {
      const result = JSON.parse(content.schema || "{}");
      setSchemaError(null);
      return result;
    } catch {
      setSchemaError("JSON invalide");
      return {};
    }
  }, [content.schema]);

  const updateContent = (patch: Partial<CustomCodeContent>) => {
    dispatch({
      type: "UPDATE_ELEMENT",
      payload: {
        elementDetails: {
          ...sel,
          content: { ...content, ...patch },
        },
      },
    });
  };

  const updatePropValue = (key: string, value: string) => {
    updateContent({ propValues: { ...(content.propValues ?? {}), [key]: value } });
  };

  return (
    <AccordionItem value="CustomCode" className="px-4 py-0">
      <AccordionTrigger className="!no-underline py-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
          Code & Props
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-4 pb-4">

        {/* Code editor */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">HTML / CSS / JS</Label>
          <textarea
            className="font-mono text-xs bg-muted border border-input rounded-md p-2 resize-y min-h-[120px] w-full focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
            value={content.code ?? ""}
            onChange={(e) => updateContent({ code: e.target.value })}
            spellCheck={false}
            placeholder={"<div style=\"padding:20px\">\n  <h2>{{title}}</h2>\n</div>"}
          />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Utilisez <code className="bg-muted px-1 rounded font-mono">{"{{propName}}"}</code> pour insérer des props dynamiques.
          </p>
        </div>

        {/* Schema editor */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Schéma des props (JSON)</Label>
            {schemaError && (
              <span className="flex items-center gap-1 text-[10px] text-destructive">
                <AlertCircle className="w-3 h-3" /> {schemaError}
              </span>
            )}
          </div>
          <textarea
            className="font-mono text-xs bg-muted border border-input rounded-md p-2 resize-y min-h-[80px] w-full focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
            value={content.schema ?? "{}"}
            onChange={(e) => updateContent({ schema: e.target.value })}
            spellCheck={false}
            placeholder={'{\n  "title": {"type":"string","default":"Hello"},\n  "color": {"type":"color","default":"#3b82f6"}\n}'}
          />
          <p className="text-[10px] text-muted-foreground">
            Types: <code className="bg-muted px-1 rounded font-mono">string</code>, <code className="bg-muted px-1 rounded font-mono">color</code>, <code className="bg-muted px-1 rounded font-mono">number</code>, <code className="bg-muted px-1 rounded font-mono">boolean</code>
          </p>
        </div>

        {/* Dynamic prop controls */}
        {Object.keys(parsedSchema).length > 0 && (
          <div className="flex flex-col gap-3 border-t pt-3">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Valeurs des props</Label>
            {Object.entries(parsedSchema).map(([key, def]) => {
              const currentVal = (content.propValues ?? {})[key] ?? String(def.default ?? "");

              if (def.type === "color") {
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <Label className="text-xs">{def.label || key}</Label>
                    <ColorInput value={currentVal} onChange={(v) => updatePropValue(key, v)} />
                  </div>
                );
              }

              if (def.type === "boolean") {
                return (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs">{def.label || key}</Label>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border border-input cursor-pointer"
                      checked={currentVal === "true"}
                      onChange={(e) => updatePropValue(key, String(e.target.checked))}
                    />
                  </div>
                );
              }

              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label className="text-xs">{def.label || key}</Label>
                  <Input
                    type={def.type === "number" ? "number" : "text"}
                    value={currentVal}
                    className="h-8 text-xs"
                    onChange={(e) => updatePropValue(key, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

export default CustomCodeSection;
