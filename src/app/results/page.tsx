
import { ResultsPage } from "@/components/ResultsPage";
import  AppLayout  from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { actionSearchTabs } from "@/components/layout/sectionTabs";
export default function Dashboard() {
  return (
    <AppLayout>
      <SectionTabsNav items={actionSearchTabs} />
      <ResultsPage />
    </AppLayout>
  );
}
