import AppLayout from "@/components/layout/AppLayout";
import { ProductionWorkspacePage } from "@/components/production/ProductionWorkspacePage";

export default function TemplatesPage() {
  return (
    <AppLayout>
      <ProductionWorkspacePage
        title="Templates"
        description="Retrouvez ici vos modèles de production réutilisables."
      />
    </AppLayout>
  );
}
