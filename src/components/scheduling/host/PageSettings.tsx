"use client";

/**
 * « Ma page » Cal.SAMA : identité publique de la page de réservation —
 * username (URL), nom affiché, bio, couleur de marque, fuseau de référence,
 * activation — plus le lien public à partager.
 * (Embed et agendas connectés vivent dans l'onglet Intégrations.)
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchSchedulingPage, patchSchedulingPage } from "@/lib/scheduling/client";
import type { SchedulingPage } from "@/lib/scheduling/types";
import { getAppUrlClient, timezoneOptions } from "./shared";

const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export default function PageSettings() {
  const [page, setPage] = useState<SchedulingPage | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pageData = await fetchSchedulingPage();
      setPage(pageData.page);
      setPublicUrl(pageData.public_url);
      setDirty(false);
    } catch (err) {
      toast.error("Chargement impossible", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof SchedulingPage>(key: K, value: SchedulingPage[K]) => {
    setPage((p) => (p ? { ...p, [key]: value } : p));
    setDirty(true);
  };

  const save = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const result = await patchSchedulingPage({
        username: page.username,
        display_name: page.display_name,
        bio: page.bio,
        brand_color: page.brand_color,
        timezone: page.timezone,
        is_active: page.is_active,
      });
      setPage(result.page);
      setPublicUrl(result.public_url);
      setDirty(false);
      toast.success("Page enregistrée");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "username_taken" ? "Ce nom d'utilisateur est déjà pris" : "Enregistrement impossible",
        { description: msg && msg !== "username_taken" ? msg : undefined },
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !page) {
    return (
      <div className="flex items-center justify-center rounded-xl border bg-card py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Identité publique */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="cal-tag text-muted-foreground">Identité de la page</h2>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="pg-username">Nom d&apos;utilisateur (URL)</Label>
            <Input
              id="pg-username"
              value={page.username}
              onChange={(e) => update("username", slugify(e.target.value))}
            />
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {getAppUrlClient()}/rdv/{page.username}
            </p>
          </div>
          <div>
            <Label htmlFor="pg-name">Nom affiché</Label>
            <Input
              id="pg-name"
              value={page.display_name}
              onChange={(e) => update("display_name", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pg-bio">Bio</Label>
            <Textarea
              id="pg-bio"
              rows={2}
              value={page.bio ?? ""}
              onChange={(e) => update("bio", e.target.value || null)}
              placeholder="Présentation courte affichée sur votre page."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pg-color">Couleur de marque</Label>
              <input
                id="pg-color"
                type="color"
                className="h-9 w-full cursor-pointer rounded border bg-transparent"
                value={page.brand_color}
                onChange={(e) => update("brand_color", e.target.value)}
              />
            </div>
            <div>
              <Label>Fuseau de référence</Label>
              <select
                value={page.timezone}
                onChange={(e) => update("timezone", e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-input-background px-2 text-sm"
              >
                {timezoneOptions().map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Page active
              <span className="block text-xs text-muted-foreground">
                Désactivée, votre lien public renvoie une page introuvable.
              </span>
            </span>
            <Switch checked={page.is_active} onCheckedChange={(v) => update("is_active", v)} />
          </label>
          <div className="flex justify-end border-t pt-3">
            <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>

      {/* Lien public */}
      <div className="rounded-xl border bg-card p-4 shadow-sm lg:self-start">
        <h2 className="cal-tag text-muted-foreground">Partager</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Votre page publique liste tous vos types d&apos;évènements actifs. Chaque type a aussi
          son lien direct (onglet Types d&apos;évènements → Copier le lien).
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input readOnly value={publicUrl} className="text-sm" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl);
              toast.success("Lien public copié");
            }}
            aria-label="Copier le lien"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" asChild aria-label="Ouvrir la page">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
