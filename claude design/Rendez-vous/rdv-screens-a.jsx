// rdv-screens-a.jsx — Aperçu + Réservations
function BkRow({ b, sel, onSel, compact }) {
  const t = rvType(b.et), h = rvHost(b.host), loc = RV_LOC[t.loc];
  const [lb, kind] = ST_LB[b.st];
  return (
    <div className={`rv-bk ${b.st === "cancelled" ? "cancel" : ""}`.trim()} data-st={b.st} aria-selected={sel === b.id} onClick={() => onSel && onSel(b.id)}>
      <div className="when">
        <div className="d">{b.day.split(" ").slice(0, 2).join(" ")}</div>
        <div className="h">{b.h}</div>
        <div className="dur">{fmtDur(b.dur)}</div>
      </div>
      <div className="who">
        <div className="nm">{b.nm}<i style={{ width: 7, height: 7, borderRadius: 2, background: t.color }} /><span style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 400 }}>{t.title}</span></div>
        <div className="sb"><span>{b.org}</span><span className="dv" /><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name={loc.ic} className="ico-xs" />{loc.lb}</span><span className="dv" /><span style={{ fontFamily: "var(--font-mono)" }}>{b.crm}</span>{b.why && <><span className="dv" /><span style={{ color: "var(--danger)" }}>{b.why}</span></>}</div>
      </div>
      <div className="meta">
        {!compact && <Pill kind={kind} dot>{lb}</Pill>}
        <span className={`rv-src ${b.src}`} title={b.src === "agent" ? "Pris pendant un appel" : b.src === "embed" ? "Embed site" : "Page publique"}><Icon name={b.src === "agent" ? "phone" : b.src === "embed" ? "code" : "globe"} className="ico-xs" /></span>
        <Av id={b.host} size={24} />
      </div>
      <div className="acts">
        {b.st === "pending" ? <><Btn kind="ok" size="xs" ic="check">Valider</Btn><Btn kind="outline" size="xs" ic="x" /></> :
          b.st === "confirmed" ? <><Btn kind="outline" size="xs" ic="repeat">Reprogrammer</Btn><Btn kind="outline" size="xs" ic="more" /></> :
            <Btn kind="outline" size="xs" ic="more" />}
      </div>
    </div>
  );
}

