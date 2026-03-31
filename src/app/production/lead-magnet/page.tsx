import AppLayout from "@/components/layout/AppLayout";
import { ProductionLeadMagnetsPage } from "@/components/production/ProductionLeadMagnetsPage";

export default function LeadMagnetRoutePage() {
  return (
    <AppLayout>
      <ProductionLeadMagnetsPage mode="tinder" />
    </AppLayout>
  );
}
