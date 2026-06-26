"use client";

import React from "react";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authedFetch } from "@/utils/authedFetch";
import type { SitemapPage } from "@/types";
import type { Tweaks } from "@/lib/site-builder/claude-design/apply-tweaks";
import type { TweaksSchema } from "@/lib/site-builder/claude-design/parse-tweaks-schema";
import { InlinePreview, type OverrideEntry } from "./InlinePreview";
import { TweaksPanel } from "./TweaksPanel";
import { VariablesPanel } from "./VariablesPanel";
import { TagToggles } from "./TagToggles";

interface PageData {
  slug: string;
  instanceId: string;
  title: string;
  serviceTag: string | null;
  html: string;
  overrides: Record<string, OverrideEntry>;
}
interface BoardData {
  name: string;
  sharedAssets: { css?: string; fonts?: string[] };
  tweaks: Tweaks;
  tweaksSchema: TweaksSchema;
  sitemap: SitemapPage[];
  pages: PageData[];
}

type RightTab = "variables" | "tweaks" | "tags";

export function ClaudeDesignBuilder({ siteId }: { siteId: string }) {
  const [data, setData] = React.useState<BoardData | null>(null);
  const [activeSlug, setActiveSlug] = React.useState("/");
  const [tab, setTab] = React.useState<RightTab>("tweaks");
  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = React.useCallback(async () => {
    const res = await authedFetch(`/api/site-builder/claude/${siteId}/pages`);
    if (!res.ok) { toast.error("Chargement impossible"); return; }
    const d = (await res.json()) as BoardData;
    setData(d);
    setActiveSlug((prev) => (d.pages.some((p) => p.slug === prev) ? prev : d.pages[0]?.slug ?? "/"));
  }, [siteId]);

  React.useEffect(() => { load(); }, [load]);

  const debounce = (key: string, fn: () => void, ms = 600) => {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(fn, ms);
  };

  const active = data?.pages.find((p) => p.slug === activeSlug) ?? null;

  const handleEdit = (key: string, entry: OverrideEntry) => {
    if (!data || !active) return;
    const overrides = { ...active.overrides, [key]: entry };
    setData({ ...data, pages: data.pages.map((p) => p.slug === active.slug ? { ...p, overrides } : p) });
    debounce(`ov-${active.instanceId}`, async () => {
      await authedFetch(`/api/site-builder/claude/${siteId}/pages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: active.instanceId, overrides }),
      });
    });
  };

  const handleTweak = (k: string, v: string) => {
    if (!data) return;
    const tweaks = { ...data.tweaks, [k]: v };
    setData({ ...data, tweaks });
    debounce("tweaks", async () => {
      await authedFetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tweaks }),
      });
    });
  };

  const handleTag = (slug: string, serviceTag: string | null) => {
    if (!data) return;
    const sitemap = data.sitemap.map((p) => p.slug === slug ? { ...p, service_tag: serviceTag } : p);
    const pages = data.pages.map((p) => p.slug === slug ? { ...p, serviceTag } : p);
    setData({ ...data, sitemap, pages });
    debounce("sitemap", async () => {
      await authedFetch(`/api/site-builder/sites/${siteId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sitemap }),
      });
    });
  };

  const handleDeploy = async () => {
    const t = toast.loading("Déploiement…");
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/deploy`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec");
      toast.success(`Déployé : ${body.url}`, { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Déploiement impossible", { id: t });
    }
  };

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      {/* Page tabs */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {data.pages.map((p) => (
            <button
              key={p.slug}
              onClick={() => setActiveSlug(p.slug)}
              className={`rounded-md px-3 py-1.5 text-xs ${p.slug === activeSlug ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
            >
              {p.title}{p.serviceTag ? ` · ${p.serviceTag}` : ""}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-2" onClick={handleDeploy}>
          <Rocket className="h-4 w-4" /> Déployer
        </Button>
      </div>

      <div className="grid flex-1 grid-cols-[1fr_320px] gap-3 overflow-hidden">
        {/* Preview */}
        <div className="overflow-hidden rounded-lg">
          {active && (
            <InlinePreview
              key={active.slug}
              html={active.html}
              sharedCss={data.sharedAssets.css ?? ""}
              fontLinks={data.sharedAssets.fonts ?? []}
              tweaks={data.tweaks}
              overrides={active.overrides}
              onEdit={handleEdit}
            />
          )}
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-3 overflow-y-auto rounded-lg border p-3">
          <div className="flex gap-1">
            {(["tweaks", "variables", "tags"] as RightTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md px-2 py-1 text-xs capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
              >
                {t === "tweaks" ? "Thème" : t === "variables" ? "Variables" : "Tags"}
              </button>
            ))}
          </div>
          {tab === "tweaks" && (
            <TweaksPanel
              controls={[
                ...(data.tweaksSchema?.theme ?? []),
                ...(data.tweaksSchema?.pageExtras?.[activeSlug] ?? []),
              ]}
              tweaks={data.tweaks}
              onChange={handleTweak}
            />
          )}
          {tab === "variables" && <VariablesPanel siteId={siteId} onRetokenised={load} />}
          {tab === "tags" && <TagToggles sitemap={data.sitemap} onChange={handleTag} />}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Astuce : clique un texte pour l&apos;éditer, clique une image pour changer son URL. Les modifications sont enregistrées automatiquement.
      </p>
    </div>
  );
}

export default ClaudeDesignBuilder;
