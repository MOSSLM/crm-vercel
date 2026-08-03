import type { Metadata } from "next";
import ManageBookingView from "@/components/scheduling/ManageBookingView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gérer mon rendez-vous",
  robots: { index: false },
};

/** Page publique de gestion d'un booking (reprogrammer / annuler) par token. */
export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ManageBookingView token={decodeURIComponent(token)} />;
}
