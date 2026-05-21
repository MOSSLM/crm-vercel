// screen-calendar.jsx
function ScreenCalendar() {
  const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const dateNums = [18, 19, 20, 21, 22, 23, 24];
  const todayIdx = 3; // Thursday
  const hours = Array.from({ length: 11 }, (_, i) => 8 + i); // 8h → 18h
  const HOUR_H = 56;

  const events = window.EVENTS_WEEK;

  const NOW = 14.45; // 14h27
  const nowTop = (NOW - 8) * HOUR_H;

  const [selectedEvt, setSelectedEvt] = React.useState(3); // index for highlight

  return (
    <div className="cal-page">
      <div className="cal-main">

        <div className="cal-toolbar">
          <h2 className="cal-title">Semaine du 18 mai</h2>
          <span className="week">SEM. 21 · MAI 2026</span>
          <div className="grow" />
          <button className="btn ghost sm icon"><Icon name="chevleft" className="ico-sm" /></button>
          <button className="btn outline sm">Aujourd'hui</button>
          <button className="btn ghost sm icon"><Icon name="chevright" className="ico-sm" /></button>
          <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
          <div style={{ display: "inline-flex", gap: 2, background: "var(--bg-2)", padding: 2, borderRadius: 6 }}>
            <button className="btn xs" style={{ height: 22, fontSize: 11 }}>Jour</button>
            <button className="btn xs" style={{ background: "var(--surface)", height: 22, fontSize: 11, boxShadow: "var(--shadow-1)" }}>Semaine</button>
            <button className="btn xs" style={{ height: 22, fontSize: 11 }}>Mois</button>
            <button className="btn xs" style={{ height: 22, fontSize: 11 }}>Terrain</button>
          </div>
          <button className="btn accent sm" style={{ marginLeft: 6 }}><Icon name="plus" className="ico-sm" />RDV</button>
        </div>

        <div className="cal-week">
          <div className="corner" />
          {days.map((d, i) => (
            <div key={d} className={`ch ${i === todayIdx ? "today" : ""}`}>
              <span>{d}</span>
              <span className="d">{dateNums[i]}</span>
            </div>
          ))}

          <div className="hour-col" style={{ gridRow: "2 / 3" }}>
            {hours.map(h => (
              <div key={h} className="h">{h}:00</div>
            ))}
          </div>

          {days.map((d, dayIdx) => {
            const isWeekend = dayIdx >= 5;
            const isToday = dayIdx === todayIdx;
            return (
              <div
                key={dayIdx}
                className={`cal-day ${isToday ? "today" : ""} ${isWeekend ? "weekend" : ""}`}
                style={{ gridRow: "2 / 3", height: hours.length * HOUR_H }}
              >
                {events.filter(e => e.day === dayIdx).map((e, ei) => {
                  const top = (e.start - 8) * HOUR_H;
                  const h = (e.end - e.start) * HOUR_H;
                  return (
                    <div
                      key={ei}
                      className="cal-event"
                      data-k={e.kind}
                      aria-selected={isToday && e.kind === "qualif" && ei === 0 ? true : undefined}
                      style={{ top, height: h - 4 }}
                    >
                      <div className="t">{e.title}</div>
                      <div className="m">
                        {String(Math.floor(e.start)).padStart(2, "0")}:{String(Math.round((e.start % 1) * 60)).padStart(2, "0")}
                        {" — "}
                        {String(Math.floor(e.end)).padStart(2, "0")}:{String(Math.round((e.end % 1) * 60)).padStart(2, "0")}
                        {e.loc && <> · {e.loc}</>}
                      </div>
                    </div>
                  );
                })}

                {isToday && (
                  <div className="cal-now-line" style={{ top: nowTop }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SIDE */}
      <aside className="cal-side">
        <div className="blk">
          <h4>Mai 2026</h4>
          <div className="mini-cal">
            {["L", "M", "M", "J", "V", "S", "D"].map((w, i) => <div key={i} className="wh">{w}</div>)}
            {/* April tail */}
            {[28, 29, 30].map(n => <div key={"p" + n} className="d mute">{n}</div>)}
            {Array.from({ length: 31 }, (_, i) => i + 1).map(n => {
              const has = [3, 6, 9, 14, 18, 19, 20, 21, 22, 27, 28].includes(n);
              const today = n === 21;
              const cls = ["d"];
              if (today) cls.push("today");
              if (has) cls.push("has");
              return <div key={n} className={cls.join(" ")}>{n}</div>;
            })}
            {[1, 2, 3, 4, 5].map(n => <div key={"n" + n} className="d mute">{n}</div>)}
          </div>
        </div>

        <div className="blk" style={{ background: "var(--text)", color: "var(--bg)", borderColor: "var(--text)", borderBottom: "1px solid var(--border)" }}>
          <h4 style={{ color: "rgba(255,255,255,.4)" }}>Prochain RDV · dans 14 min</h4>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1.1, letterSpacing: "-.005em", color: "var(--bg)" }}>
            Signature ES49<br /><span style={{ color: "rgba(255,255,255,.6)", fontSize: 15 }}>Camille Pelletier</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, fontSize: 12, color: "rgba(255,255,255,.7)", fontFamily: "var(--font-mono)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="clock" className="ico-sm" />10:30 — 12:00
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="mappin" className="ico-sm" />14 rue des Ormeaux, Angers
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="phone" className="ico-sm" />+33 6 12 84 39 22
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <button className="btn xs" style={{ flex: 1, background: "var(--accent)", color: "white", height: 30 }}>
              <Icon name="map" className="ico-sm" />GPS · 22 min
            </button>
            <button className="btn xs" style={{ background: "rgba(255,255,255,.1)", color: "var(--bg)", height: 30, border: "1px solid rgba(255,255,255,.15)" }}>
              <Icon name="doc" className="ico-sm" />Contrat
            </button>
          </div>
        </div>

        <div className="blk">
          <h4>Tournée du jour</h4>
          <div className="field-map" style={{ height: 160, marginBottom: 10 }}>
            <div className="pin" style={{ left: "20%", top: "72%" }}>1</div>
            <div className="pin next" style={{ left: "48%", top: "44%" }}>2</div>
            <div className="pin" style={{ left: "78%", top: "62%" }}>3</div>
            <svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M20,68 Q34,40 48,40 Q66,40 78,58" stroke="var(--accent)" strokeWidth=".6" strokeDasharray="2 1.5" fill="none" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "var(--text-2)" }}>
            <FieldRow num="1" t="08:30 · Briefing matinal" loc="Bureau Sama" done />
            <FieldRow num="2" t="10:30 · Signature ES49" loc="Angers — 22 min" current />
            <FieldRow num="3" t="14:30 · Qualif Solvert" loc="Visio" />
            <FieldRow num="4" t="16:00 · Devis copro VHD" loc="La Roche-sur-Yon — 1h45" />
          </div>
        </div>

        <div className="blk" style={{ flex: 1 }}>
          <h4>Légende</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <LegendRow color="var(--accent)" l="RDV terrain" />
            <LegendRow color="var(--info)" l="Qualification" />
            <LegendRow color="var(--ok)" l="Production / pose" />
            <LegendRow color="var(--text-3)" l="Interne" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function FieldRow({ num, t, loc, current, done }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, alignItems: "flex-start" }}>
      <span style={{
        width: 18, height: 18,
        borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: current ? "var(--text)" : done ? "var(--ok-tint)" : "var(--bg-2)",
        color: current ? "var(--bg)" : done ? "var(--ok)" : "var(--text-3)",
      }}>{num}</span>
      <div>
        <div style={{ color: current ? "var(--text)" : "var(--text-2)", fontWeight: current ? 500 : 400, fontSize: 12 }}>{t}</div>
        <div style={{ color: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{loc}</div>
      </div>
    </div>
  );
}

function LegendRow({ color, l }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 3, height: 14, background: color, borderRadius: 2 }} />
      <span style={{ color: "var(--text-2)" }}>{l}</span>
    </div>
  );
}

window.ScreenCalendar = ScreenCalendar;
