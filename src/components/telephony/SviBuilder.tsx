"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Info, Power } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

interface Scenario {
  id: string;
  name: string;
  active: boolean;
}
interface Node {
  id: string;
  kind: string;
  config: { text?: string; dtmf?: string; target?: string };
  position: number;
}

const KINDS: Array<{ id: string; label: string }> = [
  { id: "say", label: "Annonce (TTS)" },
  { id: "play", label: "Message audio" },
  { id: "menu", label: "Menu DTMF" },
  { id: "wait_dtmf", label: "Attendre une touche" },
  { id: "redirect", label: "Rediriger" },
  { id: "voicemail", label: "Messagerie" },
  { id: "hangup", label: "Raccrocher" },
];

export function SviBuilder() {
  const supabase = createClient();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState({ kind: "say", text: "", dtmf: "", target: "" });

  const loadScenarios = useCallback(async () => {
    const { data } = await supabase
      .from("ivr_scenarios")
      .select("id, name, active")
      .order("created_at", { ascending: true });
    const rows = (data as Scenario[]) ?? [];
    setScenarios(rows);
    setActive((cur) => cur ?? rows[0]?.id ?? null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNodes = useCallback(async (scenarioId: string | null) => {
    if (!scenarioId) return setNodes([]);
    const { data } = await supabase
      .from("ivr_nodes")
      .select("id, kind, config, position")
      .eq("scenario_id", scenarioId)
      .order("position", { ascending: true });
    setNodes((data as Node[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);
  useEffect(() => {
    void loadNodes(active);
  }, [active, loadNodes]);

  const createScenario = async () => {
    if (!newName.trim()) return;
    const { data, error } = await supabase
      .from("ivr_scenarios")
      .insert({ name: newName.trim() })
      .select("id")
      .maybeSingle();
    if (error) return toast.error("Création impossible", { description: error.message });
    setNewName("");
    await loadScenarios();
    if (data?.id) setActive(data.id as string);
  };

  const toggleActive = async (s: Scenario) => {
    setScenarios((xs) => xs.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
    await supabase.from("ivr_scenarios").update({ active: !s.active }).eq("id", s.id);
  };

  const addNode = async () => {
    if (!active) return;
    const config: Node["config"] = {};
    if (draft.text) config.text = draft.text;
    if (draft.dtmf) config.dtmf = draft.dtmf;
    if (draft.target) config.target = draft.target;
    const { error } = await supabase.from("ivr_nodes").insert({
      scenario_id: active,
      kind: draft.kind,
      config,
      position: (nodes[nodes.length - 1]?.position ?? 0) + 10,
    });
    if (error) return toast.error("Ajout impossible", { description: error.message });
    setDraft({ kind: "say", text: "", dtmf: "", target: "" });
    await loadNodes(active);
  };

  const deleteNode = async (id: string) => {
    await supabase.from("ivr_nodes").delete().eq("id", id);
    await loadNodes(active);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border bg-[var(--surface-2)] p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Le scénario est exploité par le routage dynamique (réponse au webhook Zadarma). Le SVI
          statique reste configurable au panneau ; cet éditeur pilote la voie dynamique.
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Scenarios */}
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nouveau scénario"
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={createScenario}
              className="rounded-md bg-primary px-2 text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {scenarios.map((s) => (
            <div
              key={s.id}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                active === s.id ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <button type="button" onClick={() => setActive(s.id)} className="min-w-0 flex-1 truncate text-left text-sm">
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => toggleActive(s)}
                title={s.active ? "Actif" : "Inactif"}
                className={s.active ? "text-emerald-600" : "text-muted-foreground"}
              >
                <Power className="h-4 w-4" />
              </button>
            </div>
          ))}
          {scenarios.length === 0 && <p className="text-sm text-muted-foreground">Aucun scénario.</p>}
        </div>

        {/* Flow */}
        <div className="space-y-2 rounded-lg border p-3">
          {!active ? (
            <p className="text-sm text-muted-foreground">Sélectionnez un scénario.</p>
          ) : (
            <>
              <div className="rounded-md border-2 border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
                Appel entrant
              </div>
              {nodes.map((n) => (
                <div key={n.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">
                    {KINDS.find((k) => k.id === n.kind)?.label ?? n.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {n.config.text ?? n.config.target ?? (n.config.dtmf ? `touche ${n.config.dtmf}` : "")}
                  </span>
                  <button type="button" onClick={() => deleteNode(n.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {/* Add node */}
              <div className="mt-2 flex flex-wrap items-end gap-2 border-t pt-3">
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft((s) => ({ ...s, kind: e.target.value }))}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <input
                  value={draft.text}
                  onChange={(e) => setDraft((s) => ({ ...s, text: e.target.value }))}
                  placeholder="Texte / annonce"
                  className="min-w-[140px] flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                />
                <input
                  value={draft.dtmf}
                  onChange={(e) => setDraft((s) => ({ ...s, dtmf: e.target.value }))}
                  placeholder="Touche"
                  className="w-16 rounded-md border bg-background px-2 py-1 text-sm"
                />
                <input
                  value={draft.target}
                  onChange={(e) => setDraft((s) => ({ ...s, target: e.target.value }))}
                  placeholder="Cible (ext/num)"
                  className="w-28 rounded-md border bg-background px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={addNode}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-sm text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> Ajouter
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
