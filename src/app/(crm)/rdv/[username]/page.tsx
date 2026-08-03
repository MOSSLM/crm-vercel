import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { EVENT_TYPE_COLUMNS, getPageByUsername } from "@/lib/scheduling/data";
import type { EventType } from "@/lib/scheduling/types";
import { publicPageProjection } from "@/app/api/scheduling/_lib";
import PublicProfile from "@/components/scheduling/PublicProfile";

export const dynamic = "force-dynamic";

type Params = { username: string };

async function load(params: Params) {
  const username = decodeURIComponent(params.username).trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(username)) return null;
  const sc = getServiceClient();
  const page = await getPageByUsername(sc, username);
  if (!page) return null;
  const { data } = await sc
    .from("scheduling_event_types")
    .select(EVENT_TYPE_COLUMNS)
    .eq("user_id", page.user_id)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return { page, eventTypes: (data ?? []) as unknown as EventType[] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const loaded = await load(await params);
  return {
    title: loaded
      ? `${loaded.page.display_name} — Prendre rendez-vous`
      : "Prendre rendez-vous",
    description: loaded?.page.bio ?? "Choisissez un créneau qui vous convient.",
    robots: { index: false },
  };
}

/** Page publique d'un hôte : profil + ses types réservables. */
export default async function PublicSchedulingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const loaded = await load(await params);
  if (!loaded) notFound();

  return (
    <div className="rv-scope rv-public-stage">
      <PublicProfile
        page={{ ...publicPageProjection(loaded.page), username: loaded.page.username }}
        eventTypes={loaded.eventTypes.map((t) => ({
          slug: t.slug,
          title: t.title,
          description: t.description,
          duration_minutes: t.duration_minutes,
          location_type: t.location_type,
          color: t.color,
          price_cents: t.price_cents,
          currency: t.currency,
        }))}
      />
    </div>
  );
}
