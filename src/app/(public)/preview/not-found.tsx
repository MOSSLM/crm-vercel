import React from "react";

/**
 * 404 for draft/template previews ({uuid}.{SITE_DOMAIN} → /preview/{uuid}).
 *
 * Without this, a broken preview link fell through to Next's bare English 404,
 * which looks exactly like the platform 404 you get when the wildcard domain
 * isn't wired up — so nobody could tell "the app said no" from "the request
 * never reached the app". Seeing THIS page means the request did reach the app;
 * the precise reason is logged server-side by `preview404()`.
 */
export default function PreviewNotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "40px 24px",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: "#e5e7eb" }}>404</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Aperçu indisponible</h1>
      <p style={{ fontSize: 15, color: "#6b7280", margin: 0, maxWidth: 460, lineHeight: 1.5 }}>
        Ce lien d&apos;aperçu ne pointe vers aucune page affichable. Le design a peut-être été
        supprimé, ou l&apos;import n&apos;a pas abouti.
      </p>
      <p style={{ fontSize: 13, color: "#9ca3af", margin: 0, maxWidth: 460, lineHeight: 1.5 }}>
        Si vous éditez ce design : enregistrez-le dans l&apos;éditeur, puis rouvrez l&apos;aperçu.
        Un aperçu ne montre que ce qui est déjà enregistré.
      </p>
    </div>
  );
}
