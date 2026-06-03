// screen-contacts.jsx — répertoire des prospects
function ScreenContacts() {
  const { openConv } = window.useConv();
  const prospects = window.PROSPECTS;
  const [sel, setSel] = React.useState(prospects[0].id);
  const p = prospects.find(c => c.id === sel);
  const m = window.mandant(p.mandant);
  const st = window.stage(p.status);

  const grouped = prospects.reduce((acc, c) => {
    const L = c.last[0].toUpperCase();
    (acc[L] = acc[L] || []).push(c);
    return acc;
  }, {});
  const letters = Object.keys(grouped).sort();

  // 3 derniers évènements pour aperçu
  const recent = [...p.thread].slice(-4).reverse();

  return (
    <div className="split-page">
      <aside className="split-list">
        <div className="split-list-hd">
          <h2>Contacts</h2>
          <div className="subline">{prospects.length} prospects · 5 mandants CVC</div>
        </div>
        <div className="split-list-tools">
          <div className="search-wrap">
            <Icon name="search" className="ico-sm" />
            <input placeholder="Rechercher un prospect…" />
          </div>
          <button className="btn ghost sm icon"><Icon name="filter" className="ico-sm" /></button>
        </div>
        <div className="split-list-rows">
          {letters.map(L => (
            <React.Fragment key={L}>
              <div className="split-list-letter">{L}</div>
              {grouped[L].map(c => {
                const cm = window.mandant(c.mandant);
                return (
                  <div key={c.id} className="split-list-row" aria-selected={c.id === sel} onClick={() => setSel(c.id)}>
                    <Avatar initials={window.initialsOf(c)} color={window.prospectColor(c)} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div className="nm">
                        {c.first} {c.last}
                        {c.hot && <Icon name="flame" className="ico-xs" style={{ marginLeft: 6, color: "var(--accent)" }} />}
                      </div>
                      <div className="sb"><span style={{ color: cm.color }}>●</span> {c.org} · {c.city}</div>
                    </div>
                    <div className="meta">{c.last_touch}</div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </aside>

      <main className="split-detail">
        <div className="detail-hd">
          <div className="av-lg round" style={{ background: window.prospectColor(p) }}>{window.initialsOf(p)}</div>
          <div>
            <h1>
              {p.first} {p.last}
              {p.hot && <Pill kind="accent" lg style={{ marginLeft: 12, verticalAlign: 6 }}><Icon name="flame" className="ico-xs" />chaud</Pill>}
            </h1>
            <div className="ctx">
              <span className="it"><Icon name="briefcase" className="ico-sm" />{p.role}</span>
              <span className="it"><Icon name="building" className="ico-sm" />{p.org}</span>
              <span className="it"><Icon name="mappin" className="ico-sm" />{p.city}</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn accent sm" onClick={() => openConv(p.id)}><Icon name="inbox" className="ico-sm" />Conversation</button>
            <button className="btn outline sm icon"><Icon name="phone" className="ico-sm" /></button>
            <button className="btn outline sm icon"><Icon name="whatsapp" className="ico-sm" /></button>
          </div>
        </div>

        <div className="bento">
          {/* identité */}
          <div className="c span-4">
            <div className="c-hd"><h4>Identité</h4></div>
            <div className="c-bd">
              <div className="kv-list">
                <div className="kv"><div className="k">Téléphone</div><div className="v mono">{p.phone}</div></div>
                <div className="kv"><div className="k">Email</div><div className="v mono">{p.email}</div></div>
                <div className="kv"><div className="k">Ville</div><div className="v">{p.city}</div></div>
                <div className="kv"><div className="k">Type</div><div className="v">{p.kind}</div></div>
                <div className="kv"><div className="k">Statut</div><div className="v"><Pill kind={p.status === "rdv" || p.status === "transmis" ? "magic" : p.status === "interesse" ? "warn" : p.status === "perdu" ? "danger" : "info"} dot>{st.name}</Pill></div></div>
              </div>
            </div>
          </div>

          {/* mandant */}
          <div className="c span-4">
            <div className="c-hd"><h4>Mandant CVC</h4></div>
            <div className="c-bd">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ width: 38, height: 38, borderRadius: 9, background: m.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{m.name[0]}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em" }}>{m.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{m.focus}</div>
                </div>
              </div>
              <div className="kv-list">
                <div className="kv"><div className="k">Zone</div><div className="v">{m.zone}</div></div>
                <div className="kv"><div className="k">Prime / RDV</div><div className="v mono" style={{ color: "var(--ok)" }}>{m.prime} €</div></div>
              </div>
              {p.rdv && (
                <div style={{ marginTop: 12, background: "var(--magic-tint)", borderRadius: 8, padding: "9px 11px" }}>
                  <div style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--magic)" }}>RDV transmis</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{p.rdv.when}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.rdv.where}</div>
                </div>
              )}
            </div>
          </div>

          {/* score */}
          <div className="c span-4">
            <div className="c-hd"><h4>Score d'engagement</h4></div>
            <div className="c-bd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, letterSpacing: "-.01em", lineHeight: 1 }}>
                {p.score}<span style={{ fontFamily: "var(--font-ui)", fontSize: 16, color: "var(--text-3)" }}> /100</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <ScoreBar lb="Réactivité" v={Math.min(100, p.score + 6)} />
                <ScoreBar lb="Ouvertures" v={Math.max(20, p.score - 8)} />
                <ScoreBar lb="Récence" v={Math.min(100, p.score + 12)} />
              </div>
            </div>
          </div>

          {/* aperçu conversation */}
          <div className="c span-7">
            <div className="c-hd"><h4>Derniers échanges</h4>
              <button className="btn xs ghost" style={{ marginLeft: "auto" }} onClick={() => openConv(p.id)}>Ouvrir la conversation<Icon name="arrowRight" className="ico-xs" /></button>
            </div>
            <div className="c-bd flush">
              <div className="timeline-feed">
                {recent.map((e, i) => {
                  const ic = e.t === "wa" ? "whatsapp" : e.t === "sms" ? "inbox" : e.t === "email" ? "mail" : e.t === "call" ? "phone" : e.icon || "info";
                  const cls = e.t === "email" ? "email" : e.t === "call" ? "call" : e.t === "wa" || e.t === "sms" ? "note" : "deal";
                  const txt = e.t === "email" ? e.subject : e.t === "call" ? (e.outcome === "answered" ? "Appel répondu" : e.outcome === "missed" ? "Appel sans réponse" : "Appel → messagerie") : e.t === "event" ? e.label : (e.dir === "out" ? "Vous : " : "") + e.text;
                  return (
                    <div className="tlf-row" key={i}>
                      <div className={`ic-w ${cls}`}><Icon name={ic} className="ico-sm" /></div>
                      <div className="ti">
                        <span className="e">{e.t === "email" ? "Email" : e.t === "call" ? "Appel" : e.t === "wa" ? "WhatsApp" : e.t === "sms" ? "SMS" : "Évènement"}</span>
                        <span className="h">{e.time || ""}</span>
                        <div className="det">{txt}</div>
                        {e.t === "email" && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            {e.opens > 0 && <span className="sig open"><Icon name="eye" className="ico-xs" />Ouvert ×{e.opens}</span>}
                            {e.clicked && <span className="sig click"><Icon name="link" className="ico-xs" />Cliqué</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* note */}
          <div className="c span-5">
            <div className="c-hd"><h4>À garder en tête</h4></div>
            <div className="c-bd" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)", borderRadius: "0 8px 8px 0", padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-2)" }}>
                {p.note}
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>Source & suivi</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Pill kind="info">{m.name}</Pill>
                  <Pill>{p.city}</Pill>
                  <Pill kind={p.hot ? "accent" : ""}>{p.hot ? "prioritaire" : "standard"}</Pill>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>Agent</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar initials="NC" color="#E2552B" size={24} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>Naïma Cherif</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>Agent freelance · SAMA</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ScoreBar({ lb, v }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 28px", gap: 8, alignItems: "center", fontSize: 11.5 }}>
      <span style={{ color: "var(--text-3)" }}>{lb}</span>
      <span style={{ height: 4, background: "var(--bg-3)", borderRadius: 999, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${v}%`, background: "var(--accent)" }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

window.ScreenContacts = ScreenContacts;
