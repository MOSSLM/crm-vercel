"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import SiteConfigProvider from "@/components/site-builder/SiteConfigProvider";
import SiteConfigEditor from "@/components/site-builder/SiteConfigEditor";
import { useSiteConfig } from "@/components/site-builder/use-site-config";
import type { SiteV2 } from "@/types";

export default function SiteBuilderV2Page() {
  const { siteId } = useParams<{ siteId: string }>();
  const [site, setSite] = React.useState<SiteV2 | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`/api/site-builder-v2/sites/${siteId}`)
      .then((r) => r.json())
      .then(setSite)
      .catch(() => toast.error("Erreur lors du chargement"))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0f0f11]">
        <div className="animate-pulse text-white/40 text-sm">Chargement…</div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0f0f11]">
        <p className="text-white/40 text-sm mb-3">Site introuvable</p>
        <Link href="/site-builder-v2" className="text-blue-400 hover:underline text-sm">
          ← Retour aux sites
        </Link>
      </div>
    );
  }

  return (
    <SiteConfigProvider siteId={siteId} initialConfig={site.site_config ?? undefined}>
      <SiteBuilderV2Inner site={site} setSite={setSite} />
    </SiteConfigProvider>
  );
}

// ─── Inner component ─────────────────────────────────────────────────────────

interface InnerProps {
  site: SiteV2;
  setSite: (s: SiteV2) => void;
}

function SiteBuilderV2Inner({ site, setSite }: InnerProps) {
  const { state, dispatch } = useSiteConfig();
  const [saving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [subdomain, setSubdomain] = React.useState(site.published_subdomain ?? "");
  const [publishing, setPublishing] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/site-builder-v2/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_config: state.config }),
      });
      if (!res.ok) throw new Error("Erreur de sauvegarde");
      dispatch({ type: "LOAD_CONFIG", payload: { config: state.config } });
      toast.success("Configuration sauvegardée");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!site.enterprise_id) {
      toast.error("Associez d'abord une entreprise à ce site pour générer avec l'IA");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/site-builder-v2/generate-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: { id: site.enterprise_id },
          themeSlug: state.config.theme,
        }),
      });
      if (!res.ok) throw new Error("Erreur de génération IA");
      const { config } = await res.json();
      dispatch({ type: "LOAD_CONFIG", payload: { config } });
      toast.success("Configuration générée par l'IA !");
    } catch {
      toast.error("Erreur lors de la génération IA");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!subdomain.trim()) { toast.error("Sous-domaine requis"); return; }
    setPublishing(true);
    try {
      await fetch(`/api/site-builder-v2/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_config: state.config }),
      });
      const res = await fetch(`/api/site-builder-v2/sites/${site.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: subdomain.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur");
      }
      const { site: updated } = await res.json();
      setSite({ ...site, ...updated });
      setPublishOpen(false);
      toast.success(`Site publié sur ${subdomain}.monsupercrm.fr`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    try {
      const res = await fetch(`/api/site-builder-v2/sites/${site.id}/publish`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur");
      setSite({ ...site, is_published: false });
      toast.success("Site dépublié");
    } catch {
      toast.error("Erreur lors de la dépublication");
    }
  };

  return (
    <>
      <SiteConfigEditor
        siteName={site.name}
        siteId={site.id}
        isPublished={!!site.is_published}
        publishedSubdomain={site.published_subdomain}
        onSave={handleSave}
        isSaving={saving}
        onPublish={() => setPublishOpen(true)}
        onUnpublish={handleUnpublish}
        onGenerateAI={handleGenerateWithAI}
        isGenerating={generating}
      />

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publier le site</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="subdomain">Sous-domaine</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="subdomain"
                  placeholder="mon-client"
                  value={subdomain}
                  onChange={(e) =>
                    setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.monsupercrm.fr</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Lettres minuscules, chiffres et tirets uniquement.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>Annuler</Button>
            <Button onClick={handlePublish} disabled={publishing || !subdomain.trim()}>
              {publishing ? "Publication…" : "Publier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
