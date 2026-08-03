import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { NumbersAdmin } from "@/components/telephony/NumbersAdmin";

export default function TelephonieNumerosRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">Numéros &amp; agents</h1>
            <p className="text-sm text-muted-foreground">
              Import des numéros, attribution aux agents, extensions &amp; enregistrement.
            </p>
          </header>
          <NumbersAdmin />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
