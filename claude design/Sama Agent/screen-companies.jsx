// screen-companies.jsx — Entreprises prospectées
function ScreenCompanies() {
  const { openConv } = window.useConv();
  // organisations = prospects avec une vraie entreprise (hors particuliers)
  const orgsMap = {};
  window.PROSPECTS.forEach(p => {
    if (p.org === "Particulier") return;
    (orgsMap[p.org] = orgsMap[p.org] || { name: p.org, kind: p.kind, city: p.city, mandant: p.mandant, people: [] }).people.push(p);
  });
  const orgs = Object.values(orgsMap);
  const [sel, setSel] = React.useState(orgs[0].name);
  const o = orgs.find(x => x.name === sel);
  const m = window.mandant(o.mandant);

  const colorOf = (name) => `oklch(60% 0.08 ${(name.charCodeAt(0) * 137 + name.length * 23) % 360})`;
  const orgInitials = (name) => name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const statusPill = p => {
    const st = window.stage(p.status);
    const k = p.status === "rdv" || p.status === "transmis" ? "magic" : p.status === "interesse" ? "warn" : p.status === "perdu" ? "danger" : p.status === "conv" ? "accent" : "info";
    return <Pill kind={k} dot>{st.name}</Pill>;
  };

  return (
    <div className="split-page">
      <aside className="split-list">
        <div className="split-list-hd">
          <h2>Entreprises</h2>
          <div className="subline">{orgs.length} comptes prospectés · {window.MANDANTS.length} mandants</div>
        </div>
        <div className="split-list-tools">
          <div className="search-wrap">
            <Icon name="search" className="ico-sm" />
            <input placeholder="Rechercher une entreprise…" />
          </div>
          <button className="btn ghost sm icon"><Icon name="filter" className="ico-sm" /></button>
        </div>
        <div className="split-list-rows">
          {orgs.map(c => {
            const cm = window.mandant(c.mandant);
            return (
              <div key={c.name} className="split-list-row" aria-selected={c.name === sel} onClick={() => setSel(c.name)}>
                <div className="av sq" style={{ background: colorOf(c.name) }}>{orgInitials(c.name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{c.name}</div>
                  <div className="sb">{c.kind} · {c.city}</div>
                </div>
                <div className="meta"><span style={{ color: cm.color }}>●</span></div>
              </div>
            );
          })}
        </div>
      </aside>

      <main className="split-detail">
        <div className="detail-hd">
          <div className="av-lg" style={{ background: colorOf(o.name) }}>{orgInitials(o.name)}</div>
          <div>
            <h1>{o.name}</h1>
            <div className="ctx">
              <span className="it"><Icon name="briefcase" className="ico-sm" />{o.kind}</span>
              <span className="it"><Icon name="mappin" className="ico-sm" />{o.city}</span>
              <span className="it" style={{ color: m.color, fontWeight: 600 }}><Icon name="target" className="ico-sm" />{m.name}</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Ajouter contact</button>
            <button className="btn outline sm icon"><Icon name="moreV" className="ico-sm" /></button>
          </div>
        </div>

        <div className="bento">
          {/* fiche */}
          <div className="c span-4">
            <div className="c-hd"><h4>Compte</h4></div>
            <div className="c-bd">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 46, letterSpacing: "-.015em", lineHeight: 1, color: m.color }}>{o.people.length}</span>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>contact{o.people.length > 1 ? "s" : ""}</span>
              </div>
              <div className="kv-list">
                <RowKV k="Secteur" v={o.kind} />
                <RowKV k="Ville" v={o.city} />
                <RowKV k="Mandant CVC" v={m.name} strong />
                <RowKV k="Offre visée" v={m.focus} />
                <RowKV k="Prime / RDV" v={`${m.prime} €`} mono />
              </div>
            </div>
          </div>

          {/* contacts */}
          <div className="c span-8">
            <div className="c-hd"><h4>Contacts & statut</h4>
              <Pill style={{ marginLeft: "auto" }}>{o.people.length}</Pill>
            </div>
            <div className="c-bd flush">
              {o.people.map((p, i) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto auto", gap: 11, alignItems: "center", padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : 0, cursor: "default" }} onClick={() => openConv(p.id)}>
                  <Avatar initials={window.initialsOf(p)} color={window.prospectColor(p)} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-.005em" }}>{p.first} {p.last}{p.hot && <Icon name="flame" className="ico-xs" style={{ marginLeft: 5, color: "var(--accent)" }} />}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.role} · {p.phone}</div>
                  </div>
                  {statusPill(p)}
                  <button className="btn xs ghost icon"><Icon name="chevright" className="ico-sm" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* activité compte */}
          <div className="c span-12">
            <div className="c-hd"><h4>Activité récente</h4></div>
            <div className="c-bd flush">
              <div className="timeline-feed">
                {o.people.flatMap(p => p.thread.slice(-2).map(e => ({ ...e, who: `${p.first} ${p.last}` }))).slice(0, 6).map((e, i) => {
                  const ic = e.t === "wa" ? "whatsapp" : e.t === "sms" ? "inbox" : e.t === "email" ? "mail" : e.t === "call" ? "phone" : e.icon || "info";
                  const cls = e.t === "email" ? "email" : e.t === "call" ? "call" : e.t === "event" ? "deal" : "note";
                  const txt = e.t === "email" ? e.subject : e.t === "call" ? (e.outcome === "answered" ? "Appel répondu" : e.outcome === "missed" ? "Appel sans réponse" : "Appel → messagerie") : e.t === "event" ? e.label : (e.dir === "out" ? "Vous : " : "") + e.text;
                  return (
                    <div className="tlf-row" key={i}>
                      <div className={`ic-w ${cls}`}><Icon name={ic} className="ico-sm" /></div>
                      <div className="ti"><span className="e">{e.who}</span> · {txt} <span className="h">{e.time || e.day}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function RowKV({ k, v, mono = false, strong = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 12.5 }}>
      <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{k}</span>
      <span style={{ color: "var(--text)", fontFamily: mono ? "var(--font-mono)" : "inherit", fontWeight: strong ? 600 : 500, fontSize: strong ? 14 : 12.5 }}>{v}</span>
    </div>
  );
}

window.ScreenCompanies = ScreenCompanies;
