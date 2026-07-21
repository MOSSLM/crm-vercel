"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Asset = { id: string; public_url: string; filename: string };

/**
 * Post-purchase adaptation form on the client dashboard: the buyer describes what
 * they want changed and uploads their logo / images, so our team can re-adapt the
 * site they just bought. Brief is stored on sites.client_brief; files go through
 * the existing /api/site-builder/assets pipeline (optimised + stored per site).
 */
export function SiteAdaptationCard() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = useCallback(async (id: string) => {
    const res = await authedFetch(`/api/site-builder/assets?site=${id}`);
    if (res.ok) {
      const data = (await res.json()) as Asset[];
      setAssets(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("sites")
        .select("id, client_brief")
        .limit(1)
        .maybeSingle();
      if (data) {
        setSiteId(data.id as string);
        setBrief((data as { client_brief?: string | null }).client_brief ?? "");
        await loadAssets(data.id as string);
      }
      setLoading(false);
    };
    void load();
  }, [supabase, loadAssets]);

  const saveBrief = async () => {
    if (!siteId) return;
    setSaving(true);
    const res = await authedFetch(`/api/site-builder/sites/${siteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_brief: brief.trim() || null }),
    });
    setSaving(false);
    if (res.ok) toast.success("Brief enregistré. Merci !");
    else toast.error("Impossible d’enregistrer le brief.");
  };

  const handleFiles = async (files: FileList | null) => {
    if (!siteId || !files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authedFetch(`/api/site-builder/assets?site=${siteId}`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) ok += 1;
    }
    await loadAssets(siteId);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (ok > 0) toast.success(`${ok} fichier${ok > 1 ? "s" : ""} téléversé${ok > 1 ? "s" : ""}.`);
    else toast.error("Le téléversement a échoué.");
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personnaliser mon site</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Chargement…</CardContent>
      </Card>
    );
  }

  if (!siteId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personnaliser mon site</CardTitle>
          <CardDescription>
            Votre site sera bientôt rattaché à votre compte. Revenez ici pour nous transmettre vos
            éléments.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Personnaliser mon site</CardTitle>
        <CardDescription>
          Dites-nous ce que vous voulez adapter et téléversez votre logo, vos images et tout élément
          utile. Notre équipe s’en sert pour personnaliser votre site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="client-brief">Vos consignes d’adaptation</Label>
          <Textarea
            id="client-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder="Textes à modifier, services & certifications à mettre en avant, couleurs, ton, exemples que vous aimez…"
          />
          <div>
            <Button onClick={saveBrief} disabled={saving} size="sm">
              {saving ? "Enregistrement…" : "Enregistrer le brief"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo &amp; images</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Téléversement…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Téléverser des fichiers
              </>
            )}
          </Button>

          {assets.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map((a) => (
                <a
                  key={a.id}
                  href={a.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                  title={a.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.public_url}
                    alt={a.filename}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" /> Aucun fichier pour l’instant.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
