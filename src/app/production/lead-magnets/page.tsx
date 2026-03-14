import AppLayout from "@/components/layout/AppLayout";
import { ProductionWorkspacePage } from "@/components/production/ProductionWorkspacePage";

export default function LeadMagnetsPage() {
  return (
    <AppLayout>
      <ProductionWorkspacePage
        title="Lead Magnets"
        description="Gérez vos lead magnets V2 depuis cette nouvelle section dédiée."
      />
    </AppLayout>
  );
}
