"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, CheckCircle2, FileText, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthContext";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { useTelephonyOptional } from "./CallProvider";
import { CallJournal } from "./CallJournal";

interface QueueItem {
  oppId: string;
  name: string;
  entrepriseId: number | null;
  org: string | null;
  ville: string | null;
  phone: string | null;
}

const DISPOSITIONS: Array<{ id: string; label: string; kind: string }> = [
  { id: "rdv", label: "RDV pris", kind: "magic" },
  { id: "interesse", label: "Intéressé", kind: "ok" },
  { id: "rappel", label: "À rappeler", kind: "warn" },
  { id: "repondeur", label: "Répondeur", kind: "info" },
  { id: "absent", label: "Pas de réponse", kind: "muted" },
  { id: "refus", label: "Pas intéressé", kind: "danger" },
];

const SCRIPT_STEPS = [
  { title: "Accroche", body: "Bonjour {org}, je vous appelle car j'ai vu votre présence en ligne — 30 secondes ?" },
  { title: "Découverte", body: "Comment gérez-vous aujourd'hui vos demandes entrantes / votre site ?" },
  { title: "Valeur", body: "On aide les entreprises de {ville} à convertir plus, sans effort de leur côté." },
  { title: "Closing RDV", body: "Je vous propose un point de 15 min cette semaine — plutôt mardi ou jeudi ?" },
];

const AV_COLORS = ["#E2552B", "#3B7DD8", "#7A5AF0", "#2E9E6B", "#D8912E", "#C64B8C"];
function colorOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

