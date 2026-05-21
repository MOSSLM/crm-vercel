// screen-contacts.jsx
function ScreenContacts() {
  const contacts = window.CONTACTS;
  const [sel, setSel] = React.useState(contacts[0].id);
  const selected = contacts.find(c => c.id === sel);

  // Group by first letter
  const grouped = contacts.reduce((acc, c) => {
    const L = c.last[0].toUpperCase();
    (acc[L] = acc[L] || []).push(c);
    return acc;
  }, {});
  const letters = Object.keys(grouped).sort();

  const initialsOf = c => (c.first[0] + c.last[0]).toUpperCase();
  const colorOf = c => {
    const hue = (c.id.charCodeAt(1) * 47 + c.id.charCodeAt(2) * 13) % 360;
    return `oklch(58% 0.10 ${hue})`;
  };

  return (
    <div className="split-page">
      {/* LEFT — list */}
      <aside className="split-list">
        <div className="split-list-hd">
          <h2>Contacts</h2>
          <div className="subline">{contacts.length} personnes · 4 nouveaux cette semaine</div>
        </div>
        <div className="split-list-tools">
          <div className="search-wrap">
            <Icon name="search" className="ico-sm" />
            <input placeholder="Rechercher un contact, une entreprise…" />
          </div>
          <button className="btn ghost sm icon"><Icon name="filter" className="ico-sm" /></button>
        </div>

        <div className="split-list-rows">
          {letters.map(L => (
            <React.Fragment key={L}>
              <div className="split-list-letter">{L}</div>
              {grouped[L].map(c => (
                <div
                  key={c.id}
                  className="split-list-row"
                  aria-selected={c.id === sel}
                  onClick={() => setSel(c.id)}
                >
                  <Avatar initials={initialsOf(c)} color={colorOf(c)} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">
                      {c.first} {c.last}
                      {c.tags?.includes("vip") && <Icon name="star" className="ico-xs" style={{ marginLeft: 6, color: "var(--accent)" }} />}
                      {c.tags?.includes("hot") && <Icon name="flame" className="ico-xs" style={{ marginLeft: 6, color: "var(--accent)" }} />}
                    </div>
                    <div className="sb">{c.role} · {c.company}</div>
                  </div>
                  <div className="meta">{c.last_touch}</div>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </aside>

      {/* DETAIL */}
      <main className="split-detail">
        <div className="detail-hd">
          <div className="av-lg round" style={{ background: colorOf(selected) }}>{initialsOf(selected)}</div>
          <div>
            <h1>
              {selected.first} {selected.last}
              {selected.tags?.includes("vip") && <Pill kind="accent" lg style={{ marginLeft: 12, verticalAlign: 6 }}><Icon name="star" className="ico-xs" />VIP</Pill>}
              {selected.tags?.includes("hot") && <Pill kind="accent" lg style={{ marginLeft: 8, verticalAlign: 6 }}><Icon name="flame" className="ico-xs" />HOT</Pill>}
            </h1>
            <div className="ctx">
              <span className="it"><Icon name="briefcase" className="ico-sm" />{selected.role}</span>
              <span className="it"><Icon name="building" className="ico-sm" />{selected.company}</span>
              <span className="it"><Icon name="mappin" className="ico-sm" />{selected.city}</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn outline sm"><Icon name="mail" className="ico-sm" />Email</button>
            <button className="btn outline sm"><Icon name="phone" className="ico-sm" />Appeler</button>
            <button className="btn outline sm"><Icon name="whatsapp" className="ico-sm" />WhatsApp</button>
            <button className="btn outline sm icon"><Icon name="moreV" className="ico-sm" /></button>
          </div>
        </div>

        {/* Bento */}
        <div className="bento">
          {/* Quickfacts */}
          <div className="c span-4">
            <div className="c-hd"><h4>Identité</h4></div>
            <div className="c-bd">
              <div className="kv-list">
                <div className="kv"><div className="k">Email</div><div className="v mono">{selected.email}</div></div>
                <div className="kv"><div className="k">Téléphone</div><div className="v mono">{selected.phone}</div></div>
                <div className="kv"><div className="k">Ville</div><div className="v">{selected.city}</div></div>
                <div className="kv"><div className="k">Source</div><div className="v">{selected.src}</div></div>
                <div className="kv"><div className="k">Séquence</div><div className="v">{selected.sequence !== "—" ? selected.sequence : <span style={{ color: "var(--text-4)" }}>Aucune</span>}</div></div>
                <div className="kv"><div className="k">Statut</div><div className="v"><Pill kind={selected.status === "vip" ? "accent" : selected.status === "froid" ? "" : "ok"} dot>{selected.status}</Pill></div></div>
              </div>
            </div>
          </div>

          {/* Deals tied to contact */}
          <div className="c span-5">
            <div className="c-hd"><h4>Affaires ouvertes</h4>
              <button className="btn xs ghost" style={{ marginLeft: "auto" }}><Icon name="plus" className="ico-xs" />Ajouter</button>
            </div>
            <div className="c-bd flush">
              {window.DEALS.filter(d => d.contact === `${selected.first} ${selected.last}` && d.stage !== "won").slice(0, 4).map((d, i) => {
                const stg = window.STAGES.find(s => s.id === d.stage);
                return (
                  <div key={d.id} style={{ padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg?.color }} />
                      <div style={{ flex: 1, fontSize: 12.5, fontWeight: 500, letterSpacing: "-.005em" }}>{d.title}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500 }}>{eur(d.value)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, fontSize: 11, color: "var(--text-3)" }}>
                      <span>{stg?.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)" }}>{d.prob}% · close {d.close}</span>
                      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 50, height: 3, background: "var(--bg-3)", borderRadius: 999, overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${d.prob}%`, background: "var(--accent)" }} />
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
              {window.DEALS.filter(d => d.contact === `${selected.first} ${selected.last}` && d.stage !== "won").length === 0 && (
                <div style={{ padding: 20, color: "var(--text-4)", fontSize: 12, textAlign: "center", fontStyle: "italic" }}>
                  Aucune affaire ouverte
                </div>
              )}
            </div>
          </div>

          {/* Score */}
          <div className="c span-3">
            <div className="c-hd"><h4>Score d'engagement</h4></div>
            <div className="c-bd" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 48, letterSpacing: "-.01em", lineHeight: 1 }}>
                82<span style={{ fontFamily: "var(--font-ui)", fontSize: 16, color: "var(--text-3)" }}> /100</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "var(--text-2)" }}>
                <ScoreBar lb="Ouvertures email" v={92} />
                <ScoreBar lb="Réactivité" v={78} />
                <ScoreBar lb="Volume d'échanges" v={64} />
                <ScoreBar lb="Récence" v={88} />
              </div>
            </div>
          </div>

          {/* Activity timeline */}
          <div className="c span-7">
            <div className="c-hd"><h4>Historique</h4>
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button className="btn xs subtle">Tout</button>
                <button className="btn xs ghost">Emails</button>
                <button className="btn xs ghost">Appels</button>
                <button className="btn xs ghost">Notes</button>
              </div>
            </div>
            <div className="c-bd flush">
              <div className="timeline-feed">
                <div className="tlf-day">Aujourd'hui · 21 mai 2026</div>
                <div className="tlf-row">
                  <div className="ic-w deal"><Icon name="check" className="ico-sm" /></div>
                  <div className="ti">
                    <span className="e">RDV signature confirmé</span> <span className="h">14 min</span>
                    <div className="det">PAC + PV — 27 602 € — 10h30 ce matin à Angers</div>
                  </div>
                </div>
                <div className="tlf-row">
                  <div className="ic-w email"><Icon name="mail" className="ico-sm" /></div>
                  <div className="ti">
                    <span className="e">Email envoyé</span> · « Confirmation RDV demain matin » <span className="h">hier 18:42</span>
                    <div className="quote">Bonjour Camille, comme convenu je passerai demain à 10h30 avec le contrat et les devis détaillés. À demain — Lucas</div>
                  </div>
                </div>
                <div className="tlf-day">Hier · 20 mai</div>
                <div className="tlf-row">
                  <div className="ic-w call"><Icon name="phone" className="ico-sm" /></div>
                  <div className="ti">
                    <span className="e">Appel sortant</span> · 6 min 12 <span className="h">11:24</span>
                    <div className="det">Présentation des aides MaPrimeRénov' + CEE — Camille pose Q. raccordement Enedis</div>
                  </div>
                </div>
                <div className="tlf-row">
                  <div className="ic-w docu"><Icon name="doc" className="ico-sm" /></div>
                  <div className="ti">
                    <span className="e">Devis envoyé</span> · DEV-2026-0421 — 27 602 € <span className="h">09:08</span>
                    <div className="det">PAC Daikin 11kW + iso combles 165m² + PV 6kWc — ouvert 3 fois</div>
                  </div>
                </div>
                <div className="tlf-day">Semaine passée</div>
                <div className="tlf-row">
                  <div className="ic-w cal"><Icon name="calendar" className="ico-sm" /></div>
                  <div className="ti">
                    <span className="e">RDV terrain</span> · visite technique à Angers <span className="h">14 mai</span>
                    <div className="det">Relevés toiture (39m² sud-est) + diagnostic chaudière fioul 2007 — bon état général</div>
                  </div>
                </div>
                <div className="tlf-row">
                  <div className="ic-w note"><Icon name="note" className="ico-sm" /></div>
                  <div className="ti">
                    <span className="e">Note — Lucas Bernier</span> <span className="h">13 mai</span>
                    <div className="det">Camille mentionne 3 voisins intéressés (rue Renaud) — potentiel referral à activer après signature.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes / Tags / Owner */}
          <div className="c span-5">
            <div className="c-hd"><h4>À garder en tête</h4></div>
            <div className="c-bd" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: "0 8px 8px 0",
                padding: "10px 12px",
                fontSize: 12.5, lineHeight: 1.5, color: "var(--text-2)",
              }}>
                Décide rapidement. Sensible au critère <strong>local</strong> (préfère installateurs &lt; 1h de route).
                Belle-sœur est plombière à Cholet — ne pas négliger. Pose visée <strong>fin juillet</strong> avant
                déménagement de sa mère.
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>Tags</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Pill kind="accent">décideur</Pill>
                  <Pill kind="ok">RGE-compatible</Pill>
                  <Pill kind="info">MaPrimeRénov'</Pill>
                  <Pill>49 — Maine-et-Loire</Pill>
                  <button className="btn xs ghost"><Icon name="plus" className="ico-xs" />Tag</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>Propriétaire</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar initials="LB" color="#E2552B" size={24} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>Lucas Bernier</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>AE Senior · depuis le 14 mai</div>
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
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 28px", gap: 8, alignItems: "center" }}>
      <span style={{ color: "var(--text-3)" }}>{lb}</span>
      <span style={{ height: 4, background: "var(--bg-3)", borderRadius: 999, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${v}%`, background: "var(--accent)" }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

window.ScreenContacts = ScreenContacts;
