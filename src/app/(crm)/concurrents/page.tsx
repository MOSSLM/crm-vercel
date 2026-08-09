import ConcurrentsPage from "@/components/ConcurrentsPage";
import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";

export default function Concurrents() {
  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />
      <ConcurrentsPage />
    </AppLayout>
  );
}
