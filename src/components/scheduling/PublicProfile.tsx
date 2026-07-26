"use client";

/**
 * Profil public d'un hôte — portage de `PublicProfile` (rdv-public.jsx) :
 * en-tête sombre avec halo accent, puis la liste de ses types réservables.
 */

import Link from "next/link";
import { Chip, RV_LOC, fmtDur, rvInit } from "./rdv/atoms";
import { Icon } from "./rdv/Icon";
import "./rdv-skin.css";
import "./rdv-embed.css";

type PublicPage = {
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  brand_color: string;
  timezone: string;
};

type PublicEventType = {
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  location_type: string;
  color: string | null;
  price_cents: number | null;
  currency: string;
};

export default function PublicProfile({
  page,
  eventTypes,
}: {
  page: PublicPage;
  eventTypes: PublicEventType[];
}) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 620,
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <div
        style={{
          background: "var(--ink)",
          color: "var(--on-ink)",
          padding: "26px 24px 22px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 80% 0%,rgba(226,85,43,.24),transparent 60%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
          {page.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.avatar_url}
              alt={page.display_name}
              style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                background: page.brand_color,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 17,
                fontWeight: 600,
              }}
            >
              {rvInit(page.display_name)}
            </span>
          )}
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 25, letterSpacing: "-.01em" }}>
              {page.display_name}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--on-ink-3)",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                marginTop: 3,
              }}
            >
              Sama Digital Studio
            </div>
          </div>
        </div>
        {page.bio ? (
          <p
            style={{
              position: "relative",
              fontSize: 12.5,
              color: "var(--on-ink-2)",
              lineHeight: 1.55,
              margin: "14px 0 0",
              maxWidth: "52ch",
            }}
          >
            {page.bio}
          </p>
        ) : null}
      </div>

      <div style={{ padding: 12 }}>
        {eventTypes.length ? (
          eventTypes.map((t) => {
            const loc = RV_LOC[t.location_type] ?? RV_LOC.custom;
            return (
              <Link
                key={t.slug}
                href={`/rdv/${page.username}/${t.slug}`}
                style={{
                  width: "100%",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  borderRadius: 11,
                  padding: "11px 13px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 7,
                  textAlign: "left",
                  font: "inherit",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <i
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 3,
                        background: t.color || page.brand_color,
                      }}
                    />
                    <span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: "-.005em" }}>
                      {t.title}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <Chip ic="clock">{fmtDur(t.duration_minutes)}</Chip>
                    <Chip ic={loc.ic}>{loc.lb}</Chip>
                    {t.price_cents ? (
                      <Chip ic="euro">
                        {(t.price_cents / 100).toLocaleString("fr-FR", {
                          style: "currency",
                          currency: t.currency || "EUR",
                        })}
                      </Chip>
                    ) : null}
                  </div>
                </div>
                <Icon name="chevright" className="ico-sm" style={{ color: "var(--text-4)" }} />
              </Link>
            );
          })
        ) : (
          <div className="rv-empty" style={{ padding: 26 }}>
            Aucun créneau proposé pour le moment.
          </div>
        )}
      </div>
    </div>
  );
}
