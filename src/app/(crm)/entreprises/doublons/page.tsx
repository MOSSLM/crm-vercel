"use client";

import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { crmEnterpriseTabs } from "@/components/layout/sectionTabs";
import { EntreprisesDoublons } from "@/components/EntreprisesDoublons";

export default function EntreprisesDoublonsPage() {
  return (
    <AppLayout>
      <RequireAuth>
        <SectionTabsNav items={crmEnterpriseTabs} />
        <EntreprisesDoublons />
      </RequireAuth>
    </AppLayout>
  );
}
