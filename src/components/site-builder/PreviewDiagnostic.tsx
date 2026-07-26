import React from "react";

/**
 * Self-service explanation of why a draft preview can't render, shown when the
 * preview URL carries `?diag=1`.
 *
 * The default response stays a plain 404 (see preview/not-found.tsx). This page
 * exists because the reason otherwise only lives in the platform logs, which
 * whoever is holding the broken link usually can't reach. Holding the URL
 * already grants read access to the whole design, so naming the cause to its
 * bearer leaks nothing new.
 */
export function PreviewDiagnostic({ siteId, reason }: { siteId: string; reason: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "40px 24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#9ca3af" }}>
          DIAGNOSTIC D&apos;APERÇU
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 20px" }}>
          Cet aperçu ne peut pas s&apos;afficher
        </h1>

        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            borderRadius: 10,
            padding: "14px 16px",
            fontSize: 15,
            lineHeight: 1.5,
            color: "#991b1b",
          }}
        >
          {reason}
        </div>

        <dl style={{ margin: "20px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
          <dt style={{ fontWeight: 600, color: "#374151" }}>Identifiant du design</dt>
          <dd style={{ margin: "0 0 12px", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            {siteId}
          </dd>
          <dt style={{ fontWeight: 600, color: "#374151" }}>La requête a bien atteint l&apos;app</dt>
          <dd style={{ margin: 0 }}>
            Le domaine et le routage fonctionnent : la cause est celle indiquée ci-dessus, pas la
            configuration DNS ou Vercel.
          </dd>
        </dl>
      </div>
    </div>
  );
}
