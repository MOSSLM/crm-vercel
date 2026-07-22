"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";

interface Agent {
  id: string;
  label: string;
}
interface PhoneNumber {
  id: string;
  e164: string;
  number_type: string;
  status: string;
  assigned_agent_id: string | null;
}
interface Extension {
  id: string;
  agent_id: string | null;
  extension: string;
  sip: string | null;
  record_mode: string;
  active: boolean;
}

const RECORD_MODES = ["all", "optional", "off"];
const TYPE_CLASS: Record<string, string> = {
  landline: "local",
  mobile: "mobile",
  tollfree: "tollfree",
};

/** Numbers & extensions admin (skin prototype nm-*). */
export function NumbersAdmin() {
  const supabase = createClient();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newExt, setNewExt] = useState({ agent_id: "", extension: "", sip: "", record_mode: "all" });
  const [newNum, setNewNum] = useState({ e164: "", label: "", number_type: "unknown" });

  const load = useCallback(async () => {
    const [ag, nums, exts] = await Promise.all([
      supabase.from("user_profiles").select("id, full_name, email, role").in("role", ["freelance", "admin"]),
      supabase.from("phone_numbers").select("id, e164, number_type, status, assigned_agent_id").order("e164"),
      supabase.from("phone_extensions").select("id, agent_id, extension, sip, record_mode, active").order("extension"),
    ]);
    setAgents(
      (ag.data ?? []).map((a) => ({
        id: a.id as string,
        label: (a.full_name as string) || (a.email as string) || (a.id as string),
      })),
    );
    setNumbers((nums.data as PhoneNumber[]) ?? []);
    setExtensions((exts.data as Extension[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    const res = await authedFetch("/api/telephony/numbers/sync", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setSyncing(false);
    if (res.ok) {
      toast.success(`${json.synced ?? 0} numéro(s) synchronisé(s).`);
      await load();
    } else {
      toast.error("Synchronisation impossible", { description: json.detail ?? json.error });
    }
  };

  const assignNumber = async (id: string, agentId: string) => {
    const value = agentId || null;
    setNumbers((ns) => ns.map((n) => (n.id === id ? { ...n, assigned_agent_id: value } : n)));
    const { error } = await supabase.from("phone_numbers").update({ assigned_agent_id: value }).eq("id", id);
    if (error) toast.error("Mise à jour impossible.");
  };

  const updateExt = async (id: string, patch: Partial<Extension>) => {
    setExtensions((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const { error } = await supabase.from("phone_extensions").update(patch).eq("id", id);
    if (error) toast.error("Mise à jour impossible.");
  };

  const addExt = async () => {
    if (!newExt.extension.trim()) return;
    const { error } = await supabase.from("phone_extensions").insert({
      agent_id: newExt.agent_id || null,
      extension: newExt.extension.trim(),
      sip: newExt.sip.trim() || null,
      record_mode: newExt.record_mode,
    });
    if (error) {
      toast.error("Ajout impossible", { description: error.message });
      return;
    }
    setNewExt({ agent_id: "", extension: "", sip: "", record_mode: "all" });
    await load();
  };

  const editExtLocal = (id: string, patch: Partial<Extension>) =>
    setExtensions((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const persistExt = async (id: string, patch: Partial<Extension>) => {
    const { error } = await supabase.from("phone_extensions").update(patch).eq("id", id);
    if (error) toast.error("Mise à jour impossible.");
  };

  const deleteExt = async (id: string) => {
    if (!window.confirm("Supprimer cette extension ?")) return;
    setExtensions((es) => es.filter((e) => e.id !== id));
    const { error } = await supabase.from("phone_extensions").delete().eq("id", id);
    if (error) {
      toast.error("Suppression impossible.");
      await load();
    }
  };

  const deleteNumber = async (id: string) => {
    if (!window.confirm("Supprimer ce numéro ?")) return;
    setNumbers((ns) => ns.filter((n) => n.id !== id));
    const { error } = await supabase.from("phone_numbers").delete().eq("id", id);
    if (error) {
      toast.error("Suppression impossible.");
      await load();
    }
  };

  const addNumber = async () => {
    if (!newNum.e164.trim()) return;
    const { error } = await supabase.from("phone_numbers").insert({
      provider: "zadarma",
      e164: newNum.e164.trim(),
      label: newNum.label.trim() || null,
      number_type: newNum.number_type,
      status: "active",
    });
    if (error) {
      toast.error("Ajout impossible", { description: error.message });
      return;
    }
    setNewNum({ e164: "", label: "", number_type: "unknown" });
    await load();
  };

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
      </div>
    );

  const NUM_COLS = "1.4fr 90px 90px 1.3fr 40px";
  const EXT_COLS = "1.4fr 90px 130px 120px 60px 40px";

  return (
    <div className="tel-skin">
      <div className="nm-page">
        {/* Numbers */}
        <section className="adm-section">
          <div className="page-hd">
            <div>
              <h1>Numéros</h1>
              <div className="sub">Numéros du fournisseur, attribution aux agents.</div>
            </div>
            <div className="actions">
              <button type="button" className="btn subtle sm" onClick={sync} disabled={syncing}>
                {syncing ? (
                  <RefreshCw className="ico-sm" style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <RefreshCw className="ico-sm" />
                )}
                Synchroniser
              </button>
            </div>
          </div>

          {/* Manual add */}
          <div
            className="card"
            style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12, padding: 14, marginBottom: 14 }}
          >
            <div className="fld">
              <span className="fld-lb">Numéro (E.164)</span>
              <input
                value={newNum.e164}
                onChange={(e) => setNewNum((s) => ({ ...s, e164: e.target.value }))}
                placeholder="+33…"
              />
            </div>
            <div className="fld">
              <span className="fld-lb">Libellé</span>
              <input
                value={newNum.label}
                onChange={(e) => setNewNum((s) => ({ ...s, label: e.target.value }))}
              />
            </div>
            <div className="fld">
              <span className="fld-lb">Type</span>
              <select
                value={newNum.number_type}
                onChange={(e) => setNewNum((s) => ({ ...s, number_type: e.target.value }))}
              >
                <option value="unknown">—</option>
                <option value="landline">Fixe</option>
                <option value="mobile">Mobile</option>
                <option value="tollfree">Numéro vert</option>
              </select>
            </div>
            <button type="button" className="btn accent sm" onClick={addNumber}>
              <Plus className="ico-sm" /> Ajouter
            </button>
          </div>

          {numbers.length === 0 ? (
            <p className="adm-note">
              Aucun numéro. Cliquez sur « Synchroniser » pour importer depuis le fournisseur.
            </p>
          ) : (
            <div className="adm-tbl">
              <div className="nm-th" style={{ gridTemplateColumns: NUM_COLS }}>
                <span>Numéro</span>
                <span>Type</span>
                <span>Statut</span>
                <span>Agent attribué</span>
                <span />
              </div>
              {numbers.map((n) => (
                <div key={n.id} className="nm-tr" style={{ gridTemplateColumns: NUM_COLS }}>
                  <div className="nm-num">
                    <span className="e">{n.e164}</span>
                  </div>
                  <div>
                    {TYPE_CLASS[n.number_type] ? (
                      <span className={`nm-type ${TYPE_CLASS[n.number_type]}`}>{n.number_type}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-4)" }}>—</span>
                    )}
                  </div>
                  <div>
                    <span className={`pill ${n.status === "active" ? "ok" : ""}`}>{n.status}</span>
                  </div>
                  <div>
                    <select
                      value={n.assigned_agent_id ?? ""}
                      onChange={(e) => assignNumber(n.id, e.target.value)}
                      style={{ maxWidth: "100%" }}
                    >
                      <option value="">Non attribué</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="nm-actions">
                    <button
                      type="button"
                      className="btn ghost sm icon"
                      onClick={() => deleteNumber(n.id)}
                      aria-label="Supprimer le numéro"
                    >
                      <Trash2 className="ico-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Extensions */}
        <section className="adm-section">
          <div className="page-hd">
            <div>
              <h1>Extensions / SIP par agent</h1>
              <div className="sub">
                L&apos;extension pilote le softphone (clé WebRTC) et l&apos;enregistrement de l&apos;agent.
              </div>
            </div>
          </div>

          <div className="adm-tbl">
            <div className="nm-ag-th" style={{ gridTemplateColumns: EXT_COLS }}>
              <span>Agent</span>
              <span>Extension</span>
              <span>SIP</span>
              <span>Enregistrement</span>
              <span>Actif</span>
              <span />
            </div>
            {extensions.map((x) => (
              <div key={x.id} className="nm-ag-row" style={{ gridTemplateColumns: EXT_COLS }}>
                <div>
                  <select
                    value={x.agent_id ?? ""}
                    onChange={(e) => updateExt(x.id, { agent_id: e.target.value || null })}
                    style={{ maxWidth: "100%" }}
                  >
                    <option value="">—</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    value={x.extension}
                    onChange={(e) => editExtLocal(x.id, { extension: e.target.value })}
                    onBlur={(e) => persistExt(x.id, { extension: e.target.value })}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <input
                    value={x.sip ?? ""}
                    onChange={(e) => editExtLocal(x.id, { sip: e.target.value })}
                    onBlur={(e) => persistExt(x.id, { sip: e.target.value.trim() || null })}
                    placeholder="ex. 420031"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <select
                    value={x.record_mode}
                    onChange={(e) => updateExt(x.id, { record_mode: e.target.value })}
                    style={{ maxWidth: "100%" }}
                  >
                    {RECORD_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="checkbox"
                    checked={x.active}
                    onChange={(e) => updateExt(x.id, { active: e.target.checked })}
                  />
                </div>
                <div className="nm-actions">
                  <button
                    type="button"
                    className="btn ghost sm icon"
                    onClick={() => deleteExt(x.id)}
                    aria-label="Supprimer l'extension"
                  >
                    <Trash2 className="ico-sm" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add row */}
            <div
              className="nm-ag-row"
              style={{ gridTemplateColumns: EXT_COLS, background: "var(--surface-2)" }}
            >
              <div>
                <select
                  value={newExt.agent_id}
                  onChange={(e) => setNewExt((s) => ({ ...s, agent_id: e.target.value }))}
                  style={{ maxWidth: "100%" }}
                >
                  <option value="">—</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  value={newExt.extension}
                  onChange={(e) => setNewExt((s) => ({ ...s, extension: e.target.value }))}
                  placeholder="100"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <input
                  value={newExt.sip}
                  onChange={(e) => setNewExt((s) => ({ ...s, sip: e.target.value }))}
                  placeholder="SIP login"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <select
                  value={newExt.record_mode}
                  onChange={(e) => setNewExt((s) => ({ ...s, record_mode: e.target.value }))}
                  style={{ maxWidth: "100%" }}
                >
                  {RECORD_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div />
              <div className="nm-actions">
                <button type="button" className="btn accent sm icon" onClick={addExt} aria-label="Ajouter">
                  <Plus className="ico-sm" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
