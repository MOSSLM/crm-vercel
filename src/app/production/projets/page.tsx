import AppLayout from "@/components/layout/AppLayout";
import { SectionTabsNav } from "@/components/layout/SectionTabsNav";
import { productionProjectTabs } from "@/components/layout/sectionTabs";
import { ProjectTasksWorkspace } from "@/components/production/ProjectTasksWorkspace";

export default function ProjetsPage() {
  return (
    <AppLayout>
      <SectionTabsNav items={productionProjectTabs} />
      <ProjectTasksWorkspace
        title="Projets"
        description="Pilotez vos projets clients et internes, puis basculez de vue pour gérer les priorités, les échéances et l'avancement."
        scope="all"
      />
    </AppLayout>
  );
}
