import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { EVENT_TYPE_COLUMNS, getPageByUsername } from "@/lib/scheduling/data";
import type { EventType } from "@/lib/scheduling/types";
import {
  publicEventTypeProjection,
  publicPageProjection,
} from "@/app/api/scheduling/_lib";
import BookingWidget from "@/components/scheduling/BookingWidget";

export const dynamic = "force-dynamic";

type Params = { username: string; slug: string };
type Search = { [key: string]: string | string[] | undefined };

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

async function loadData(params: Params) {
  const username = decodeURIComponent(params.username).trim().toLowerCase();
  const slug = decodeURIComponent(params.slug).trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(username) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return null;
  }
  const sc = getServiceClient();
  const page = await getPageByUsername(sc, username);
  if (!page) return null;
  const { data } = await sc
    .from("scheduling_event_types")
    .select(EVENT_TYPE_COLUMNS)
    .eq("user_id", page.user_id)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return { page, eventType: data as unknown as EventType };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const loaded = await loadData(await params);
  return {
    title: loaded
      ? `${loaded.eventType.title} — ${loaded.page.display_name}`
      : "Prendre rendez-vous",
    description: loaded?.eventType.description ?? "Choisissez un créneau qui vous convient.",
    robots: { index: false },
  };
}

/** Page publique de réservation d'un type d'évènement (mode embed inclus). */
export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const loaded = await loadData(await params);
  if (!loaded) notFound();

  const sp = await searchParams;
  const embed = first(sp.embed) === "1";

  return (
    <BookingWidget
      page={{ ...publicPageProjection(loaded.page), username: loaded.page.username }}
      eventType={publicEventTypeProjection(loaded.eventType)}
      embed={embed}
      prefill={{
        name: first(sp.name),
        email: first(sp.email),
        phone: first(sp.phone),
        tz: first(sp.tz),
      }}
    />
  );
}
