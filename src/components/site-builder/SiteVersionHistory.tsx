"use client";

import React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { SiteVersion } from "@/types";
import { authedFetch } from "@/utils/authedFetch";

interface Props {
  siteId: string;
  onRestored?: () => void;
}

export function SiteVersionHistory({ siteId, onRestored }: Props) {
  const [open, setOpen] = React.useState(false);
  const [versions, setVersions] = React.useState<SiteVersion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const fetchVersions = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`/api/site-builder/sites/${siteId}/versions`);
      if (!res.ok) throw new Error();
      setVersions(await res.json());
    } catch {
      toast.error("Impossible de charger l'historique");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  React.useEffect(() => {
    if (open) fetchVersions();
  }, [open, fetchVersions]);

  const handleRestore = async (version: SiteVersion) => {
    if (!window.confirm(`Restaurer la version ${version.version_number} ? Cela créera une nouvelle version.`)) return;
    setRestoringId(version.id);
    try {
      const res = await fetch(
        `/api/site-builder/sites/${siteId}/versions/${version.id}/restore`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error();
      toast.success(`Version ${version.version_number} restaurée`);
      setOpen(false);
      onRestored?.();
    } catch {
      toast.error("Erreur lors de la restauration");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <History className="h-4 w-4" />
          Historique
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Historique des versions</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Aucune version sauvegardée
          </div>
        ) : (
          <ul className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-1">
            {versions.map((v, idx) => (
              <li
                key={v.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">v{v.version_number}</span>
                    {idx === 0 && (
                      <Badge variant="secondary" className="text-xs h-4">actuelle</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(v.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </span>
                  {v.change_description && (
                    <span className="text-xs text-muted-foreground truncate">{v.change_description}</span>
                  )}
                </div>
                {idx !== 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1.5 text-xs"
                    disabled={restoringId === v.id}
                    onClick={() => handleRestore(v)}
                  >
                    {restoringId === v.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Restaurer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