function ScreenOverview({ go }) {
  const next = RV_BK[0], nt = rvType(next.et);
  const pend = RV_BK.filter(b => b.st === "pending");
  const today = RV_BK.filter(b => b.st === "confirmed" && (b.d === "auj." || b.d === "demain"));
  const max = Math.max(...RV_STATS.weeks.map(w => w.n));
  return (
    <>
      <div className="rv-ph">
        <div><h1>Aperçu</h1><div className="sub">Vos rendez-vous en ligne, vos demandes à valider et l'état de vos liens de réservation.</div></div>
        <div className="actions"><Btn kind="outline" ic="ext">Voir ma page</Btn><Btn kind="primary" ic="calPlus">Nouveau type de RDV</Btn></div>
      </div>

      <div className="rv-hero">
        <div style={{ position: "relative" }}>
          <span className="tag">Prochain rendez-vous · dans 47 min</span>
          <h2>{next.nm} — {nt.title}</h2>
          <div className="who">
            <span className="it"><Icon name="clock" className="ico-sm" style={{ color: "var(--accent)" }} />{next.h} – {addMin(next.h, next.dur)}</span>
            <span className="it"><Icon name="video" className="ico-sm" style={{ color: "var(--accent)" }} />Google Meet</span>
            <span className="it"><Icon name="building" className="ico-sm" style={{ color: "var(--accent)" }} />{next.org}</span>
            <span className="it"><Icon name="globe" className="ico-sm" style={{ color: "var(--accent)" }} />Réservé sur votre page publique</span>
          </div>
          <div className="acts">
            <button className="gb acc"><Icon name="video" className="ico-sm" />Rejoindre la visio</button>
            <button className="gb"><Icon name="user" className="ico-sm" />Fiche prospect</button>
            <button className="gb"><Icon name="repeat" className="ico-sm" />Reprogrammer</button>
          </div>
        </div>
        <div className="side">
          <div className="row"><span>Réservations à venir</span><b>{RV_STATS.upcoming}</b></div>
          <div className="row"><span>En attente de validation</span><b className="w">{RV_STATS.pending}</b></div>
          <div className="row"><span>Remplissage des créneaux</span><b>{RV_STATS.fillRate} %</b></div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-ink-3)", textTransform: "uppercase", letterSpacing: ".09em" }}>6 dernières semaines</div>
            <div className="spark">{RV_STATS.weeks.map((w, i) => <i key={w.w} className={i === RV_STATS.weeks.length - 1 ? "hi" : ""} style={{ height: `${(w.n / max) * 100}%` }} title={`${w.w} · ${w.n}`} />)}</div>
          </div>
        </div>
      </div>

      <div className="rv-kpis">
        <div className="rv-kpi"><div className="k"><Icon name="calCheck" className="ico-xs" />À venir</div><div className="v">{RV_STATS.upcoming}</div><div className="d">dont 6 cette semaine</div></div>
        <div className="rv-kpi warn"><div className="k"><Icon name="hourglass" className="ico-xs" />À valider</div><div className="v">{RV_STATS.pending}</div><div className="d">plus ancienne : il y a 5 h</div></div>
        <div className="rv-kpi ok"><div className="k"><Icon name="check" className="ico-xs" />Tenus · 30 j</div><div className="v">{RV_STATS.held}</div><div className="d up">+18 % vs mois précédent</div></div>
        <div className="rv-kpi"><div className="k"><Icon name="ban" className="ico-xs" />Annulation · 30 j</div><div className="v">{RV_STATS.cancelRate}<small>%</small></div><div className="d">{RV_STATS.noShow} no-show</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="rv-list">
          <div className="rv-list-hd"><Icon name="hourglass" className="ico-sm" style={{ color: "var(--warn)" }} /><h3>À valider</h3><span className="n">{pend.length}</span><Btn kind="ghost" size="xs" onClick={() => go("bookings", "pending")}>Tout voir<Icon name="arrowRight" className="ico-xs" /></Btn></div>
          {pend.map(b => <BkRow key={b.id} b={b} compact />)}
        </div>
        <div className="rv-list">
          <div className="rv-list-hd"><Icon name="calCheck" className="ico-sm" style={{ color: "var(--ok)" }} /><h3>Aujourd'hui & demain</h3><span className="n">{today.length}</span><Btn kind="ghost" size="xs" onClick={() => go("bookings")}>Tout voir<Icon name="arrowRight" className="ico-xs" /></Btn></div>
          {today.map(b => <BkRow key={b.id} b={b} compact />)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Blk title="D'où viennent les réservations" ic="target">
          <Stack gap={9}>
            {RV_STATS.bySrc.map(s => (
              <div key={s.k}>
                <Row style={{ justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12 }}>{s.k}</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{s.n} %</span></Row>
                <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 999 }}><i style={{ display: "block", height: "100%", width: `${s.n}%`, background: s.c, borderRadius: 999 }} /></div>
              </div>
            ))}
          </Stack>
        </Blk>
        <Blk title="Charge de l'équipe cette semaine" ic="users" right={<Btn kind="ghost" size="xs" onClick={() => go("team")}>Équipe<Icon name="arrowRight" className="ico-xs" /></Btn>}>
          <Stack gap={9}>
            {[["u2", 9, 12], ["u3", 7, 12], ["u4", 11, 12], ["u5", 4, 8]].map(([id, n, cap]) => {
              const h = rvHost(id);
              return (
                <Row key={id} style={{ gap: 10 }}>
                  <Av id={id} size={24} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Row style={{ justifyContent: "space-between" }}><span style={{ fontSize: 12, fontWeight: 500 }}>{h.n}</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{n}/{cap}</span></Row>
                    <div style={{ height: 4, background: "var(--bg-3)", borderRadius: 999, marginTop: 4 }}><i style={{ display: "block", height: "100%", width: `${(n / cap) * 100}%`, background: n / cap > .85 ? "var(--warn)" : h.c, borderRadius: 999 }} /></div>
                  </div>
                </Row>
              );
            })}
          </Stack>
        </Blk>
      </div>
    </>
  );
}

