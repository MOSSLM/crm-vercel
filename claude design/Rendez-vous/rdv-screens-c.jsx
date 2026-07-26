// rdv-screens-c.jsx — Disponibilités · Équipe · Statistiques
const T0 = 420, T1 = 1260, TSPAN = T1 - T0;
const pct = m => ((m - T0) / TSPAN) * 100;

function ScreenAvail() {
  const [days, setDays] = React.useState(RV_SCHEDULE.days);
  const [plan, setPlan] = React.useState("def");
  const toggle = iso => setDays(ds => ds.map(d => d.iso === iso ? { ...d, ranges: d.ranges.length ? [] : [[540, 1080]] } : d));
  const totalH = days.reduce((s, d) => s + d.ranges.reduce((a, r) => a + (r[1] - r[0]), 0), 0) / 60;
  return (
    <>
      <div className="rv-ph">
        <div><h1>Disponibilités</h1><div className="sub">Vos horaires réels. Tout est calculé dans le fuseau du planning — les changements d'heure ne décalent jamais vos créneaux.</div></div>
        <div className="actions"><Btn kind="outline" ic="plus">Nouveau planning</Btn><Btn kind="accent" ic="check">Enregistrer</Btn></div>
      </div>

      <Row style={{ marginBottom: 14, gap: 10 }}>
        <Seg opts={[{ id: "def", lb: "Horaires de travail" }, { id: "field", lb: "Visites terrain" }, { id: "ext", lb: "Étendu (sam.)" }]} val={plan} set={setPlan} lg />
        <Chip ic="check" color="var(--ok)">par défaut</Chip>
        <span style={{ flex: 1 }} />
        <Row style={{ gap: 6 }}><span className="rv-lb">Fuseau</span><select className="rv-in mono" style={{ width: 170 }}><option>Europe/Paris · GMT+2</option><option>Europe/Brussels</option><option>Africa/Casablanca</option></select></Row>
      </Row>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        <div className="rv-list" style={{ padding: "14px 16px 16px" }}>
          <div className="rv-scale">
            <span />
            <div className="ticks">{[7, 9, 11, 13, 15, 17, 19, 21].map(h => <span key={h}>{h}h</span>)}</div>
          </div>
          {days.map(d => {
            const on = d.ranges.length > 0;
            const busy = RV_SCHEDULE.busy.filter(b => b.iso === d.iso);
            return (
              <div key={d.iso} className={`rv-dayrow ${on ? "" : "off"}`.trim()}>
                <div className="dl"><Sw on={on} onClick={() => toggle(d.iso)} />{d.lb}</div>
                <div className={`rv-track ${on ? "" : "off"}`.trim()}>
                  {on ? <>
                    {[9, 11, 13, 15, 17, 19].map(h => <i key={h} className="g" style={{ left: `${pct(h * 60)}%` }} />)}
                    {d.ranges.map((r, i) => (
                      <div key={i} className="rv-band" style={{ left: `${pct(r[0])}%`, width: `${((r[1] - r[0]) / TSPAN) * 100}%` }}>
                        <i className="gr l" /><span>{minToHHMM(r[0])} – {minToHHMM(r[1])}</span><i className="gr r" />
                      </div>
                    ))}
                    {busy.map((b, i) => (
                      <div key={`b${i}`} className="rv-band busy" style={{ left: `${pct(b.r[0])}%`, width: `${((b.r[1] - b.r[0]) / TSPAN) * 100}%`, fontSize: 9.5 }} title={b.lb}>{b.lb}</div>
                    ))}
                  </> : <span className="offtx">Indisponible</span>}
                </div>
              </div>
            );
          })}
          <Row style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", gap: 14 }}>
            <Row style={{ gap: 6 }}><i style={{ width: 12, height: 8, borderRadius: 3, background: "var(--accent)" }} /><span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Ouvert à la réservation</span></Row>
            <Row style={{ gap: 6 }}><i style={{ width: 12, height: 8, borderRadius: 3, background: "var(--ink)", backgroundImage: "repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(255,255,255,.2) 2px,rgba(255,255,255,.2) 4px)" }} /><span style={{ fontSize: 11.5, color: "var(--text-3)" }}>Occupé réel (CRM + Google)</span></Row>
            <span style={{ flex: 1 }} />
            <Btn kind="outline" size="xs" ic="plus">Ajouter une plage</Btn>
            <Btn kind="ghost" size="xs" ic="copy">Copier lundi partout</Btn>
          </Row>
        </div>

        <Stack gap={14}>
          <Blk title="Cette semaine" ic="clock">
            <Row style={{ gap: 16 }}>
              {[[`${totalH.toFixed(0)} h`, "ouvertes"], ["78", "créneaux"], [`${RV_STATS.fillRate} %`, "remplis"]].map(([v, l]) => (
                <div key={l}><div style={{ fontFamily: "var(--font-serif)", fontSize: 26, lineHeight: 1 }}>{v}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 3 }}>{l}</div></div>
              ))}
            </Row>
          </Blk>
          <Blk title="Exceptions de dates" ic="calOff" right={<Btn kind="ghost" size="xs" ic="plus" />}>
            <Stack gap={9}>
              <Row style={{ gap: 6 }}>
                <input className="rv-in" type="date" style={{ flex: 1 }} />
                <Btn kind="outline" size="sm" ic="plus">Bloquer</Btn>
              </Row>
              <div>
                {RV_SCHEDULE.overrides.map(o => (
                  <div key={o.date} className="rv-ovr">
                    <span className="dt">{o.date}</span>
                    <span className="st">{o.st}</span>
                    {o.off ? <Pill kind="danger" dot>fermé</Pill> : <Pill kind="warn" dot>partiel</Pill>}
                    <Btn kind="ghost" size="xs" ic="trash" />
                  </div>
                ))}
              </div>
            </Stack>
          </Blk>
          <Blk title="Sources d'occupation" ic="plug">
            <Stack gap={7}>
              {[["google", "Google Agenda", "jean@samadigitalstudio.fr", true], ["calendar", "Calendrier CRM", "événements + récurrences", true], ["microsoft", "Outlook", "non connecté", false]].map(([ic, n, s, on]) => (
                <Row key={n} style={{ gap: 9 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: on ? "var(--ok-tint)" : "var(--bg-2)", color: on ? "var(--ok)" : "var(--text-4)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name={ic} className="ico-xs" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{n}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis" }}>{s}</div></div>
                  {on ? <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} /> : <Btn kind="outline" size="xs">Lier</Btn>}
                </Row>
              ))}
            </Stack>
          </Blk>
        </Stack>
      </div>
    </>
  );
}

