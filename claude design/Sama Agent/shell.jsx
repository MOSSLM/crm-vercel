// shell.jsx — sidebar + routing pour l'espace agent SAMA
const { useState, useEffect } = React;

const NAV = [
  {
    label: "Pilotage",
    items: [
      { id: "dashboard", lb: "Dashboard", ic: "home" },
      { id: "pipeline",  lb: "Pipeline",  ic: "pipeline", badge: "23" },
      { id: "calendar",  lb: "Calendrier", ic: "calendar", badge: "6" },
    ],
  },
  {
    label: "Démarchage",
    items: [
      { id: "demarchage", lb: "Démarchage", ic: "target", badge: "9" },
      { id: "messagerie", lb: "Messagerie", ic: "inbox", badge: "4" },
      { id: "sequences",  lb: "Séquences", ic: "flow" },
    ],
  },
  {
    label: "Relation",
    items: [
      { id: "contacts",  lb: "Contacts", ic: "user" },
      { id: "companies", lb: "Entreprises", ic: "building" },
    ],
  },
  {
    label: "SAMA",
    items: [
      { id: "mandants",    lb: "Mandants CVC", ic: "briefcase", badge: "5" },
      { id: "commissions", lb: "Commissions", ic: "euro" },
      { id: "objectifs",   lb: "Objectifs", ic: "flag" },
    ],
  },
];

const CRUMBS = {
  dashboard:  ["Pilotage", "Dashboard"],
  pipeline:   ["Pilotage", "Pipeline"],
  calendar:   ["Pilotage", "Calendrier"],
  demarchage: ["Démarchage", "File du jour"],
  messagerie: ["Démarchage", "Messagerie"],
  contacts:   ["Relation", "Contacts"],
  companies:  ["Relation", "Entreprises"],
  mandants:   ["SAMA", "Mandants CVC"],
  commissions:["SAMA", "Commissions"],
};

const SCREEN = {
  dashboard:   () => <ScreenDashboard />,
  pipeline:    () => <ScreenPipeline />,
  calendar:    () => <ScreenCalendar />,
  demarchage:  () => <ScreenDemarchage />,
  messagerie:  () => <ScreenMessagerie />,
  contacts:    () => <ScreenContacts />,
  companies:   () => <ScreenCompanies />,
  mandants:    () => <ScreenMandants />,
  commissions: () => <ScreenCommissions />,
};

function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem("samaAgent:auth") !== "0");
  const [route, setRoute]   = useState(() => localStorage.getItem("samaAgent:route") || "dashboard");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { localStorage.setItem("samaAgent:route", route); }, [route]);
  useEffect(() => { localStorage.setItem("samaAgent:auth", authed ? "1" : "0"); }, [authed]);

  if (!authed) return <ScreenLogin onSignIn={() => setAuthed(true)} />;

  const Screen = SCREEN[route] || SCREEN.dashboard;
  const crumbs = CRUMBS[route] || ["—", "—"];

  return (
    <ConvProvider>
      <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-hd">
            <div className="brand-mark">S</div>
            <div className="brand-text">
              <div className="nm">SAMA</div>
              <div className="org">espace agent</div>
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
                    <button key={it.id} className="nav-item" aria-current={active ? "page" : undefined}
                      onClick={() => clickable && setRoute(it.id)}
                      style={{ opacity: clickable ? 1 : 0.55 }} title={!clickable ? "Bientôt" : ""}>
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
            <div className="av">NC</div>
            <div className="who">
              <div className="n">Naïma Cherif</div>
              <div className="r">freelance · SAMA</div>
            </div>
            <button className="ck" title="Replier" onClick={() => setCollapsed(true)}>
              <Icon name="chevsLR" className="ico-sm" />
            </button>
          </div>

          {collapsed && (
            <button onClick={() => setCollapsed(false)} className="collapse-tab" title="Déplier">
              <Icon name="chevsRL" className="ico-sm" />
            </button>
          )}
        </aside>

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
              <button className="btn ghost sm icon" title="Notifications"><Icon name="bell" className="ico-sm" /></button>
              <button className="btn ghost sm icon" title="Paramètres"><Icon name="settings" className="ico-sm" /></button>
              <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />
              <button className="btn ghost sm" onClick={() => { setAuthed(false); localStorage.removeItem("samaAgent:auth"); }} title="Déconnexion">
                <Icon name="ext" className="ico-sm" />Déconnexion
              </button>
            </div>
          </header>

          <div className="content-body" style={{ padding: 0 }}>
            <Screen />
          </div>

          <footer className="statusbar">
            <span><span className="dot" />Connectée · SAMA</span>
            <span className="sep" />
            <span>agent · Naïma Cherif</span>
            <span className="sep" />
            <span>5 mandants</span>
            <span className="spacer" />
            <span>synchro il y a 4s</span>
          </footer>
        </main>
      </div>
    </ConvProvider>
  );
}

document.body.classList.remove("mount-pending");
ReactDOM.createRoot(document.getElementById("app")).render(<App />);
