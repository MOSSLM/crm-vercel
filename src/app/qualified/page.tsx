import { QualifiedCompaniesPage } from "@/components/QualifiedCompaniesPage";
import  AppLayout  from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";
import { Suspense } from "react";

export default function Dashboard() {
  return (
    <AppLayout>
      <SectionTabsNav items={crmEnterpriseTabs} />
      <Suspense fallback={null}>
        <QualifiedCompaniesPage />
      </Suspense>
    </AppLayout>
  );
}
