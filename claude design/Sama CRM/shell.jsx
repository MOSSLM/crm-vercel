// app.jsx — main sidebar shell + routing
const { useState, useEffect } = React;

const NAV = [
  {
    label: "Pilotage",
    items: [
      { id: "dashboard", lb: "Dashboard", ic: "home", badge: null },
      { id: "pipeline",  lb: "Pipeline",  ic: "pipeline", badge: "38" },
      { id: "calendar",  lb: "Calendrier", ic: "calendar", badge: "7" },
    ],
  },
  {
    label: "Relation client",
    items: [
      { id: "contacts",  lb: "Contacts", ic: "user" },
      { id: "companies", lb: "Entreprises", ic: "building" },
      { id: "messagerie", lb: "Messagerie", ic: "inbox", badge: "12" },
    ],
  },
  {
    label: "Acquisition",
    items: [
      { id: "prospection", lb: "Démarchage", ic: "target", badge: "10" },
      { id: "automations", lb: "Automatisations", ic: "flow" },
      { id: "audits",      lb: "Audits & leads", ic: "search" },
    ],
  },
  {
    label: "Production",
    items: [
      { id: "production",  lb: "Devis & offres", ic: "doc", badge: "33" },
      { id: "pose",        lb: "Pose & chantiers", ic: "tools" },
      { id: "objectifs",   lb: "Objectifs", ic: "target" },
    ],
  },
];

const CRUMBS = {
  dashboard:  ["Pilotage", "Dashboard"],
  pipeline:   ["Pilotage", "Pipeline"],
  calendar:   ["Pilotage", "Calendrier"],
  contacts:   ["Relation client", "Contacts"],
  companies:  ["Relation client", "Entreprises"],
  prospection:["Acquisition", "Démarchage"],
  production: ["Production", "Devis & offres"],
};

const SCREEN = {
  dashboard:   () => <ScreenDashboard />,
  pipeline:    () => <ScreenPipeline />,
  calendar:    () => <ScreenCalendar />,
  contacts:    () => <ScreenContacts />,
  companies:   () => <ScreenCompanies />,
  prospection: () => <ScreenProspection />,
  production:  () => <ScreenProduction />,
};

function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem("sama:auth") !== "0");
  const [route, setRoute]   = useState(() => localStorage.getItem("sama:route") || "dashboard");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { localStorage.setItem("sama:route", route); }, [route]);
  useEffect(() => { localStorage.setItem("sama:auth", authed ? "1" : "0"); }, [authed]);

  if (!authed) {
    return <ScreenLogin onSignIn={() => setAuthed(true)} />;
  }

  const Screen = SCREEN[route] || SCREEN.dashboard;
  const crumbs = CRUMBS[route] || ["—", "—"];

  // No padding for split-style screens
  const fluid = ["contacts", "companies", "calendar", "prospection", "production"].includes(route);

  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-hd">
          <div className="brand-mark">S</div>
          <div className="brand-text">
            <div className="nm">Sama CRM</div>
            <div className="org">thermalis</div>
          </div>
        </div>

        <div className="sidebar-search">
          <div className="ws">
            <Icon name="search" className="ico-sm" />
            <span className="ph">Recherche…</span>
            <kbd>⌘K</kbd>
          </div>
        </div>

        <div className="sidebar-body">
          {NAV.map(section => (
            <div className="nav-section" key={section.label}>
              <div className="nl">{section.label}</div>
              {section.items.map(it => {
                const active = route === it.id;
                const clickable = !!SCREEN[it.id];
                return (
                  <button
                    key={it.id}
                    className="nav-item"
                    aria-current={active ? "page" : undefined}
                    onClick={() => clickable && setRoute(it.id)}
                    style={{ opacity: clickable ? 1 : 0.55 }}
                    title={!clickable ? "Bientôt" : ""}
                  >
                    <Icon name={it.ic} className="ico ic" />
                    <span className="lb">{it.lb}</span>
                    {it.badge && <span className="bd">{it.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="sidebar-ft">
          <div className="av">LB</div>
          <div className="who">
            <div className="n">Lucas Bernier</div>
            <div className="r">workspace · pro</div>
          </div>
          <button className="ck" title="Replier" onClick={() => setCollapsed(true)}>
            <Icon name="chevsLR" className="ico-sm" />
          </button>
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="collapse-tab"
            title="Déplier"
          >
            <Icon name="chevsRL" className="ico-sm" />
          </button>
        )}
      </aside>

      {/* CONTENT */}
      <main className="content">
        <header className="topbar">
          <div className="crumbs">
            <Icon name="home2" className="ico-sm" style={{ color: "var(--text-4)" }} />
            <Icon name="chevright" className="ico-xs" />
            <span>{crumbs[0]}</span>
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">{crumbs[1]}</span>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon" title="Notifications">
              <Icon name="bell" className="ico-sm" />
            </button>
            <button className="btn ghost sm icon" title="Paramètres">
              <Icon name="settings" className="ico-sm" />
            </button>
            <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />
            <button
              className="btn ghost sm"
              onClick={() => { setAuthed(false); localStorage.removeItem("sama:auth"); }}
              title="Déconnexion"
            >
              <Icon name="ext" className="ico-sm" />Déconnexion
            </button>
          </div>
        </header>

        <div className="content-body" style={{ padding: 0 }}>
          <Screen />
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Connecté · Supabase</span>
          <span className="sep" />
          <span>workspace: thermalis</span>
          <span className="sep" />
          <span>v2.4.1</span>
          <span className="spacer" />
          <span>auto-save · synced il y a 4s</span>
        </footer>
      </main>
    </div>
  );
}

document.body.classList.remove("mount-pending");
ReactDOM.createRoot(document.getElementById("app")).render(<App />);
