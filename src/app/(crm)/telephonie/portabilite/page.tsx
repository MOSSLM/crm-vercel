import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { Portabilite } from "@/components/telephony/Portabilite";

export default function PortabiliteRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">Portabilité</h1>
            <p className="text-sm text-muted-foreground">Suivi des demandes de portage de numéros.</p>
          </header>
          <Portabilite />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
