"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Save, CheckCircle2, Loader2, ImageIcon } from "lucide-react";
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
import { authedFetch } from "@/utils/authedFetch";

interface AutotagOption {
  provider: "anthropic" | "openai";
  model: string;
  label: string;
  note?: string;
}

const keyOf = (provider: string, model: string) => `${provider}::${model}`;

export function MediaAutotagSettings() {
  const [options, setOptions] = useState<AutotagOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    authedFetch("/api/settings/media-autotag")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.options)) setOptions(data.options);
        if (data?.current) setSelected(keyOf(data.current.provider, data.current.model));
      })
      .catch(() => toast.error("Impossible de charger la configuration IA des images"))
      .finally(() => setLoading(false));
  }, []);

  const current = useMemo(
    () => options.find((o) => keyOf(o.provider, o.model) === selected),
    [options, selected],
  );
  const anthropicOptions = useMemo(() => options.filter((o) => o.provider === "anthropic"), [options]);
  const openaiOptions = useMemo(() => options.filter((o) => o.provider === "openai"), [options]);

  const handleSave = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/media-autotag", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: current.provider, model: current.model }),
      });
      if (!res.ok) throw new Error("save_failed");
      setSaved(true);
      toast.success("Modèle d'auto-tag des images enregistré !");
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
          <ImageIcon className="h-4 w-4" />
          Modèle IA d&apos;auto-tag des images
        </CardTitle>
        <CardDescription>
          Modèle vision utilisé par la bibliothèque pour deviner les service tags d&apos;une
          image et rédiger sa description. Claude Haiku est le plus économique ; GPT-4o mini
          est une alternative OpenAI.
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
                {anthropicOptions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Anthropic (Claude)</SelectLabel>
                    {anthropicOptions.map((o) => (
                      <SelectItem key={keyOf(o.provider, o.model)} value={keyOf(o.provider, o.model)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {openaiOptions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>OpenAI (GPT)</SelectLabel>
                    {openaiOptions.map((o) => (
                      <SelectItem key={keyOf(o.provider, o.model)} value={keyOf(o.provider, o.model)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>

            {current?.note && (
              <p className="text-sm text-muted-foreground">{current.note}</p>
            )}

            {current?.provider === "openai" && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                OpenAI nécessite le secret <code>OPENAI_API_KEY</code> côté application.
              </p>
            )}
            {current?.provider === "anthropic" && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Claude nécessite le secret <code>ANTHROPIC_API_KEY</code> côté application.
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
