import AppLayout from "@/components/layout/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import { SoftphoneSettings } from "@/components/telephony/SoftphoneSettings";

export default function AdminSoftphoneRoute() {
  return (
    <AppLayout>
      <RequireAuth>
        <div className="space-y-4 p-4 md:p-6">
          <header>
            <h1 className="text-2xl font-semibold">Softphone &amp; widget</h1>
            <p className="text-sm text-muted-foreground">
              Configure ton login SIP et autorise ce domaine pour le widget WebRTC.
            </p>
          </header>
          <SoftphoneSettings isAdmin />
        </div>
      </RequireAuth>
    </AppLayout>
  );
}
