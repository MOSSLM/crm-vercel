// studio-views-8.jsx — Cold Call workspace + Démarchage (file du jour) + Opportunity Detail

// ───── ARTBOARD: Cold Call workspace (focus mode) ─────
function StudioColdCall() {
  const companies = [
    { id: 1, sel: false, nm: "Brossard Plomberie Chauffage", ville: "Carcassonne", stage: "Qualifié",   stageColor: "#3b82f6", opps: 2, tags: ["plomberie"] },
    { id: 2, sel: true,  nm: "SARL Dumas BTP",                ville: "Toulouse",    stage: "Cold call",  stageColor: "#eab308", opps: 1, tags: ["rénovation","RGE"] },
    { id: 3, sel: false, nm: "Énergie Sud-Ouest",             ville: "Albi",        stage: "Qualifié",   stageColor: "#3b82f6", opps: 1, tags: ["PAC","solaire"] },
    { id: 4, sel: false, nm: "Isolation Pro Languedoc",       ville: "Béziers",     stage: "RDV vente",  stageColor: "#f97316", opps: 1, tags: ["isolation"] },
    { id: 5, sel: false, nm: "Climatech Languedoc",           ville: "Lézignan",    stage: "Cold call",  stageColor: "#eab308", opps: 1, tags: ["clim"] },
    { id: 6, sel: false, nm: "Bati Solutions Méditerranée",   ville: "Narbonne",    stage: "Qualifié",   stageColor: "#3b82f6", opps: 1, tags: ["BTP"] },
    { id: 7, sel: false, nm: "Sud Habitat Rénovation",        ville: "Perpignan",   stage: "Cold call",  stageColor: "#eab308", opps: 1, tags: ["rénovation"] },
    { id: 8, sel: false, nm: "Groupe Tarn Énergies",          ville: "Albi",        stage: "Devis",      stageColor: "#22c55e", opps: 1, tags: ["multi-site","B2B"] },
  ];

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
            <span>Pipeline</span>
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">Cold call workspace</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher dans la file…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn primary sm"><Icon name="phone" className="ico-sm" />Lancer la session</button>
          </div>
        </header>

        <div className="ws-shell">
          <AcquisitionSubnav active="pipeline" />

          <div className="ws-content">
            <div className="tabs-strip">
              <div className="tab"><Icon name="kanban" className="ico-sm" />Kanban</div>
              <div className="tab"><Icon name="layoutList" className="ico-sm" />Liste</div>
              <div className="tab"><Icon name="bento" className="ico-sm" />Grille</div>
              <div className="tab" aria-selected="true"><Icon name="phone" className="ico-sm" />Cold call <span className="bd">42</span></div>
              <span className="grow" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                <Icon name="zap" className="ico-sm" style={{ color: "var(--accent)" }} />
                <span>Focus · 1 entreprise à la fois</span>
              </div>
              <button className="btn ghost sm icon"><Icon name="settings" className="ico-sm" /></button>
            </div>

            <div className="ws-3col">

              {/* LEFT — Companies queue */}
              <aside className="ws-col-left">
                <div className="ws-col-hd">
                  <div className="ttl"><Icon name="building" className="ico-xs" />Entreprises qualifiées · 42</div>
                  <div className="sub">filtrées + masquables. Cliquer pour basculer.</div>
                </div>

                <div className="cc-filters">
                  <div className="search-w-mini">
                    <Icon name="search" className="ico-sm" />
                    <input placeholder="Filtrer la file…" />
                  </div>
                  <div className="row">
                    <div className="sel"><span>Étape : toutes</span><Icon name="chevdown" className="ico-xs chev" /></div>
                    <div className="sel"><span>Tag : tous</span><Icon name="chevdown" className="ico-xs chev" /></div>
                  </div>
                  <div className="row">
                    <div className="sel"><span>Flag : tous</span><Icon name="chevdown" className="ico-xs chev" /></div>
                    <div className="sel"><span>Service : tous</span><Icon name="chevdown" className="ico-xs chev" /></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-2)" }}>
                    <span className="switch sm" />
                    <span>Afficher les masquées</span>
                  </div>
                </div>

                <div className="ws-col-body">
                  {companies.map((c) => (
                    <div key={c.id} className="cc-co-row" aria-selected={c.sel ? "true" : "false"}>
                      <div>
                        <div className="nm">{c.nm}</div>
                        <div className="det">
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Icon name="mappin" className="ico-xs" />
                            {c.ville}
                          </span>
                          <span style={{ color: "var(--text-4)", margin: "0 6px" }}>·</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.stageColor }} />
                            {c.stage}
                          </span>
                        </div>
                        <div className="meta-row">
                          <span className="pill">{c.opps} opp.</span>
                          {c.tags.slice(0, 2).map((t, i) => <span key={i} className="pill">{t}</span>)}
                        </div>
                      </div>
                      <span className="hide-btn"><Icon name="eyeOff" className="ico-sm" /></span>
                    </div>
                  ))}
                </div>
              </aside>

              {/* MAIN — Cold call mode */}
              <div className="ws-col-main">
                <div className="cc-main">
                  <div className="cc-hero">
                    <div className="hd-row">
                      <div className="av">SD</div>
                      <div>
                        <h2>SARL Dumas BTP</h2>
                        <div className="role">5 avenue Jean Jaurès, Toulouse · 2 contacts · 1 opportunité</div>
                      </div>
                      <div className="actions">
                        <button className="btn outline sm"><Icon name="phone" className="ico-sm" />Appeler</button>
                        <button className="btn outline sm"><Icon name="ext" className="ico-sm" />Fiche</button>
                        <button className="btn outline sm icon"><Icon name="moreV" className="ico-sm" /></button>
                      </div>
                    </div>

                    <div className="summary">
                      <div className="h"><Icon name="zap" className="ico-xs" />RÉSUMÉ IA · auto-enrichi</div>
                      Entreprise familiale de rénovation BTP active depuis 2008 sur le Tarn et la Haute-Garonne. 14 salariés, 1.8 M€ CA estimé, focalisée sur l'éco-rénovation pour particuliers. Site marketing assez ancien (2019) mais bien positionné SEO sur "rénovation Toulouse". RGE QualiPAC active.
                    </div>

                    <div className="cc-quickfacts">
                      <div className="cc-quickfact">
                        <div className="k">Score chaleur</div>
                        <div className="v" style={{ color: "var(--ok)" }}>chaud · 87</div>
                      </div>
                      <div className="cc-quickfact">
                        <div className="k">Étape</div>
                        <div className="v">Cold call</div>
                      </div>
                      <div className="cc-quickfact">
                        <div className="k">Avis Google</div>
                        <div className="v">★ 4.8 — 124 avis</div>
                      </div>
                      <div className="cc-quickfact">
                        <div className="k">Dernière interaction</div>
                        <div className="v">il y a 2j · appel</div>
                      </div>
                    </div>
                  </div>

                  {/* Call note form */}
                  <div className="cc-note-card">
                    <h3>Note d'appel structurée</h3>

                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Résultat de l'appel</div>
                    <div className="cc-outcome-row">
                      <span className="cc-outcome ok" aria-pressed="true"><Icon name="check" className="ico-sm" />Intéressé</span>
                      <span className="cc-outcome warn"><Icon name="clock" className="ico-sm" />À rappeler</span>
                      <span className="cc-outcome danger"><Icon name="x" className="ico-sm" />Pas intéressé</span>
                      <span className="cc-outcome"><Icon name="phone" className="ico-sm" />Pas de réponse</span>
                    </div>

                    <div className="cc-form" style={{ marginTop: 16 }}>
                      <div className="field full">
                        <label>Ce qu'a dit le client</label>
                        <textarea className="textarea" rows="3" defaultValue="A confirmé être en réflexion sur l'éco-rénovation pour ses clients. Connaît l'aide d'État 2026, ouvert à recevoir un audit gratuit. Disponibilités jeudi/vendredi matin." />
                      </div>
                      <div className="field full">
                        <label>Points à retenir · objections · next step</label>
                        <textarea className="textarea" rows="3" defaultValue="Objection prix : 1290€ semble OK car remboursé par dossier. Next : envoyer doc commercial + planifier audit terrain semaine prochaine. M. Dumas père est le décideur final." />
                      </div>
                      <div className="field">
                        <label>Rappel prévu</label>
                        <div className="input">📅 vendredi 6 juin · 10:00</div>
                      </div>
                      <div className="field">
                        <label>Nouveau RDV</label>
                        <div className="input">📅 jeudi 12 juin · 14:30 · audit terrain</div>
                      </div>
                    </div>

                    <div className="cc-form-ft">
                      <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                        <Icon name="zap" className="ico-xs" style={{ marginRight: 4, verticalAlign: "-2px", color: "var(--accent)" }} />
                        Crée automatiquement entrée journal + tâche calendar
                      </span>
                      <span className="spacer" />
                      <button className="btn ghost sm">Annuler</button>
                      <button className="btn primary sm"><Icon name="check" className="ico-sm" />Enregistrer la note</button>
                    </div>
                  </div>

                  {/* History */}
                  <div className="cc-history">
                    <h3>Historique récent</h3>
                    <div className="cc-hist-row">
                      <span className="icw call"><Icon name="phone" className="ico-sm" /></span>
                      <div>
                        <div className="ttl">Appel sortant · pas de réponse</div>
                        <div className="det">Tentative 2/3 — laissé message vocal pour M. Dumas</div>
                      </div>
                      <div className="dt">il y a 2j · 14:32</div>
                    </div>
                    <div className="cc-hist-row">
                      <span className="icw call"><Icon name="phone" className="ico-sm" /></span>
                      <div>
                        <div className="ttl">Appel — Mathieu Dumas (fils)</div>
                        <div className="det">"Mon père s'en occupe, rappelez en début de semaine prochaine"</div>
                      </div>
                      <div className="dt">il y a 5j · 11:15</div>
                    </div>
                    <div className="cc-hist-row">
                      <span className="icw rdv"><Icon name="mail" className="ico-sm" /></span>
                      <div>
                        <div className="ttl">Email envoyé · template "Première approche PAC"</div>
                        <div className="det">Ouvert 2x, pas de clic. Note: relancer par téléphone vu l'engagement.</div>
                      </div>
                      <div className="dt">il y a 8j · 09:00</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT — KPIs / Quick links / AI meta */}
              <aside className="ws-col-right">
                <div className="cc-block">
                  <h4><Icon name="target" className="ico-xs" />KPIs conversion · 30j</h4>
                  <div className="cc-kpi-row"><span>% conversations décideur</span><span className="val">64<small style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 400, marginLeft: 2 }}>%</small></span></div>
                  <div className="cc-kpi-row"><span>% RDV / conversations</span><span className="val ok">38<small style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 400, marginLeft: 2 }}>%</small></span></div>
                  <div className="cc-kpi-row"><span>% show-up RDV</span><span className="val ok">82<small style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 400, marginLeft: 2 }}>%</small></span></div>
                  <div className="cc-kpi-row"><span>% devis sous 48h</span><span className="val">71<small style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 400, marginLeft: 2 }}>%</small></span></div>
                  <div className="cc-kpi-row"><span>% signés</span><span className="val ok">22<small style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontWeight: 400, marginLeft: 2 }}>%</small></span></div>
                </div>

                <div className="cc-block">
                  <h4><Icon name="link" className="ico-xs" />Accès rapide</h4>
                  <a className="cc-link"><span className="label"><Icon name="globe" className="ico-sm" />Site web</span><span className="ext"><Icon name="ext" className="ico-sm" /></span></a>
                  <a className="cc-link"><span className="label"><Icon name="mappin" className="ico-sm" />Google Maps</span><span className="ext"><Icon name="ext" className="ico-sm" /></span></a>
                  <a className="cc-link"><span className="label"><Icon name="search" className="ico-sm" />Google search</span><span className="ext"><Icon name="ext" className="ico-sm" /></span></a>
                  <a className="cc-link"><span className="label"><Icon name="mail" className="ico-sm" />Page contact</span><span className="ext"><Icon name="ext" className="ico-sm" /></span></a>
                  <a className="cc-link"><span className="label"><Icon name="linkedin" className="ico-sm" />LinkedIn</span><span className="ext"><Icon name="ext" className="ico-sm" /></span></a>
                  <div className="cc-link" style={{ borderColor: "var(--warn-tint)" }}>
                    <span className="label">⭐ Note Google</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>4.8 · 124 avis</span>
                  </div>
                </div>

                <div className="cc-block">
                  <h4><Icon name="zap" className="ico-xs" />AI meta · différenciateurs</h4>
                  <div className="cc-ai-list">
                    <div className="cc-ai-item">Certifié RGE QualiPAC depuis 2018 — peu de concurrents locaux</div>
                    <div className="cc-ai-item">Spécialiste éco-rénovation maisons anciennes &lt;1948</div>
                    <div className="cc-ai-item">Équipe interne (pas de sous-traitance) — argument confiance</div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6 }}>PROOF POINTS</div>
                    <div className="cc-proof">
                      <div className="claim">"170 chantiers livrés en 2025"</div>
                      <div className="evidence">cité dans la page À propos</div>
                      <a><Icon name="ext" className="ico-xs" />dumas-btp.com/about</a>
                    </div>
                    <div className="cc-proof">
                      <div className="claim">"Économie moyenne -42% sur facture énergie"</div>
                      <div className="evidence">3 témoignages clients chiffrés</div>
                      <a><Icon name="ext" className="ico-xs" />dumas-btp.com/realisations</a>
                    </div>
                  </div>
                </div>

                <div className="cc-block" style={{ borderBottom: 0 }}>
                  <h4><Icon name="check" className="ico-xs" />Services détectés</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    <span className="pill">rénovation</span>
                    <span className="pill">PAC air-eau</span>
                    <span className="pill">isolation combles</span>
                    <span className="pill">menuiserie</span>
                    <span className="pill">RGE</span>
                    <span className="pill">aide d'État</span>
                  </div>
                </div>
              </aside>

            </div>

          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Mode focus · cold call</span>
          <span className="sep">·</span>
          <span>42 entreprises dans la file</span>
          <span className="sep">·</span>
          <span>session active depuis 23 min · 6 appels passés</span>
          <span className="spacer" />
          <span>auto-save · journal synced</span>
        </footer>
      </div>

      <div className="callout lt" style={{ left: 372, top: 250 }}>filtres compacts intégrés dans la sidebar de file</div>
      <div className="callout tp" style={{ left: 760, top: 250 }}>résumé IA + quickfacts en hero — tout le contexte en 1 écran</div>
      <div className="callout rt" style={{ left: 1100, top: 250 }}>KPIs perso + proof points = munition d'appel à portée de main</div>
    </div>
  );
}

window.StudioColdCall = StudioColdCall;
