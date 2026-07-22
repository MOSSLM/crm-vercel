"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, Flame, CheckCircle2, ChevronRight } from "lucide-react";
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

const DISPOSITIONS: Array<{ id: string; label: string; tone: string }> = [
  { id: "rdv", label: "RDV pris", tone: "bg-violet-600 text-white" },
  { id: "interesse", label: "Intéressé", tone: "bg-emerald-600 text-white" },
  { id: "rappel", label: "À rappeler", tone: "bg-amber-500 text-white" },
  { id: "repondeur", label: "Répondeur", tone: "bg-sky-600 text-white" },
  { id: "absent", label: "Pas de réponse", tone: "bg-muted text-foreground" },
  { id: "refus", label: "Pas intéressé", tone: "bg-red-600 text-white" },
];

const SCRIPT_STEPS = [
  { title: "Accroche", body: "Bonjour {org}, je vous appelle car j'ai vu votre présence en ligne — 30 secondes ?" },
  { title: "Découverte", body: "Comment gérez-vous aujourd'hui vos demandes entrantes / votre site ?" },
  { title: "Valeur", body: "On aide les entreprises de {ville} à convertir plus, sans effort de leur côté." },
  { title: "Closing RDV", body: "Je vous propose un point de 15 min cette semaine — plutôt mardi ou jeudi ?" },
];

/** Cockpit d'appel : file de prospection, surface d'appel, contexte. */
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

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="grid h-full gap-4 p-4 md:p-6 lg:grid-cols-[300px_1fr_320px]">
      {/* Queue */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            File du jour
          </span>
          <span className="text-xs text-muted-foreground">
            {done.size}/{queue.length}
          </span>
        </div>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto">
          {queue.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">Aucun prospect à appeler.</p>
          )}
          {queue.map((q) => (
            <button
              key={q.oppId}
              type="button"
              onClick={() => setSelected(q.oppId)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${
                selected === q.oppId ? "bg-muted" : "hover:bg-muted/50"
              } ${done.has(q.oppId) ? "opacity-50" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{q.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[q.org, q.ville].filter(Boolean).join(" · ")}
                </span>
              </span>
              {done.has(q.oppId) && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
            </button>
          ))}
        </div>
      </div>

      {/* Call surface */}
      <div className="space-y-4">
        {!current ? (
          <div className="flex h-40 items-center justify-center rounded-lg border text-sm text-muted-foreground">
            File terminée 🎉
          </div>
        ) : (
          <>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">{current.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {[current.org, current.ville].filter(Boolean).join(" · ")} · {current.phone}
              </p>
              <button
                type="button"
                onClick={call}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-white shadow hover:bg-emerald-700"
              >
                <Phone className="h-5 w-5" /> Appeler {current.name.split(" ")[0]}
              </button>
              {!tel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Softphone non disponible — l'appel utilisera le callback serveur.
                </p>
              )}
            </div>

            {/* Script */}
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SCRIPT_STEPS.map((s, i) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => setStep(i)}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      step === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}. {s.title}
                  </button>
                ))}
              </div>
              <p className="text-sm">
                {SCRIPT_STEPS[step].body
                  .replace("{org}", current.org ?? "votre entreprise")
                  .replace("{ville}", current.ville ?? "votre région")}
              </p>
            </div>

            {/* Notes */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Notes d'appel (enregistrées sur la fiche)…"
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Dispositions */}
            <div className="flex flex-wrap gap-2">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => logOutcome(d.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${d.tone}`}
                >
                  {d.label} <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Context: call history for the prospect */}
      <div className="space-y-2 rounded-lg border p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Historique d'appels
        </span>
        {current?.entrepriseId ? (
          <CallJournal filters={{ entreprise_id: current.entrepriseId }} />
        ) : (
          <p className="text-sm text-muted-foreground">Sélectionnez un prospect.</p>
        )}
      </div>
    </div>
  );
}
