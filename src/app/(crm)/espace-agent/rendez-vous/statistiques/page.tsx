import { SectionHeader } from "@/components/scheduling/host/CalShell";
import InsightsDashboard from "@/components/scheduling/host/InsightsDashboard";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Statistiques"
        subtitle="Volume, annulations et canaux de vos réservations."
      />
      <InsightsDashboard />
    </div>
  );
}
