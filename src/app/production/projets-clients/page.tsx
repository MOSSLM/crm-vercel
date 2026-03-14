import AppLayout from "@/components/layout/AppLayout";
import { ProductionWorkspacePage } from "@/components/production/ProductionWorkspacePage";

export default function ProjetsClientsPage() {
  return (
    <AppLayout>
      <ProductionWorkspacePage
        title="Projets Clients"
        description="Pilotez ici les projets livrés pour vos clients."
      />
    </AppLayout>
  );
}
