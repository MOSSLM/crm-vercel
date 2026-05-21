// screen-companies.jsx
function ScreenCompanies() {
  const companies = window.COMPANIES;
  const [sel, setSel] = React.useState(companies[0].id);
  const selected = companies.find(c => c.id === sel);

  const colorOf = (c) => {
    const hue = (c.id.charCodeAt(1) * 137) % 360;
    return `oklch(60% 0.08 ${hue})`;
  };
  const initialsOf = (c) => c.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div className="split-page">
      <aside className="split-list">
        <div className="split-list-hd">
          <h2>Entreprises</h2>
          <div className="subline">{companies.length} comptes · 14 contacts associés</div>
        </div>
        <div className="split-list-tools">
          <div className="search-wrap">
            <Icon name="search" className="ico-sm" />
            <input placeholder="Rechercher une entreprise…" />
          </div>
          <button className="btn ghost sm icon"><Icon name="filter" className="ico-sm" /></button>
        </div>

        <div className="split-list-rows">
          {companies.map(c => (
            <div
              key={c.id}
              className="split-list-row"
              aria-selected={c.id === sel}
              onClick={() => setSel(c.id)}
            >
              <div className="av sq" style={{ background: colorOf(c) }}>{initialsOf(c)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{c.name}</div>
                <div className="sb">{c.sector} · {c.city}</div>
              </div>
              <div className="meta">{c.pipe}</div>
            </div>
          ))}
        </div>
      </aside>

      <main className="split-detail">
        <div className="detail-hd">
          <div className="av-lg" style={{ background: colorOf(selected) }}>{initialsOf(selected)}</div>
          <div>
            <h1>{selected.name}</h1>
            <div className="ctx">
              <span className="it"><Icon name="briefcase" className="ico-sm" />{selected.sector}</span>
              <span className="it"><Icon name="mappin" className="ico-sm" />{selected.city}</span>
              <span className="it"><Icon name="users" className="ico-sm" />{selected.size}</span>
              <span className="it"><Icon name="calendar" className="ico-sm" />Client depuis {selected.since}</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Nouveau deal</button>
            <button className="btn outline sm"><Icon name="ext" className="ico-sm" />Site web</button>
            <button className="btn outline sm icon"><Icon name="moreV" className="ico-sm" /></button>
          </div>
        </div>

        <div className="bento">
          {/* Health gauge */}
          <div className="c span-4">
            <div className="c-hd"><h4>Santé du compte</h4></div>
            <div className="c-bd">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 56, letterSpacing: "-.015em", lineHeight: 1, color: "var(--ok)" }}>A</span>
                <Pill kind="ok" dot>actif · sain</Pill>
              </div>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <RowKV k="ARR estimé" v={selected.arr} mono />
                <RowKV k="Pipeline" v={selected.pipe} mono strong />
                <RowKV k="Contacts" v={`${selected.contacts} personnes`} />
                <RowKV k="Deals ouverts" v={`${selected.deals}`} />
                <RowKV k="Dernier contact" v="il y a 2 jours" />
                <RowKV k="NPS interne" v={<><Icon name="star" className="ico-xs" style={{ color: "var(--accent)" }} /> 9 / 10</>} />
              </div>
            </div>
          </div>

          {/* Address / map */}
          <div className="c span-5">
            <div className="c-hd"><h4>Adresse & terrain</h4>
              <button className="btn xs ghost" style={{ marginLeft: "auto" }}><Icon name="map" className="ico-sm" />Itinéraire</button>
            </div>
            <div className="c-bd">
              <div className="field-map" style={{ height: 140 }}>
                <div className="pin" style={{ left: "50%", top: "60%" }}>1</div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--text)" }}>{selected.name}</strong><br />
                12 rue Saint-Michel<br />
                49000 {selected.city}<br />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>SIRET · 891 247 332 00018 · Code APE 4322B</span>
              </div>
            </div>
          </div>

          {/* Snapshot — sparkline */}
          <div className="c span-3">
            <div className="c-hd"><h4>Activité 90j</h4></div>
            <div className="c-bd">
              <div style={{ height: 70 }}>
                <Sparkline data={[3, 5, 4, 8, 7, 6, 12, 9, 14, 11, 16, 18]} color="var(--accent)" width={240} height={70} fill />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12, fontSize: 11 }}>
                <Mini lb="Emails" v="42" />
                <Mini lb="Appels" v="18" />
                <Mini lb="RDV"    v="6"  />
              </div>
            </div>
          </div>

          {/* Contacts */}
          <div className="c span-6">
            <div className="c-hd"><h4>Contacts</h4>
              <Pill style={{ marginLeft: "auto" }}>{selected.contacts}</Pill>
            </div>
            <div className="c-bd flush">
              {window.CONTACTS.filter(p => p.company === selected.name).map((p, i) => (
                <div key={p.id} style={{
                  display: "grid", gridTemplateColumns: "32px 1fr auto",
                  gap: 10, alignItems: "center", padding: "10px 14px",
                  borderTop: i ? "1px solid var(--border)" : 0,
                }}>
                  <Avatar initials={(p.first[0] + p.last[0]).toUpperCase()} color={`oklch(58% 0.10 ${(p.id.charCodeAt(1) * 47) % 360})`} size={32} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: "-.005em" }}>
                      {p.first} {p.last}
                      {p.tags?.includes("vip") && <Icon name="star" className="ico-xs" style={{ marginLeft: 5, color: "var(--accent)" }} />}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>{p.role} · {p.email}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn xs ghost icon"><Icon name="mail" className="ico-sm" /></button>
                    <button className="btn xs ghost icon"><Icon name="phone" className="ico-sm" /></button>
                  </div>
                </div>
              ))}
              {window.CONTACTS.filter(p => p.company === selected.name).length === 0 && (
                <div style={{ padding: 20, color: "var(--text-4)", textAlign: "center", fontSize: 12, fontStyle: "italic" }}>
                  Aucun contact rattaché — <button className="btn xs ghost" style={{ verticalAlign: -2 }}><Icon name="plus" className="ico-xs" />ajouter</button>
                </div>
              )}
            </div>
          </div>

          {/* Deals */}
          <div className="c span-6">
            <div className="c-hd"><h4>Affaires</h4>
              <Pill style={{ marginLeft: "auto" }}>{selected.deals}</Pill>
            </div>
            <div className="c-bd flush">
              {window.DEALS.filter(d => d.company === selected.name).map((d, i) => {
                const stg = window.STAGES.find(s => s.id === d.stage);
                return (
                  <div key={d.id} style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg?.color }} />
                      <div style={{ flex: 1, fontSize: 12.5, fontWeight: 500, letterSpacing: "-.005em" }}>{d.title}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>{eur(d.value)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, fontSize: 11, color: "var(--text-3)" }}>
                      <span>{stg?.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)" }}>{d.prob}% · {d.close}</span>
                    </div>
                  </div>
                );
              })}
              {window.DEALS.filter(d => d.company === selected.name).length === 0 && (
                <div style={{ padding: 20, color: "var(--text-4)", textAlign: "center", fontSize: 12, fontStyle: "italic" }}>
                  Aucune affaire — opportunité dormante
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="c span-12">
            <div className="c-hd"><h4>Historique compte</h4></div>
            <div className="c-bd flush">
              <div className="timeline-feed">
                <div className="tlf-row">
                  <div className="ic-w deal"><Icon name="check" className="ico-sm" /></div>
                  <div className="ti"><span className="e">Pelletier — Devis 27 602 €</span> passé en stade closing <span className="h">il y a 14 min</span></div>
                </div>
                <div className="tlf-row">
                  <div className="ic-w email"><Icon name="mail" className="ico-sm" /></div>
                  <div className="ti"><span className="e">Email envoyé</span> à Hugo Pinault — proposition de RDV semaine prochaine <span className="h">il y a 3h</span></div>
                </div>
                <div className="tlf-row">
                  <div className="ic-w cal"><Icon name="calendar" className="ico-sm" /></div>
                  <div className="ti"><span className="e">RDV planifié</span> · visite technique 165m² + dépose chaudière fioul <span className="h">hier 17:30</span></div>
                </div>
                <div className="tlf-row">
                  <div className="ic-w call"><Icon name="phone" className="ico-sm" /></div>
                  <div className="ti"><span className="e">Appel</span> — 6min12 avec Camille — questions raccordement Enedis <span className="h">20 mai 11:24</span></div>
                </div>
                <div className="tlf-row">
                  <div className="ic-w docu"><Icon name="doc" className="ico-sm" /></div>
                  <div className="ti"><span className="e">DEV-2026-0421 envoyé</span> — PAC + iso + PV — ouvert 3 fois <span className="h">20 mai 09:08</span></div>
                </div>
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
      <span style={{
        color: "var(--text)",
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        fontWeight: strong ? 600 : 500,
        fontSize: strong ? 14 : 12.5,
      }}>{v}</span>
    </div>
  );
}

function Mini({ lb, v }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, letterSpacing: "-.01em", lineHeight: 1 }}>{v}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-3)", marginTop: 4 }}>{lb}</div>
    </div>
  );
}

window.ScreenCompanies = ScreenCompanies;
