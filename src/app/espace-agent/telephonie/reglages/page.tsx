import { SoftphoneSettings } from "@/components/telephony/SoftphoneSettings";

export default function AgentSoftphoneSettingsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Mon softphone</h1>
        <p className="text-sm text-muted-foreground">
          Configure ton login SIP pour activer le téléphone dans le navigateur.
        </p>
      </header>
      <SoftphoneSettings isAdmin={false} />
    </div>
  );
}
