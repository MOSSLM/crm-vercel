import { SectionHeader } from "@/components/scheduling/host/CalShell";
import OverviewDashboard from "@/components/scheduling/host/OverviewDashboard";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Aperçu"
        subtitle="Votre activité de rendez-vous en un coup d'œil."
      />
      <OverviewDashboard basePath="/rendez-vous" />
    </div>
  );
}
