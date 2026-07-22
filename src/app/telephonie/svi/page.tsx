import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { SviBuilder } from "@/components/telephony/SviBuilder";

export default function SviRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">SVI / Standard</h1>
            <p className="text-sm text-muted-foreground">
              Scénarios d’accueil : annonce, horaires, menu DTMF, cascade.
            </p>
          </header>
          <SviBuilder />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
