// screen-extra.jsx — Mandants CVC + Commissions

function ScreenMandants() {
  const { openConv } = window.useConv();
  const mandants = window.MANDANTS;
  const prospectsOf = id => window.PROSPECTS.filter(p => p.mandant === id);

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <h1 className="display">Mes mandants CVC</h1>
          <div className="sub">{mandants.length} installateurs · SAMA me confie leur démarchage terrain</div>
        </div>
        <div className="actions">
          <button className="btn outline sm"><Icon name="filter" className="ico-sm" />Zone</button>
          <button className="btn accent sm"><Icon name="plus" className="ico-sm" />Demander un mandat</button>
        </div>
      </div>

      <div className="mandant-grid">
        {mandants.map(m => {
          const ppl = prospectsOf(m.id);
          const rdvCount = ppl.filter(p => p.status === "rdv" || p.status === "transmis").length;
          const pct = Math.round((m.rdv_mois / m.obj) * 100);
          return (
            <div className="mandant-card" key={m.id}>
              <div className="mc-hd">
                <div className="mc-logo" style={{ background: m.color }}>{m.name[0]}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mc-nm">{m.name}</div>
                  <div className="mc-focus">{m.focus}</div>
                  <div className="mc-zone">{m.zone}</div>
                </div>
                <Pill kind="ok" dot>actif</Pill>
              </div>
              <div className="mc-stats">
                <div className="mc-stat"><div className="v" style={{ color: m.color }}>{m.rdv_mois}</div><div className="l">RDV / mois</div></div>
                <div className="mc-stat"><div className="v">{ppl.length}</div><div className="l">leads actifs</div></div>
                <div className="mc-stat"><div className="v" style={{ color: "var(--ok)" }}>{m.prime}€</div><div className="l">prime / RDV</div></div>
              </div>
              <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
                {ppl.slice(0, 3).map((p, i) => (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 8, alignItems: "center", cursor: "default" }} onClick={() => openConv(p.id)}>
                    <Avatar initials={window.initialsOf(p)} color={window.prospectColor(p)} size={24} />
                    <span style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.first} {p.last}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>{window.stage(p.status).name}</span>
                  </div>
                ))}
              </div>
              <div className="mc-foot">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{m.rdv_mois}/{m.obj} obj.</span>
                <span className="mc-bar"><i style={{ width: `${Math.min(100, pct)}%`, background: m.color }} /></span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: pct >= 100 ? "var(--ok)" : "var(--text-3)" }}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScreenCommissions() {
  const lines = [
    { pid: "p8",  status: "Validée", k: "ok",    label: "RDV honoré — Camping Les Pins", m: "breizh", amt: 80,  date: "16 mai" },
    { pid: "p1",  status: "À venir", k: "magic", label: "RDV transmis — Syndic Les Ormeaux", m: "clim", amt: 70, date: "22 mai" },
    { pid: "p10", status: "À venir", k: "magic", label: "RDV transmis — Hôtel du Port", m: "thermi", amt: 60, date: "22 mai" },
    { pid: "p2",  status: "Pressenti", k: "warn", label: "Intéressé — Bailleur Habitat 44", m: "thermi", amt: 60, date: "vendredi" },
    { pid: "p7",  status: "Pressenti", k: "warn", label: "Intéressé — Domus Services", m: "thermi", amt: 60, date: "cette sem." },
    { pid: "p4",  status: "Pressenti", k: "warn", label: "Intéressé — Garage Daoudi", m: "clim", amt: 70, date: "cette sem." },
  ];
  const validated = lines.filter(l => l.status === "Validée").reduce((a, l) => a + l.amt, 0);
  const pending = lines.filter(l => l.status === "À venir").reduce((a, l) => a + l.amt, 0);
  const potential = lines.filter(l => l.status === "Pressenti").reduce((a, l) => a + l.amt, 0);
  const { openConv } = window.useConv();

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <h1 className="display">Commissions</h1>
          <div className="sub">Rémunération au RDV honoré · bonus à la signature CVC · mai 2026</div>
        </div>
        <div className="actions">
          <button className="btn outline sm"><Icon name="download" className="ico-sm" />Relevé</button>
          <button className="btn outline sm"><Icon name="calendar" className="ico-sm" />Mai 2026<Icon name="chevdown" className="ico-xs" /></button>
        </div>
      </div>

      <div className="kpi-bento" style={{ marginBottom: 22 }}>
        <div className="kpi dark">
          <div className="lb"><Icon name="check" className="ico-sm" />Validé · ce mois</div>
          <div className="vl">1 840<small>€</small></div>
          <div className="delta up"><Icon name="trending" className="ico-xs" />+15% <span className="vs">vs avril</span></div>
        </div>
        <div className="kpi">
          <div className="lb"><Icon name="clock" className="ico-sm" />En attente d'honoré</div>
          <div className="vl">{pending}<small>€ · {lines.filter(l => l.status === "À venir").length} RDV</small></div>
          <div className="delta up"><Icon name="calendar" className="ico-xs" />transmis aux CVC</div>
        </div>
        <div className="kpi">
          <div className="lb"><Icon name="target" className="ico-sm" />Potentiel pipeline</div>
          <div className="vl">{potential}<small>€</small></div>
          <div className="delta up"><Icon name="flame" className="ico-xs" />leads chauds</div>
        </div>
        <div className="kpi">
          <div className="lb"><Icon name="euro" className="ico-sm" />Projection fin de mois</div>
          <div className="vl">2 4{"" }<small style={{ marginLeft: -2 }}>00 € · est.</small></div>
          <div className="delta up"><Icon name="trending" className="ico-xs" />objectif 2 200 € ✓</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <h3>Détail des commissions</h3>
          <span className="meta">RDV transmis & honorés</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
            total estimé · {validated + pending + potential} €
          </span>
        </div>
        <div className="card-bd" style={{ padding: 0 }}>
          {lines.map((l, i) => {
            const m = window.mandant(l.m);
            return (
              <div className="commission-row" key={i} style={{ cursor: "default" }} onClick={() => openConv(l.pid)}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: m.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>{m.name[0]}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: "-.005em" }}>{l.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{m.name} · {l.date}</div>
                </div>
                <Pill kind={l.k} dot>{l.status}</Pill>
                <span className="amt">{l.amt} €</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenMandants, ScreenCommissions });
