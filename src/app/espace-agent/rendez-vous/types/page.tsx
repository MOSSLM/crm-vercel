import { SectionHeader } from "@/components/scheduling/host/CalShell";
import EventTypesManager from "@/components/scheduling/host/EventTypesManager";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Types d'évènements"
        subtitle="Les liens réservables que vous partagez (durée, lieu, règles, questions)."
      />
      <EventTypesManager />
    </div>
  );
}
