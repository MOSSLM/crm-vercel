// screen-pipeline.jsx — funnel de génération de RDV de l'agent
function ScreenPipeline() {
  const { openConv } = window.useConv();
  const stages = window.STAGES.filter(s => s.id !== "perdu");
  const prospects = window.PROSPECTS;

  const byStage = stages.map(s => ({ ...s, items: prospects.filter(p => p.status === s.id) }));
  const commissionOf = p => window.mandant(p.mandant).prime;
  const totalPotential = prospects.filter(p => p.status !== "perdu" && p.status !== "transmis").reduce((a, p) => a + commissionOf(p), 0);

  return (
    <div>
      <div className="page-hd" style={{ padding: "22px 24px 0" }}>
        <div>
          <h1 className="display">Pipeline</h1>
          <div className="sub">
            {prospects.filter(p => p.status !== "perdu").length} leads actifs · potentiel de commission{" "}
            <strong style={{ color: "var(--text)" }}>{totalPotential} €</strong> · 5 mandants CVC
          </div>
        </div>
        <div className="actions">
          <button className="btn outline sm"><Icon name="layoutGrid" className="ico-sm" />Kanban</button>
          <button className="btn ghost sm"><Icon name="layoutList" className="ico-sm" />Tableau</button>
          <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
          <button className="btn accent sm"><Icon name="plus" className="ico-sm" />Nouveau lead</button>
        </div>
      </div>

      <div className="pipe-toolbar" style={{ paddingTop: 18 }}>
        <div className="filters">
          <button className="btn subtle sm"><Icon name="building" className="ico-sm" />Tous les mandants<Icon name="chevdown" className="ico-xs" /></button>
          <button className="btn ghost sm"><Icon name="whatsapp" className="ico-sm" />Canal<Icon name="chevdown" className="ico-xs" /></button>
          <button className="btn ghost sm"><Icon name="flame" className="ico-sm" style={{ color: "var(--accent)" }} />Chauds</button>
        </div>
        <div className="views">
          <div style={{ display: "flex", alignItems: "center" }}>
            {window.MANDANTS.map((mn, i) => (
              <div key={mn.id} title={mn.name} style={{ marginLeft: i ? -6 : 0, width: 22, height: 22, borderRadius: 6, background: mn.color, border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9, fontWeight: 700 }}>
                {mn.name[0]}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Forecast strip */}
      <div className="pipe-forecast" style={{ gridTemplateColumns: `repeat(${byStage.length}, 1fr) 1fr` }}>
        {byStage.map(s => (
          <div className="col" key={s.id}>
            <div className="nm"><span className="dot" style={{ background: s.color }} /> {s.name}</div>
            <div className="vl">{s.items.length}</div>
            <div className="nb">{s.items.reduce((a, p) => a + commissionOf(p), 0)} € pot.</div>
          </div>
        ))}
        <div className="col" style={{ background: "var(--text)", color: "var(--bg)" }}>
          <div className="nm" style={{ color: "rgba(255,255,255,.5)" }}>RDV → transmis</div>
          <div className="vl" style={{ color: "var(--bg)" }}>{byStage.find(s => s.id === "rdv").items.length + byStage.find(s => s.id === "transmis").items.length}</div>
          <div className="nb" style={{ color: "rgba(255,255,255,.4)" }}>ce mois · commission acquise</div>
        </div>
      </div>

      {/* Kanban */}
      <div className="kanban" style={{ gridAutoColumns: "270px", minHeight: 480 }}>
        {byStage.map(col => (
          <div className="kb-col" key={col.id}>
            <div className="kb-col-hd">
              <span className="dot" style={{ background: col.color }} />
              <span className="nm">{col.name}</span>
              <span className="ct">{col.items.length}</span>
              <span className="vl">{col.items.reduce((a, p) => a + commissionOf(p), 0)}€</span>
            </div>
            <div className="kb-col-bd">
              {col.items.map(p => {
                const mn = window.mandant(p.mandant);
                return (
                  <div className={`kb-card ${p.hot ? "hot" : ""}`} key={p.id} onClick={() => openConv(p.id)}>
                    <div className="tl-row">
                      <div className="nm">{p.first} {p.last}</div>
                      <div className="val" style={{ color: "var(--ok)" }}>{mn.prime}€</div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                      <Icon name="briefcase" className="ico-xs" style={{ verticalAlign: -2, marginRight: 4 }} />
                      {p.org} · {p.city}
                    </div>
                    <div className="tags">
                      <Pill dot style={{ "--d": mn.color }}><span style={{ width: 6, height: 6, borderRadius: 2, background: mn.color, display: "inline-block" }} />{mn.name}</Pill>
                    </div>
                    <div className="meta">
                      <Avatar initials={window.initialsOf(p)} color={window.prospectColor(p)} size={18} />
                      <span style={{ flex: 1 }}>score {p.score}</span>
                      <Icon name="clock" className="ico-xs" />
                      <span className="nb">{p.last_touch}</span>
                    </div>
                    <div className="progress"><i style={{ width: `${p.score}%` }} /></div>
                  </div>
                );
              })}
              {col.items.length === 0 && (
                <button className="kb-add"><Icon name="plus" className="ico-sm" />Ajouter</button>
              )}
            </div>
          </div>
        ))}

        {/* Perdu */}
        <div className="kb-col" style={{ background: "rgba(181,50,47,.04)", borderColor: "rgba(181,50,47,.18)" }}>
          <div className="kb-col-hd">
            <Icon name="x" className="ico-sm" style={{ color: "var(--danger)" }} />
            <span className="nm">Perdu</span>
            <span className="ct">{prospects.filter(p => p.status === "perdu").length}</span>
          </div>
          <div className="kb-col-bd">
            {prospects.filter(p => p.status === "perdu").map(p => {
              const mn = window.mandant(p.mandant);
              return (
                <div className="kb-card" key={p.id} style={{ borderColor: "rgba(181,50,47,.18)", opacity: .75 }} onClick={() => openConv(p.id)}>
                  <div className="tl-row">
                    <div className="nm">{p.first} {p.last}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.org} · {p.city}</div>
                  <div className="meta">
                    <span style={{ flex: 1, fontSize: 11, color: "var(--text-3)" }}>{mn.name}</span>
                    <Pill kind="danger">injoignable</Pill>
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
