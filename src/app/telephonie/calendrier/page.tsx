import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { TeamCalendar } from "@/components/telephony/TeamCalendar";

export default function TeamCalendarRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">Calendrier équipe</h1>
            <p className="text-sm text-muted-foreground">Les rendez-vous à venir de toute l’équipe.</p>
          </header>
          <TeamCalendar />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
