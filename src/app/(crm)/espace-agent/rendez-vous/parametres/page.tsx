import { SectionHeader } from "@/components/scheduling/host/CalShell";
import PageSettings from "@/components/scheduling/host/PageSettings";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Ma page"
        subtitle="L'identité publique de votre page de réservation."
      />
      <PageSettings />
    </div>
  );
}