const FILTERS = [{ id: "upcoming", lb: "À venir" }, { id: "pending", lb: "En attente" }, { id: "past", lb: "Passées" }, { id: "cancelled", lb: "Annulées" }];

function ScreenBookings({ filter = "upcoming", setFilter }) {
  const [sel, setSel] = React.useState(null);
  const [host, setHost] = React.useState("all");
  const list = RV_BK.filter(b => {
    const okF = filter === "upcoming" ? b.st === "confirmed" : filter === "pending" ? b.st === "pending" : filter === "past" ? b.st === "past" : b.st === "cancelled";
    return okF && (host === "all" || b.host === host);
  });
  const days = [...new Set(list.map(b => b.day))];
  const b = RV_BK.find(x => x.id === sel);
  return (
    <>
      <div className="rv-ph">
        <div><h1>Réservations</h1><div className="sub">Tout ce qui est réservé sur vos liens — page publique, embed, ou calé par un agent pendant un appel.</div></div>
        <div className="actions">
          <Btn kind="outline" ic="download">Exporter</Btn>
          <Btn kind="primary" ic="calPlus">Réserver pour un client</Btn>
        </div>
      </div>

      <Row style={{ marginBottom: 13, gap: 10 }}>
        <Seg opts={FILTERS.map(f => ({ ...f, lb: f.id === "pending" ? <>En attente<span className="pill warn" style={{ height: 15, padding: "0 4px", marginLeft: 4 }}>4</span></> : f.lb }))} val={filter} set={setFilter} lg />
        <span style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <Icon name="search" className="ico-sm" style={{ position: "absolute", left: 8, top: 8, color: "var(--text-4)" }} />
          <input className="rv-in" style={{ width: 210, paddingLeft: 27 }} placeholder="Invité, entreprise, email…" />
        </div>
        <select className="rv-in" style={{ width: 150 }} value={host} onChange={e => setHost(e.target.value)}>
          <option value="all">Tous les hôtes</option>
          {RV_HOSTS.map(h => <option key={h.id} value={h.id}>{h.n}</option>)}
        </select>
      </Row>

      <div className="rv-list">
        {days.map(d => (
          <React.Fragment key={d}>
            <div className="rv-day-sep"><span>{d}</span><span>{list.filter(x => x.day === d).length} rendez-vous</span></div>
            {list.filter(x => x.day === d).map(x => <BkRow key={x.id} b={x} sel={sel} onSel={setSel} />)}
          </React.Fragment>
        ))}
        {!list.length && <div style={{ padding: 40 }}><div className="rv-empty">Rien dans cette vue.</div></div>}
      </div>

      {b && <BookingDrawer b={b} onClose={() => setSel(null)} />}
    </>
  );
}

