"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Check, X, Inbox, Users, Workflow, RefreshCw } from "lucide-react";
import { one, agentLabel, type Agent, type Ent } from "./agents/shared";
import AgentPermissionsPanel from "./agents/AgentPermissionsPanel";
import AgentQualificationReview from "./agents/AgentQualificationReview";
import AgentActivityFeed from "./agents/AgentActivityFeed";
import {
  OwnedPanel,
  PoolPanel,
  type AgentProspect,
  type PipelineOption,
  type PoolProspect,
  type StageOption,
} from "./agents/ProspectPanels";

type Sequence = {
  id: string;
  name: string | null;
  status: string;
  steps_count: number;
  /** `tous` = ouverte à tout le monde, l'attribution nominative ne s'applique pas. */
  acces?: "tous" | "choisis";
};
type SeqAssignment = { automation_id: string; agent_id: string };
type ClaimRequest = {
  id: string;
  created_at: string;
  entreprise: Ent | Ent[] | null;
  agent: Agent | Agent[] | null;
};

type PoolPayload = {
  prospects: PoolProspect[];
  pipelines: PipelineOption[];
  stages: StageOption[];
  owned_counts: Record<string, number>;
  truncated: boolean;
};

const EMPTY_POOL: PoolPayload = {
  prospects: [],
  pipelines: [],
  stages: [],
  owned_counts: {},
  truncated: false,
};