/** Cockpit d'appel (skin prototype ck-*) : file de prospection, surface d'appel, contexte. */
export function Cockpit() {
  const { user } = useAuth();
  const tel = useTelephonyOptional();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("opportunites")
        .select("id, name, entreprise:entreprises(id, name, ville, telephone)")
        .eq("owner_id", user.id)
        .limit(60);
      const items: QueueItem[] = (data ?? [])
        .map((o) => {
          const ent = Array.isArray(o.entreprise) ? o.entreprise[0] : o.entreprise;
          return {
            oppId: o.id as string,
            name: (o.name as string) || (ent?.name as string) || "Prospect",
            entrepriseId: (ent?.id as number | null) ?? null,
            org: (ent?.name as string | null) ?? null,
            ville: (ent?.ville as string | null) ?? null,
            phone: (ent?.telephone as string | null) ?? null,
          };
        })
        .filter((i) => i.phone);
      setQueue(items);
      setSelected(items[0]?.oppId ?? null);
      setLoading(false);
    })();
  }, [user?.id]);

  const current = useMemo(() => queue.find((q) => q.oppId === selected) ?? null, [queue, selected]);

  const call = () => {
    if (!current?.phone) return;
    void tel?.dial({
      to: current.phone,
      entrepriseId: current.entrepriseId,
      opportuniteId: current.oppId,
    });
  };

  const logOutcome = async (disposition: string) => {
    if (!current) return;
    await authedFetch("/api/telephony/cockpit/outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunite_id: current.oppId, disposition, note: note.trim() || null }),
    }).catch(() => {});
    setDone((d) => new Set(d).add(current.oppId));
    toast.success("Issue enregistrée");
    setNote("");
    setStep(0);
    const idx = queue.findIndex((q) => q.oppId === current.oppId);
    const next = queue.slice(idx + 1).find((q) => !done.has(q.oppId));
    setSelected(next?.oppId ?? null);
  };

  if (loading)
    return (
      <div className="tel-skin">
        <p style={{ padding: 24, color: "var(--text-3)", fontSize: 13 }}>Chargement…</p>
      </div>
    );

  const pct = queue.length ? (done.size / queue.length) * 100 : 0;

  return (
    <div className="tel-skin" style={{ height: "100%" }}>
      <div className="pros-3col cockpit" style={{ height: "100%" }}>
        {/* LEFT — file power dialer */}
        <aside className="pros-left">
          <div className="ck-session">
            <div className="ck-session-top">
              <div>
                <div className="lb">Session démarchage</div>
                <div className="vl">
                  {done.size}
                  <span>/{queue.length}</span> traités
                </div>
              </div>
            </div>
            <div className="ck-progress">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="pros-tabs-bar">
            <button type="button" className="pros-tab" aria-selected>
              File du jour<span className="nb">{queue.length}</span>
            </button>
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            {queue.length === 0 && (
              <div className="ck-empty" style={{ padding: 14 }}>
                Aucun prospect à appeler.
              </div>
            )}
            {queue.map((q) => {
              const isDone = done.has(q.oppId);
              const isCur = q.oppId === selected;
              return (
                <div
                  key={q.oppId}
                  className={`ck-qrow ${isDone ? "done" : ""}`}
                  aria-selected={isCur}
                  onClick={() => setSelected(q.oppId)}
                >
                  <div
                    className="av"
                    style={{ background: colorOf(q.name), color: "#fff", border: 0 }}
                  >
                    {initials(q.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">
                      {q.name}
                      {isDone && (
                        <CheckCircle2
                          className="ico-xs"
                          style={{ color: "var(--ok)", marginLeft: 4 }}
                        />
                      )}
                    </div>
                    <div className="sb">{[q.org, q.ville].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="ck-qmeta">
                    {q.phone && <div className="best">{q.phone}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER — surface d'appel */}
        <main className="ck-center">
          {!current ? (
            <div className="ck-idle">
              <div className="ck-idle-reason">
                <CheckCircle2 className="ico-sm" />
                File terminée — tous les prospects ont été traités.
              </div>
            </div>
          ) : (
            <>
              <div className="ck-callhd">
                <div className="ck-callhd-l">
                  <div className="av" style={{ background: colorOf(current.name) }}>
                    {initials(current.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{current.name}</div>
                    <div className="sb">
                      {[current.org, current.ville].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="ck-callhd-r">
                  <div className="ck-phone-line">
                    <Phone className="ico-sm" />
                    {current.phone}
                  </div>
                </div>
              </div>

              <div className="ck-idle">
                <button type="button" className="ck-bigcall" onClick={call}>
                  <span className="ring">
                    <Phone className="ico-xl" />
                  </span>
                  <span className="t">
                    Appeler {current.name.split(" ")[0]}
                    <em>{current.phone}</em>
                  </span>
                </button>
                {!tel && (
                  <div className="ck-idle-reason">
                    Softphone non disponible — l'appel utilisera le callback serveur.
                  </div>
                )}

                {/* Script */}
                <div className="ck-script">
                  <div className="ck-script-hd">
                    <FileText className="ico-sm" />
                    <div className="ti">Argumentaire</div>
                  </div>
                  <div className="ck-steps">
                    {SCRIPT_STEPS.map((s, i) => (
                      <button
                        key={s.title}
                        type="button"
                        className={`ck-step ${i === step ? "cur" : ""} ${i < step ? "past" : ""}`}
                        onClick={() => setStep(i)}
                      >
                        <span className="n">{i + 1}</span>
                        {s.title}
                      </button>
                    ))}
                  </div>
                  <div className="ck-script-body">
                    <p>
                      {SCRIPT_STEPS[step].body
                        .replace("{org}", current.org ?? "votre entreprise")
                        .replace("{ville}", current.ville ?? "votre région")}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                <div className="ck-notes">
                  <div className="ck-notes-lb">
                    <StickyNote className="ico-xs" />
                    Notes d'appel
                    <span className="auto">enregistrées sur la fiche</span>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ce qu'il dit, ses besoins, prochaine étape…"
                  />
                </div>

                {/* Dispositions */}
                <div className="ck-dispo-bar">
                  <div className="lb">Marquer l'issue</div>
                  <div className="chips">
                    {DISPOSITIONS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={`dchip ${d.kind}`}
                        onClick={() => logOutcome(d.id)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        {/* RIGHT — contexte prospect */}
        <aside className="pros-right">
          <div className="blk">
            <h4>Historique d'appels</h4>
            {current?.entrepriseId ? (
              <CallJournal filters={{ entreprise_id: current.entrepriseId }} />
            ) : (
              <div className="ck-empty">Sélectionnez un prospect.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
