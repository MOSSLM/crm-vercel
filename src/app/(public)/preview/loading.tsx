import React from "react";

/**
 * Streaming fallback for draft/template previews.
 *
 * The preview renders live (`force-dynamic`), so the whole response used to
 * wait on the render: Next flushed the response headers immediately, then the
 * connection sat open until the last section was ready. A profile of a real
 * preview measured 47 ms to first byte and 10 065 ms to last byte — ten seconds
 * of blank white page, during which the browser was idle 89 % of the time.
 *
 * This file creates the Suspense boundary that lets the shell flush at first
 * byte instead. It is deliberately content-free: guessing at the design's own
 * layout would only trade a blank page for a wrong one that then jumps. Inline
 * styles only, like `not-found.tsx` — the preview tree imports no stylesheet.
 */
export default function PreviewLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#9ca3af",
      }}
    >
      {/* Keyframes have to travel with the element: no stylesheet is loaded here. */}
      <style>{"@keyframes preview-spin{to{transform:rotate(360deg)}}"}</style>
      <div
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          border: "2px solid #e5e7eb",
          borderTopColor: "#9ca3af",
          animation: "preview-spin .7s linear infinite",
        }}
      />
      <p style={{ margin: 0, fontSize: 14 }} role="status">
        Chargement de l&apos;aperçu…
      </p>
    </div>
  );
}
