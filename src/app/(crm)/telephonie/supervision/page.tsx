import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { Supervision } from "@/components/telephony/Supervision";

export default function SupervisionRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">Supervision live</h1>
            <p className="text-sm text-muted-foreground">Appels en cours et présence de l’équipe.</p>
          </header>
          <Supervision />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
