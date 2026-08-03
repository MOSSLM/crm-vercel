import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { productionProjectTabs } from "@/components/layout/sectionTabs";
import { ProjectTasksWorkspace } from "@/components/production/ProjectTasksWorkspace";

export default function ProjetsClientsPage() {
  return (
    <AppLayout>
      <SectionTabsNav items={productionProjectTabs} />
      <ProjectTasksWorkspace
        title="Projets clients"
        description="Pilotez les projets liés aux entreprises, offres, échéances et priorités avec un système projet > tâches > sous-tâches."
        scope="client"
      />
    </AppLayout>
  );
}
