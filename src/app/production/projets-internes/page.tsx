import AppLayout from "@/components/layout/AppLayout";
import { ProjectTasksWorkspace } from "@/components/production/ProjectTasksWorkspace";

export default function ProjetsInternesPage() {
  return (
    <AppLayout>
      <ProjectTasksWorkspace
        title="Projets internes"
        description="Créez vos projets internes, suivez leur avancement et gérez tâches/sous-tâches en liste, kanban, tableau et agenda."
        scope="internal"
      />
    </AppLayout>
  );
}
