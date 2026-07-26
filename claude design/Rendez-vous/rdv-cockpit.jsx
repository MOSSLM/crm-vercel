// rdv-cockpit.jsx — Cockpit téléphonie : proposer un RDV pendant l'appel (3 présentations)
function useRdvState() {
  const [mode, setMode] = React.useState("book");
  const [tid, setTid] = React.useState("et2");
  const [di, setDi] = React.useState(0);
  const [slot, setSlot] = React.useState(null);
  const [who, setWho] = React.useState("me");
  const [sent, setSent] = React.useState(false);
  const d = RV_AGENT_DAYS[di];
  return { mode, setMode, tid, setTid, di, setDi, slot, setSlot, who, setWho, sent, setSent, d, t: rvType(tid) };
}

function TypeSelect({ tid, setTid }) {
  return (
    <select className="rv-in" value={tid} onChange={e => setTid(e.target.value)}>
      {RV_TYPES.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.title} · {fmtDur(t.dur)}</option>)}
    </select>
  );
}

function DayPills({ s, cols }) {
  return (
    <div className="rv-days">
      {RV_AGENT_DAYS.map((d, i) => (
        <button key={d.n} className={`rv-dpill ${s.di === i ? "on" : ""} ${d.free === 0 ? "full" : ""}`.trim()} onClick={() => { s.setDi(i); s.setSlot(null); }}>
          <span className="dl">{d.lb}</span><span className="dn">{d.n}</span><span className="n">{d.free} libres</span>
        </button>
      ))}
    </div>
  );
}

function SlotGrid({ s, cols = 3 }) {
  return (
    <div className="rv-slotgrid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
      {s.d.slots.map(([h, free]) => (
        <button key={h} className={`rv-sc ${s.slot === h ? "on" : ""} ${free ? "" : "busy"}`.trim()} onClick={() => free && s.setSlot(h)} disabled={!free}>{h}</button>
      ))}
    </div>
  );
}

