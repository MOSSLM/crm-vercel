"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Info,
  PhoneIncoming,
  Megaphone,
  Music,
  Menu as MenuIcon,
  Hash,
  PhoneForwarded,
  Voicemail as VoicemailIcon,
  PhoneOff,
} from "lucide-react";
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

function NodeIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "say":
      return <Megaphone className="ico-sm" />;
    case "play":
      return <Music className="ico-sm" />;
    case "menu":
      return <MenuIcon className="ico-sm" />;
    case "wait_dtmf":
      return <Hash className="ico-sm" />;
    case "redirect":
      return <PhoneForwarded className="ico-sm" />;
    case "voicemail":
      return <VoicemailIcon className="ico-sm" />;
    default:
      return <PhoneOff className="ico-sm" />;
  }
}
function iconTone(kind: string): string {
  if (kind === "say" || kind === "play") return "magic";
  if (kind === "menu") return "accent";
  if (kind === "wait_dtmf" || kind === "redirect" || kind === "voicemail") return "info";
  return "";
}
function nodeSummary(n: Node): string {
  return (
    n.config.text ??
    n.config.target ??
    (n.config.dtmf ? `touche ${n.config.dtmf}` : "—")
  );
}

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

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
      </div>
    );

  const activeScenario = scenarios.find((s) => s.id === active) ?? null;

  return (
    <div className="tel-skin" style={{ height: "min(78vh, 860px)", minHeight: 480 }}>
      <div className="svi-page" style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {/* FLOW */}
        <div className="svi-flow-wrap">
          <div className="svi-hd">
            <div>
              <h1>Serveur vocal (SVI)</h1>
              <div className="sub">
                {activeScenario ? activeScenario.name : "Voie dynamique · webhook Zadarma"}
              </div>
            </div>
          </div>

          {!active ? (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>
              Créez ou sélectionnez un scénario à droite.
            </p>
          ) : (
            <div className="svi-flow">
              <div className="svi-node entry">
                <span className="ic">
                  <PhoneIncoming className="ico-sm" />
                </span>
                <div>
                  <div className="t">Appel entrant</div>
                  <div className="s">Routage dynamique</div>
                </div>
              </div>

              {nodes.map((n) => (
                <div key={n.id} style={{ display: "contents" }}>
                  <div className="svi-conn" />
                  <div className="svi-node">
                    <span className={`ic ${iconTone(n.kind)}`}>
                      <NodeIcon kind={n.kind} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t">{KINDS.find((k) => k.id === n.kind)?.label ?? n.kind}</div>
                      <div className="s" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nodeSummary(n)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn ghost sm icon"
                      onClick={() => deleteNode(n.id)}
                      aria-label="Supprimer l'étape"
                    >
                      <Trash2 className="ico-sm" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add node */}
              <div className="svi-conn" />
              <div className="svi-node col fallback">
                <div className="svi-node-top">
                  <span className="ic accent">
                    <Plus className="ico-sm" />
                  </span>
                  <div className="t">Ajouter une étape</div>
                </div>
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft((s) => ({ ...s, kind: e.target.value }))}
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
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={draft.dtmf}
                    onChange={(e) => setDraft((s) => ({ ...s, dtmf: e.target.value }))}
                    placeholder="Touche"
                    style={{ width: 90 }}
                  />
                  <input
                    value={draft.target}
                    onChange={(e) => setDraft((s) => ({ ...s, target: e.target.value }))}
                    placeholder="Cible (ext/num)"
                    style={{ flex: 1 }}
                  />
                </div>
                <button type="button" className="btn accent sm" onClick={addNode}>
                  <Plus className="ico-sm" /> Ajouter l&apos;étape
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SIDE */}
        <aside className="svi-side">
          <div className="blk">
            <h4>Scénarios</h4>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nouveau scénario"
                style={{ minWidth: 0, flex: 1 }}
              />
              <button type="button" className="btn accent sm icon" onClick={createScenario} aria-label="Créer">
                <Plus className="ico-sm" />
              </button>
            </div>
            {scenarios.length === 0 && (
              <p style={{ fontSize: 12.5, color: "var(--text-3)" }}>Aucun scénario.</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {scenarios.map((s) => (
                <div key={s.id} className="svi-set" style={{ marginBottom: 0 }}>
                  <button
                    type="button"
                    onClick={() => setActive(s.id)}
                    style={{
                      appearance: "none",
                      border: 0,
                      background: "transparent",
                      textAlign: "left",
                      flex: 1,
                      minWidth: 0,
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 12.5,
                      fontWeight: active === s.id ? 600 : 400,
                      color: active === s.id ? "var(--accent-2)" : "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                  </button>
                  <label className="svi-toggle">
                    <input type="checkbox" checked={s.active} onChange={() => toggleActive(s)} />
                    <span className="tk" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="blk">
            <h4>À propos</h4>
            <div className="svi-callback">
              <Info className="ico-sm" />
              <div>
                <div className="s" style={{ marginTop: 0 }}>
                  Le scénario est exploité par le routage dynamique (réponse au webhook Zadarma). Le SVI
                  statique reste configurable au panneau ; cet éditeur pilote la voie dynamique.
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
