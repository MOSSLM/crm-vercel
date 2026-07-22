import { CallJournal } from "@/components/telephony/CallJournal";

export default function MesAppelsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Mes appels</h1>
        <p className="text-sm text-muted-foreground">Historique de tes appels, entrants et sortants.</p>
      </header>
      <CallJournal />
    </div>
  );
}
