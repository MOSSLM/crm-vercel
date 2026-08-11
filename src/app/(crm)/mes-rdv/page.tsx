"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  Headset,
  Loader2,
  Video,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { authedFetch } from "@/utils/authedFetch";
import { ouvrirCockpitRdv } from "@/components/rdv/CockpitRdv";
import type { CompteRendu, IssueCompteRendu } from "@/lib/rdv/types";

type Onglet = "a_venir" | "comptes_rendus" | "passes";

interface Booking {
  id: string;
  event_title: string;
  start_at: string;
  end_at: string;
  status: string;
  meeting_url: string | null;
  location_text: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  entreprise_id: number | null;
}

type CompteRenduListe = CompteRendu & {
  entreprises?: { name: string | null; ville: string | null } | null;
};

const ISSUE_LABEL: Record<IssueCompteRendu, string> = {
  interesse: "Intéressé",
  a_relancer: "À relancer",
  reflexion: "Réflexion",
  pas_interesse: "Pas intéressé",
  injoignable: "Injoignable",
  vendu: "Vendu",
};

const ISSUE_TON: Record<IssueCompteRendu, string> = {
  interesse: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  a_relancer: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  reflexion: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pas_interesse: "bg-red-500/15 text-red-700 dark:text-red-300",
  injoignable: "bg-slate-400/15 text-slate-600 dark:text-slate-300",
  vendu: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const dateCourte = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export default function MesRdvPage() {
  const [onglet, setOnglet] = React.useState<Onglet>("a_venir");
  const [aVenir, setAVenir] = React.useState<Booking[]>([]);
  const [passes, setPasses] = React.useState<Booking[]>([]);
  const [comptesRendus, setComptesRendus] = React.useState<CompteRenduListe[]>([]);
  const [chargement, setChargement] = React.useState(true);

  const charger = React.useCallback(async () => {
    setChargement(true);
    try {
      const [resAVenir, resPasses, resCR] = await Promise.all([
        authedFetch("/api/scheduling/bookings?filter=upcoming"),
        authedFetch("/api/scheduling/bookings?filter=past"),
        authedFetch("/api/rdv/comptes-rendus?mine=1&limit=200"),
      ]);

      if (resAVenir.ok) setAVenir(((await resAVenir.json()) as { bookings?: Booking[] }).bookings ?? []);
      if (resPasses.ok) setPasses(((await resPasses.json()) as { bookings?: Booking[] }).bookings ?? []);
      if (resCR.ok) setComptesRendus((await resCR.json()) as CompteRenduListe[]);
    } catch {
      toast.error("Impossible de charger tes rendez-vous");
    } finally {
      setChargement(false);
    }
  }, []);

  React.useEffect(() => {
    void charger();
  }, [charger]);

  /** Les RDV passés sans compte rendu : ce qu'il reste à rattraper. */
  const bookingsCouverts = React.useMemo(
    () => new Set(comptesRendus.map((cr) => cr.booking_id).filter(Boolean) as string[]),
    [comptesRendus],
  );

  const aRattraper = React.useMemo(
    () => passes.filter((b) => !bookingsCouverts.has(b.id)).length,
    [passes, bookingsCouverts],
  );

  const brouillons = React.useMemo(
    () => comptesRendus.filter((cr) => cr.statut === "brouillon").length,
    [comptesRendus],
  );

  return (
    <AppLayout>
      <div className="space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <CalendarClock className="h-6 w-6" />
              Mes RDV
            </h1>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Les rendez-vous à venir, les comptes rendus, et ce qu&apos;il reste à consigner.
            </p>
          </div>
          <button
            type="button"
            onClick={() => ouvrirCockpitRdv()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Headset className="h-4 w-4" />
            Nouveau compte rendu
          </button>
        </div>

        <div className="flex gap-1 rounded-lg bg-[var(--bg-2)] p-0.5">
          <Onglets actif={onglet === "a_venir"} onClick={() => setOnglet("a_venir")}>
            À venir {aVenir.length > 0 && <Pastille>{aVenir.length}</Pastille>}
          </Onglets>
          <Onglets actif={onglet === "comptes_rendus"} onClick={() => setOnglet("comptes_rendus")}>
            Comptes rendus {brouillons > 0 && <Pastille ton="ambre">{brouillons}</Pastille>}
          </Onglets>
          <Onglets actif={onglet === "passes"} onClick={() => setOnglet("passes")}>
            Passés {aRattraper > 0 && <Pastille ton="ambre">{aRattraper}</Pastille>}
          </Onglets>
        </div>

        {chargement ? (
          <div className="flex h-40 items-center justify-center text-[var(--text-3)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : onglet === "a_venir" ? (
          <ListeBookings
            bookings={aVenir}
            vide="Aucun rendez-vous à venir."
            couverts={bookingsCouverts}
            futur
          />
        ) : onglet === "passes" ? (
          <ListeBookings
            bookings={passes}
            vide="Aucun rendez-vous passé."
            couverts={bookingsCouverts}
          />
        ) : (
          <ListeComptesRendus comptesRendus={comptesRendus} />
        )}
      </div>
    </AppLayout>
  );
}

function ListeBookings({
  bookings,
  vide,
  couverts,
  futur,
}: {
  bookings: Booking[];
  vide: string;
  couverts: Set<string>;
  futur?: boolean;
}) {
  if (bookings.length === 0) {
    return <p className="py-12 text-center text-sm text-[var(--text-3)]">{vide}</p>;
  }

  return (
    <ul className="space-y-2">
      {bookings.map((b) => {
        const sansCompteRendu = !futur && !couverts.has(b.id);
        return (
          <li
            key={b.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-[var(--surface)] p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.event_title}</p>
              <p className="text-sm text-[var(--text-3)]">
                {dateHeure(b.start_at)}
                {b.invitee_name && ` · ${b.invitee_name}`}
              </p>
            </div>

            {sansCompteRendu && (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                sans compte rendu
              </span>
            )}

            <div className="flex shrink-0 items-center gap-1.5">
              {b.meeting_url && (
                <a
                  href={b.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Rejoindre la visio"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 transition-colors hover:bg-[var(--bg-2)]"
                >
                  <Video className="h-4 w-4" />
                </a>
              )}
              {b.entreprise_id && (
                <>
                  <Link
                    href={`/companies/${b.entreprise_id}`}
                    title="Fiche entreprise"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 transition-colors hover:bg-[var(--bg-2)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      ouvrirCockpitRdv({ entrepriseId: b.entreprise_id!, bookingId: b.id })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--bg-2)]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {sansCompteRendu ? "Rédiger" : "Ouvrir"}
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ListeComptesRendus({ comptesRendus }: { comptesRendus: CompteRenduListe[] }) {
  if (comptesRendus.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--text-3)]">
        Aucun compte rendu pour l&apos;instant. Le bouton « Cockpit » en haut à droite en ouvre un
        en deux clics.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {comptesRendus.map((cr) => (
        <li key={cr.id}>
          <button
            type="button"
            onClick={() =>
              ouvrirCockpitRdv({ entrepriseId: cr.entreprise_id, compteRenduId: cr.id })
            }
            className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-[var(--surface)] p-3 text-left transition-colors hover:bg-[var(--bg-2)]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {cr.entreprises?.name ?? `Entreprise #${cr.entreprise_id}`}
              </p>
              <p className="truncate text-sm text-[var(--text-3)]">
                {cr.titre || dateCourte(cr.demarre_le)}
                {cr.resume && ` — ${cr.resume}`}
              </p>
              {cr.prochaine_etape && (
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  Suite : {cr.prochaine_etape}
                  {cr.date_prochaine_etape && ` (${dateCourte(cr.date_prochaine_etape)})`}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {cr.statut === "brouillon" && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  brouillon
                </span>
              )}
              {cr.issue && (
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${ISSUE_TON[cr.issue]}`}>
                  {ISSUE_LABEL[cr.issue]}
                </span>
              )}
              <span className="text-xs text-[var(--text-4)]">{dateCourte(cr.demarre_le)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Onglets({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        actif ? "bg-background shadow-sm" : "text-[var(--text-3)] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Pastille({ children, ton }: { children: React.ReactNode; ton?: "ambre" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        ton === "ambre"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-[var(--bg-3)] text-[var(--text-2)]"
      }`}
    >
      {children}
    </span>
  );
}
