"use client";

/**
 * Réglages de la page de réservation : identité publique (username, nom, bio,
 * couleur, fuseau), lien public + snippet d'embed, et connexions d'agendas
 * externes (Google — busy réel + création d'évènements avec lien Meet).
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarX2,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Plug,
  Save,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  disconnectConnection,
  fetchConnections,
  fetchGoogleAuthUrl,
  fetchSchedulingPage,
  patchSchedulingPage,
  type CalendarConnection,
} from "@/lib/scheduling/client";
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
  const searchParams = useSearchParams();
  const [page, setPage] = useState<SchedulingPage | null>(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pageData, connData] = await Promise.all([
        fetchSchedulingPage(),
        fetchConnections().catch(() => ({ connections: [], google_available: false })),
      ]);
      setPage(pageData.page);
      setPublicUrl(pageData.public_url);
      setConnections(connData.connections);
      setGoogleAvailable(connData.google_available);
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

  // Retour du flow OAuth Google (?google=connected|refused|…)
  useEffect(() => {
    const g = searchParams?.get("google");
    if (!g) return;
    if (g === "connected") toast.success("Google Calendar connecté !");
    else if (g === "refused") toast.error("Connexion Google refusée");
    else toast.error("La connexion Google a échoué", { description: g });
  }, [searchParams]);

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

  const connectGoogle = async () => {
    setConnecting(true);
    try {
      const { url } = await fetchGoogleAuthUrl();
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "google_calendar_non_configure"
          ? "Google Calendar n'est pas configuré (GOOGLE_CALENDAR_CLIENT_ID/SECRET manquants)"
          : "Impossible de démarrer la connexion Google",
      );
      setConnecting(false);
    }
  };

  const copy = (text: string, message: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(message);
  };

  if (loading || !page) {
    return (
      <div className="flex items-center justify-center rounded-2xl border bg-card py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  const embedSnippet =
    `<div class="sama-rdv" data-url="${publicUrl}/appel-30min"></div>\n` +
    `<script src="${getAppUrlClient()}/api/public/scheduling/embed.js" async></script>`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Identité publique */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="font-semibold">Ma page publique</h2>
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
                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
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
            <Switch
              checked={page.is_active}
              onCheckedChange={(v) => update("is_active", v)}
            />
          </label>
          <div className="flex justify-end border-t pt-3">
            <Button onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Lien + embed */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="font-semibold">Partager & intégrer</h2>
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl} className="text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(publicUrl, "Lien public copié")}
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
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                <Code2 className="h-4 w-4" /> Intégrer sur un site (embed)
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">
                {embedSnippet}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => copy(embedSnippet, "Snippet d'intégration copié")}
              >
                <Copy className="mr-1 h-4 w-4" /> Copier le snippet
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                Remplacez le slug par celui du type d&apos;évènement à intégrer. L&apos;iframe
                s&apos;adapte automatiquement à la hauteur du contenu.
              </p>
            </div>
          </div>
        </div>

        {/* Connexions agendas */}
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Plug className="h-4 w-4" /> Agendas connectés
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Le busy de vos agendas est soustrait de vos disponibilités, et chaque RDV confirmé y
            est créé (avec lien Google Meet automatique pour les visios).
          </p>

          <div className="mt-3 space-y-2">
            {connections.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {c.provider === "google" ? "Google Calendar" : c.provider}
                    <Badge className="bg-emerald-100 text-emerald-800">
                      <Check className="mr-0.5 h-3 w-3" /> Connecté
                    </Badge>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.account_email}</p>
                  {c.last_error ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                      <TriangleAlert className="h-3 w-3" /> {c.last_error.slice(0, 80)}
                    </p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={async () => {
                    try {
                      await disconnectConnection(c.id);
                      setConnections((list) => list.filter((x) => x.id !== c.id));
                      toast.success("Agenda déconnecté");
                    } catch {
                      toast.error("Déconnexion impossible");
                    }
                  }}
                >
                  <CalendarX2 className="mr-1 h-4 w-4" /> Déconnecter
                </Button>
              </div>
            ))}

            {connections.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Aucun agenda connecté — vos dispos reposent sur le planning et le calendrier CRM.
              </div>
            ) : null}

            <Button
              variant="outline"
              className="w-full"
              disabled={connecting || !googleAvailable}
              onClick={() => void connectGoogle()}
            >
              {connecting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-1 h-4 w-4" />
              )}
              {googleAvailable
                ? "Connecter Google Calendar"
                : "Google Calendar non configuré (env)"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
