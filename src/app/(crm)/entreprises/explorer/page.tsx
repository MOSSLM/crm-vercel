"use client";

import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";
import { EntreprisesExplorer } from "@/components/EntreprisesExplorer";

export default function EntreprisesExplorerPage() {
  return (
    <AppLayout>
      <RequireAuth>
        <SectionTabsNav items={crmEnterpriseTabs} />
        <EntreprisesExplorer />
      </RequireAuth>
    </AppLayout>
  );
}
