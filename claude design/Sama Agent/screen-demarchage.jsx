// screen-demarchage.jsx — cockpit de démarchage (file focus + conversation inline)
function ScreenDemarchage() {
  const { openConv } = window.useConv();
  const tasks = window.TODAY_TASKS;
  const [sel, setSel] = React.useState(tasks.find(t => t.state === "now")?.pid || tasks[0].pid);

  const tabs = [
    { id: "today", l: "Aujourd'hui", n: tasks.length },
    { id: "over",  l: "Retard",      n: 1 },
    { id: "week",  l: "Cette sem.",  n: 34 },
    { id: "skip",  l: "Reportés",    n: 3 },
  ];

  const p = window.prospect(sel);
  const m = window.mandant(p.mandant);
  const st = window.stage(p.status);
  const chIc = ch => ch === "wa" ? "whatsapp" : ch === "call" ? "phone" : ch === "email" ? "mail" : "linkedin";

  // composer local : ajoute à la conversation affichée
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

  return (
    <div className="pros-3col">
      {/* LEFT — file d'actions */}
      <aside className="pros-left">
        <div className="pros-tabs-bar">
          {tabs.map((t, i) => (
            <button key={t.id} className="pros-tab" aria-selected={i === 0}>
              {t.l}<span className="nb">{t.n}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, alignItems: "center" }}>
          <Icon name="zap" className="ico-sm" style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1, fontSize: 11.5, color: "var(--text-2)" }}>Mode <strong>Focus</strong> — file traitée 1 par 1</div>
          <button className="btn xs ghost icon"><Icon name="settings" className="ico-sm" /></button>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {tasks.map(t => {
            const tp = window.prospect(t.pid);
            const tm = window.mandant(tp.mandant);
            return (
              <div key={t.id} className="pros-q-row" data-k={t.ch} data-overdue={t.state === "done" ? false : undefined}
                aria-selected={t.pid === sel} onClick={() => setSel(t.pid)}>
                <div className="av" style={{ background: window.prospectColor(tp), color: "white", border: 0 }}>{window.initialsOf(tp)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{tp.first} {tp.last}{t.state === "done" && <Icon name="check" className="ico-xs" style={{ marginLeft: 5, color: "var(--ok)" }} />}</div>
                  <div className="sb"><span style={{ color: tm.color }}>●</span> {tm.name} · {tp.city}</div>
                </div>
                <div>
                  <div className="kind"><Icon name={chIc(t.ch)} className="ico-sm" /></div>
                  <div className="tm">{t.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* CENTER — conversation inline */}
      <main className="dem-center">
        <div className="dem-hd">
          <div className="av-lg" style={{ background: window.prospectColor(p) }}>{window.initialsOf(p)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nm">
              {p.first} {p.last}
              {p.hot && <Pill kind="accent"><Icon name="flame" className="ico-xs" />chaud</Pill>}
              <span style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-3)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />{st.name}
              </span>
            </div>
            <div className="sb">{p.role} · {p.org} · <span style={{ color: m.color, fontWeight: 600 }}>{m.name}</span></div>
          </div>
          <div className="actions">
            <button className="btn outline sm"><Icon name="phone" className="ico-sm" />Appeler</button>
            <button className="btn outline sm icon"><Icon name="whatsapp" className="ico-sm" /></button>
            <button className="btn outline sm" onClick={() => openConv(sel)}><Icon name="ext" className="ico-sm" />Fiche</button>
          </div>
        </div>

        <ConversationThread entries={entries} />

        <div className="dem-foot">
          <Composer onSend={handleSend} />
          <div className="dem-outcome">
            <button className="conv-out rdv"><Icon name="calendar" className="ico-sm" />RDV pris</button>
            <button className="conv-out ok"><Icon name="check" className="ico-sm" />Intéressé</button>
            <button className="conv-out warn"><Icon name="clock" className="ico-sm" />Rappeler</button>
            <button className="conv-out danger"><Icon name="x" className="ico-sm" />Pas intéressé</button>
            <span style={{ width: 1, height: 28, background: "var(--border)" }} />
            <button className="btn primary sm"><Icon name="arrowRight" className="ico-sm" />Suivant</button>
          </div>
        </div>
      </main>

      {/* RIGHT — argumentaire mandant */}
      <aside className="pros-right">
        <div className="blk" style={{ background: "var(--surface-2)" }}>
          <h4>Mandant — {m.name}</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
            <RowKV2 k="Offre" v={m.focus} />
            <RowKV2 k="Zone" v={m.zone} />
            <RowKV2 k="Prime / RDV" v={<span style={{ fontFamily: "var(--font-mono)", color: "var(--ok)" }}>{m.prime} €</span>} />
          </div>
        </div>

        <div className="blk">
          <h4>Accroche conseillée</h4>
          <div style={{ background: "var(--surface-2)", borderLeft: "3px solid var(--manual)", borderRadius: "0 8px 8px 0", padding: "10px 12px", fontSize: 12.5, lineHeight: 1.55, color: "var(--text)" }}>
            « Bonjour <span style={{ background: "var(--accent-tint)", color: "var(--accent-2)", padding: "1px 5px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{p.first}</span>, Naïma de SAMA pour {m.name}. Vous étudiez {m.focus.toLowerCase()} ? J'aide à organiser un RDV technique gratuit, sans engagement. »
          </div>
        </div>

        <div className="blk">
          <h4>Objections fréquentes</h4>
          <div className="obj" style={{ gridTemplateColumns: "1fr" }}>
            <div className="ob">
              <div className="ttl">« C'est trop cher »</div>
              <div className="ans">Le RDV est gratuit et chiffré. On regarde les aides 2026 avant de parler budget.</div>
            </div>
            <div className="ob">
              <div className="ttl">« Pas le temps »</div>
              <div className="ans">15 min en visio suffisent. Je cale selon vos dispos, même en soirée.</div>
            </div>
          </div>
        </div>

        <div className="blk">
          <h4>Signaux récents</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11.5 }}>
            <SignalMini ic="eye" tint="info" txt={<>Score d'engagement <strong>{p.score}/100</strong></>} sub={`statut · ${st.name}`} />
            <SignalMini ic="clock" tint="manual" txt={<>Dernier contact</>} sub={p.last_touch} />
            <SignalMini ic="note" tint="magic" txt="Note" sub={p.note} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function RowKV2({ k, v }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 12 }}>
      <span style={{ color: "var(--text-3)" }}>{k}</span>
      <span style={{ color: "var(--text)", fontWeight: 500, textAlign: "right" }}>{v}</span>
    </div>
  );
}

function SignalMini({ ic, tint, txt, sub }) {
  const tints = { info: ["var(--info-tint)", "var(--info)"], manual: ["var(--manual-tint)", "var(--manual)"], magic: ["var(--magic-tint)", "var(--magic)"], ok: ["var(--ok-tint)", "var(--ok)"] };
  const [bg, fg] = tints[tint] || tints.info;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8 }}>
      <span style={{ width: 22, height: 22, borderRadius: 5, background: bg, color: fg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={ic} className="ico-xs" />
      </span>
      <div>
        <div style={{ color: "var(--text)" }}>{txt}</div>
        <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 1, lineHeight: 1.4 }}>{sub}</div>
      </div>
    </div>
  );
}

window.ScreenDemarchage = ScreenDemarchage;
