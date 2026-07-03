"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Phone, Check, X, Inbox, Users, Workflow } from "lucide-react";

type Agent = { id: string; full_name: string | null; email: string | null };
type Ent = { id: number; name: string | null; ville: string | null; telephone: string | null };
type Sequence = { id: string; name: string | null; status: string; steps_count: number };
type SeqAssignment = { automation_id: string; agent_id: string };
type ClaimRequest = {
  id: string;
  created_at: string;
  entreprise: Ent | Ent[] | null;
  agent: Agent | Agent[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

function agentLabel(a: Agent | null): string {
  if (!a) return "Agent";
  return a.full_name?.trim() || a.email || "Agent";
}

export default function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [pool, setPool] = useState<Ent[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [seqAssignments, setSeqAssignments] = useState<SeqAssignment[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [agentsRes, poolRes, reqJson, seqJson] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .eq("role", "freelance")
        .order("full_name", { nullsFirst: false }),
      supabase
        .from("entreprises")
        .select("id, name, ville, telephone")
        .is("owner_id", null)
        .eq("qualifie", true)
        .order("name")
        .limit(100),
      authedFetch("/api/admin/claim-requests").then((r) => (r.ok ? r.json() : [])),
      authedFetch("/api/admin/agent-sequences").then((r) =>
        r.ok ? r.json() : { sequences: [], assignments: [] },
      ),
    ]);
    const ag = (agentsRes.data ?? []) as Agent[];
    setAgents(ag);
    setSelectedAgent((cur) => cur || ag[0]?.id || "");
    setPool((poolRes.data ?? []) as Ent[]);
    setRequests((reqJson ?? []) as ClaimRequest[]);
    setSequences((seqJson?.sequences ?? []) as Sequence[]);
    setSeqAssignments((seqJson?.assignments ?? []) as SeqAssignment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (requestId: string, decision: "approve" | "refuse") => {
    setBusy(requestId);
    try {
      const res = await authedFetch("/api/admin/claim-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
      if (!res.ok) throw new Error();
      toast.success(decision === "approve" ? "Demande approuvée." : "Demande refusée.");
      await load();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusy(null);
    }
  };

  const toggleSequence = async (automationId: string, assigned: boolean) => {
    if (!selectedAgent) {
      toast.error("Choisis d'abord un agent.");
      return;
    }
    setBusy(`seq-${automationId}`);
    try {
      const res = await authedFetch("/api/admin/agent-sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation_id: automationId,
          agent_id: selectedAgent,
          assigned,
        }),
      });
      if (!res.ok) throw new Error();
      setSeqAssignments((cur) =>
        assigned
          ? [...cur, { automation_id: automationId, agent_id: selectedAgent }]
          : cur.filter((a) => !(a.automation_id === automationId && a.agent_id === selectedAgent)),
      );
      toast.success(assigned ? "Séquence attribuée à l'agent." : "Séquence retirée.");
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusy(null);
    }
  };

  const assign = async (entrepriseId: number) => {
    if (!selectedAgent) {
      toast.error("Choisis d'abord un agent.");
      return;
    }
    setBusy(`ent-${entrepriseId}`);
    try {
      const res = await authedFetch("/api/admin/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_id: entrepriseId, agent_id: selectedAgent }),
      });
      if (!res.ok) throw new Error();
      toast.success("Prospect attribué à l'agent.");
      await load();
    } catch {
      toast.error("Attribution impossible.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Attribue des prospects CVC à tes agents et traite leurs demandes. Une attribution ouvre
          l&apos;opportunité et crée la tâche d&apos;appel à froid dans leur démarchage.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && (
        <>
          {/* Pending claim requests */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Inbox className="h-4 w-4" /> Demandes en attente{" "}
              <span className="text-muted-foreground">({requests.length})</span>
            </h2>
            {requests.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Aucune demande d&apos;attribution en attente.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => {
                  const ent = one(r.entreprise);
                  const agent = one(r.agent);
                  const disabled = busy === r.id;
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{ent?.name || "Sans nom"}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Demandé par <span className="font-medium">{agentLabel(agent)}</span>
                          {ent?.ville ? ` · ${ent.ville}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" disabled={disabled} onClick={() => decide(r.id, "approve")}>
                          <Check className="mr-1 h-4 w-4" /> Approuver
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={disabled}
                          onClick={() => decide(r.id, "refuse")}
                        >
                          <X className="mr-1 h-4 w-4" /> Refuser
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Direct assignment from the pool */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-4 w-4" /> Attribuer un prospect
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Agent :</span>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {agents.length === 0 && <option value="">Aucun agent</option>}
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {agentLabel(a)}
                  </option>
                ))}
              </select>
            </div>

            {pool.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Aucun prospect qualifié disponible dans le pool.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pool.map((e) => {
                  const disabled = busy === `ent-${e.id}` || !selectedAgent;
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{e.name || "Sans nom"}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {e.ville && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {e.ville}
                            </span>
                          )}
                          {e.telephone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {e.telephone}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button size="sm" disabled={disabled} onClick={() => assign(e.id)}>
                        Attribuer
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Sequence assignment for the selected agent */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Workflow className="h-4 w-4" /> Séquences de l&apos;agent
            </h2>
            <p className="text-sm text-muted-foreground">
              L&apos;agent sélectionné ci-dessus pourra lancer les séquences attribuées sur ses
              prospects et exécuter les étapes manuelles (WhatsApp, LinkedIn, appel).
            </p>
            {sequences.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Aucune séquence créée. Crée d&apos;abord une séquence dans Automatisations.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {sequences.map((s) => {
                  const assigned = seqAssignments.some(
                    (a) => a.automation_id === s.id && a.agent_id === selectedAgent,
                  );
                  const disabled = busy === `seq-${s.id}` || !selectedAgent;
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="truncate">{s.name || "Séquence sans nom"}</span>
                          <Badge variant={s.status === "on" ? "default" : "secondary"}>
                            {s.status === "on" ? "Active" : s.status === "paused" ? "En pause" : "Brouillon"}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {s.steps_count} étape{s.steps_count > 1 ? "s" : ""}
                          {s.status !== "on" &&
                            " · visible côté agent seulement quand la séquence est activée"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={assigned ? "outline" : "default"}
                        disabled={disabled}
                        onClick={() => toggleSequence(s.id, !assigned)}
                      >
                        {assigned ? (
                          <>
                            <X className="mr-1 h-4 w-4" /> Retirer
                          </>
                        ) : (
                          <>
                            <Check className="mr-1 h-4 w-4" /> Attribuer
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
