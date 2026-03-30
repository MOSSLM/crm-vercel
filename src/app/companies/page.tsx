import { QualificationPage } from "@/components/QualificationPage";
import  AppLayout  from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";
export default function Dashboard() {
  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />
      <QualificationPage />
    </AppLayout>
  );
}
