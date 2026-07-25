import { SectionHeader } from "@/components/scheduling/host/CalShell";
import TeamOverview from "@/components/scheduling/host/TeamOverview";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Équipe"
        subtitle="Les pages de réservation et rendez-vous de tous les hôtes."
      />
      <TeamOverview basePath="/rendez-vous" />
    </div>
  );
}
