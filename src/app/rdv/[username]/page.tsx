import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, MapPin, ArrowRight } from "lucide-react";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { EVENT_TYPE_COLUMNS, getPageByUsername } from "@/lib/scheduling/data";
import { formatDurationFr } from "@/lib/scheduling/format";
import { LOCATION_LABELS, type EventType } from "@/lib/scheduling/types";

export const dynamic = "force-dynamic";

type Params = { username: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { username } = await params;
  const page = await getPageByUsername(getServiceClient(), username.toLowerCase());
  return {
    title: page ? `${page.display_name} — Prendre rendez-vous` : "Prendre rendez-vous",
    description: page?.bio ?? "Choisissez un créneau qui vous convient.",
    robots: { index: false },
  };
}

/**
 * Page publique d'un hôte : liste ses types d'évènements réservables.
 * Accessible sans compte — parcours invité de bout en bout.
 */
export default async function PublicSchedulingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername).trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(username)) notFound();

  const sc = getServiceClient();
  const page = await getPageByUsername(sc, username);
  if (!page) notFound();

  const { data } = await sc
    .from("scheduling_event_types")
    .select(EVENT_TYPE_COLUMNS)
    .eq("user_id", page.user_id)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const eventTypes = (data ?? []) as unknown as EventType[];

  const brand = page.brand_color || "#2A6FDB";
  const initials = page.display_name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#FBFAF7] px-4 py-10 text-[#14120E]">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col items-center text-center">
          {page.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.avatar_url}
              alt={page.display_name}
              className="h-20 w-20 rounded-full border object-cover shadow-sm"
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-semibold text-white shadow-sm"
              style={{ backgroundColor: brand }}
            >
              {initials || "?"}
            </div>
          )}
          <h1 className="mt-4 text-2xl font-semibold">{page.display_name}</h1>
          {page.bio ? (
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#8A877F]">{page.bio}</p>
          ) : null}
        </div>

        <div className="mt-8 space-y-3">
          {eventTypes.length === 0 ? (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-[#8A877F]">
              Aucun créneau proposé pour le moment.
            </div>
          ) : (
            eventTypes.map((et) => (
              <Link
                key={et.id}
                href={`/rdv/${page.username}/${et.slug}`}
                className="group flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <span
                  className="h-12 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: et.color || brand }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">{et.title}</span>
                  {et.description ? (
                    <span className="mt-0.5 block truncate text-sm text-[#8A877F]">
                      {et.description}
                    </span>
                  ) : null}
                  <span className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#8A877F]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDurationFr(et.duration_minutes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {LOCATION_LABELS[et.location_type] ?? et.location_type}
                    </span>
                    {et.price_cents ? (
                      <span className="font-medium text-[#14120E]">
                        {(et.price_cents / 100).toLocaleString("fr-FR", {
                          style: "currency",
                          currency: et.currency || "EUR",
                        })}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-[#8A877F] transition group-hover:translate-x-0.5" />
              </Link>
            ))
          )}
        </div>

        <p className="mt-10 text-center text-xs text-[#B4B0A6]">
          Propulsé par SAMA Digital Studio
        </p>
      </div>
    </div>
  );
}
