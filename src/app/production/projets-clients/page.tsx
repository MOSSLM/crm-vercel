import AppLayout from "@/components/layout/AppLayout";
import { ProjectTasksWorkspace } from "@/components/production/ProjectTasksWorkspace";

export default function ProjetsClientsPage() {
  return (
    <AppLayout>
      <ProjectTasksWorkspace
        title="Projets clients"
        description="Pilotez les projets liés aux entreprises, offres, échéances et priorités avec un système projet > tâches > sous-tâches."
        scope="client"
      />
    </AppLayout>
  );
}
