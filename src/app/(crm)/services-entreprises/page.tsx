import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";
import { CompanyServicesPage } from "@/components/CompanyServicesPage";

export default function ServicesEntreprises() {
  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />
      <CompanyServicesPage />
    </AppLayout>
  );
}
