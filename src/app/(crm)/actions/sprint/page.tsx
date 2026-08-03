import AppLayout from "@/components/layout/AppLayout";
import { OpportunitiesPage } from "@/components/OpportunitiesPage";
import { SprintModuleTabs } from "@/components/SprintModuleTabs";

export default function SprintModulePage() {
  return (
    <AppLayout>
      <SprintModuleTabs />
      <OpportunitiesPage sprintModule />
    </AppLayout>
  );
}
