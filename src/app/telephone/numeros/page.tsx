import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { NumbersAdmin } from "@/components/telephone/NumbersAdmin";

export default function TelephoneNumerosRoute() {
  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-4xl p-6">
        <Link
          href="/telephone"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Centrale d&apos;appels
        </Link>
        <h1 className="mb-6 text-xl font-semibold">Numéros</h1>
        <NumbersAdmin />
      </div>
    </AppLayout>
  );
}
