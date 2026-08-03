import NetworksPage from "@/components/NetworksPage";
import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";

export default function Networks() {
  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />
      <NetworksPage />
    </AppLayout>
  );
}
