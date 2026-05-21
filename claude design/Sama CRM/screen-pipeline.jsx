// screen-pipeline.jsx
function ScreenPipeline() {
  const stages = window.STAGES.filter(s => s.id !== "lost"); // 5 columns visible
  const deals = window.DEALS;

  const byStage = stages.map(s => ({ ...s, items: deals.filter(d => d.stage === s.id) }));
  const totalsByStage = byStage.map(s => ({
    ...s,
    sum: s.items.reduce((acc, d) => acc + d.value, 0),
    weighted: s.items.reduce((acc, d) => acc + d.value * d.prob / 100, 0),
  }));
  const totalPipe = totalsByStage.reduce((a, s) => a + s.sum, 0);
  const totalWeighted = totalsByStage.reduce((a, s) => a + s.weighted, 0);

  const memberByUser = u => window.TEAM.find(t => t.id === u) || {};

  return (
    <div>
      <div className="page-hd" style={{ padding: "22px 24px 0" }}>
        <div>
          <h1 className="display">Pipeline</h1>
          <div className="sub">
            38 deals ouverts · <strong style={{ color: "var(--text)" }}>{eur(totalPipe)}</strong> brut ·
            <strong style={{ color: "var(--text)", marginLeft: 6 }}>{eur(Math.round(totalWeighted))}</strong> pondéré ·
            close estimée juin 2026
          </div>
        </div>
        <div className="actions">
          <button className="btn outline sm"><Icon name="layoutGrid" className="ico-sm" />Kanban</button>
          <button className="btn ghost sm"><Icon name="layoutList" className="ico-sm" />Tableau</button>
          <button className="btn ghost sm"><Icon name="bar" className="ico-sm" />Forecast</button>
          <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
          <button className="btn accent sm"><Icon name="plus" className="ico-sm" />Nouveau deal</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="pipe-toolbar" style={{ paddingTop: 18 }}>
        <div className="filters">
          <button className="btn subtle sm"><Icon name="users" className="ico-sm" />Tous les owners<Icon name="chevdown" className="ico-xs" /></button>
          <button className="btn subtle sm"><Icon name="filter" className="ico-sm" />Type · 3<Icon name="chevdown" className="ico-xs" /></button>
          <button className="btn ghost sm"><Icon name="calendar" className="ico-sm" />Close ≤ 30j</button>
          <button className="btn ghost sm"><Icon name="flame" className="ico-sm" style={{ color: "var(--accent)" }} />Hot uniquement</button>
        </div>
        <div className="views">
          <div style={{ display: "flex", alignItems: "center", gap: -8 }}>
            {window.TEAM.slice(0, 4).map((t, i) => (
              <div key={t.id} style={{ marginLeft: i ? -8 : 0, border: "2px solid var(--bg)", borderRadius: "50%" }}>
                <Avatar initials={t.initials} color={t.color} size={24} />
              </div>
            ))}
          </div>
          <button className="btn ghost sm icon" title="Plus"><Icon name="more" className="ico-sm" /></button>
        </div>
      </div>

      {/* Forecast strip */}
      <div className="pipe-forecast">
        {totalsByStage.map(s => (
          <div className="col" key={s.id}>
            <div className="nm"><span className="dot" style={{ background: s.color }} /> {s.name}</div>
            <div className="vl">{Math.round(s.sum / 1000)}<span style={{ fontSize: 13, color: "var(--text-3)", marginLeft: 2 }}>k€</span></div>
            <div className="nb">{s.items.length} deals · pond. {Math.round(s.weighted / 1000)}k€</div>
          </div>
        ))}
        <div className="col" style={{ background: "var(--text)", color: "var(--bg)" }}>
          <div className="nm" style={{ color: "rgba(255,255,255,.5)" }}>Total pondéré</div>
          <div className="vl" style={{ color: "var(--bg)" }}>{Math.round(totalWeighted / 1000)}<span style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginLeft: 2 }}>k€</span></div>
          <div className="nb" style={{ color: "rgba(255,255,255,.4)" }}>{deals.filter(d => d.stage !== "won" && d.stage !== "lost").length} ouverts · 6 mois glissants</div>
        </div>
      </div>

      {/* Kanban */}
      <div className="kanban">
        {byStage.map(col => (
          <div className="kb-col" key={col.id}>
            <div className="kb-col-hd">
              <span className="dot" style={{ background: col.color }} />
              <span className="nm">{col.name}</span>
              <span className="ct">{col.items.length}</span>
              <span className="vl">{Math.round(col.items.reduce((a, d) => a + d.value, 0) / 1000)}k€</span>
            </div>
            <div className="kb-col-bd">
              {col.items.map(d => {
                const owner = memberByUser(d.owner);
                return (
                  <div className={`kb-card ${d.hot ? "hot" : ""}`} key={d.id}>
                    <div className="tl-row">
                      <div className="nm">{d.title}</div>
                      <div className="val">{eur(d.value)}</div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      <Icon name="building" className="ico-xs" style={{ verticalAlign: -2, marginRight: 4 }} />
                      {d.company}
                    </div>
                    {(d.tags?.length > 0) && (
                      <div className="tags">
                        {d.tags.map((t, i) => (
                          <Pill key={i} kind={t === "MaPrimeRenov'" ? "ok" : t === "B2B" ? "info" : t === "récurrent" ? "magic" : ""}>{t}</Pill>
                        ))}
                      </div>
                    )}
                    <div className="meta">
                      <Avatar initials={owner.initials} color={owner.color} size={18} />
                      <span style={{ flex: 1 }}>{owner.name?.split(" ")[0]}</span>
                      <span className="nb">{d.prob}%</span>
                      <span style={{ width: 1, height: 10, background: "var(--border)" }} />
                      <Icon name="calendar" className="ico-xs" />
                      <span className="nb">{d.close}</span>
                    </div>
                    <div className="progress"><i style={{ width: `${d.prob}%` }} /></div>
                  </div>
                );
              })}
              <button className="kb-add"><Icon name="plus" className="ico-sm" />Ajouter</button>
            </div>
          </div>
        ))}

        {/* Won column visual */}
        <div className="kb-col" style={{ background: "rgba(31,138,91,.05)", borderColor: "rgba(31,138,91,.2)" }}>
          <div className="kb-col-hd">
            <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
            <span className="nm">Signé · ce mois</span>
            <span className="ct">2</span>
            <span className="vl" style={{ color: "var(--ok)" }}>17k€</span>
          </div>
          <div className="kb-col-bd">
            {deals.filter(d => d.stage === "won").map(d => {
              const owner = memberByUser(d.owner);
              return (
                <div className="kb-card" key={d.id} style={{ borderColor: "rgba(31,138,91,.2)" }}>
                  <div className="tl-row">
                    <div className="nm">{d.title}</div>
                    <div className="val" style={{ color: "var(--ok)" }}>{eur(d.value)}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{d.company}</div>
                  <div className="meta">
                    <Avatar initials={owner.initials} color={owner.color} size={18} />
                    <span style={{ flex: 1 }}>{owner.name?.split(" ")[0]}</span>
                    <Pill kind="ok"><Icon name="check" className="ico-xs" />signé</Pill>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.ScreenPipeline = ScreenPipeline;
