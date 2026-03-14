import AppLayout from "@/components/layout/AppLayout";
import { ProductionWorkspacePage } from "@/components/production/ProductionWorkspacePage";

export default function ProjetsInternesPage() {
  return (
    <AppLayout>
      <ProductionWorkspacePage
        title="Projets Internes"
        description="Centralisez les projets internes de l'agence sur cet espace."
      />
    </AppLayout>
  );
}
