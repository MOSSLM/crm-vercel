import AppLayout from "@/components/layout/AppLayout";
import { CompanyServicesPage } from "@/components/CompanyServicesPage";
import { SprintModuleTabs } from "@/components/SprintModuleTabs";

export default function SprintModuleServicesPage() {
  return (
    <AppLayout>
      <SprintModuleTabs />
      <CompanyServicesPage sprintModule />
    </AppLayout>
  );
}
