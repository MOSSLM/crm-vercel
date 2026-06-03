// atoms.jsx — tiny shared bits
const { useState, useEffect, useMemo, useRef } = React;

function Avatar({ name, color, size = 28, initials, square = false }) {
  const ini = initials || (name ? name.split(" ").slice(0, 2).map(w => w[0]).join("") : "?");
  return (
    <span style={{
      width: size, height: size,
      borderRadius: square ? Math.round(size * 0.25) : "50%",
      background: color || "var(--bg-3)",
      color: color ? "white" : "var(--text-2)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontWeight: 600, fontSize: Math.round(size * 0.36),
      letterSpacing: "-.01em",
      flexShrink: 0,
    }}>{ini}</span>
  );
}

function Pill({ children, kind = "", dot = false, lg = false }) {
  return (
    <span className={`pill ${kind} ${dot ? "dot" : ""} ${lg ? "lg" : ""}`}>{children}</span>
  );
}

function Sparkline({ data, color = "currentColor", width = 84, height = 32, fill = false }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const dFill = `${d} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" stroke="none">
      {fill && <path d={dFill} fill={color} opacity=".15" />}
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={color} />
    </svg>
  );
}

function MiniBars({ data, color = "var(--accent)", height = 28, gap = 2 }) {
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height }}>
      {data.map((v, i) => (
        <span key={i} style={{
          flex: 1, height: `${(v / max) * 100}%`,
          background: color, opacity: i === data.length - 1 ? 1 : 0.45,
          borderRadius: "2px 2px 0 0", minWidth: 3,
        }} />
      ))}
    </div>
  );
}

function StatusDot({ kind = "ok" }) {
  const c = { ok: "var(--ok)", paused: "var(--warn)", draft: "var(--text-4)", error: "var(--danger)" }[kind] || "var(--text-4)";
  return <span style={{
    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
    background: c, boxShadow: kind === "ok" ? `0 0 0 3px var(--ok-tint)` : "none", flexShrink: 0,
  }} />;
}

function eur(n, opts = {}) {
  if (n == null || n === "" || n === "—") return "—";
  const v = typeof n === "number" ? n : Number(n);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0, ...opts }).format(v) + " €";
}

Object.assign(window, { Avatar, Pill, Sparkline, MiniBars, StatusDot, eur });
