import DuplicatesPage from "@/components/DuplicatesPage";
import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";

export default function Duplicates() {
  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />
      <DuplicatesPage />
    </AppLayout>
  );
}
