import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { StatsDashboard } from "@/components/telephony/StatsDashboard";

export default function TelephonieStatsRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">Statistiques d’appels</h1>
            <p className="text-sm text-muted-foreground">
              Vue d’ensemble, volume par jour et performance par agent.
            </p>
          </header>
          <StatsDashboard />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
