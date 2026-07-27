"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Building2,
  MapPin,
  Phone,
  Check,
  X,
  Inbox,
  Users,
  Workflow,
  FileText,
  Globe,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Search,
} from "lucide-react";

type Agent = { id: string; full_name: string | null; email: string | null };
type Ent = { id: number; name: string | null; ville: string | null; telephone: string | null };
type Sequence = { id: string; name: string | null; status: string; steps_count: number };
type SeqAssignment = { automation_id: string; agent_id: string };
type AgentProspect = {
  id: number;
  name: string | null;
  ville: string | null;
  audit: { statut: string; url: string | null; ready: boolean } | null;
  demo: { url: string | null; is_published: boolean; build_stage: string | null; ready: boolean } | null;
};
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

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}

/** Fixed-height panel with its own scrollbar, so the page never grows with the list. */
function ListPanel({
  title,
  icon,
  count,
  hint,
  search,
  onSearch,
  searchPlaceholder,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  hint: string;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-[32rem] flex-col rounded-xl border bg-card">
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon} {title} <span className="text-muted-foreground">({count})</span>
        </h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [pool, setPool] = useState<Ent[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [seqAssignments, setSeqAssignments] = useState<SeqAssignment[]>([]);
  const [agentProspects, setAgentProspects] = useState<AgentProspect[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [poolQuery, setPoolQuery] = useState("");
  const [ownedQuery, setOwnedQuery] = useState("");
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
        .limit(200),
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

  // Prospects (+ audit / site démo readiness) of the selected agent.
  const loadProspects = useCallback(async (agentId: string) => {
    if (!agentId) {
      setAgentProspects([]);
      return;
    }
    setProspectsLoading(true);
    try {
      const res = await authedFetch(`/api/admin/agent-prospects?agent_id=${agentId}`);
      const data = res.ok ? await res.json() : { prospects: [] };
      setAgentProspects((data?.prospects ?? []) as AgentProspect[]);
    } catch {
      setAgentProspects([]);
    } finally {
      setProspectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProspects(selectedAgent);
  }, [selectedAgent, loadProspects]);

  const refreshLists = useCallback(async () => {
    await Promise.all([load(), loadProspects(selectedAgent)]);
  }, [load, loadProspects, selectedAgent]);

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
      await refreshLists();
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
      await refreshLists();
    } catch {
      toast.error("Attribution impossible.");
    } finally {
      setBusy(null);
    }
  };

  const unassign = async (entrepriseId: number) => {
    if (!selectedAgent) return;
    setBusy(`ent-${entrepriseId}`);
    try {
      const res = await authedFetch(
        `/api/admin/assign?entreprise_id=${entrepriseId}&agent_id=${selectedAgent}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      toast.success("Prospect retiré de l'agent, remis dans le pool.");
      await refreshLists();
    } catch {
      toast.error("Retrait impossible.");
    } finally {
      setBusy(null);
    }
  };

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgent) ?? null,
    [agents, selectedAgent],
  );
  const filteredPool = useMemo(
    () => pool.filter((e) => matches(poolQuery, e.name, e.ville, e.telephone)),
    [pool, poolQuery],
  );
  const filteredOwned = useMemo(
    () => agentProspects.filter((p) => matches(ownedQuery, p.name, p.ville)),
    [agentProspects, ownedQuery],
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Attribue ou retire des entreprises à tes agents et traite leurs demandes. Une attribution
          ouvre l&apos;opportunité et crée la tâche d&apos;appel à froid dans leur démarchage ; un
          retrait remet l&apos;entreprise dans le pool et arrête ses séquences en cours.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && (
        <>
          {/* Agent picker — drives both columns and the sequence list below. */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
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
            <span className="text-xs text-muted-foreground">
              {agentProspects.length} entreprise{agentProspects.length > 1 ? "s" : ""} attribuée
              {agentProspects.length > 1 ? "s" : ""}
            </span>
          </div>

          {/* Pool ⇄ agent: two fixed-height, independently scrolling lists. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ListPanel
              title="Pool disponible"
              icon={<Inbox className="h-4 w-4" />}
              count={filteredPool.length}
              hint="Entreprises qualifiées sans agent. Clique sur Attribuer pour les donner à l'agent sélectionné."
              search={poolQuery}
              onSearch={setPoolQuery}
              searchPlaceholder="Filtrer par nom, ville, téléphone…"
            >
              {filteredPool.length === 0 ? (
                <EmptyRow>
                  {pool.length === 0
                    ? "Aucun prospect qualifié disponible dans le pool."
                    : "Aucune entreprise ne correspond à ce filtre."}
                </EmptyRow>
              ) : (
                filteredPool.map((e) => {
                  const disabled = busy === `ent-${e.id}` || !selectedAgent;
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
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
                      <Button
                        size="sm"
                        className="shrink-0"
                        disabled={disabled}
                        onClick={() => assign(e.id)}
                      >
                        Attribuer <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </ListPanel>

            <ListPanel
              title={`Entreprises de ${currentAgent ? agentLabel(currentAgent) : "l'agent"}`}
              icon={<Building2 className="h-4 w-4" />}
              count={filteredOwned.length}
              hint="Avec l'état de leur audit et de leur site démo. Retirer les remet dans le pool."
              search={ownedQuery}
              onSearch={setOwnedQuery}
              searchPlaceholder="Filtrer par nom, ville…"
            >
              {prospectsLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Chargement…</div>
              ) : filteredOwned.length === 0 ? (
                <EmptyRow>
                  {agentProspects.length === 0
                    ? "Aucune entreprise attribuée à cet agent."
                    : "Aucune entreprise ne correspond à ce filtre."}
                </EmptyRow>
              ) : (
                filteredOwned.map((p) => {
                  const disabled = busy === `ent-${p.id}`;
                  return (
                    <div key={p.id} className="rounded-lg border bg-background px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{p.name || "Sans nom"}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            {p.ville && <span className="text-muted-foreground">{p.ville}</span>}
                            <Badge variant={p.audit?.ready ? "default" : "secondary"}>
                              {p.audit?.ready
                                ? "Audit prêt"
                                : p.audit
                                  ? "Audit en cours"
                                  : "Pas d'audit"}
                            </Badge>
                            <Badge variant={p.demo?.ready ? "default" : "secondary"}>
                              {p.demo?.is_published
                                ? "Site en ligne"
                                : p.demo?.ready
                                  ? "Site prêt"
                                  : p.demo
                                    ? "Site en cours"
                                    : "Pas de site"}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-destructive hover:text-destructive"
                          disabled={disabled}
                          onClick={() => unassign(p.id)}
                        >
                          <ArrowLeft className="mr-1 h-4 w-4" /> Retirer
                        </Button>
                      </div>
                      {(p.audit?.url || p.demo?.url) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.audit?.url && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                              <a href={p.audit.url} target="_blank" rel="noreferrer">
                                <FileText className="mr-1 h-3.5 w-3.5" /> Audit
                              </a>
                            </Button>
                          )}
                          {p.demo?.url && (
                            <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                              <a href={p.demo.url} target="_blank" rel="noreferrer">
                                <Globe className="mr-1 h-3.5 w-3.5" /> Site démo
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </ListPanel>
          </div>

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
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-card p-3">
                {requests.map((r) => {
                  const ent = one(r.entreprise);
                  const agent = one(r.agent);
                  const disabled = busy === r.id;
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
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
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border bg-card p-3">
                {sequences.map((s) => {
                  const assigned = seqAssignments.some(
                    (a) => a.automation_id === s.id && a.agent_id === selectedAgent,
                  );
                  const disabled = busy === `seq-${s.id}` || !selectedAgent;
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
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
