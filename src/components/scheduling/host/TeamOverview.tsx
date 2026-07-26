"use client";

/**
 * Équipe — portage de `ScreenTeam` (rdv-screens-c.jsx) : liste `rv-mem` des
 * hôtes avec page publique, compteurs et barre de charge.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchTeam, type TeamMember } from "@/lib/scheduling/client";
import { Btn, Pill, Row, Seg, rvColor, rvInit } from "../rdv/atoms";
import { SectionHeader } from "./CalShell";
import { getAppUrlClient } from "../rdv/shared";

export default function TeamOverview({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("all");

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

  const rows = members.filter((m) => (scope === "ag" ? m.role === "freelance" : true));
  const maxLoad = Math.max(4, ...members.map((m) => m.upcoming + m.pending));

  const copy = (username: string) => {
    void navigator.clipboard.writeText(`${getAppUrlClient()}/rdv/${username}`);
    toast.success("Lien de réservation copié");
  };

  return (
    <>
      <SectionHeader
        title="Équipe"
        subtitle="Les pages de réservation de tout le monde, leur charge et leurs demandes en attente."
        actions={
          <Btn
            kind="outline"
            ic="copy"
            onClick={() => {
              const links = members
                .filter((m) => m.username)
                .map((m) => `${m.name} : ${getAppUrlClient()}/rdv/${m.username}`)
                .join("\n");
              if (!links) return;
              void navigator.clipboard.writeText(links);
              toast.success("Tous les liens copiés");
            }}
          >
            Copier tous les liens
          </Btn>
        }
      />

      <div className="rv-list" style={{ marginBottom: 16 }}>
        <div className="rv-list-hd">
          <h3>Hôtes</h3>
          <span className="n">{rows.length} actifs</span>
          <Seg
            opts={[
              { id: "all", lb: "Tous" },
              { id: "ag", lb: "Agents" },
            ]}
            val={scope}
            set={setScope}
          />
        </div>

        {loading ? (
          <div style={{ padding: 40 }}>
            <div className="rv-empty">Chargement…</div>
          </div>
        ) : rows.length ? (
          rows.map((m) => {
            const load = m.upcoming + m.pending;
            const ratio = load / maxLoad;
            const color = rvColor(m.name);
            return (
              <div key={m.user_id} className="rv-mem">
                <span className="av" style={{ background: color }}>
                  {rvInit(m.name)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">
                    {m.name}
                    <Pill kind={m.role === "admin" ? "accent" : ""}>
                      {m.role === "admin" ? "Admin" : "Agent"}
                    </Pill>
                    {m.username && !m.page_active ? (
                      <Pill kind="warn" dot>
                        page désactivée
                      </Pill>
                    ) : null}
                  </div>
                  <div className="u">
                    {m.username ? `/rdv/${m.username}` : "page non configurée"} · {m.email}
                  </div>
                </div>
                <div className="kv">
                  <div className="v">{m.upcoming}</div>
                  <div className="l">à venir</div>
                </div>
                <div className="kv">
                  <div className={`v ${m.pending ? "w" : ""}`.trim()}>{m.pending}</div>
                  <div className="l">à valider</div>
                </div>
                <div className="load">
                  <div className="bar">
                    <i
                      style={{
                        width: `${ratio * 100}%`,
                        background: ratio > 0.85 ? "var(--warn)" : color,
                      }}
                    />
                  </div>
                  <div className="l">{load} rendez-vous</div>
                </div>
                <Row style={{ gap: 5 }}>
                  {m.username ? (
                    <>
                      <Btn kind="outline" size="xs" ic="copy" onClick={() => copy(m.username!)}>
                        Lien
                      </Btn>
                      <Btn
                        kind="outline"
                        size="xs"
                        ic="ext"
                        onClick={() =>
                          window.open(`${getAppUrlClient()}/rdv/${m.username}`, "_blank")
                        }
                      />
                    </>
                  ) : null}
                  <Btn
                    kind="ghost"
                    size="xs"
                    onClick={() => router.push(`${basePath}/reservations?host=${m.user_id}`)}
                  >
                    Ses résas
                  </Btn>
                </Row>
              </div>
            );
          })
        ) : (
          <div style={{ padding: 40 }}>
            <div className="rv-empty">Aucun hôte actif.</div>
          </div>
        )}
      </div>
    </>
  );
}
