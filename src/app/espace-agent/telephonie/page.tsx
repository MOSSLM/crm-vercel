import { CallJournal } from "@/components/telephony/CallJournal";

export default function AgentTelephoniePage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Téléphonie</h1>
        <p className="text-sm text-muted-foreground">Tes appels — entrants et sortants.</p>
      </header>
      <CallJournal />
    </div>
  );
}
