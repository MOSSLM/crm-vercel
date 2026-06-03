// screen-messagerie.jsx — boîte de réception unifiée (toutes conversations)
function ScreenMessagerie() {
  const { openConv } = window.useConv();
  const order = window.INBOX_ORDER;
  const [sel, setSel] = React.useState(order[0]);
  const p = window.prospect(sel);
  const m = window.mandant(p.mandant);
  const st = window.stage(p.status);

  // dernier message de chaque conversation pour l'aperçu
  const lastOf = pr => {
    const msg = [...pr.thread].reverse().find(e => e.t === "wa" || e.t === "sms" || e.t === "email");
    if (!msg) return { ch: "call", txt: "Appel", dir: "out", unread: false };
    const txt = msg.t === "email" ? msg.subject : msg.text;
    const unread = msg.dir === "in"; // message entrant non traité
    return { ch: msg.t, txt: (msg.dir === "in" ? "" : "Vous : ") + txt, dir: msg.dir, unread, time: msg.time };
  };

  // composer
  const [entries, setEntries] = React.useState(p.thread);
  React.useEffect(() => { setEntries(p.thread); }, [sel]);
  const handleSend = (ch, text) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (ch === "email") { setEntries(es => [...es, { day: "Aujourd'hui", t: "email", dir: "out", time, subject: text.slice(0, 48), preview: text, opens: 0 }]); return; }
    const idx = entries.length;
    setEntries(es => [...es, { day: "Aujourd'hui", t: ch, dir: "out", time, text, status: "sent" }]);
    setTimeout(() => setEntries(es => es.map((e, i) => i === idx ? { ...e, status: "delivered" } : e)), 900);
    setTimeout(() => setEntries(es => es.map((e, i) => i === idx ? { ...e, status: "read" } : e)), 2400);
  };

  const unreadCount = order.filter(id => lastOf(window.prospect(id)).unread).length;

  return (
    <div className="msg-page">
      {/* LIST */}
      <aside className="msg-list">
        <div className="split-list-hd">
          <h2>Messagerie</h2>
          <div className="subline">{order.length} conversations · {unreadCount} à traiter</div>
        </div>
        <div className="split-list-tools">
          <div className="search-wrap">
            <Icon name="search" className="ico-sm" />
            <input placeholder="Rechercher une conversation…" />
          </div>
          <button className="btn ghost sm icon"><Icon name="filter" className="ico-sm" /></button>
        </div>
        <div className="split-list-rows">
          {order.map(id => {
            const pr = window.prospect(id);
            const mm = window.mandant(pr.mandant);
            const last = lastOf(pr);
            return (
              <div key={id} className="inbox-row" aria-selected={id === sel} onClick={() => setSel(id)}>
                <div className="av" style={{ background: window.prospectColor(pr) }}>{window.initialsOf(pr)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">
                    {pr.first} {pr.last}
                    {pr.hot && <Icon name="flame" className="ico-xs" style={{ color: "var(--accent)" }} />}
                  </div>
                  <div className="pv">{last.txt}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: mm.color }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-4)" }}>{mm.name}</span>
                  </div>
                </div>
                <div className="right">
                  <span className="tm">{last.time || ""}</span>
                  <span className={`ch-mini ${last.ch === "wa" ? "wa" : last.ch === "email" ? "email" : last.ch === "sms" ? "sms" : "call"}`}>
                    <Icon name={last.ch === "wa" ? "whatsapp" : last.ch === "email" ? "mail" : last.ch === "sms" ? "inbox" : "phone"} className="ico-xs" />
                  </span>
                  {last.unread && <span className="unread">1</span>}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* THREAD */}
      <main className="msg-thread-pane">
        <div className="msg-thread-hd">
          <div className="av" style={{ background: window.prospectColor(p) }}>{window.initialsOf(p)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nm">
              {p.first} {p.last}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.name}
              </span>
            </div>
            <div className="sb">{p.role} · {p.org} · {p.city} · <span style={{ color: m.color, fontWeight: 600 }}>{m.name}</span></div>
          </div>
          <div className="actions">
            <button className="btn outline sm icon"><Icon name="phone" className="ico-sm" /></button>
            <button className="btn outline sm icon"><Icon name="whatsapp" className="ico-sm" /></button>
            <button className="btn outline sm" onClick={() => openConv(sel)}><Icon name="ext" className="ico-sm" />Fiche complète</button>
          </div>
        </div>

        <ConversationThread entries={entries} />

        <div className="msg-composer">
          <Composer onSend={handleSend} />
        </div>
      </main>
    </div>
  );
}

window.ScreenMessagerie = ScreenMessagerie;
