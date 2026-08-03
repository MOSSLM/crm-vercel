import { Suspense } from "react";
import { SectionHeader } from "@/components/scheduling/host/CalShell";
import IntegrationsPanel from "@/components/scheduling/host/IntegrationsPanel";

export default function Page() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SectionHeader
        title="Intégrations"
        subtitle="Agendas connectés, widget d'embed et emails automatiques."
      />
      <Suspense fallback={null}>
        <IntegrationsPanel />
      </Suspense>
    </div>
  );
}
