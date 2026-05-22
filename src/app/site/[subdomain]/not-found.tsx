import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { resolveSite } from "@/lib/site-resolver";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "samadigitalstudio.fr";

function extractSubdomain(hostname: string): string | null {
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  if (!hostname.endsWith(APP_DOMAIN)) return null;
  const withoutBase = hostname.slice(0, -(APP_DOMAIN.length + 1));
  return withoutBase || null;
}

/** 404 for published sites. Branded with the site's logo when resolvable. */
export default async function SiteNotFound() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const hostname = host.split(":")[0];

  const subdomain = extractSubdomain(hostname);
  const site = subdomain ? await resolveSite(subdomain, host).catch(() => null) : null;
  const companyName = site?.companyName ?? null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "40px 24px",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      {site?.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={site.logoUrl} alt={companyName ?? "Logo"} style={{ height: 44, width: "auto" }} />
      )}
      <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: "#e5e7eb" }}>404</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Page introuvable</h1>
      <p style={{ fontSize: 15, color: "#6b7280", margin: 0, maxWidth: 420 }}>
        Cette page n&apos;existe pas ou n&apos;est plus disponible
        {companyName ? ` sur le site de ${companyName}` : ""}.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 4,
          padding: "10px 20px",
          borderRadius: 8,
          background: "#111827",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
