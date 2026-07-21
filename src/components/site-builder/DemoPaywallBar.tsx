"use client";

import { useState } from "react";

/**
 * Purchase bar shown at the bottom of a demo site when its paywall is enabled.
 * Rendered on top of an arbitrary client site (ThemeLayout / Claude design), so
 * it uses inline styles only — it must not depend on the host site's CSS.
 *
 * Two CTAs: book a quick call, or buy the site (anonymous Stripe Checkout via
 * /api/stripe/checkout-demo). After payment the account is created and a login
 * link is emailed — see the checkout-demo route + Stripe webhook.
 */

const NUIT = "#0B1D3A";
const AZUR = "#3A7BD5";
const BLANC = "#E8F3FF";
const BRUME = "rgba(181,208,240,0.75)";

const DEFAULT_BOOKING = "mailto:matteos@samadigitalstudio.fr?subject=Réserver%20un%20appel%20—%20mon%20site";

interface Props {
  siteId: string;
  bookingUrl?: string | null;
  companyName?: string;
}

export function DemoPaywallBar({ siteId, bookingUrl, companyName }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const booking = bookingUrl || DEFAULT_BOOKING;

  const handleBuy = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError("Le paiement est momentanément indisponible. Réessayez ou réservez un appel.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
      setLoading(false);
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 2147483000,
          background: AZUR,
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "12px 20px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(11,29,58,0.35)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        Acheter ce site
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Acheter ce site"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2147483000,
        background: NUIT,
        color: BLANC,
        boxShadow: "0 -8px 32px rgba(11,29,58,0.35)",
        borderTop: `1px solid rgba(181,208,240,0.15)`,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ flex: "1 1 320px", minWidth: 260 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>
            Vous voulez que ce site soit le vôtre&nbsp;?
          </div>
          <div style={{ fontSize: 13, color: BRUME, marginTop: 4, lineHeight: 1.5 }}>
            Après paiement, vous accédez à votre espace personnel et à un court formulaire pour
            adapter le site{companyName ? ` à ${companyName}` : ""} : téléversez votre logo, vos
            images et vos infos, on personnalise tout à votre image.
          </div>
          {error && (
            <div style={{ fontSize: 12, color: "#ffb4b4", marginTop: 8 }}>{error}</div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <a
            href={booking}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 18px",
              borderRadius: 8,
              border: `1px solid rgba(181,208,240,0.35)`,
              color: BLANC,
              background: "transparent",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Réserver un appel rapide
          </a>
          <button
            type="button"
            onClick={handleBuy}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 22px",
              borderRadius: 8,
              border: "none",
              color: "#fff",
              background: AZUR,
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Redirection…" : "Le site me plaît, je l’achète"}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Réduire"
            style={{
              background: "transparent",
              border: "none",
              color: BRUME,
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