export default function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [pool, setPool] = useState<PoolPayload>(EMPTY_POOL);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [seqAssignments, setSeqAssignments] = useState<SeqAssignment[]>([]);
  const [agentProspects, setAgentProspects] = useState<AgentProspect[]>([]);
  const [ownedPipelines, setOwnedPipelines] = useState<PipelineOption[]>([]);
  const [prospectsLoading, setProspectsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** Id en cours de traitement à l'unité, et lot en cours — pour figer l'UI juste. */
  const [busyEnt, setBusyEnt] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [agentsRes, poolJson, reqJson, seqJson] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .eq("role", "freelance")
        .order("full_name", { nullsFirst: false }),
      authedFetch("/api/admin/agent-pool").then((r) => (r.ok ? r.json() : null)),
      authedFetch("/api/admin/claim-requests").then((r) => (r.ok ? r.json() : [])),
      authedFetch("/api/admin/agent-sequences").then((r) =>
        r.ok ? r.json() : { sequences: [], assignments: [] },
      ),
    ]);
    const ag = (agentsRes.data ?? []) as Agent[];
    setAgents(ag);
    setSelectedAgent((cur) => cur || ag[0]?.id || "");
    setPool(poolJson ? ({ ...EMPTY_POOL, ...poolJson } as PoolPayload) : EMPTY_POOL);
    setRequests((reqJson ?? []) as ClaimRequest[]);
    setSequences((seqJson?.sequences ?? []) as Sequence[]);
    setSeqAssignments((seqJson?.assignments ?? []) as SeqAssignment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Prospects (+ avancement des 4 étapes du pipeline) de l'agent sélectionné.
  // `reqRef` ignore les réponses dépassées : sans ça, la requête lancée avant
  // un retrait peut arriver après celle d'après et réafficher l'entreprise
  // qu'on vient d'enlever.
  const reqRef = useRef(0);
  const loadProspects = useCallback(async (agentId: string) => {
    const seq = ++reqRef.current;
    if (!agentId) {
      setAgentProspects([]);
      setOwnedPipelines([]);
      return;
    }
    setProspectsLoading(true);
    try {
      const res = await authedFetch(`/api/admin/agent-prospects?agent_id=${agentId}`);
      const data = res.ok ? await res.json() : { prospects: [], pipelines: [] };
      if (seq === reqRef.current) {
        setAgentProspects((data?.prospects ?? []) as AgentProspect[]);
        setOwnedPipelines((data?.pipelines ?? []) as PipelineOption[]);
      }
    } catch {
      if (seq === reqRef.current) {
        setAgentProspects([]);
        setOwnedPipelines([]);
      }
    } finally {
      if (seq === reqRef.current) setProspectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProspects(selectedAgent);
  }, [selectedAgent, loadProspects]);

  const refreshLists = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), loadProspects(selectedAgent)]);
    } finally {
      setRefreshing(false);
    }
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

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgent) ?? null,
    [agents, selectedAgent],
  );
  const currentAgentName = currentAgent ? agentLabel(currentAgent) : "l'agent";

  /** Marque l'action en cours : une seule ligne, ou tout le panneau si c'est un lot. */
  const startBusy = (ids: number[]) => {
    if (ids.length === 1) setBusyEnt(ids[0]);
    else setBulkBusy(true);
  };
  const endBusy = () => {
    setBusyEnt(null);
    setBulkBusy(false);
  };

  type Failure = { entreprise_id: number; error: string };

  /** « 3 attribuées, 1 en échec » plutôt qu'un succès qui cache une moitié ratée. */
  const reportPartial = (done: number, failed: Failure[], verb: string) => {
    if (failed.length === 0) {
      toast.success(`${done} entreprise${done > 1 ? "s" : ""} ${verb}.`);
      return;
    }
    toast.warning(
      `${done} ${verb}, ${failed.length} en échec (${failed[0].error || "raison inconnue"}).`,
    );
  };

  const assign = async (entrepriseIds: number[]) => {
    if (!selectedAgent) {
      toast.error("Choisis d'abord un agent.");
      return;
    }
    if (entrepriseIds.length === 0) return;
    startBusy(entrepriseIds);
    try {
      const res = await authedFetch("/api/admin/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_ids: entrepriseIds, agent_id: selectedAgent }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "");
      reportPartial(
        Number(data?.assigned ?? entrepriseIds.length),
        (data?.failed ?? []) as Failure[],
        `attribuée${entrepriseIds.length > 1 ? "s" : ""} à ${currentAgentName}`,
      );
      await refreshLists();
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      toast.error(detail ? `Attribution impossible : ${detail}` : "Attribution impossible.");
    } finally {
      endBusy();
    }
  };

  const unassign = async (entrepriseIds: number[]) => {
    if (!selectedAgent || entrepriseIds.length === 0) return;
    startBusy(entrepriseIds);
    try {
      const params = new URLSearchParams({
        entreprise_ids: entrepriseIds.join(","),
        agent_id: selectedAgent,
      });
      const res = await authedFetch(`/api/admin/assign?${params}`, { method: "DELETE" });
      // Un retrait qui échoue à mi-chemin laissait l'entreprise dans un état
      // bâtard : on remonte la raison exacte plutôt qu'un « impossible » muet.
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || data?.message || "");
      reportPartial(
        Number(data?.released ?? entrepriseIds.length),
        (data?.failed ?? []) as Failure[],
        `remise${entrepriseIds.length > 1 ? "s" : ""} dans le pool`,
      );
      await refreshLists();
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      toast.error(detail ? `Retrait impossible : ${detail}` : "Retrait impossible.");
    } finally {
      endBusy();
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Attribue ou retire des entreprises à tes agents, ouvre-leur la qualification et le
          marketing pipeline, et valide leur pré-tri. Une attribution ouvre l&apos;opportunité et
          crée la tâche d&apos;appel à froid dans leur démarchage ; un retrait remet
          l&apos;entreprise dans le pool et arrête ses séquences en cours.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!loading && (
        <>
          {/* Agent picker — drives every section below, et reste accessible
              quand on fait défiler les listes. */}
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-4 py-3 text-sm shadow-sm backdrop-blur">
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
                  {agentLabel(a)} ({pool.owned_counts[a.id] ?? 0})
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {agentProspects.length} entreprise{agentProspects.length > 1 ? "s" : ""} attribuée
              {agentProspects.length > 1 ? "s" : ""} · {pool.prospects.length} dans le pool
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8"
              disabled={refreshing}
              onClick={() => void refreshLists()}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Rafraîchir
            </Button>
          </div>

          {/* Pool ⇄ agent: two fixed-height, independently scrolling lists.
              C'est le cœur de l'écran, donc juste sous le sélecteur d'agent. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PoolPanel
              prospects={pool.prospects}
              pipelines={pool.pipelines}
              stages={pool.stages}
              truncated={pool.truncated}
              loading={refreshing && pool.prospects.length === 0}
              agentName={currentAgentName}
              canAssign={!!selectedAgent}
              busyId={busyEnt}
              bulkBusy={bulkBusy}
              onAssign={assign}
            />

            <OwnedPanel
              prospects={agentProspects}
              pipelines={ownedPipelines}
              loading={prospectsLoading}
              agentName={currentAgentName}
              busyId={busyEnt}
              bulkBusy={bulkBusy}
              onUnassign={unassign}
            />
          </div>

          {/* Ce que l'agent a le droit de faire. */}
          {selectedAgent && (
            <AgentPermissionsPanel agentId={selectedAgent} agentName={agentLabel(currentAgent)} />
          )}

          {/* Le pré-tri à valider — le cœur de la boucle agent → admin. */}
          <AgentQualificationReview
            agentId={selectedAgent}
            agents={agents}
            onChanged={refreshLists}
          />

          {/* Ce que l'agent a fait, et ce qu'il a dépensé. */}
          {selectedAgent && <AgentActivityFeed agentId={selectedAgent} />}

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
              prospects et exécuter les étapes manuelles (WhatsApp, LinkedIn, appel). Une séquence
              ouverte à tous les agents n&apos;a pas besoin d&apos;être attribuée : c&apos;est dans
              Automatisations › Séquences qu&apos;on la restreint.
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
                      {s.acces === "choisis" ? (
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
                      ) : (
                        // Rien à attribuer : tous les agents l'ont déjà. Un bouton
                        // « Attribuer » ici cocherait une ligne sans effet visible.
                        <Badge variant="secondary">Ouverte à tous</Badge>
                      )}
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
