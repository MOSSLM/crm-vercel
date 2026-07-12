"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Save, CheckCircle2, Loader2, Cpu } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";

interface LlmOption {
  provider: "openai" | "deepseek";
  model: string;
  label: string;
  strictSchema: boolean;
  note?: string;
}

const keyOf = (provider: string, model: string) => `${provider}::${model}`;

export function EnrichmentLlmSettings() {
  const [options, setOptions] = useState<LlmOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    authedFetch("/api/settings/enrichment-llm")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.options)) setOptions(data.options);
        if (data?.current) setSelected(keyOf(data.current.provider, data.current.model));
      })
      .catch(() => toast.error("Impossible de charger la configuration IA"))
      .finally(() => setLoading(false));
  }, []);

  const current = useMemo(
    () => options.find((o) => keyOf(o.provider, o.model) === selected),
    [options, selected],
  );
  const openaiOptions = useMemo(() => options.filter((o) => o.provider === "openai"), [options]);
  const deepseekOptions = useMemo(() => options.filter((o) => o.provider === "deepseek"), [options]);

  const handleSave = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/enrichment-llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: current.provider, model: current.model }),
      });
      if (!res.ok) throw new Error("save_failed");
      setSaved(true);
      toast.success("Modèle d'enrichissement enregistré !");
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-4 w-4" />
          Modèle IA de l&apos;enrichissement
        </CardTitle>
        <CardDescription>
          Modèle utilisé par l&apos;edge function pour analyser les sites et en extraire les
          informations. Les modèles OpenAI garantissent un schéma strict ; DeepSeek est
          moins cher mais renvoie du JSON simple (normalisé côté serveur).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <>
            <Select
              value={selected}
              onValueChange={(v) => {
                setSelected(v);
                setSaved(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un modèle" />
              </SelectTrigger>
              <SelectContent>
                {openaiOptions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>OpenAI</SelectLabel>
                    {openaiOptions.map((o) => (
                      <SelectItem key={keyOf(o.provider, o.model)} value={keyOf(o.provider, o.model)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {deepseekOptions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>DeepSeek</SelectLabel>
                    {deepseekOptions.map((o) => (
                      <SelectItem key={keyOf(o.provider, o.model)} value={keyOf(o.provider, o.model)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>

            {current && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant={current.strictSchema ? "outline" : "secondary"}>
                  {current.strictSchema ? "Schéma strict" : "JSON simple"}
                </Badge>
                {current.note && <span>{current.note}</span>}
              </div>
            )}

            {current?.provider === "deepseek" && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                DeepSeek nécessite le secret <code>DEEPSEEK_API_KEY</code> configuré sur la
                fonction Supabase.
              </p>
            )}

            <Button onClick={handleSave} disabled={saving || !current} className="w-full gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Enregistré" : "Enregistrer le modèle"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
