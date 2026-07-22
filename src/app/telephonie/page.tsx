import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { CallJournal } from "@/components/telephony/CallJournal";

export default function TelephonieRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">Téléphonie</h1>
            <p className="text-sm text-muted-foreground">
              Journal des appels — l’ensemble de l’équipe.
            </p>
          </header>
          <CallJournal />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
