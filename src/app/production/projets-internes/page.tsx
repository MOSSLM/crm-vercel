import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { productionProjectTabs } from "@/components/layout/sectionTabs";
import { ProjectTasksWorkspace } from "@/components/production/ProjectTasksWorkspace";

export default function ProjetsInternesPage() {
  return (
    <AppLayout>
      <SectionTabsNav items={productionProjectTabs} />
      <ProjectTasksWorkspace
        title="Projets internes"
        description="Créez vos projets internes, suivez leur avancement et gérez tâches/sous-tâches en liste, kanban, tableau et agenda."
        scope="internal"
      />
    </AppLayout>
  );
}
