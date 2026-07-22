import { VoicemailList } from "@/components/telephony/VoicemailList";

export default function MessagerieVocalePage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Messagerie vocale</h1>
        <p className="text-sm text-muted-foreground">Appels manqués et messages laissés.</p>
      </header>
      <VoicemailList />
    </div>
  );
}
