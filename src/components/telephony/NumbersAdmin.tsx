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

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-8">
      {/* Numbers */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Numéros</h2>
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Synchroniser
          </button>
        </div>

        {/* Manual add (useful before/without a synced number) */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div>
            <label className="block text-xs text-muted-foreground">Numéro (E.164)</label>
            <input
              value={newNum.e164}
              onChange={(e) => setNewNum((s) => ({ ...s, e164: e.target.value }))}
              placeholder="+33…"
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Libellé</label>
            <input
              value={newNum.label}
              onChange={(e) => setNewNum((s) => ({ ...s, label: e.target.value }))}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Type</label>
            <select
              value={newNum.number_type}
              onChange={(e) => setNewNum((s) => ({ ...s, number_type: e.target.value }))}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value="unknown">—</option>
              <option value="landline">Fixe</option>
              <option value="mobile">Mobile</option>
              <option value="tollfree">Numéro vert</option>
            </select>
          </div>
          <button
            type="button"
            onClick={addNumber}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Ajouter un numéro
          </button>
        </div>

        {numbers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun numéro. Cliquez sur « Synchroniser » pour importer depuis le fournisseur.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Numéro</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Agent attribué</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => (
                  <tr key={n.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{n.e164}</td>
                    <td className="px-3 py-2 text-muted-foreground">{n.number_type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{n.status}</td>
                    <td className="px-3 py-2">
                      <select
                        value={n.assigned_agent_id ?? ""}
                        onChange={(e) => assignNumber(n.id, e.target.value)}
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                      >
                        <option value="">Non attribué</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => deleteNumber(n.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Supprimer le numéro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Extensions */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Extensions / SIP par agent</h2>
        <p className="text-sm text-muted-foreground">
          L’extension pilote le softphone (clé WebRTC) et l’enregistrement de l’agent.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Extension</th>
                <th className="px-3 py-2 font-medium">SIP</th>
                <th className="px-3 py-2 font-medium">Enregistrement</th>
                <th className="px-3 py-2 font-medium">Actif</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {extensions.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <select
                      value={x.agent_id ?? ""}
                      onChange={(e) => updateExt(x.id, { agent_id: e.target.value || null })}
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={x.extension}
                      onChange={(e) => editExtLocal(x.id, { extension: e.target.value })}
                      onBlur={(e) => persistExt(x.id, { extension: e.target.value })}
                      className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={x.sip ?? ""}
                      onChange={(e) => editExtLocal(x.id, { sip: e.target.value })}
                      onBlur={(e) => persistExt(x.id, { sip: e.target.value.trim() || null })}
                      placeholder="ex. 420031"
                      className="w-28 rounded-md border bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={x.record_mode}
                      onChange={(e) => updateExt(x.id, { record_mode: e.target.value })}
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      {RECORD_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={x.active}
                      onChange={(e) => updateExt(x.id, { active: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => deleteExt(x.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Supprimer l'extension"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {/* Add row */}
              <tr className="bg-muted/20">
                <td className="px-3 py-2">
                  <select
                    value={newExt.agent_id}
                    onChange={(e) => setNewExt((s) => ({ ...s, agent_id: e.target.value }))}
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                  >
                    <option value="">—</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    value={newExt.extension}
                    onChange={(e) => setNewExt((s) => ({ ...s, extension: e.target.value }))}
                    placeholder="100"
                    className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={newExt.sip}
                    onChange={(e) => setNewExt((s) => ({ ...s, sip: e.target.value }))}
                    placeholder="SIP login"
                    className="w-28 rounded-md border bg-background px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={newExt.record_mode}
                    onChange={(e) => setNewExt((s) => ({ ...s, record_mode: e.target.value }))}
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                  >
                    {RECORD_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={addExt}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
