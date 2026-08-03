import BlacklistPage from "@/components/BlacklistPage";
import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";

export default function Blacklist() {
  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />
      <BlacklistPage />
    </AppLayout>
  );
}
