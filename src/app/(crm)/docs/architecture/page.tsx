import AppLayout from "@/components/layout/AppLayout";
import { ArchitecturePage } from "@/components/architecture/ArchitecturePage";

export const metadata = {
  title: "Architecture — Sama CRM",
};

export default function Page() {
  return (
    <AppLayout>
      <ArchitecturePage />
    </AppLayout>
  );
}
