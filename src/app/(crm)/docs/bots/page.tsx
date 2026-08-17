import AppLayout from "@/components/layout/AppLayout";
import { BotsPage } from "@/components/architecture/BotsPage";

export const metadata = { title: "Les bots — Sama CRM" };

export default function Page() {
  return (
    <AppLayout>
      <BotsPage />
    </AppLayout>
  );
}
