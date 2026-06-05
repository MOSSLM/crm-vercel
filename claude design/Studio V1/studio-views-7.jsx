// studio-views-7.jsx — Opportunités (grid view + full feature set)

function StudioOpportunities() {
  const opps = [
    {
      id: 1, nm: "SARL Dumas BTP", url: "dumas-btp.com",
      stage: "Cold call", stageColor: "#eab308",
      priority: "haute", value: "2 580 €", channel: "phone",
      tags: ["rénovation","RGE"], flags: ["site_tres_ancien"],
      lm: "ready",
      note: { type: "appel", body: "Appel du 03/06 — rappeler vendredi 10h, intéressé par PAC + isolation combles. Connaît l'aide d'État.", date: "il y a 2j" },
    },
    {
      id: 2, nm: "Isolation Pro Languedoc", url: "isolationpro-lr.fr",
      stage: "RDV vente", stageColor: "#f97316",
      priority: "haute", value: "3 200 €", channel: "phone",
      tags: ["isolation","RGE"], flags: [],
      lm: "framer",
      note: { type: "email", body: "Email confirmation RDV — Mme Sylvie Roux, jeudi 5 juin 9h30 sur place.", date: "hier" },
    },
    {
      id: 3, nm: "Brossard Plomberie", url: "brossard-plomberie.fr",
      stage: "Qualifié", stageColor: "#3b82f6",
      priority: "moyenne", value: "1 290 €", channel: "linkedin",
      tags: ["plomberie","chauffage"], flags: [],
      lm: "ready",
      note: { type: "linkedin", body: "InMail envoyé · vu hier, pas de réponse encore.", date: "hier" },
    },
    {
      id: 4, nm: "Énergie Sud-Ouest", url: "energie-sudouest.fr",
      stage: "Qualifié", stageColor: "#3b82f6",
      priority: "moyenne", value: "1 290 €", channel: "phone",
      tags: ["PAC","solaire"], flags: ["site_merdique"],
      lm: "draft",
      note: null,
    },
    {
      id: 5, nm: "Groupe Tarn Énergies", url: "tarn-energies.com",
      stage: "Devis", stageColor: "#22c55e",
      priority: "haute", value: "12 800 €", channel: "mail",
      tags: ["multi-site","B2B"], flags: [],
      lm: "ready",
      note: { type: "email", body: "Devis v2 envoyé · attente retour direction. Conditions de paiement à négocier.", date: "il y a 4h" },
    },
    {
      id: 6, nm: "Cabinet Aubert", url: "aubert-cabinet.fr",
      stage: "Signature", stageColor: "#16a34a",
      priority: "haute", value: "8 400 €", channel: "phone",
      tags: ["acompte versé"], flags: [],
      lm: "ready",
      note: { type: "appel", body: "Signature confirmée, acompte 30% reçu. Démarrage chantier semaine 26.", date: "hier" },
    },
    {
      id: 7, nm: "Chauffage Vasseur", url: "",
      stage: "Cold call", stageColor: "#eab308",
      priority: "haute", value: "1 290 €", channel: "phone",
      tags: ["chauffage"], flags: ["a_revoir_plus_tard"],
      lm: "failed",
      note: { type: "appel", body: "Pas de site web — appelé 2× sans réponse. Tester WhatsApp ?", date: "il y a 3j" },
    },
    {
      id: 8, nm: "Sud Habitat Rénovation", url: "sudhabitat.fr",
      stage: "Cold call", stageColor: "#eab308",
      priority: "moyenne", value: "1 290 €", channel: "phone",
      tags: ["rénovation"], flags: [],
      lm: "draft",
      note: null,
    },
  ];

  const noteIcon = (type) => ({
    appel: "phone", email: "mail", linkedin: "linkedin", whatsapp: "whatsapp", autre: "msgSquare",
  }[type] || "msgSquare");

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
            <span className="cur">Opportunités</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher dans Opportunités…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Nouvelle opp.</button>
          </div>
        </header>

        <div className="ws-shell">
          <AcquisitionSubnav active="opportunities" />

          <div className="ws-content">
            <div className="tabs-strip">
              <div className="tab" aria-selected="true">
                <Icon name="zap" className="ico-sm" />Toutes <span className="bd">124</span>
              </div>
              <div className="tab">
                <Icon name="note" className="ico-sm" />Lead magnet draft <span className="bd">38</span>
              </div>
              <div className="tab">
                <Icon name="globe" className="ico-sm" />Framer <span className="bd">22</span>
              </div>
              <div className="tab">
                <Icon name="check" className="ico-sm" />Ready <span className="bd">52</span>
              </div>
              <div className="tab">
                <Icon name="alert" className="ico-sm" />Failed <span className="bd">12</span>
              </div>
              <span className="grow" />
              <div className="seg">
                <span className="s" aria-pressed="true"><Icon name="bento" className="ico-sm" />Grille</span>
                <span className="s"><Icon name="layoutList" className="ico-sm" />Liste</span>
                <span className="s"><Icon name="kanban" className="ico-sm" />Kanban</span>
                <span className="s"><Icon name="phone" className="ico-sm" />Cold call</span>
              </div>
            </div>

            <div className="ws-overview" style={{ padding: "16px 24px 40px" }}>

              {/* Bulk action bar (shown when items selected) */}
              <div className="bulk-bar">
                <span className="ct"><b>3</b> opportunités sélectionnées</span>
                <span style={{ width: 1, height: 18, background: "rgba(255,255,255,.15)" }} />
                <button className="b"><Icon name="pipeline" className="ico-sm" />Changer pipeline</button>
                <button className="b"><Icon name="arrowRight" className="ico-sm" />Faire avancer</button>
                <button className="b"><Icon name="zap" className="ico-sm" />Enrichir auto</button>
                <button className="b"><Icon name="send" className="ico-sm" />Lancer séquence</button>
                <span className="spacer" />
                <button className="b"><Icon name="trash" className="ico-sm" /></button>
                <button className="b x"><Icon name="x" className="ico-sm" /></button>
              </div>

              {/* Filter bar */}
              <div className="filter-bar">
                <div className="search-w">
                  <Icon name="search" className="ico-sm" />
                  <input placeholder="Rechercher entreprise, tag, note…" />
                </div>
                <div className="select-w">
                  <span className="lb">Pipeline :</span>
                  <span className="val">Principal</span>
                  <Icon name="chevdown" className="ico-xs chev" />
                </div>
                <div className="select-w">
                  <span className="lb">Étape :</span>
                  <span className="val">Toutes</span>
                  <Icon name="chevdown" className="ico-xs chev" />
                </div>
                <div className="select-w">
                  <span className="lb">Priorité :</span>
                  <span className="val">Toutes</span>
                  <Icon name="chevdown" className="ico-xs chev" />
                </div>
                <div className="select-w">
                  <span className="lb">Flag :</span>
                  <span className="val">Tous</span>
                  <Icon name="chevdown" className="ico-xs chev" />
                </div>
                <span className="grow" />
                <div className="toggle-w">
                  <span>Tri par pipeline</span>
                  <span className="switch sm" />
                </div>
                <button className="btn ghost sm"><Icon name="download" className="ico-sm" />Export</button>
              </div>

              {/* Grid */}
              <div className="opp-grid">
                {opps.map((o) => (
                  <div key={o.id} className="opp-card">
                    <span className={`lm-status ${o.lm}`} title={`Lead magnet · ${o.lm}`} />
                    <div className="hd">
                      <div className="top-line">
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                          <span className="nm">{o.nm}</span>
                          {o.url && <span className="meta">{o.url}</span>}
                        </div>
                        <span className="vl">{o.value}</span>
                      </div>
                      <div className="meta" style={{ marginTop: 6 }}>
                        <span className="stage">
                          <span className="dot" style={{ background: o.stageColor }} />
                          {o.stage}
                        </span>
                        <span style={{ color: "var(--text-4)" }}>·</span>
                        <span className="pill" style={
                          o.priority === "haute" ? { background: "var(--danger-tint)", color: "var(--danger)" }
                          : o.priority === "moyenne" ? { background: "var(--warn-tint)", color: "var(--warn)" }
                          : { background: "var(--bg-2)", color: "var(--text-3)" }
                        }>
                          <Icon name={o.priority === "haute" ? "arrowUp" : o.priority === "basse" ? "arrowDown" : "minus"} className="ico-xs" />
                          {o.priority}
                        </span>
                      </div>
                    </div>

                    <div className="bd">
                      <div className="tags">
                        {o.tags.map((t, i) => (
                          <span key={i} className="pill">{t}</span>
                        ))}
                        {o.flags.includes("site_merdique")     && <span className="pill warn"><Icon name="warning" className="ico-xs" />site merdique</span>}
                        {o.flags.includes("site_tres_ancien")  && <span className="pill magic"><Icon name="clock" className="ico-xs" />site ancien</span>}
                        {o.flags.includes("a_revoir_plus_tard")&& <span className="pill info"><Icon name="calendar" className="ico-xs" />à revoir</span>}
                      </div>

                      {o.note ? (
                        <div className="last-note">
                          <div className="h">
                            <Icon name={noteIcon(o.note.type)} className="ico-xs" />
                            {o.note.type} · {o.note.date}
                          </div>
                          {o.note.body}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "var(--text-4)", fontStyle: "italic", padding: "4px 0" }}>
                          Aucune note encore — ajouter la première
                        </div>
                      )}
                    </div>

                    <div className="ft">
                      <button className="btn outline sm icon" title="Appeler"><Icon name="phone" className="ico-sm" /></button>
                      <button className="btn outline sm icon" title="Email"><Icon name="mail" className="ico-sm" /></button>
                      <button className="btn outline sm icon" title="LinkedIn"><Icon name="linkedin" className="ico-sm" /></button>
                      {o.url && <button className="btn outline sm icon" title="Site"><Icon name="ext" className="ico-sm" /></button>}
                      <button className="btn outline sm"><Icon name="edit" className="ico-sm" />Éditer</button>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Connecté</span>
          <span className="sep">·</span>
          <span>opportunités</span>
          <span className="sep">·</span>
          <span>124 opp · 5 actions sélectionnées</span>
          <span className="spacer" />
          <span>auto-save synced</span>
        </footer>
      </div>

      <div className="callout tp" style={{ left: 700, top: 140 }}>tabs = statut lead magnet · compteurs visibles</div>
      <div className="callout lt" style={{ left: 360, top: 254 }}>bulk bar noire apparaît au-dessus du filtre · compact, actions ciblées</div>
      <div className="callout rt" style={{ left: 1080, top: 460 }}>card complète : stage + priorité + tags + flags + dernière note + 4 actions de contact</div>
    </div>
  );
}

window.StudioOpportunities = StudioOpportunities;
