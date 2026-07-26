"use client";

/**
 * Équipe (admin) : chaque hôte — admin et agents — avec sa page publique,
 * ses compteurs de RDV et des raccourcis (copier le lien, voir ses résas).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Users } from "lucide-react";
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
      <div className="blk empty">
        <Loader2 size={18} className="spin" style={{ margin: "0 auto 8px" }} />
        Chargement…
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="blk empty">
        <Users size={22} />
        Aucun membre actif.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <div
          key={m.user_id}
          className="rowcard"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "12px 14px" }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              backgroundColor: colorOf(m.name),
            }}
          >
            {initials(m.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="nm">{m.name}</span>
              <span className="pill outline">{m.role === "admin" ? "Admin" : "Agent"}</span>
              {m.username && !m.page_active ? (
                <span className="pill danger">Page désactivée</span>
              ) : null}
            </div>
            <p
              className="mono"
              style={{
                margin: "2px 0 0",
                fontSize: 10.5,
                color: "var(--text-3)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {m.username ? `/rdv/${m.username}` : "Page non configurée (créée à sa première visite)"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "center" }}>
            <div>
              <p className="mono" style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>
                {m.upcoming}
              </p>
              <p className="cs-tag" style={{ margin: 0 }}>
                à venir
              </p>
            </div>
            <div>
              <p
                className="mono"
                style={{ margin: 0, fontWeight: 600, fontSize: 15, color: m.pending ? "var(--warn)" : undefined }}
              >
                {m.pending}
              </p>
              <p className="cs-tag" style={{ margin: 0 }}>
                en attente
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {m.username ? (
              <>
                <button type="button" className="btn outline xs" onClick={() => copyLink(m.username!)}>
                  <Copy size={12} /> Lien
                </button>
                <a
                  href={`${getAppUrlClient()}/rdv/${m.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn outline icon xs"
                  aria-label="Ouvrir la page"
                >
                  <ExternalLink size={12} />
                </a>
              </>
            ) : null}
            <Link href={`${basePath}/reservations?host=${m.user_id}`} className="btn ghost xs">
              Ses résas
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
