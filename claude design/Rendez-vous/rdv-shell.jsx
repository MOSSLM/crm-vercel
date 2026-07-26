// rdv-shell.jsx — coquille du module (rail CRM + rail Cal.SAMA + espaces) et montage
const NAV = [
  { s: "Rendez-vous", items: [
    { id: "overview", lb: "Aperçu", ic: "grid" },
    { id: "bookings", lb: "Réservations", ic: "calCheck", badge: 4, subs: FILTERS },
    { id: "types", lb: "Types d'évènements", ic: "calCog" },
    { id: "avail", lb: "Disponibilités", ic: "clock" },
  ] },
  { s: "Pilotage", items: [
    { id: "team", lb: "Équipe", ic: "users", admin: true },
    { id: "stats", lb: "Statistiques", ic: "bar" },
  ] },
  { s: "Réglages", items: [
    { id: "integrations", lb: "Intégrations", ic: "plug" },
    { id: "settings", lb: "Ma page", ic: "settings" },
  ] },
];
const CRUMB = { overview: "Aperçu", bookings: "Réservations", types: "Types d'évènements", avail: "Disponibilités", team: "Équipe", stats: "Statistiques", integrations: "Intégrations", settings: "Ma page" };
const RAIL_ADMIN = [["grid", "Tableau de bord"], ["pipeline", "Pipeline"], ["users", "Contacts"], ["building", "Entreprises"], ["calendar", "Rendez-vous", true], ["phone", "Centrale d'appels"], ["zap", "Automatisations"], ["doc", "Production"]];
const RAIL_AGENT = [["grid", "Mon tableau"], ["phone", "Cockpit", true], ["calCheck", "Mes RDV"], ["users", "Mes prospects"], ["mail", "Messagerie"], ["bar", "Mes stats"]];

