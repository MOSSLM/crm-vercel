// parts.tsx — atomes partagés (port de an-parts.jsx)
import React from "react";
import { Icon } from "./icons";
import { anIni } from "./format";

export function Panel({
  title,
  icon,
  src,
  count,
  right,
  children,
  bodyClass = "",
  className = "",
  style,
}: {
  title: string;
  icon?: string;
  src?: string;
  count?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  bodyClass?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={"a-panel " + className} style={style}>
      <div className="hd">
        {icon ? (
          <span className="sq">
            <Icon name={icon} className="ico s" />
          </span>
        ) : null}
        <h3>{title}</h3>
        {count != null ? <span className="a-tag mono">{count}</span> : null}
        {right}
        {src ? <span className="src">{src}</span> : null}
      </div>
      <div className={"bd " + bodyClass}>{children}</div>
    </section>
  );
}

export function Av({ name, color, size = 30, radius = 9 }: { name: string; color: string; size?: number; radius?: number }) {
  return (
    <span className="av" style={{ background: color, width: size, height: size, borderRadius: radius }}>
      {anIni(name)}
    </span>
  );
}

export function Meter({ v, tone = "", w = 56 }: { v: number; tone?: string; w?: number }) {
  return (
    <span className="a-meter">
      <span className="tr" style={{ width: w }}>
        <i className={tone} style={{ width: Math.max(2, Math.min(100, v * 100)) + "%" }} />
      </span>
    </span>
  );
}

export function Spark({ data, hiFrom }: { data: number[]; hiFrom?: number }) {
  const max = Math.max(1, ...data);
  return (
    <div className="a-spark">
      {data.map((v, i) => (
        <i key={i} className={hiFrom != null && i >= hiFrom ? "hi" : ""} style={{ height: Math.max(2, (v / max) * 16) }} />
      ))}
    </div>
  );
}

export function Kpi({
  tone = "",
  icon,
  label,
  value,
  unit,
  note,
  spark,
  hiFrom,
  children,
}: {
  tone?: string;
  icon: string;
  label: string;
  value: React.ReactNode;
  unit?: string;
  note?: React.ReactNode;
  spark?: number[];
  hiFrom?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className={"a-kpi " + tone}>
      <div className="k">
        <span className="sq">
          <Icon name={icon} className="ico s" />
        </span>
        {label}
      </div>
      <div className="v">
        {value}
        {unit ? <u>{unit}</u> : null}
      </div>
      {note ? <div className="d">{note}</div> : null}
      {spark ? <Spark data={spark} hiFrom={hiFrom} /> : null}
      {children}
    </div>
  );
}

export function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="a-na">nouveau</span>;
  const d = (cur - prev) / prev;
  const good = invert ? d < 0 : d > 0;
  return (
    <b className={good ? "" : "dn"}>
      {d >= 0 ? "+" : "−"}
      {Math.abs(d * 100).toFixed(0)} % vs période préc.
    </b>
  );
}
