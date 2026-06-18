// studio-views-6.jsx — Pipeline (kanban with full feature set)

function StudioPipeline() {
  const stages = [
    { id: "set-aside", name: "Mis de côté", color: "#9ca3af", count: 12, value: "—",   reduced: true },
    { id: "qualified", name: "Qualifié",   color: "#3b82f6", count: 14, value: "18,1k€" },
    { id: "coldcall",  name: "Cold call",  color: "#eab308", count:  9, value: "12,4k€" },
    { id: "rdv",       name: "RDV vente",  color: "#f97316", count:  6, value:  "9,8k€" },
    { id: "devis",     name: "Devis",      color: "#22c55e", count:  4, value:  "8,2k€" },
    { id: "signature", name: "Signature",  color: "#16a34a", count:  3, value:  "5,4k€" },
  ];

  const cards = {
    qualified: [
      { nm: "Brossard Plomberie Chauffage", vl: "1 290 €", priority: "haute", tags: ["plomberie","chauffage"], channel: "phone", flags: [] },
      { nm: "Énergie Sud-Ouest",            vl: "1 290 €", priority: "moyenne", tags: ["PAC","solaire"], channel: "linkedin", flags: ["flag-site"] },
      { nm: "Climatech Languedoc",          vl: "1 290 €", priority: "moyenne", tags: ["clim"], channel: "phone", flags: [] },
      { nm: "Bati Solutions Méditerranée",  vl: "1 290 €", priority: "basse",  tags: ["BTP"], channel: "mail", flags: ["flag-old"] },
    ],
    coldcall: [
      { nm: "SARL Dumas BTP",          vl: "2 580 €", priority: "haute",  tags: ["rénovation"], channel: "phone", flags: [], note: "Appel le 03/06 — rappeler vendredi 10h." },
      { nm: "Sud Habitat Rénovation",  vl: "1 290 €", priority: "moyenne", tags: ["rénovation"], channel: "phone", flags: [] },
      { nm: "Chauffage Vasseur",       vl: "1 290 €", priority: "haute",  tags: ["chauffage"], channel: "phone", flags: ["flag-later"] },
    ],
    rdv: [
      { nm: "Isolation Pro Languedoc", vl: "3 200 €", priority: "haute",  tags: ["isolation","RGE"], channel: "phone", flags: [], note: "RDV jeudi 9h30 chez le client." },
      { nm: "Mme Vasseur",             vl: "4 800 €", priority: "haute",  tags: ["PAC"], channel: "phone", flags: [] },
      { nm: "Pierre Brossard",         vl: "2 100 €", priority: "moyenne", tags: ["isolation"], channel: "whatsapp", flags: [] },
    ],
    devis: [
      { nm: "Anne Leclerc",            vl: "5 400 €", priority: "moyenne", tags: ["PAC + isolation"], channel: "mail", flags: [] },
      { nm: "Groupe Tarn Énergies",    vl: "12 800 €", priority: "haute",  tags: ["multi-site"], channel: "linkedin", flags: [] },
    ],
    signature: [
      { nm: "Cabinet Aubert",          vl: "8 400 €", priority: "haute",  tags: ["acompte versé"], channel: "phone", flags: [] },
      { nm: "Mathieu Dumas",           vl: "3 600 €", priority: "moyenne", tags: ["signature"], channel: "mail", flags: [] },
    ],
  };

  const ChannelBtn = ({ name, active }) => (
    <span className="ch" aria-pressed={active ? "true" : "false"} title={name}>
      <Icon name={name === "phone" ? "phone" : name === "mail" ? "mail" : name === "linkedin" ? "linkedin" : name === "whatsapp" ? "whatsapp" : "globe"} className="ico-sm" />
    </span>
  );

  const Card = ({ c }) => (
    <div className="kp-card" data-priority={c.priority}>
      <div className="top">
        <span className="nm">{c.nm}</span>
        <span className="vl">{c.vl}</span>
      </div>
      <div className="meta-line">
        <span className="priority" data-p={c.priority}>
          <Icon name={c.priority === "haute" ? "arrowUp" : c.priority === "basse" ? "arrowDown" : "minus"} className="ico-xs" />
          {c.priority}
        </span>
        <span style={{ color: "var(--text-4)" }}>·</span>
        <span>{c.tags[0]}</span>
        {c.tags.length > 1 && <span style={{ color: "var(--text-4)" }}>+{c.tags.length - 1}</span>}
      </div>
      {c.flags && c.flags.length > 0 && (
        <div className="flags-line">
          {c.flags.includes("flag-site")  && <span className="flag flag-site"><Icon name="warning" className="ico-xs" />site merdique</span>}
          {c.flags.includes("flag-old")   && <span className="flag flag-old"><Icon name="clock" className="ico-xs" />site très ancien</span>}
          {c.flags.includes("flag-later") && <span className="flag flag-later"><Icon name="calendar" className="ico-xs" />revoir plus tard</span>}
        </div>
      )}
      {c.note && (
        <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4, fontStyle: "italic", borderTop: "1px solid var(--border)", paddingTop: 5, marginTop: 2 }}>
          <Icon name="msgSquare" className="ico-xs" style={{ marginRight: 4, verticalAlign: "-2px", color: "var(--text-4)" }} />
          {c.note}
        </div>
      )}
      <div className="channels">
        <ChannelBtn name="phone" active={c.channel === "phone"} />
        <ChannelBtn name="mail" active={c.channel === "mail"} />
        <ChannelBtn name="linkedin" active={c.channel === "linkedin"} />
        <ChannelBtn name="whatsapp" active={c.channel === "whatsapp"} />
        <ChannelBtn name="globe" active={c.channel === "globe"} />
      </div>
    </div>
  );

  return (
    <div className="studio">
      <AppRail active="acq" />
      <div className="content">

        <header className="topbar">
          <WorkspacePill />
          <div className="crumbs">
            <Icon name="home2" className="ico-sm" style={{ color: "var(--text-4)" }} />
            <Icon name="chevright" className="ico-xs" />
            <span>Studio</span>
            <Icon name="chevright" className="ico-xs" />
            <span>Acquisition</span>
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">Pipeline</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher dans le pipeline…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Ajouter</button>
          </div>
        </header>

        <div className="ws-shell">
          <AcquisitionSubnav active="pipeline" />

          <div className="ws-content">
            <div className="pipe-bar">
              <div className="pipeline-pick">
                <Icon name="pipeline" className="ico ic" />
                <span>Pipeline principal</span>
                <span className="ct">38 opp.</span>
                <Icon name="chevdown" className="ico-sm chev" />
              </div>
              <div className="seg">
                <span className="s" aria-pressed="true"><Icon name="kanban" className="ico-sm" />Kanban</span>
                <span className="s"><Icon name="layoutList" className="ico-sm" />Liste</span>
                <span className="s"><Icon name="bento" className="ico-sm" />Grille</span>
                <span className="s"><Icon name="phone" className="ico-sm" />Cold call</span>
              </div>
              <span className="grow" />
              <div className="select-w">
                <span className="lb">Tri :</span>
                <span className="val">Récent</span>
                <Icon name="chevdown" className="ico-xs chev" />
              </div>
              <button className="btn ghost sm"><Icon name="filter" className="ico-sm" />Filtres</button>
              <button className="btn ghost sm"><Icon name="settings" className="ico-sm" />Étapes</button>
              <button className="btn ghost sm icon"><Icon name="chevsLR" className="ico-sm" /></button>
            </div>

            {/* Pipeline KPIs */}
            <div className="pipe-bar" style={{ paddingTop: 4 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", flex: 1 }}>
                {stages.map((s) => (
                  <div key={s.id} style={{ background: "var(--surface)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
                      {s.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, letterSpacing: "-.01em", lineHeight: 1, marginTop: 3 }}>{s.value}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{s.count} opp.</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kanban */}
            <div className="kb-pipeline">
              {stages.map((s) => {
                const stageCards = cards[s.id] || [];
                if (s.reduced) {
                  return (
                    <div key={s.id} className="kp-col reduced">
                      <div className="kp-col-hd" style={{ flexDirection: "column", padding: "10px 6px", gap: 6 }}>
                        <span className="dot" style={{ background: s.color }} />
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", marginTop: 4 }}>{s.name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: "auto" }}>{s.count}</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={s.id} className="kp-col">
                    <div className="kp-col-hd">
                      <span className="dot" style={{ background: s.color }} />
                      <span className="nm">{s.name}</span>
                      <span className="ct">{s.count}</span>
                      <span className="vl">{s.value}</span>
                      <span className="ck"><Icon name="moreV" className="ico-sm" /></span>
                    </div>
                    <div className="kp-col-bd">
                      {stageCards.map((c, i) => <Card key={i} c={c} />)}
                    </div>
                    <button className="kp-add"><Icon name="plus" className="ico-sm" />Ajouter une opp.</button>
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Connecté</span>
          <span className="sep">·</span>
          <span>pipeline principal</span>
          <span className="sep">·</span>
          <span>38 opp · 53,9 k€ · 5 étapes actives</span>
          <span className="spacer" />
          <span>auto-save synced il y a 2s</span>
        </footer>
      </div>

      <div className="callout tp" style={{ left: 700, top: 190 }}>strip KPI par étape · valeur + count en un coup d'œil</div>
      <div className="callout lt" style={{ left: 326, top: 380 }}>colonne réduite — clic pour déplier</div>
      <div className="callout rt" style={{ left: 1050, top: 380 }}>border-left = priorité · channels rapides · flags visibles</div>
    </div>
  );
}

window.StudioPipeline = StudioPipeline;
