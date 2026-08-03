import AppLayout from "@/components/layout/AppLayout";
import { ProductionWorkspacePage } from "@/components/production/ProductionWorkspacePage";

export default function AppsPage() {
  return (
    <AppLayout>
      <ProductionWorkspacePage
        title="Apps"
        description="Organisez vos apps et outils internes dans ce hub production."
      />
    </AppLayout>
  );
}
