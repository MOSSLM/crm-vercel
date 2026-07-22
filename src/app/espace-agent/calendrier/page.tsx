import { UpcomingAppointments } from "@/components/telephony/UpcomingAppointments";

export default function CalendrierPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold">Calendrier</h1>
        <p className="text-sm text-muted-foreground">Tes rendez-vous et rappels.</p>
      </header>
      <UpcomingAppointments />
    </div>
  );
}
