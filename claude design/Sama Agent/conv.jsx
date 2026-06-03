// conv.jsx — conversation thread + modal (pièce maîtresse)
// Affiche l'historique unifié d'un prospect : WhatsApp, SMS, appels, emails
// avec accusés (distribué / lu), ouvertures email, clics sur lien, réponses.
const { useState, useEffect, useRef, createContext, useContext, useCallback } = React;

/* ---- contexte global : ouvrir une conversation depuis n'importe où ---- */
const ConvContext = createContext(null);
function useConv() { return useContext(ConvContext); }

function ConvProvider({ children }) {
  const [pid, setPid] = useState(null);
  const openConv = useCallback(id => setPid(id), []);
  const closeConv = useCallback(() => setPid(null), []);

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") setPid(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const p = pid ? window.prospect(pid) : null;
  return (
    <ConvContext.Provider value={{ openConv, closeConv, openPid: pid }}>
      {children}
      {p && <ConvModal prospect={p} onClose={closeConv} />}
    </ConvContext.Provider>
  );
}

/* ---- ticks WhatsApp (envoyé / distribué / lu) ---- */
function Ticks({ status }) {
  if (!status) return null;
  if (status === "sent") {
    return <span className="tick"><Icon name="check" className="ico-xs" /></span>;
  }
  const read = status === "read";
  return (
    <span className={`tick ${read ? "read" : ""}`} title={read ? "Lu" : "Distribué"}>
      <svg viewBox="0 0 24 18" width="14" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 9 6 14 14 4" />
        <polyline points="9 14 11 12" />
        <polyline points="13 14 23 4" />
      </svg>
      {read && <span style={{ fontWeight: 600 }}>Lu</span>}
    </span>
  );
}

/* ---- bulle de chat (WhatsApp / SMS) ---- */
function ChatBubble({ e }) {
  const chCls = e.t === "sms" ? "sms" : "wa";
  const chLb = e.t === "sms" ? "SMS" : "WhatsApp";
  const chIc = e.t === "sms" ? "inbox" : "whatsapp";
  return (
    <div className={`bub-row ${e.dir}`}>
      <div className="bubble">{e.text}</div>
      <div className="bub-meta">
        <span className={`bub-channel ${chCls}`}><Icon name={chIc} className="ico-xs" />{chLb}</span>
        <span>· {e.time}</span>
        {e.dir === "out" && <Ticks status={e.status} />}
      </div>
    </div>
  );
}

/* ---- carte email avec signaux (ouvert / cliqué / répondu) ---- */
function EmailCard({ e }) {
  return (
    <div className="conv-email">
      <div className="e-top">
        <Icon name="mail" className="ico-sm" />
        {e.dir === "out" ? "Email envoyé" : "Email reçu"}
        <span className="h">{e.time}</span>
      </div>
      <div className="e-subj">{e.subject}</div>
      {e.preview && <div className="e-prev">{e.preview}</div>}
      <div className="e-signals">
        {e.opens > 0
          ? <span className="sig open"><Icon name="eye" className="ico-xs" />Ouvert ×{e.opens}</span>
          : <span className="sig none"><Icon name="eye" className="ico-xs" />Pas encore ouvert</span>}
        {e.clicked && <span className="sig click"><Icon name="link" className="ico-xs" />Lien cliqué{e.link ? ` · ${e.link}` : ""}</span>}
        {e.replied && <span className="sig reply"><Icon name="arrowRight" className="ico-xs" />A répondu</span>}
        {!e.clicked && e.opens > 0 && <span className="sig none">Pas de clic</span>}
      </div>
    </div>
  );
}

/* ---- ligne d'appel ---- */
function CallRow({ e }) {
  const label = e.outcome === "answered" ? "Appel répondu" : e.outcome === "missed" ? "Appel — pas de réponse" : "Appel → messagerie";
  const ic = e.outcome === "missed" ? "phone" : e.outcome === "voicemail" ? "phone" : "phone";
  return (
    <div className="conv-call" data-o={e.outcome}>
      <span className="cc-ic"><Icon name={ic} className="ico-xs" /></span>
      <span>
        <span className="cc-main">{label}</span>
        {e.dur && <span className="cc-note"> · {e.dur}</span>}
        {e.note && <span className="cc-note"> · {e.note}</span>}
      </span>
      <span className="cc-h">{e.time}</span>
    </div>
  );
}

function EventRow({ e }) {
  return (
    <div className="conv-event">
      <Icon name={e.icon || "info"} className="ev-ic ico-sm" />
      <span>{e.label}</span>
      {e.h && <span className="ev-h">{e.h}</span>}
    </div>
  );
}

/* ---- le fil complet, groupé par jour ---- */
function ConversationThread({ entries }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [entries.length]);

  let lastDay = null;
  return (
    <div className="conv-thread">
      {entries.map((e, i) => {
        const showDay = e.day && e.day !== lastDay;
        if (e.day) lastDay = e.day;
        return (
          <React.Fragment key={i}>
            {showDay && <div className="conv-day">{e.day}</div>}
            {e.t === "wa" || e.t === "sms" ? <ChatBubble e={e} />
              : e.t === "email" ? <EmailCard e={e} />
              : e.t === "call" ? <CallRow e={e} />
              : <EventRow e={e} />}
          </React.Fragment>
        );
      })}
      <div ref={endRef} style={{ height: 1 }} />
    </div>
  );
}

