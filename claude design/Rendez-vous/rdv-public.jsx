// rdv-public.jsx — page publique de réservation (invité, sans compte) + aperçus
const WD = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAY_LB = d => { const off = (RV_MONTH.first + d - 1) % 7; return `${WD[off]} ${d} août`; };

function BookingWidget({ typeId = "et2", hostId = "u1", wide, start = 0, onDone }) {
  const t = rvType(typeId), h = rvHost(hostId);
  const [step, setStep] = React.useState(start);
  const [day, setDay] = React.useState(6);
  const [slot, setSlot] = React.useState(start > 0 ? "10:30" : null);
  const [tz, setTz] = React.useState("Europe/Paris");
  const [vals, setVals] = React.useState({});
  const loc = RV_LOC[t.loc];
  const slots = RV_SLOTS[day] || [];
  const cells = [];
  for (let i = 0; i < RV_MONTH.first; i++) cells.push(null);
  for (let d = 1; d <= RV_MONTH.days; d++) cells.push(d);

  const reset = () => { setStep(0); setSlot(null); };
  const steps = ["Créneau", "Vos informations", "Confirmé"];

  return (
    <div className={`rv-book ${wide ? "wide" : ""}`.trim()}>
      <aside className="rv-bk-side">
        <div className="host">
          <span className="av">{rvInit(h.n)}</span>
          <div><div className="n">{h.n}</div><div className="o">Sama Digital Studio</div></div>
        </div>
        <h2>{t.title}</h2>
        <p className="desc">{t.desc}</p>
        <div className="facts">
          <div className="fact"><Icon name="clock" className="ico-sm" /><div>{fmtDur(t.dur)}</div></div>
          <div className="fact"><Icon name={loc.ic} className="ico-sm" /><div>{loc.lb}{t.loc === "google_meet" && <div className="s">Lien envoyé à la confirmation</div>}</div></div>
          <div className="fact"><Icon name="globe" className="ico-sm" /><div>{tz.replace("_", " ")}<div className="s">Heures affichées dans votre fuseau</div></div></div>
          {t.mode === "rr" && <div className="fact"><Icon name="shuffle" className="ico-sm" /><div>Avec le premier commercial disponible</div></div>}
          {t.mode === "col" && <div className="fact"><Icon name="users" className="ico-sm" /><div>{t.col.map(id => rvHost(id).n.split(" ")[0]).join(", ")}<div className="s">Tous présents</div></div></div>}
          {t.confirm && <div className="fact"><Icon name="hourglass" className="ico-sm" /><div>Demande à valider<div className="s">Réponse sous 12 h ouvrées</div></div></div>}
        </div>
        <div className="ft"><Icon name="calCheck" className="ico-xs" />Cal.SAMA</div>
      </aside>

      <div className="rv-bk-main">
        <div className="rv-bk-steps">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="ln" />}
              <span className={`st ${i === step ? "on" : ""} ${i < step ? "done" : ""}`}>
                <span className="n">{i < step ? <Icon name="check" className="ico-xs" /> : i + 1}</span>{s}
              </span>
            </React.Fragment>
          ))}
        </div>

        {step === 0 && (
          <div className="rv-pick">
            <div>
              <div className="rv-cal-hd">
                <span className="m">{RV_MONTH.name}</span>
                <button className="rv-nav"><Icon name="chevleft" className="ico-sm" /></button>
                <button className="rv-nav"><Icon name="chevright" className="ico-sm" /></button>
              </div>
              <div className="rv-mini">
                {WD.map(w => <div key={w} className="dw">{w[0]}</div>)}
                {cells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} className="dd" />;
                  const free = !!RV_SLOTS[d];
                  return <button key={d} className={`dd ${free ? "free" : "off"} ${day === d && free ? "sel" : ""}`.trim()} onClick={() => { if (free) { setDay(d); setSlot(null); } }}>{d}</button>;
                })}
              </div>
              <div className="rv-tz">
                <Icon name="globe" className="ico-sm" style={{ color: "var(--text-4)" }} />
                <select value={tz} onChange={e => setTz(e.target.value)}>
                  {["Europe/Paris", "Europe/Brussels", "Europe/London", "Africa/Casablanca", "America/Montreal"].map(z => <option key={z} value={z}>{z.replace("_", " ")} · GMT+2</option>)}
                </select>
              </div>
            </div>
            <div className="rv-slots">
              <div className="h"><span className="d">{DAY_LB(day)}</span><span className="n">{slots.length} créneaux</span></div>
              <div className="sc">
                {slots.map(s => slot === s ? (
                  <div key={s} className="rv-slot-pair">
                    <span className="rv-slot sel">{s}</span>
                    <button className="go" onClick={() => setStep(1)}>Suivant<Icon name="chevright" className="ico-xs" /></button>
                  </div>
                ) : (
                  <button key={s} className="rv-slot" onClick={() => setSlot(s)}>{s}</button>
                ))}
                {!slots.length && <div className="rv-empty">Aucun créneau ce jour-là.</div>}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="rv-form">
            <div className="rv-recap">
              <Icon name="calCheck" className="ico-sm" style={{ color: "var(--accent)" }} />
              <div><b>{DAY_LB(day)} · {slot}–{addMin(slot, t.dur)}</b><div style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 2 }}>{t.title} · {fmtDur(t.dur)} · {loc.lb}</div></div>
              <button className="btn ghost xs" style={{ marginLeft: "auto" }} onClick={reset}>Modifier</button>
            </div>
            <div className="rv-grid2">
              <Field label="Nom complet *"><input className="rv-in" defaultValue={vals.nm || ""} placeholder="Karim Belhadj" /></Field>
              <Field label="Email *"><input className="rv-in" placeholder="vous@entreprise.fr" /></Field>
            </div>
            <Field label="Téléphone"><input className="rv-in" placeholder="06 12 34 56 78" /></Field>
            {t.questions.map(q => (
              <Field key={q.id} label={q.label + (q.required ? " *" : "")}>
                {q.type === "textarea" ? <textarea className="rv-in" rows={2} /> :
                  q.type === "select" ? <select className="rv-in">{(q.options || []).map(o => <option key={o}>{o}</option>)}</select> :
                    <input className="rv-in" />}
              </Field>
            ))}
            <Field label="Ajouter des invités"><input className="rv-in" placeholder="email1@ex.fr, email2@ex.fr" /></Field>
            <Row style={{ marginTop: 2 }}>
              <Btn kind="ghost" onClick={reset} ic="chevleft">Retour</Btn>
              <span style={{ flex: 1 }} />
              <Btn kind="accent" size="" ic="check" onClick={() => { setStep(2); onDone && onDone(); }}>{t.confirm ? "Envoyer la demande" : "Confirmer le rendez-vous"}</Btn>
            </Row>
            <div style={{ fontSize: 11, color: "var(--text-4)", lineHeight: 1.5 }}>En confirmant, vous recevez un email avec l'invitation agenda (.ics){t.loc === "google_meet" ? " et le lien Google Meet" : ""}. Annulation ou report possibles à tout moment depuis cet email.</div>
          </div>
        )}

        {step === 2 && (
          <div className="rv-done">
            <span className="ok"><Icon name={t.confirm ? "hourglass" : "check"} className="ico-xl" /></span>
            <h3>{t.confirm ? "Demande envoyée" : "C'est confirmé"}</h3>
            <p className="s">{t.confirm ? `${h.n} valide votre créneau et vous recevez la confirmation par email — généralement sous quelques heures.` : `Un email de confirmation vient de partir avec l'invitation agenda${t.loc === "google_meet" ? " et le lien de visio" : ""}.`}</p>
            <div className="card">
              <div className="r"><span className="k">Quand</span><span><b style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{DAY_LB(day)} · {slot}–{addMin(slot, t.dur)}</b><div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{tz.replace("_", " ")}</div></span></div>
              <div className="r"><span className="k">Avec</span><span>{h.n} · Sama Digital Studio</span></div>
              <div className="r"><span className="k">Où</span><span>{loc.lb}{t.loc === "google_meet" && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--info)" }}>meet.google.com/xzr-kfpq-mno</div>}</span></div>
            </div>
            <div className="adds">
              <Btn kind="outline" ic="google">Google Agenda</Btn>
              <Btn kind="outline" ic="microsoft">Outlook</Btn>
              <Btn kind="outline" ic="download">.ics</Btn>
            </div>
            <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={reset}><Icon name="repeat" className="ico-sm" />Reprogrammer / annuler</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* Page publique complète : profil de l'hôte + liste de ses types */
function PublicProfile({ hostId = "u1", onPick }) {
  const h = rvHost(hostId), types = RV_TYPES.filter(t => t.active);
  return (
    <div style={{ width: "100%", maxWidth: 620, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-pop)" }}>
      <div style={{ background: "var(--ink)", color: "var(--on-ink)", padding: "26px 24px 22px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 0%,rgba(226,85,43,.24),transparent 60%)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 13 }}>
          <span style={{ width: 46, height: 46, borderRadius: "50%", background: h.c, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600 }}>{rvInit(h.n)}</span>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 25, letterSpacing: "-.01em" }}>{h.n}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-ink-3)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>{h.job} · Sama Digital Studio</div>
          </div>
        </div>
        <p style={{ position: "relative", fontSize: 12.5, color: "var(--on-ink-2)", lineHeight: 1.55, margin: "14px 0 0", maxWidth: "52ch" }}>Choisissez le format qui vous convient — sites web, visibilité Google et acquisition pour les artisans et TPE d'Île-de-France.</p>
      </div>
      <div style={{ padding: 12 }}>
        {types.map(t => (
          <button key={t.id} onClick={() => onPick && onPick(t.id)} style={{ width: "100%", border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 11, padding: "11px 13px", display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", marginBottom: 7, textAlign: "left", font: "inherit", cursor: "default" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 3, background: t.color }} /><span style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: "-.005em" }}>{t.title}</span></div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Chip ic="clock">{fmtDur(t.dur)}</Chip><Chip ic={RV_LOC[t.loc].ic}>{RV_LOC[t.loc].lb}</Chip></div>
            </div>
            <Icon name="chevright" className="ico-sm" style={{ color: "var(--text-4)" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { BookingWidget, PublicProfile, DAY_LB, WD });
