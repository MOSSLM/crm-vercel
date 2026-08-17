import AppLayout from "@/components/layout/AppLayout";
import { ExplorateurEntreprises } from "@/components/entreprises/ExplorateurEntreprises";

export const metadata = {
  title: "Explorateur d'entreprises — Sama CRM",
};

export default function Page() {
  return (
    <AppLayout>
      <ExplorateurEntreprises />
    </AppLayout>
  );
}