function ScreenTeam() {
  const rows = [
    { id: "u1", up: 8, pd: 2, load: [12, 16] }, { id: "u5", up: 5, pd: 0, load: [4, 8] },
    { id: "u2", up: 6, pd: 1, load: [9, 12] }, { id: "u3", up: 3, pd: 1, load: [7, 12] }, { id: "u4", up: 1, pd: 0, load: [11, 12] },
  ];
  return (
    <>
      <div className="rv-ph">
        <div><h1>Équipe</h1><div className="sub">Les pages de réservation de tout le monde, leur charge, et les rotations round-robin en cours.</div></div>
        <div className="actions"><Btn kind="outline" ic="copy">Copier tous les liens</Btn><Btn kind="primary" ic="shuffle">Nouvelle rotation</Btn></div>
      </div>
      <div className="rv-list" style={{ marginBottom: 16 }}>
        <div className="rv-list-hd"><h3>Hôtes</h3><span className="n">{rows.length} actifs</span><Seg opts={[{ id: "all", lb: "Tous" }, { id: "ag", lb: "Agents" }]} val="all" set={() => { }} /></div>
        {rows.map(r => {
          const h = rvHost(r.id);
          return (
            <div key={r.id} className="rv-mem">
              <span className="av" style={{ background: h.c }}>{rvInit(h.n)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{h.n}<Pill kind={h.role === "admin" ? "accent" : ""}>{h.role === "admin" ? "Admin" : "Agent"}</Pill>{r.id === "u4" && <Pill kind="warn" dot>page désactivée</Pill>}</div>
                <div className="u">/rdv/{h.u} · {h.job}</div>
              </div>
              <div className="kv"><div className="v">{r.up}</div><div className="l">à venir</div></div>
              <div className="kv"><div className={`v ${r.pd ? "w" : ""}`.trim()}>{r.pd}</div><div className="l">à valider</div></div>
              <div className="load">
                <div className="bar"><i style={{ width: `${(r.load[0] / r.load[1]) * 100}%`, background: r.load[0] / r.load[1] > .85 ? "var(--warn)" : h.c }} /></div>
                <div className="l">{r.load[0]}/{r.load[1]} créneaux</div>
              </div>
              <Row style={{ gap: 5 }}><Btn kind="outline" size="xs" ic="copy">Lien</Btn><Btn kind="outline" size="xs" ic="ext" /><Btn kind="ghost" size="xs">Ses résas</Btn></Row>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Blk title="Rotations round-robin" ic="shuffle">
          <Stack gap={9}>
            {RV_TYPES.filter(t => t.mode === "rr").map(t => (
              <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <Row><i style={{ width: 8, height: 8, borderRadius: 3, background: t.color }} /><span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{t.title}</span><Chip ic="clock">{fmtDur(t.dur)}</Chip></Row>
                <Row style={{ marginTop: 9, gap: 8 }}>
                  {t.rr.map((id, i) => <Row key={id} style={{ gap: 6 }}><Av id={id} size={22} /><span style={{ fontSize: 11.5 }}>{rvHost(id).n.split(" ")[0]}</span>{i === 1 && <Pill kind="accent">suivant</Pill>}</Row>)}
                </Row>
              </div>
            ))}
            {RV_TYPES.filter(t => t.mode === "col").map(t => (
              <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <Row><i style={{ width: 8, height: 8, borderRadius: 3, background: t.color }} /><span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{t.title}</span><Pill kind="magic">collectif</Pill></Row>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 7 }}>Créneau proposé seulement si {t.col.map(id => rvHost(id).n.split(" ")[0]).join(", ")} sont libres — 6 créneaux cette semaine.</div>
              </div>
            ))}
          </Stack>
        </Blk>
        <Blk title="Délégations en cours" ic="transfer">
          <Stack gap={0}>
            {[["Sofia Kadri", "Hugo Ferrand", "Présentation du devis", "Ven 31 · 11:30"], ["Malik Oueslati", "Hugo Ferrand", "Présentation du devis", "Lun 3 · 15:00"], ["Léa Vasseur", "Jean Moss", "Visite technique", "Mar 4 · 09:00"]].map(([a, b, t, w], i) => (
              <Row key={i} style={{ padding: "9px 0", borderTop: i ? "1px solid var(--border)" : 0, gap: 9 }}>
                <Icon name="transfer" className="ico-sm" style={{ color: "var(--text-4)" }} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 12.5 }}><b style={{ fontWeight: 500 }}>{a}</b> → {b}</div><div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{t}</div></div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{w}</span>
              </Row>
            ))}
          </Stack>
        </Blk>
      </div>
    </>
  );
}

function ScreenStats() {
  const max = Math.max(...RV_STATS.weeks.map(w => w.n));
  const hours = [9, 10, 11, 14, 15, 16, 17];
  const heat = (h, d) => { const s = Math.abs(Math.sin(h * 1.7 + d * 2.3)); return d >= 5 ? 0 : s; };
  const byType = RV_TYPES.filter(t => t.bookings30).sort((a, b) => b.bookings30 - a.bookings30);
  const maxT = byType[0].bookings30;
  return (
    <>
      <div className="rv-ph">
        <div><h1>Statistiques</h1><div className="sub">30 derniers jours · tous les hôtes.</div></div>
        <div className="actions"><Seg opts={[{ id: 7, lb: "7 j" }, { id: 30, lb: "30 j" }, { id: 90, lb: "90 j" }]} val={30} set={() => { }} lg /><Btn kind="outline" ic="download">CSV</Btn></div>
      </div>
      <div className="rv-kpis">
        <div className="rv-kpi dark"><div className="k"><Icon name="calCheck" className="ico-xs" />Réservations</div><div className="v">108</div><div className="d">+22 % vs période précédente</div></div>
        <div className="rv-kpi ok"><div className="k"><Icon name="check" className="ico-xs" />Tenus</div><div className="v">{RV_STATS.held}</div><div className="d">sur 68 passés</div></div>
        <div className="rv-kpi"><div className="k"><Icon name="ban" className="ico-xs" />No-show</div><div className="v">{RV_STATS.noShow}</div><div className="d">4,4 % des RDV</div></div>
        <div className="rv-kpi"><div className="k"><Icon name="timer" className="ico-xs" />Délai de prise</div><div className="v">2,4<small>j</small></div><div className="d">médiane avant le RDV</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-hd"><h3>Réservations par semaine</h3><span className="meta">6 semaines</span></div>
          <div className="card-bd">
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${RV_STATS.weeks.length},1fr)`, gap: 12, alignItems: "end", height: 168, padding: "10px 0 4px" }}>
              {RV_STATS.weeks.map((w, i) => (
                <div key={w.w} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, height: "100%", justifyContent: "flex-end" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>{w.n}</span>
                  <div style={{ width: "100%", maxWidth: 52, height: `${(w.n / max) * 100}%`, background: i === RV_STATS.weeks.length - 1 ? "var(--accent)" : "var(--bg-3)", borderRadius: "5px 5px 0 0" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{w.w}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Blk title="Créneaux les plus demandés" ic="grid">
          <div className="rv-heat">
            <span />
            {WD.map(w => <div key={w} className="hw">{w[0]}</div>)}
            {hours.map(h => (
              <React.Fragment key={h}>
                <div className="hh">{h}h</div>
                {WD.map((w, d) => {
                  const v = heat(h, d);
                  return <div key={w} className="hc" style={{ background: v ? `color-mix(in oklab, var(--accent) ${Math.round(v * 90)}%, var(--bg-3))` : "var(--bg-3)" }} title={`${w} ${h}h`} />;
                })}
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>Pic le mardi et jeudi en fin de matinée. Ouvrir 2 créneaux de plus mardi 11 h ferait gagner ~3 RDV/mois.</div>
        </Blk>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Blk title="Par type d'évènement" ic="calCog">
          <Stack gap={10}>
            {byType.map(t => (
              <div key={t.id}>
                <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
                  <Row style={{ gap: 7 }}><i style={{ width: 7, height: 7, borderRadius: 2, background: t.color }} /><span style={{ fontSize: 12 }}>{t.title}</span></Row>
                  <Row style={{ gap: 10 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{t.bookings30}</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: t.conv > 60 ? "var(--ok)" : "var(--text-3)", width: 34, textAlign: "right" }}>{t.conv} %</span></Row>
                </Row>
                <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 999 }}><i style={{ display: "block", height: "100%", width: `${(t.bookings30 / maxT) * 100}%`, background: t.color, borderRadius: 999 }} /></div>
              </div>
            ))}
          </Stack>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 11 }}>Deuxième colonne : part de RDV réellement tenus.</div>
        </Blk>
        <Blk title="Par hôte" ic="users">
          <Stack gap={0}>
            {[["u1", 31, 84, 4], ["u2", 27, 71, 9], ["u3", 22, 66, 11], ["u4", 18, 78, 6], ["u5", 10, 90, 0]].map(([id, n, held, cancel], i) => {
              const h = rvHost(id);
              return (
                <Row key={id} style={{ padding: "9px 0", borderTop: i ? "1px solid var(--border)" : 0, gap: 10 }}>
                  <Av id={id} size={24} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 500 }}>{h.n}</div><div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{h.job}</div></div>
                  <div style={{ textAlign: "right", width: 44 }}><div style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{n}</div><div style={{ fontSize: 9.5, color: "var(--text-4)", textTransform: "uppercase" }}>résas</div></div>
                  <div style={{ textAlign: "right", width: 44 }}><div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ok)" }}>{held}%</div><div style={{ fontSize: 9.5, color: "var(--text-4)", textTransform: "uppercase" }}>tenus</div></div>
                  <div style={{ textAlign: "right", width: 44 }}><div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: cancel > 9 ? "var(--warn)" : "var(--text-2)" }}>{cancel}%</div><div style={{ fontSize: 9.5, color: "var(--text-4)", textTransform: "uppercase" }}>annul.</div></div>
                </Row>
              );
            })}
          </Stack>
        </Blk>
      </div>
    </>
  );
}

Object.assign(window, { ScreenAvail, ScreenTeam, ScreenStats });
