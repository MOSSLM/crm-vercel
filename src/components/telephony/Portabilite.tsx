"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Info } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";

interface Porting {
  id: string;
  e164: string;
  operator: string | null;
  line_type: string;
  status: string;
  rio: string | null;
  notes: string | null;
}

const STATUSES = ["brouillon", "soumis", "en_cours", "bloque", "termine"];
const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  soumis: "Soumis",
  en_cours: "En cours opérateur",
  bloque: "Bloqué",
  termine: "Terminé",
};

export function Portabilite() {
  const supabase = createClient();
  const [items, setItems] = useState<Porting[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ e164: "", operator: "", line_type: "fixe" });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("number_portings")
      .select("id, e164, operator, line_type, status, rio, notes")
      .order("created_at", { ascending: false });
    setItems((data as Porting[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!form.e164.trim()) return;
    const { error } = await supabase.from("number_portings").insert({
      e164: form.e164.trim(),
      operator: form.operator.trim() || null,
      line_type: form.line_type,
    });
    if (error) {
      toast.error("Ajout impossible", { description: error.message });
      return;
    }
    setForm({ e164: "", operator: "", line_type: "fixe" });
    await load();
  };

  const setStatus = async (id: string, status: string) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("number_portings").update({ status }).eq("id", id);
    if (error) toast.error("Mise à jour impossible.");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border bg-[var(--surface-2)] p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Le portage (MNP) chez Zadarma est une démarche manuelle avec justificatifs/KYC au
          panneau. Cet écran suit l’avancement des demandes ; il ne déclenche pas le portage.
        </span>
      </div>

      {/* Add form */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div>
          <label className="block text-xs text-muted-foreground">Numéro</label>
          <input
            value={form.e164}
            onChange={(e) => setForm((s) => ({ ...s, e164: e.target.value }))}
            placeholder="+33…"
            className="rounded-md border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Opérateur actuel</label>
          <input
            value={form.operator}
            onChange={(e) => setForm((s) => ({ ...s, operator: e.target.value }))}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Type</label>
          <select
            value={form.line_type}
            onChange={(e) => setForm((s) => ({ ...s, line_type: e.target.value }))}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="fixe">Fixe</option>
            <option value="mobile">Mobile</option>
            <option value="tollfree">Numéro vert</option>
          </select>
        </div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Nouvelle demande
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande de portabilité.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Numéro</th>
                <th className="px-3 py-2 font-medium">Opérateur</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{p.e164}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.operator ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.line_type}</td>
                  <td className="px-3 py-2">
                    <select
                      value={p.status}
                      onChange={(e) => setStatus(p.id, e.target.value)}
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
