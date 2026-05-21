"use client";

import React from "react";
import { Loader2, Sparkles, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  themeSlug: string;
  sectionId: string | null;
  code: string;
  schema: Record<string, unknown> | null;
  isTagAdaptive?: boolean;
  onSchemaSave: (schema: Record<string, unknown>) => Promise<void>;
}

export default function SectionSchemaEditor({
  themeSlug,
  sectionId,
  code,
  schema,
  isTagAdaptive,
  onSchemaSave,
}: Props) {
  const [schemaStr, setSchemaStr] = React.useState(
    schema ? JSON.stringify(schema, null, 2) : ""
  );
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);

  // Sync when schema prop changes (e.g. section switched)
  React.useEffect(() => {
    setSchemaStr(schema ? JSON.stringify(schema, null, 2) : "");
    setParseError(null);
  }, [schema, sectionId]);

  const handleChange = (val: string) => {
    setSchemaStr(val);
    if (!val.trim()) {
      setParseError(null);
      return;
    }
    try {
      JSON.parse(val);
      setParseError(null);
    } catch {
      setParseError("JSON invalide");
    }
  };

  const handleGenerate = async () => {
    if (!sectionId || !code.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/themes/${themeSlug}/sections/${sectionId}/generate-schema`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, isTagAdaptive: isTagAdaptive ?? false }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur IA");
      setSchemaStr(JSON.stringify(data.schema, null, 2));
      setParseError(null);
      toast.success("Schéma généré — vérifiez et sauvegardez");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (parseError || !schemaStr.trim()) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(schemaStr);
      await onSchemaSave(parsed);
      toast.success("Schéma sauvegardé");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  if (!sectionId) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Sélectionnez une section
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-xs text-zinc-400 flex-1">Schéma JSON</span>
        {parseError && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3" />
            {parseError}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1.5"
          onClick={handleGenerate}
          disabled={generating || !code.trim()}
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Générer avec l'IA
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={handleSave}
          disabled={saving || !!parseError || !schemaStr.trim()}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Sauvegarder
        </Button>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-h-0 relative">
        {!schemaStr.trim() && !generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <p className="text-zinc-600 text-sm">Aucun schéma défini</p>
            <p className="text-zinc-700 text-xs">
              Cliquez sur &ldquo;Générer avec l&apos;IA&rdquo; pour créer automatiquement un schéma
            </p>
          </div>
        )}
        <Textarea
          value={schemaStr}
          onChange={(e) => handleChange(e.target.value)}
          className="font-mono text-xs bg-zinc-950 border-0 text-zinc-300 resize-none h-full rounded-none focus-visible:ring-0 leading-relaxed"
          spellCheck={false}
          placeholder='{"name": "...", "settings": []}'
        />
      </div>
    </div>
  );
}
