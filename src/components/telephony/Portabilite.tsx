"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Info, Phone, Smartphone, AlertTriangle, CheckCircle2 } from "lucide-react";
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

const STEPS = [
  { id: "brouillon", lb: "Brouillon" },
  { id: "soumis", lb: "Soumis" },
  { id: "en_cours", lb: "En cours" },
  { id: "termine", lb: "Terminé" },
];

export function Portabilite() {
  const supabase = createClient();
  const [items, setItems] = useState<Porting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ e164: "", operator: "", line_type: "fixe" });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("number_portings")
      .select("id, e164, operator, line_type, status, rio, notes")
      .order("created_at", { ascending: false });
    const rows = (data as Porting[]) ?? [];
    setItems(rows);
    setSelected((cur) => cur ?? rows[0]?.id ?? null);
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

  const current = useMemo(() => items.find((x) => x.id === selected) ?? null, [items, selected]);

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>Chargement…</p>
      </div>
    );

  const blocked = current?.status === "bloque";
  const curIdx = current ? (blocked ? 2 : Math.max(0, STEPS.findIndex((s) => s.id === current.status))) : 0;

  return (
    <div className="tel-skin" style={{ height: "min(78vh, 860px)", minHeight: 480 }}>
      <div className="po-page" style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {/* LIST */}
        <aside className="po-list">
          <div className="po-list-hd">
            <div>
              <h2>Portabilité</h2>
              <div className="subline">{items.length} demande(s)</div>
            </div>
          </div>

          {/* Add form */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={form.e164}
              onChange={(e) => setForm((s) => ({ ...s, e164: e.target.value }))}
              placeholder="Numéro à porter (+33…)"
            />
            <input
              value={form.operator}
              onChange={(e) => setForm((s) => ({ ...s, operator: e.target.value }))}
              placeholder="Opérateur actuel"
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={form.line_type}
                onChange={(e) => setForm((s) => ({ ...s, line_type: e.target.value }))}
                style={{ flex: 1 }}
              >
                <option value="fixe">Fixe</option>
                <option value="mobile">Mobile</option>
                <option value="tollfree">Numéro vert</option>
              </select>
              <button type="button" className="btn accent sm" onClick={add}>
                <Plus className="ico-sm" /> Ajouter
              </button>
            </div>
          </div>

          <div className="po-rows">
            {items.length === 0 ? (
              <p style={{ padding: 16, fontSize: 13, color: "var(--text-3)" }}>
                Aucune demande de portabilité.
              </p>
            ) : (
              items.map((p) => (
                <div
                  key={p.id}
                  className="po-row"
                  aria-selected={p.id === selected}
                  onClick={() => setSelected(p.id)}
                >
                  <span className={`po-type ${p.line_type === "mobile" ? "mobile" : ""}`}>
                    {p.line_type === "mobile" ? (
                      <Smartphone className="ico-sm" />
                    ) : (
                      <Phone className="ico-sm" />
                    )}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="e164">{p.e164}</div>
                    <div className="op">{p.operator ?? "opérateur inconnu"}</div>
                  </div>
                  <span
                    className={`pill ${p.status === "termine" ? "ok" : p.status === "bloque" ? "danger" : p.status === "brouillon" ? "" : "info"}`}
                  >
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="po-note-mobile">
            <Info className="ico-sm" />
            Le portage (MNP) chez Zadarma est manuel (justificatifs / KYC au panneau). Cet écran suit
            l&apos;avancement ; il ne déclenche pas le portage.
          </div>
        </aside>

        {/* DETAIL */}
        <main className="po-detail">
          {!current ? (
            <p style={{ fontSize: 13, color: "var(--text-3)" }}>Sélectionnez une demande.</p>
          ) : (
            <>
              <div className="po-dhd">
                <div>
                  <div className="po-dhd-e">
                    {current.e164}
                    <span className={`po-type inline ${current.line_type === "mobile" ? "mobile" : ""}`}>
                      {current.line_type}
                    </span>
                  </div>
                  <div className="po-dhd-sub">
                    Opérateur actuel : {current.operator ?? "—"}
                  </div>
                </div>
                <div className="fld" style={{ alignItems: "flex-end" }}>
                  <span className="fld-lb">Statut</span>
                  <select value={current.status} onChange={(e) => setStatus(current.id, e.target.value)}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stepper */}
              <div className="po-stepper">
                {STEPS.map((s, i) => {
                  const state =
                    blocked && i === curIdx
                      ? "blocked"
                      : i < curIdx || current.status === "termine"
                        ? "done"
                        : i === curIdx
                          ? "cur"
                          : "";
                  return (
                    <div key={s.id} className={`po-step ${state}`}>
                      <span className="dot">{state === "done" ? "✓" : i + 1}</span>
                      <span className="lb">{s.lb}</span>
                    </div>
                  );
                })}
              </div>

              {blocked && (
                <div className="po-blocked-banner">
                  <AlertTriangle className="ico-lg" />
                  <span>
                    Demande bloquée côté opérateur — vérifiez le <code>RIO</code>, le titulaire de la
                    ligne et les justificatifs, puis relancez la soumission.
                  </span>
                </div>
              )}

              <div className="po-grid">
                <div className="card">
                  <div className="card-hd">
                    <h3>Suivi</h3>
                  </div>
                  <div className="po-track">
                    <div className="po-track-row">
                      <span className="k">Numéro</span>
                      <span className="v mono">{current.e164}</span>
                    </div>
                    <div className="po-track-row">
                      <span className="k">Type de ligne</span>
                      <span className="v">{current.line_type}</span>
                    </div>
                    <div className="po-track-row">
                      <span className="k">Opérateur</span>
                      <span className="v">{current.operator ?? "—"}</span>
                    </div>
                    <div className="po-track-row">
                      <span className="k">RIO</span>
                      <span className="v mono">{current.rio ?? "—"}</span>
                    </div>
                    <div className="po-track-row">
                      <span className="k">Statut</span>
                      <span className="v">{STATUS_LABELS[current.status] ?? current.status}</span>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-hd">
                    <h3>Notes</h3>
                  </div>
                  <div style={{ padding: "6px 16px 16px", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>
                    {current.notes ?? "—"}
                  </div>
                </div>
              </div>

              {current.status === "termine" && (
                <div className="po-actions">
                  <span className="po-done">
                    <CheckCircle2 className="ico-sm" />
                    Portage terminé — le numéro est actif chez Zadarma.
                  </span>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
