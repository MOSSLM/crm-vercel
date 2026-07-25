"use client";

import { Suspense } from "react";
import SchedulingTabs from "./SchedulingTabs";
import BookingsDashboard from "./BookingsDashboard";
import EventTypesManager from "./EventTypesManager";
import AvailabilityEditor from "./AvailabilityEditor";
import PageSettings from "./PageSettings";

export type SchedulingSectionId = "bookings" | "types" | "availability" | "settings";

const HEADERS: Record<SchedulingSectionId, { title: string; subtitle: string }> = {
  bookings: {
    title: "Rendez-vous",
    subtitle: "Vos réservations en ligne — confirmations, annulations, reprogrammations.",
  },
  types: {
    title: "Types d'évènements",
    subtitle: "Les liens réservables que vous partagez (durée, lieu, règles, questions).",
  },
  availability: {
    title: "Disponibilités",
    subtitle: "Vos horaires récurrents et vos exceptions (congés, journées spéciales).",
  },
  settings: {
    title: "Ma page & agendas",
    subtitle: "Votre page publique de réservation, l'embed et vos agendas connectés.",
  },
};

/**
 * Section Rendez-vous partagée entre le CRM admin (/rendez-vous) et
 * l'espace agent (/espace-agent/rendez-vous) — seule la base d'URL change.
 */
export default function SchedulingSection({
  section,
  basePath,
}: {
  section: SchedulingSectionId;
  basePath: string;
}) {
  const header = HEADERS[section];
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold">{header.title}</h1>
        <p className="text-sm text-muted-foreground">{header.subtitle}</p>
      </header>
      <SchedulingTabs basePath={basePath} />
      {section === "bookings" ? <BookingsDashboard /> : null}
      {section === "types" ? <EventTypesManager /> : null}
      {section === "availability" ? <AvailabilityEditor /> : null}
      {section === "settings" ? (
        <Suspense fallback={null}>
          <PageSettings />
        </Suspense>
      ) : null}
    </div>
  );
}
