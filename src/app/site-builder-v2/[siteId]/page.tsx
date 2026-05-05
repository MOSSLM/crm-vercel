"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Globe, Sparkles, Settings } from "lucide-react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SiteConfigProvider from "@/components/site-builder/SiteConfigProvider";
import SiteConfigEditor from "@/components/site-builder/SiteConfigEditor";
import { useSiteConfig } from "@/components/site-builder/use-site-config";
import type { SiteV2 } from "@/types";

export default function SiteBuilderV2Page() {
  const { siteId } = useParams<{ siteId: string }>();
  const [site, setSite] = React.useState<SiteV2 | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [publishOpen, setPublishOpen] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/site-builder-v2/sites/${siteId}`)
      .then((r) => r.json())
      .then(setSite)
      .catch(() => toast.error("Erreur lors du chargement"))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Chargement...</div>
        </div>
      </AppLayout>
    );
  }

  if (!site) {
    return (
      <AppLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Site introuvable</p>
          <Link href="/site-builder-v2">
            <Button variant="link">Retour</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <SiteConfigProvider siteId={siteId} initialConfig={site.site_config ?? undefined}>
        <SiteBuilderV2Inner site={site} setSite={setSite} publishOpen={publishOpen} setPublishOpen={setPublishOpen} />
      </SiteConfigProvider>
    </AppLayout>
  );
}

// ─── Inner component (has access to SiteConfigProvider) ─────────────────────

interface InnerProps {
  site: SiteV2;
  setSite: (s: SiteV2) => void;
  publishOpen: boolean;
  setPublishOpen: (v: boolean) => void;
}

function SiteBuilderV2Inner({ site, setSite, publishOpen, setPublishOpen }: InnerProps) {
  const { state, dispatch } = useSiteConfig();
  const [saving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [subdomain, setSubdomain] = React.useState(site.published_subdomain ?? "");
  const [publishing, setPublishing] = React.useState(false);
  const router = useRouter();

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/site-builder-v2/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_config: state.config }),
      });
      if (!res.ok) throw new Error("Erreur de sauvegarde");
      dispatch({ type: "LOAD_CONFIG", payload: { config: state.config } }); // reset dirty
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
      // Fetch company data
      const companyRes = await fetch(`/api/site-builder-v2/sites/${site.id}`);
      const siteData = await companyRes.json();

      // Call AI generation
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
      // Save config first
      await fetch(`/api/site-builder-v2/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_config: state.config }),
      });
      // Publish
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
    <div className="flex flex-col h-full">
      {/* Top navigation bar */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-background flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/site-builder-v2" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="font-semibold text-sm truncate max-w-48">{site.name}</span>
          <Badge variant={site.is_published ? "default" : "secondary"} className="text-xs">
            {site.is_published ? "Publié" : "Brouillon"}
          </Badge>
          {site.is_published && site.published_subdomain && (
            <a
              href={`https://${site.published_subdomain}.monsupercrm.fr`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline hidden sm:block"
            >
              {site.published_subdomain}.monsupercrm.fr ↗
            </a>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerateWithAI}
            disabled={generating}
            className="gap-2 text-xs"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? "Génération…" : "Générer avec l'IA"}
          </Button>

          {site.is_published ? (
            <Button variant="outline" size="sm" onClick={handleUnpublish} className="gap-2 text-xs">
              <Globe className="h-4 w-4" />
              Dépublier
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setPublishOpen(true)} className="gap-2 text-xs">
              <Globe className="h-4 w-4" />
              Publier
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <SiteConfigEditor onSave={handleSave} isSaving={saving} />
      </div>

      {/* Publish dialog */}
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
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.monsupercrm.fr</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Uniquement lettres minuscules, chiffres et tirets.
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
    </div>
  );
}
