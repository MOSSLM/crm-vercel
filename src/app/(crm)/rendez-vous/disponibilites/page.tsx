import { SectionHeader } from "@/components/scheduling/host/CalShell";
import AvailabilityEditor from "@/components/scheduling/host/AvailabilityEditor";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Disponibilités"
        subtitle="Vos horaires récurrents et vos exceptions (congés, journées spéciales)."
      />
      <AvailabilityEditor />
    </div>
  );
}