function BookingDrawer({ b, onClose }) {
  const t = rvType(b.et), h = rvHost(b.host), loc = RV_LOC[t.loc];
  const [lb, kind] = ST_LB[b.st];
  const tl = [
    { ic: "globe", lb: "Réservée par l'invité", d: "il y a 2 j · 14:22", tint: "info" },
    { ic: "mail", lb: "Confirmation + .ics envoyés", d: "il y a 2 j · 14:22", tint: "ok" },
    { ic: "calendar", lb: "Ajoutée au calendrier CRM et à Google Agenda", d: "il y a 2 j · 14:22", tint: "" },
    { ic: "bell", lb: "Rappel J-1 envoyé", d: "hier · 09:30", tint: "warn" },
  ];
  return (
    <div className="rv-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rv-drawer" role="dialog" aria-modal="true">
        <div className="rv-dr-hd">
          <div style={{ flex: 1 }}>
            <Row style={{ gap: 7, marginBottom: 8 }}><Pill kind={kind} dot>{lb}</Pill><Chip line ic="clock">{b.day} · {b.h}–{addMin(b.h, b.dur)}</Chip></Row>
            <h2 className="t">{b.nm}</h2>
            <div className="s">{t.title.toUpperCase()} · {b.org}</div>
          </div>
          <button className="cx" onClick={onClose}><Icon name="x" className="ico-sm" /></button>
        </div>
        <div className="rv-dr-bd">
          <Blk title="Invité">
            <Stack gap={8}>
              {[["Email", b.mail], ["Téléphone", b.tel], ["Fuseau", b.tz.replace("_", " ")], ["Lieu", loc.lb]].map(([k, v]) => (
                <Row key={k} style={{ gap: 12 }}><span style={{ width: 76, fontSize: 11.5, color: "var(--text-3)", flexShrink: 0 }}>{k}</span><span style={{ fontSize: 12.5, fontFamily: k === "Email" || k === "Téléphone" ? "var(--font-mono)" : "inherit" }}>{v}</span></Row>
              ))}
              {b.meet && <Row style={{ gap: 12 }}><span style={{ width: 76, fontSize: 11.5, color: "var(--text-3)" }}>Visio</span><a style={{ fontFamily: "var(--font-mono)", fontSize: 12 }} href="#">meet.google.com/xzr-kfpq-mno</a></Row>}
            </Stack>
          </Blk>
          <Blk title="Réponses au formulaire">
            <Stack gap={9}>
              {t.questions.length ? t.questions.map((q, i) => (
                <div key={q.id}><div style={{ fontSize: 11, color: "var(--text-3)" }}>{q.label}</div><div style={{ fontSize: 12.5, marginTop: 2 }}>{["belhadj-reno.fr (fiche Google uniquement)", "Vitry-sur-Seine + 25 km", "Appel"][i] || "—"}</div></div>
              )) : <div style={{ fontSize: 12, color: "var(--text-3)" }}>Aucune question sur ce type de RDV.</div>}
            </Stack>
          </Blk>
          <Blk title="Rattachement CRM" right={<Btn kind="ghost" size="xs" ic="ext">Ouvrir</Btn>}>
            <Row style={{ gap: 7, flexWrap: "wrap" }}>
              <Chip ic="user">Contact rapproché par email</Chip><Chip ic="building">{b.org}</Chip><Chip ic="pipeline">{b.crm}</Chip><Chip ic="phone">Appel #A-3391</Chip>
            </Row>
          </Blk>
          <Blk title="Journal">
            <Stack gap={0}>
              {tl.map((e, i) => (
                <Row key={i} style={{ gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--border)" : 0, alignItems: "flex-start" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: e.tint ? `var(--${e.tint}-tint)` : "var(--bg-2)", color: e.tint ? `var(--${e.tint})` : "var(--text-3)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name={e.ic} className="ico-xs" /></span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5 }}>{e.lb}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-4)", marginTop: 1 }}>{e.d}</div></div>
                </Row>
              ))}
            </Stack>
          </Blk>
        </div>
        <div className="rv-dr-ft">
          {b.st === "pending" && <Btn kind="ok" ic="check">Valider la demande</Btn>}
          <Btn kind="outline" ic="repeat">Reprogrammer</Btn>
          <Btn kind="outline" ic="mail">Relancer</Btn>
          <span className="sp" />
          <Btn kind="danger" ic="ban">Annuler</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenOverview, ScreenBookings, BkRow, BookingDrawer, FILTERS });