function CalRail({ page, setPage, filter, setFilter, base }) {
  return (
    <nav className="rv-cal-rail">
      <div className="rv-cr-hd">
        <span className="ic"><Icon name="calCheck" className="ico-lg" /></span>
        <div><div className="t">Cal.SAMA</div><div className="s">Rendez-vous en ligne</div></div>
      </div>
      <div className="rv-cr-nav">
        {NAV.map(sec => (
          <div key={sec.s}>
            <div className="rv-cr-lb">{sec.s}</div>
            {sec.items.filter(i => !i.admin || base === "admin").map(i => (
              <React.Fragment key={i.id}>
                <button className={`rv-ci ${page === i.id ? "on" : ""}`.trim()} onClick={() => setPage(i.id)}>
                  <Icon name={i.ic} className="ico-sm" /><span className="lb">{i.lb}</span>{i.badge ? <span className="bd">{i.badge}</span> : null}
                </button>
                {i.subs && page === i.id && (
                  <div className="rv-csub">
                    {i.subs.map(sub => (
                      <button key={sub.id} className={filter === sub.id ? "on" : ""} onClick={() => setFilter(sub.id)}>
                        {sub.lb}<span className="n">{RV_BK.filter(b => sub.id === "upcoming" ? b.st === "confirmed" : sub.id === "pending" ? b.st === "pending" : sub.id === "past" ? b.st === "past" : b.st === "cancelled").length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
      <div className="rv-cr-ft">
        <div className="rv-link-card">
          <div className="k">Votre lien public</div>
          <div className="u">app.samadigitalstudio.fr/rdv/jean</div>
          <div className="bs"><button><Icon name="copy" className="ico-xs" />Copier</button><button className="w"><Icon name="ext" className="ico-xs" /></button></div>
        </div>
      </div>
    </nav>
  );
}

const SPACES = [{ id: "admin", lb: "Admin", ic: "settings" }, { id: "agent", lb: "Cockpit agent", ic: "phone" }, { id: "guest", lb: "Vue invité", ic: "globe" }];

function App() {
  const [space, setSpace] = React.useState("admin");
  const [page, setPage] = React.useState("overview");
  const [filter, setFilter] = React.useState("upcoming");
  const [guestType, setGuestType] = React.useState(null);
  const go = (p, f) => { setPage(p); if (f) setFilter(f); };
  const rail = space === "agent" ? RAIL_AGENT : RAIL_ADMIN;
  const me = space === "agent" ? rvHost("u2") : rvHost("u1");

  const screen = () => {
    if (space === "agent") return <ScreenCockpit />;
    if (space === "guest") return (
      <div style={{ minHeight: "100%", padding: "40px 26px 60px", display: "flex", justifyContent: "center", background: "var(--bg-2)", backgroundImage: "radial-gradient(rgba(20,18,14,.05) 1px,transparent 1px)", backgroundSize: "20px 20px" }}>
        {guestType ? (
          <div style={{ width: "100%", maxWidth: 900 }}>
            <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setGuestType(null)}><Icon name="chevleft" className="ico-sm" />Tous les rendez-vous de Jean</button>
            <BookingWidget typeId={guestType} wide />
          </div>
        ) : <PublicProfile hostId="u1" onPick={setGuestType} />}
      </div>
    );
    switch (page) {
      case "bookings": return <ScreenBookings filter={filter} setFilter={setFilter} />;
      case "types": return <ScreenTypes openPublic={() => setSpace("guest")} />;
      case "avail": return <ScreenAvail />;
      case "team": return <ScreenTeam />;
      case "stats": return <ScreenStats />;
      case "integrations": return <ScreenIntegrations />;
      case "settings": return <ScreenPage />;
      default: return <ScreenOverview go={go} />;
    }
  };

  const crumbs = space === "agent"
    ? [["Espace agent", 0], ["Téléphonie", 0], ["Cockpit d'appel", 1]]
    : space === "guest"
      ? [["Page publique", 0], ["app.samadigitalstudio.fr/rdv/jean", 1]]
      : [["Relation", 0], ["Rendez-vous", 0], [CRUMB[page], 1]];

  return (
    <div className="rv-app" style={{ gridTemplateColumns: space === "admin" ? "56px 220px 1fr" : space === "agent" ? "56px 1fr" : "1fr" }}>
      {space !== "guest" && (
        <div className="rv-rail">
          <span className="mk">S</span>
          {rail.map(([ic, lb, on]) => <button key={lb} className={`ri ${on ? "on" : ""}`.trim()}><Icon name={ic} className="ico-lg" /><span className="tip">{lb}</span></button>)}
          <span className="sp" />
          <button className="ri"><Icon name="bell" className="ico-lg" /><span className="tip">Notifications</span></button>
          <span className="av" style={{ background: me.c }}>{rvInit(me.n)}</span>
        </div>
      )}
      {space === "admin" && <CalRail page={page} setPage={setPage} filter={filter} setFilter={setFilter} base="admin" />}
      <div className="rv-content">
        <div className="rv-top">
          <div className="crumbs">
            {crumbs.map(([lb, cur], i) => (
              <React.Fragment key={lb}>
                {i > 0 && <span className="sep">/</span>}
                {cur ? <b>{lb}</b> : <span>{lb}</span>}
              </React.Fragment>
            ))}
          </div>
          {space === "admin" && <Row style={{ gap: 6 }}><Btn kind="outline" ic="search">Rechercher<kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--bg-2)", borderRadius: 3, padding: "1px 4px", color: "var(--text-4)" }}>⌘K</kbd></Btn></Row>}
          <Row style={{ gap: 8 }}>
            <span className="rv-lb" style={{ color: "var(--text-4)" }}>Espace</span>
            <Seg opts={SPACES} val={space} set={v => { setSpace(v); setGuestType(null); }} lg />
          </Row>
        </div>
        <div className={`rv-body ${space === "agent" || space === "guest" ? "flush" : ""}`.trim()} style={space === "agent" ? { display: "flex", flexDirection: "column", overflow: "hidden" } : undefined}>
          {screen()}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
document.body.classList.remove("mount-pending");
