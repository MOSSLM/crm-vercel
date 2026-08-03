import AppLayout from "@/components/layout/AppLayout";
import { ProductionLeadMagnetsPage } from "@/components/production/ProductionLeadMagnetsPage";
import { SprintModuleTabs } from "@/components/SprintModuleTabs";

export default function SprintModuleLeadMagnetPage() {
  return (
    <AppLayout>
      <SprintModuleTabs />
      <ProductionLeadMagnetsPage mode="tinder" sprintModule />
    </AppLayout>
  );
}
