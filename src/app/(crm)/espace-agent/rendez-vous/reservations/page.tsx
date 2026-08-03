import { Suspense } from "react";
import { SectionHeader } from "@/components/scheduling/host/CalShell";
import BookingsDashboard from "@/components/scheduling/host/BookingsDashboard";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Réservations"
        subtitle="Confirmations, annulations et reprogrammations de vos rendez-vous."
      />
      <Suspense fallback={null}>
        <BookingsDashboard />
      </Suspense>
    </div>
  );
}
