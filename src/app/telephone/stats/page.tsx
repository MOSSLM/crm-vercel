import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { CallAnalytics } from "@/components/telephone/CallAnalytics";

export default function TelephoneStatsRoute() {
  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl p-6">
        <Link
          href="/telephone"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Centrale d&apos;appels
        </Link>
        <h1 className="mb-6 text-xl font-semibold">Statistiques d&apos;appels</h1>
        <CallAnalytics />
      </div>
    </AppLayout>
  );
}