function Attribution({ s, compact }) {
  const opts = [{ id: "me", host: "u2", n: "Sofia Kadri", r: "moi · je fais le RDV" }, { id: "closer", host: "u5", n: "Hugo Ferrand", r: "mon closer · RDV délégué" }];
  return (
    <div className="rv-attr">
      {opts.map(o => (
        <button key={o.id} className={`rv-attr-row ${s.who === o.id ? "on" : ""}`.trim()} onClick={() => s.setWho(o.id)} style={{ textAlign: "left", font: "inherit" }}>
          <Av id={o.host} size={26} />
          <div><div className="n">{o.n}</div><div className="r">{o.r}</div></div>
          {s.who === o.id ? <Icon name="check" className="ico-sm" style={{ color: "var(--accent-2)" }} /> : <span />}
        </button>
      ))}
      {!compact && <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", gap: 6, marginTop: 2, lineHeight: 1.45 }}><Icon name="info" className="ico-xs" style={{ marginTop: 2, flexShrink: 0 }} />Un RDV se garde ou se délègue à son closer — jamais à un autre agent.</div>}
    </div>
  );
}

function ConfirmBlk({ s, wide }) {
  const p = RV_PROSPECT;
  if (!s.slot) return (
    <div className="rv-confirm" style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px dashed var(--border-2)" }}>
      <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>Choisissez un créneau : les heures affichées sont les vraies disponibilités de {s.who === "me" ? "Sofia" : "Hugo"}, occupé Google inclus.</div>
    </div>
  );
  return (
    <div className="rv-confirm">
      <div className="rc"><Icon name="calCheck" className="ico-sm" style={{ color: "var(--accent)" }} /><b>{s.d.lb} {s.d.n} · {s.slot}–{addMin(s.slot, s.t.dur)}</b></div>
      <div className="sub">{s.t.title} · {RV_LOC[s.t.loc].lb} · avec {s.who === "me" ? "Sofia Kadri" : "Hugo Ferrand"}{s.who === "closer" ? " (délégué)" : ""}<br />Email de confirmation + invitation .ics à {p.mail} — rattaché à {p.opp}.</div>
      <button className="go" onClick={() => s.setSent(true)}>{s.sent ? <><Icon name="check" className="ico-sm" />Rendez-vous confirmé</> : <><Icon name="send" className="ico-sm" />Confirmer et envoyer l'invitation</>}</button>
    </div>
  );
}

function LinkMode({ s }) {
  return (
    <Stack gap={9}>
      <TypeSelect tid={s.tid} setTid={s.setTid} />
      <Field label="Email du prospect"><Row style={{ gap: 6 }}><input className="rv-in" defaultValue={RV_PROSPECT.mail} /><Btn kind="accent" ic="send">Envoyer</Btn></Row></Field>
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", wordBreak: "break-all", lineHeight: 1.5 }}>
        …/rdv/sofia/{rvType(s.tid).slug}?name=Karim+Belhadj&amp;email={RV_PROSPECT.mail}
      </div>
      <Row style={{ gap: 6 }}><Btn kind="outline" ic="copy" style={{ flex: 1, justifyContent: "center" }}>Copier le lien prérempli</Btn><Btn kind="outline" ic="phone">SMS</Btn></Row>
      <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>À utiliser quand le prospect veut « voir ça plus tard » : le lien est prérempli, il ne saisit que son créneau.</div>
    </Stack>
  );
}

/* Panneau latéral (option A) */
function RdvPanel({ s }) {
  return (
    <div className="rv-panel">
      <div className="ph">
        <span className="ic"><Icon name="calPlus" className="ico-sm" /></span>
        <div className="t">Proposer un RDV<div className="s">lié à {RV_PROSPECT.opp}</div></div>
      </div>
      <div className="pb">
        <Seg opts={[{ id: "book", lb: "Réserver", ic: "calPlus" }, { id: "link", lb: "Envoyer un lien", ic: "link" }]} val={s.mode} set={s.setMode} accent />
        {s.mode === "book" ? <>
          <TypeSelect tid={s.tid} setTid={s.setTid} />
          <DayPills s={s} />
          <SlotGrid s={s} />
          <Attribution s={s} compact />
          <ConfirmBlk s={s} />
        </> : <LinkMode s={s} />}
      </div>
    </div>
  );
}

/* Modale (option B) */
function RdvModalBig({ s, onClose }) {
  const p = RV_PROSPECT;
  return (
    <div className="rv-mod-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rv-mod">
        <aside className="side">
          <div className="tag">Pendant l'appel · 04:12</div>
          <h3>Caler le rendez-vous avant de raccrocher</h3>
          <div className="pr"><span className="av" style={{ background: p.c }}>{rvInit(p.first + " " + p.last)}</span><div><div className="n">{p.first} {p.last}</div><div className="o">{p.role} · {p.org}</div></div></div>
          <div className="kv">
            <div className="r"><Icon name="phone" className="ico-sm" />{p.tel}</div>
            <div className="r"><Icon name="mail" className="ico-sm" />{p.mail}</div>
            <div className="r"><Icon name="mappin" className="ico-sm" />{p.city}</div>
            <div className="r"><Icon name="pipeline" className="ico-sm" />{p.opp} · {p.offer}</div>
          </div>
          <div className="ft">Le créneau est bloqué à la seconde où vous confirmez — double réservation impossible, même si le prospect ouvre le lien en parallèle.</div>
        </aside>
        <div className="main">
          <div className="h"><span className="t">Créneaux réellement disponibles</span><Seg opts={[{ id: "book", lb: "Réserver" }, { id: "link", lb: "Lien" }]} val={s.mode} set={s.setMode} accent /><Btn kind="ghost" size="sm" ic="x" onClick={onClose} /></div>
          {s.mode === "book" ? <>
            <TypeSelect tid={s.tid} setTid={s.setTid} />
            <DayPills s={s} />
            <SlotGrid s={s} cols={6} />
            <div className="rv-grid2" style={{ alignItems: "start" }}>
              <Field label="Qui réalise le RDV ?"><Attribution s={s} /></Field>
              <Field label="Note transmise dans l'invitation"><textarea className="rv-in" rows={5} defaultValue={`Suite à notre appel — ${RV_PROSPECT.offer}. Objectif : refaire la présence Google et un site vitrine avant la rentrée.`} /></Field>
            </div>
            <ConfirmBlk s={s} wide />
          </> : <LinkMode s={s} />}
        </div>
      </div>
    </div>
  );
}

/* Bandeau bas (option C) */
function RdvDock({ s, onExpand }) {
  const flat = [];
  RV_AGENT_DAYS.forEach((d, i) => d.slots.filter(x => x[1]).slice(0, 3).forEach(x => flat.push({ d, i, h: x[0] })));
  return (
    <div className="rv-dockbar">
      <div>
        <div className="lb">Proposer un RDV</div>
        <div className="t">{rvType(s.tid).title} · {fmtDur(s.t.dur)}</div>
      </div>
      <div className="rail">
        {flat.map((f, i) => (
          <button key={i} className={`rs ${s.di === f.i && s.slot === f.h ? "on" : ""}`.trim()} onClick={() => { s.setDi(f.i); s.setSlot(f.h); }}>
            <span className="d">{f.d.lb} {f.d.n}</span><span className="h">{f.h}</span>
          </button>
        ))}
      </div>
      <Row style={{ gap: 7 }}>
        <button className="gb" onClick={onExpand} style={{ height: 30, padding: "0 11px", borderRadius: 7, border: "1px solid var(--on-ink-line)", background: "rgba(255,255,255,.06)", color: "var(--on-ink)", font: "inherit", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, cursor: "default" }}><Icon name="grid" className="ico-sm" />Tout voir</button>
        <button className="gb" disabled={!s.slot} style={{ height: 30, padding: "0 13px", borderRadius: 7, border: 0, background: s.slot ? "var(--accent)" : "rgba(255,255,255,.1)", color: s.slot ? "#fff" : "var(--on-ink-3)", font: "inherit", fontSize: 12.5, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6, cursor: "default" }}><Icon name="check" className="ico-sm" />{s.slot ? `Confirmer ${s.d.lb} ${s.slot}` : "Choisir un créneau"}</button>
      </Row>
    </div>
  );
}

const DISPO = [["RDV pris", "ok", "calCheck"], ["Rappel", "warn", "clock"], ["Pas intéressé", "danger", "ban"], ["Répondeur", "", "phone"]];

function ScreenCockpit() {
  const [opt, setOpt] = React.useState("side");
  const [modal, setModal] = React.useState(false);
  const s = useRdvState();
  const p = RV_PROSPECT;
  const bars = React.useMemo(() => Array.from({ length: 56 }, (_, i) => 18 + Math.abs(Math.sin(i * 1.4)) * 70), []);
  return (
    <>
      <div className="rv-optbar">
        <span className="lb">Présentation de la prise de RDV</span>
        <Seg opts={[{ id: "side", lb: "Panneau latéral", ic: "layout" }, { id: "modal", lb: "Modale", ic: "grid" }, { id: "dock", lb: "Bandeau bas", ic: "panelBottom" }]} val={opt} set={v => { setOpt(v); setModal(false); }} accent />
        <span className="d">{opt === "side" ? "Toujours visible, l'agent ne quitte jamais l'appel — recommandé." : opt === "modal" ? "Plus de créneaux d'un coup, mais masque le script pendant la saisie." : "Rapide pour un créneau évident, replié le reste du temps."}</span>
      </div>

      <div className={`rv-ck ${opt === "dock" ? "dock" : ""}`.trim()} style={{ position: "relative" }}>
        <main className="rv-ck-main" style={{ paddingBottom: opt === "dock" ? 76 : 0 }}>
          <div className="rv-ck-hd">
            <span className="av" style={{ background: p.c }}>{rvInit(p.first + " " + p.last)}</span>
            <div style={{ minWidth: 0, position: "relative" }}>
              <div className="nm">{p.first} {p.last}<Pill kind="accent"><Icon name="flame" className="ico-xs" />chaud</Pill></div>
              <div className="sb">{p.role} · {p.org} · {p.city}<span style={{ color: "var(--on-ink-3)" }}>·</span><span style={{ color: "#6ce6a8", fontWeight: 600 }}>En ligne</span></div>
            </div>
            <div className="tm">
              <div className="t"><span className="rec"><i />REC</span>04:12</div>
              <div className="v">via +33 1 84 80 22 41 · SIMULATION</div>
            </div>
          </div>

          <div className="rv-ck-body">
            <div className="rv-wave">{bars.map((h, i) => <i key={i} style={{ height: `${h}%`, opacity: i > 44 ? .3 : .85 }} />)}</div>
            <Row style={{ gap: 6 }}>
              <Btn kind="outline" ic="phone">Muet</Btn><Btn kind="outline" ic="clock">Attente</Btn><Btn kind="outline" ic="transfer">Transférer</Btn><Btn kind="outline" ic="note">Note</Btn>
              <span style={{ flex: 1 }} />
              {opt === "modal" && <Btn kind="accent" ic="calPlus" onClick={() => setModal(true)}>Proposer un RDV</Btn>}
              <Btn kind="danger-fill" ic="phoneOff">Raccrocher</Btn>
            </Row>

            <div className="rv-script">
              <div className="h"><Icon name="doc" className="ico-sm" style={{ color: "var(--text-3)" }} />Argumentaire<span className="v">v4 · étape 3/5 — la proposition</span><span style={{ flex: 1 }} /><Chip line ic="target">objection prix</Chip></div>
              <div className="b">Ce qu'on fait pour <span className="var">Belhadj Rénovation</span>, concrètement : on reprend la fiche Google, on met un site qui convertit les appels, et vous voyez les demandes arriver dans un tableau de bord. <b>Je vous montre ça 30 minutes en visio</b> — je vous propose <span className="var">jeudi 11 h 30</span> ou <span className="var">lundi 9 h</span>, qu'est-ce qui vous arrange ?</div>
            </div>

            <div>
              <span className="rv-lb">Issue de l'appel</span>
              <Row style={{ gap: 6, marginTop: 7 }}>
                {DISPO.map(([lb, kind, ic]) => <button key={lb} className={`btn ${kind === "ok" ? "ok" : "outline"} sm`} style={kind === "danger" ? { color: "var(--danger)" } : kind === "warn" ? { color: "var(--warn)" } : undefined}><Icon name={ic} className="ico-sm" />{lb}</button>)}
              </Row>
            </div>

            {opt === "dock" && (
              <Blk title="Contexte de l'accroche" ic="globe">
                <Row style={{ gap: 10 }}><Icon name="globe" className="ico-sm" style={{ color: "var(--info)" }} /><span style={{ fontSize: 12.5 }}>{p.web}</span><span style={{ flex: 1 }} /><Chip color="var(--accent)">{p.offer}</Chip></Row>
              </Blk>
            )}
          </div>
        </main>

        {opt !== "dock" && (
          <aside className="rv-ck-side">
            {opt === "side" ? <div className="blk" style={{ padding: 12 }}><RdvPanel s={s} /></div>
              : <div className="blk">
                <h4><Icon name="calPlus" className="ico-xs" />Rendez-vous</h4>
                <Btn kind="accent" size="" ic="calPlus" onClick={() => setModal(true)} style={{ width: "100%", justifyContent: "center" }}>Proposer un créneau</Btn>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8, lineHeight: 1.45 }}>Ouvre le sélecteur plein écran avec tous les créneaux de la semaine.</div>
              </div>}
            <div className="blk">
              <h4><Icon name="globe" className="ico-xs" />L'accroche · situation web</h4>
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, padding: "9px 11px", fontSize: 12, lineHeight: 1.5 }}>{p.web}</div>
              <Row style={{ marginTop: 9, gap: 9 }}><i style={{ width: 8, height: 8, borderRadius: 3, background: "var(--accent)" }} /><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.offer}</div><div style={{ fontSize: 11, color: "var(--text-3)" }}>1 490 € + 149 €/mois</div></div></Row>
            </div>
            <div className="blk">
              <h4><Icon name="clock" className="ico-xs" />Historique</h4>
              <Stack gap={8}>
                {[["phone", "Répondu · 3 min 12", "il y a 6 j", "ok"], ["phone", "Pas de réponse", "il y a 9 j", ""], ["mail", "Audit envoyé — ouvert 2×", "il y a 12 j", "info"]].map(([ic, t, w, tint], i) => (
                  <Row key={i} style={{ gap: 9 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: tint ? `var(--${tint}-tint)` : "var(--bg-2)", color: tint ? `var(--${tint})` : "var(--text-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={ic} className="ico-xs" /></span>
                    <span style={{ fontSize: 12, flex: 1 }}>{t}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-4)" }}>{w}</span>
                  </Row>
                ))}
              </Stack>
            </div>
            <div className="blk">
              <h4><Icon name="calCheck" className="ico-xs" />Mes RDV à venir</h4>
              <Stack gap={7}>
                {RV_BK.filter(b => b.host === "u2" && b.st !== "cancelled").slice(0, 3).map(b => (
                  <Row key={b.id} style={{ gap: 9 }}>
                    <div style={{ textAlign: "right", width: 46, flexShrink: 0 }}><div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>{b.day.split(" ").slice(0, 2).join(" ")}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>{b.h}</div></div>
                    <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--border)", paddingLeft: 9 }}><div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nm}</div><div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{rvType(b.et).title}</div></div>
                  </Row>
                ))}
              </Stack>
            </div>
          </aside>
        )}

        {opt === "dock" && <RdvDock s={s} onExpand={() => setModal(true)} />}
        {modal && <RdvModalBig s={s} onClose={() => setModal(false)} />}
      </div>
    </>
  );
}

Object.assign(window, { ScreenCockpit });
