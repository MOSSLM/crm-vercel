import { SmsInbox } from "@/components/telephony/SmsInbox";

export default function AgentSmsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Messages SMS</h1>
        <p className="text-sm text-muted-foreground">Tes conversations SMS.</p>
      </header>
      <SmsInbox />
    </div>
  );
}
