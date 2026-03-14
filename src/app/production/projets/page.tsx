import AppLayout from "@/components/layout/AppLayout";
import { ProjectTasksWorkspace } from "@/components/production/ProjectTasksWorkspace";

export default function ProjetsPage() {
  return (
    <AppLayout>
      <ProjectTasksWorkspace
        title="Projets"
        description="Pilotez vos projets clients et internes, puis basculez de vue pour gérer les priorités, les échéances et l'avancement."
        scope="all"
      />
    </AppLayout>
  );
}
