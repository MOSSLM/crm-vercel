// rdv-atoms.jsx — atomes partagés du module Rendez-vous
const Btn = ({ kind = "", size = "sm", ic, children, ...r }) => (
  <button className={`btn ${kind} ${size}`.trim()} {...r}>{ic && <Icon name={ic} className="ico-sm" />}{children}</button>
);
const Pill = ({ kind = "", dot, children }) => (
  <span className={`pill ${kind} ${dot ? "dot" : ""}`.trim()}>{children}</span>
);
const Chip = ({ ic, color, line, children }) => (
  <span className={`rv-chip ${line ? "line" : ""}`.trim()}>{color && <i className="dot" style={{ background: color }} />}{ic && <Icon name={ic} className="ico-xs" />}{children}</span>
);
const Sw = ({ on, onClick }) => <button className={`rv-sw ${on ? "on" : ""}`} onClick={onClick} aria-pressed={!!on} />;
const Seg = ({ opts, val, set, accent, lg }) => (
  <div className={`rv-seg ${accent ? "accent" : ""} ${lg ? "lg" : ""}`.trim()}>
    {opts.map(o => <button key={o.id} className={val === o.id ? "on" : ""} onClick={() => set(o.id)}>{o.ic && <Icon name={o.ic} className="ico-xs" />}{o.lb}</button>)}
  </div>
);
const Field = ({ label, hint, children }) => (
  <div className="rv-field">{label && <label>{label}</label>}{children}{hint && <div className="hint">{hint}</div>}</div>
);
const Blk = ({ title, ic, right, children, style }) => (
  <div className="rv-blk" style={style}>
    {(title || right) && <div className="h">{ic && <Icon name={ic} className="ico-sm" style={{ color: "var(--text-3)" }} />}<h4>{title}</h4>{right}</div>}
    {children}
  </div>
);
const Av = ({ id, name, c, size = 26, sq }) => {
  const h = id ? rvHost(id) : null;
  const nm = name || (h ? h.n : "?"), col = c || (h ? h.c : "var(--text-3)");
  return <span style={{ width: size, height: size, borderRadius: sq ? 7 : "50%", background: col, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 600, flexShrink: 0, letterSpacing: "-.01em" }}>{rvInit(nm)}</span>;
};
const Row = ({ children, style }) => <div style={{ display: "flex", alignItems: "center", gap: 8, ...style }}>{children}</div>;
const Stack = ({ gap = 10, children, style }) => <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>;

const ST_LB = { confirmed: ["Confirmé", "ok"], pending: ["À valider", "warn"], cancelled: ["Annulé", "danger"], past: ["Tenu", ""] };
const fmtMin = m => m >= 1440 ? `${m / 1440} j` : m >= 60 ? `${m / 60} h` : `${m} min`;
const fmtDur = m => m >= 60 ? `${m / 60} h` : `${m} min`;
const hhmmToMin = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const minToHHMM = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const addMin = (s, d) => minToHHMM(hhmmToMin(s) + d);
const QT = { text: ["text", "Texte court"], textarea: ["doc", "Texte long"], select: ["list", "Liste déroulante"], checkbox: ["squareCheck", "Case à cocher"], phone: ["phone", "Téléphone"] };

Object.assign(window, { Btn, Pill, Chip, Sw, Seg, Field, Blk, Av, Row, Stack, ST_LB, fmtMin, fmtDur, hhmmToMin, minToHHMM, addMin, QT });
