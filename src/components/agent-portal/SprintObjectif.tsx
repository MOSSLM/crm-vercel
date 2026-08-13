"use client";
// SprintObjectif.tsx — le bloc d'objectif en tête du tableau de bord agent.
//
// Un seul chiffre compte vraiment (l'encaissé face à la cible) ; le reste est
// là pour dire ce qui, aujourd'hui, fait avancer ce chiffre. Chaque compteur
// affiche d'où il vient au survol : personne ne doit piloter sa journée sur un
// nombre dont il ignore la définition.
import React from "react";
import { authedFetch } from "@/utils/authedFetch";
import { Flame, Phone, Send, Eye, FileText, CalendarCheck, Handshake, Trophy, MessageCircle } from "lucide-react";

interface Compteur {
  today: number;
  total: number;
  targetToday?: number;
  mesure: string;
}

interface SprintData {
  objectif: {
    cents: number;
    encaisseCents: number;
    progression: number;
    deadline: string;
    joursRestants: number;
    rythmeRequisCents: number | null;
  };
  compteurs: Record<string, Compteur>;
}

const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 });

const LIGNES: Array<{ k: string; label: string; icon: React.ElementType; hot?: boolean }> = [
  { k: "nouveauxContacts", label: "Nouveaux contacts", icon: Phone },
  { k: "reponsesWhatsapp", label: "Réponses WhatsApp", icon: MessageCircle },
  { k: "demosEnvoyees", label: "Démos envoyées", icon: Send },
  { k: "demosVisitees", label: "Démos visitées", icon: Eye },
  { k: "auditsConsultes", label: "Audits consultés", icon: FileText },
  { k: "rdvAujourdhui", label: "RDV aujourd'hui", icon: CalendarCheck },
  { k: "offresEnDecision", label: "Offres en décision", icon: Handshake },
  { k: "ventes", label: "Ventes", icon: Trophy, hot: true },
];

export default function SprintObjectif({ aAppeler }: { aAppeler?: number }) {
  const [d, setD] = React.useState<SprintData | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    authedFetch("/api/agent/sprint")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setD(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!d) return null;
  const { objectif } = d;
  const pct = Math.round(objectif.progression * 100);
  const atteint = objectif.encaisseCents >= objectif.cents;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-4">
      <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-700 text-white">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="text-[11px] uppercase tracking-[.14em] text-white/60">Objectif du sprint</div>
          <div className="text-[11px] text-white/60 font-mono">
            {objectif.joursRestants > 0 ? `${objectif.joursRestants} j restants · jusqu'au ${objectif.deadline}` : "sprint terminé"}
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
          <span className="text-4xl font-semibold tabular-nums">{euros(objectif.encaisseCents)} €</span>
          <span className="text-lg text-white/50">/ {euros(objectif.cents)} € encaissés</span>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-white/15 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${atteint ? "bg-emerald-400" : "bg-blue-400"}`}
            style={{ width: `${Math.max(pct, 1.5)}%` }}
          />
        </div>
        <div className="mt-2 text-[12px] text-white/70">
          {atteint ? (
            <>Objectif atteint. 🎉</>
          ) : objectif.rythmeRequisCents != null ? (
            <>
              {pct} % — il reste <b className="text-white">{euros(objectif.cents - objectif.encaisseCents)} €</b>, soit{" "}
              <b className="text-white">{euros(objectif.rythmeRequisCents)} €/jour</b>.
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y divide-slate-100 border-t border-slate-100">
        {aAppeler != null && aAppeler > 0 ? (
          <div className="p-3 bg-orange-50" title="Prospects dont les signaux justifient un appel aujourd'hui">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-orange-700">
              <Flame className="w-3 h-3" />À appeler
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-orange-700">{aAppeler}</div>
            <div className="text-[10px] text-orange-600/80">maintenant</div>
          </div>
        ) : null}
        {LIGNES.map(({ k, label, icon: Icon, hot }) => {
          const c = d.compteurs[k];
          if (!c) return null;
          return (
            <div key={k} className="p-3" title={`Mesuré : ${c.mesure}`}>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                <Icon className="w-3 h-3" />
                {label}
              </div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${hot && c.total > 0 ? "text-emerald-600" : "text-slate-900"}`}>
                {c.today}
                {c.targetToday ? <span className="text-sm font-normal text-slate-400"> / {c.targetToday}</span> : null}
              </div>
              <div className="text-[10px] text-slate-400">
                {c.total} depuis le début
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
