"use client";

/**
 * Atomes du module Rendez-vous — portage fidèle de
 * `claude design/Rendez-vous/rdv-atoms.jsx` (mêmes classes, mêmes styles
 * inline) pour un rendu identique à la maquette.
 */

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon";

export const Btn = ({
  kind = "",
  size = "sm",
  ic,
  children,
  ...r
}: {
  kind?: string;
  size?: string;
  ic?: string;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" className={`btn ${kind} ${size}`.trim()} {...r}>
    {ic && <Icon name={ic} className="ico-sm" />}
    {children}
  </button>
);

export const Pill = ({
  kind = "",
  dot,
  children,
  style,
}: {
  kind?: string;
  dot?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) => (
  <span className={`pill ${kind} ${dot ? "dot" : ""}`.trim()} style={style}>
    {children}
  </span>
);

export const Chip = ({
  ic,
  color,
  line,
  children,
}: {
  ic?: string;
  color?: string;
  line?: boolean;
  children?: ReactNode;
}) => (
  <span className={`rv-chip ${line ? "line" : ""}`.trim()}>
    {color && <i className="dot" style={{ background: color }} />}
    {ic && <Icon name={ic} className="ico-xs" />}
    {children}
  </span>
);

export const Sw = ({ on, onClick }: { on?: boolean; onClick?: () => void }) => (
  <button
    type="button"
    className={`rv-sw ${on ? "on" : ""}`}
    onClick={onClick}
    aria-pressed={!!on}
  />
);

export type SegOpt = { id: string; lb: ReactNode; ic?: string };

export const Seg = ({
  opts,
  val,
  set,
  accent,
  lg,
}: {
  opts: SegOpt[];
  val: string;
  set: (id: string) => void;
  accent?: boolean;
  lg?: boolean;
}) => (
  <div className={`rv-seg ${accent ? "accent" : ""} ${lg ? "lg" : ""}`.trim()}>
    {opts.map((o) => (
      <button
        type="button"
        key={o.id}
        className={val === o.id ? "on" : ""}
        onClick={() => set(o.id)}
      >
        {o.ic && <Icon name={o.ic} className="ico-xs" />}
        {o.lb}
      </button>
    ))}
  </div>
);

export const Field = ({
  label,
  hint,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) => (
  <div className="rv-field">
    {label && <label>{label}</label>}
    {children}
    {hint && <div className="hint">{hint}</div>}
  </div>
);

export const Blk = ({
  title,
  ic,
  right,
  children,
  style,
}: {
  title?: ReactNode;
  ic?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}) => (
  <div className="rv-blk" style={style}>
    {(title || right) && (
      <div className="h">
        {ic && <Icon name={ic} className="ico-sm" style={{ color: "var(--text-3)" }} />}
        <h4>{title}</h4>
        {right}
      </div>
    )}
    {children}
  </div>
);

/** Initiales d'un nom : « Jean Dupont » → « JD ». */
export const rvInit = (name: string): string => {
  const p = (name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
};

/** Couleur d'avatar stable, dérivée du nom (même palette que la maquette). */
const AV_COLORS = ["#E2552B", "#3B7DD8", "#7A5AE0", "#2E9E6B", "#D8912E", "#C64B8C"];
export const rvColor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
};

export const Av = ({
  name,
  c,
  size = 26,
  sq,
}: {
  name?: string;
  c?: string;
  size?: number;
  sq?: boolean;
}) => {
  const nm = name || "?";
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: sq ? 7 : "50%",
        background: c || rvColor(nm),
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 600,
        flexShrink: 0,
        letterSpacing: "-.01em",
      }}
    >
      {rvInit(nm)}
    </span>
  );
};

export const Row = ({ children, style }: { children?: ReactNode; style?: CSSProperties }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, ...style }}>{children}</div>
);

export const Stack = ({
  gap = 10,
  children,
  style,
}: {
  gap?: number;
  children?: ReactNode;
  style?: CSSProperties;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>
);

/** Libellé + teinte par statut de réservation. */
export const ST_LB: Record<string, [string, string]> = {
  confirmed: ["Confirmé", "ok"],
  pending: ["À valider", "warn"],
  cancelled: ["Annulé", "danger"],
  declined: ["Refusé", "danger"],
  past: ["Tenu", ""],
};

export const fmtMin = (m: number) =>
  m >= 1440 ? `${m / 1440} j` : m >= 60 ? `${m / 60} h` : `${m} min`;
export const fmtDur = (m: number) => (m >= 60 ? `${m / 60} h` : `${m} min`);
export const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
export const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const addMin = (s: string, d: number) => minToHHMM(hhmmToMin(s) + d);

/** Types de question custom (icône + libellé), comme la maquette. */
export const QT: Record<string, [string, string]> = {
  text: ["text", "Texte court"],
  textarea: ["doc", "Texte long"],
  select: ["list", "Liste déroulante"],
  checkbox: ["squareCheck", "Case à cocher"],
  phone: ["phone", "Téléphone"],
};

/** Libellés + icônes des types de lieu (repris de RV_LOC). */
export const RV_LOC: Record<string, { lb: string; ic: string }> = {
  google_meet: { lb: "Google Meet", ic: "video" },
  zoom: { lb: "Zoom", ic: "video" },
  teams: { lb: "Microsoft Teams", ic: "video" },
  phone: { lb: "Appel téléphonique", ic: "phone" },
  in_person: { lb: "En présentiel", ic: "mappin" },
  custom: { lb: "À définir", ic: "info" },
};