/* ---- composer (multi-canal) ---- */
function Composer({ onSend, compact = false }) {
  const [ch, setCh] = useState("wa");
  const [txt, setTxt] = useState("");
  const channels = [
    { id: "wa", lb: "WhatsApp", ic: "whatsapp" },
    { id: "email", lb: "Email", ic: "mail" },
    { id: "sms", lb: "SMS", ic: "inbox" },
  ];
  const send = () => {
    const v = txt.trim();
    if (!v) return;
    onSend?.(ch, v);
    setTxt("");
  };
  return (
    <>
      <div className="composer-tabs">
        {channels.map(c => (
          <button key={c.id} className="composer-tab" aria-selected={ch === c.id} onClick={() => setCh(c.id)}>
            <Icon name={c.ic} className="ico-sm" />{c.lb}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="composer-tab"><Icon name="doc" className="ico-sm" />Modèle</button>
      </div>
      <div className="composer-input">
        <textarea
          rows={1}
          placeholder={ch === "email" ? "Rédiger un email…" : ch === "sms" ? "Écrire un SMS…" : "Écrire un message WhatsApp…"}
          value={txt}
          onChange={e => setTxt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="composer-send" onClick={send}><Icon name="send" className="ico-sm" /></button>
      </div>
    </>
  );
}

/* ---- la modal complète ---- */
function ConvModal({ prospect, onClose }) {
  const m = window.mandant(prospect.mandant);
  const st = window.stage(prospect.status);
  const [entries, setEntries] = useState(prospect.thread);

  // réinitialiser quand on change de prospect
  useEffect(() => { setEntries(prospect.thread); }, [prospect.id]);

  const handleSend = (ch, text) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (ch === "email") {
      setEntries(es => [...es, { day: "Aujourd'hui", t: "email", dir: "out", time, subject: text.slice(0, 48), preview: text, opens: 0, clicked: false }]);
      return;
    }
    const idx = entries.length;
    setEntries(es => [...es, { day: "Aujourd'hui", t: ch, dir: "out", time, text, status: "sent" }]);
    // simulation accusés
    setTimeout(() => setEntries(es => es.map((e, i) => i === idx ? { ...e, status: "delivered" } : e)), 900);
    setTimeout(() => setEntries(es => es.map((e, i) => i === idx ? { ...e, status: "read" } : e)), 2400);
  };

  return (
    <div className="conv-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="conv-modal" role="dialog" aria-modal="true">
        {/* header */}
        <div className="conv-hd">
          <div className="av-lg" style={{ background: window.prospectColor(prospect) }}>{window.initialsOf(prospect)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="nm">
              {prospect.first} {prospect.last}
              {prospect.hot && <Pill kind="accent"><Icon name="flame" className="ico-xs" />chaud</Pill>}
            </div>
            <div className="sb">
              <span className="it"><Icon name="briefcase" className="ico-xs" />{prospect.role} · {prospect.org}</span>
              <span className="it"><Icon name="mappin" className="ico-xs" />{prospect.city}</span>
              <span className="it" style={{ color: m.color, fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: m.color, display: "inline-block" }} />{m.name}</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn outline sm icon" title="Appeler"><Icon name="phone" className="ico-sm" /></button>
            <button className="btn outline sm icon" title="WhatsApp"><Icon name="whatsapp" className="ico-sm" /></button>
            <button className="btn outline sm icon" title="Email"><Icon name="mail" className="ico-sm" /></button>
            <button className="conv-close" onClick={onClose} title="Fermer (Échap)"><Icon name="x" className="ico-sm" /></button>
          </div>
        </div>

        {/* thread */}
        <ConversationThread entries={entries} />

        {/* composer */}
        <div className="conv-composer">
          <Composer onSend={handleSend} />
        </div>

        {/* right rail */}
        <aside className="conv-side">
          <div className="blk">
            <h4>Statut du lead</h4>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.color }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{st.name}</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>score {prospect.score}</span>
            </div>
            <div className="cs-row"><span className="k">Dernier contact</span><span className="v">{prospect.last_touch}</span></div>
            <div className="cs-row"><span className="k">Téléphone</span><span className="v">{prospect.phone}</span></div>
            <div className="cs-row"><span className="k">Type</span><span className="v" style={{ fontFamily: "var(--font-ui)", fontWeight: 400 }}>{prospect.kind}</span></div>
          </div>

          {prospect.rdv && (
            <div className="blk">
              <h4>RDV pris</h4>
              <div className="conv-rdv-card">
                <div className="lb">Transmis à {m.name}</div>
                <div className="vl">{prospect.rdv.when}</div>
                <div className="mt">{prospect.rdv.where}</div>
              </div>
            </div>
          )}

          <div className="blk">
            <h4>Conclure l'échange</h4>
            <div className="outcome-grid">
              <button className="conv-out rdv"><Icon name="calendar" className="ico-sm" />RDV pris</button>
              <button className="conv-out ok"><Icon name="check" className="ico-sm" />Intéressé</button>
              <button className="conv-out warn"><Icon name="clock" className="ico-sm" />Rappeler</button>
              <button className="conv-out danger"><Icon name="x" className="ico-sm" />Pas intéressé</button>
            </div>
          </div>

          <div className="blk" style={{ flex: 1 }}>
            <h4>À garder en tête</h4>
            <div className="conv-note">{prospect.note}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { ConvProvider, useConv, ConversationThread, Composer });
