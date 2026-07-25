"use client";

/**
 * Équipe (admin) : chaque hôte — admin et agents — avec sa page publique,
 * ses compteurs de RDV et des raccourcis (copier le lien, voir ses résas).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchTeam, type TeamMember } from "@/lib/scheduling/client";
import { getAppUrlClient } from "./shared";

const AV_COLORS = ["#E2552B", "#3B7DD8", "#7A5AF0", "#2E9E6B", "#D8912E", "#C64B8C"];
const colorOf = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
};
const initials = (name: string): string => {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
};

export default function TeamOverview({ basePath }: { basePath: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchTeam();
        setMembers(data.members);
      } catch (err) {
        toast.error("Chargement de l'équipe impossible", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const copyLink = (username: string) => {
    void navigator.clipboard.writeText(`${getAppUrlClient()}/rdv/${username}`);
    toast.success("Lien de réservation copié");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border bg-card py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border bg-card py-16 text-center shadow-sm">
        <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">Aucun membre actif.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <div key={m.user_id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: colorOf(m.name) }}
          >
            {initials(m.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{m.name}</p>
              <Badge variant="outline">{m.role === "admin" ? "Admin" : "Agent"}</Badge>
              {m.username && !m.page_active ? (
                <Badge className="bg-red-100 text-red-700">Page désactivée</Badge>
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {m.username ? `/rdv/${m.username}` : "Page non configurée (créée à sa première visite)"}
            </p>
          </div>
          <div className="flex items-center gap-4 text-center text-sm">
            <div>
              <p className="font-semibold tabular-nums">{m.upcoming}</p>
              <p className="text-[11px] text-muted-foreground">à venir</p>
            </div>
            <div>
              <p className={`font-semibold tabular-nums ${m.pending ? "text-amber-600" : ""}`}>
                {m.pending}
              </p>
              <p className="text-[11px] text-muted-foreground">en attente</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {m.username ? (
              <>
                <Button size="sm" variant="outline" onClick={() => copyLink(m.username!)}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Lien
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={`${getAppUrlClient()}/rdv/${m.username}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" asChild>
              <Link href={`${basePath}/reservations?host=${m.user_id}`}>Ses résas</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
