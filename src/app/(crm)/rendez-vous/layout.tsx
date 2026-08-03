import type { ReactNode } from "react";
import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import CalShell from "@/components/scheduling/host/CalShell";

/** Section Cal.SAMA (admin) : sidebar dédiée + contenu. */
export default function RendezVousLayout({ children }: { children: ReactNode }) {
  return (
    <AppLayout>
      <RequireAuth>
        <CalShell basePath="/rendez-vous">{children}</CalShell>
      </RequireAuth>
    </AppLayout>
  );
}
