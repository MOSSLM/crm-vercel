// studio-views-9.jsx — Démarchage (file du jour avec script) + Opportunity Detail

// ───── ARTBOARD: Démarchage — file du jour avec script ─────
function StudioDemarchage() {
  const queue = [
    { id: 1, sel: false, k: "call",     who: "Mathieu Dumas",    role: "Dirigeant · SARL Dumas BTP",    tm: "09:45", overdue: false },
    { id: 2, sel: true,  k: "linkedin", who: "Inès Vandamme",    role: "Architecte · Solvert Aménag.",  tm: "10:30", overdue: false, current: true },
    { id: 3, sel: false, k: "call",     who: "Sylvie Roux",       role: "Gérante · Isolation Pro LR",    tm: "11:00", overdue: false },
    { id: 4, sel: false, k: "email",    who: "Pierre Brossard",   role: "Plombier · Brossard Chauf.",    tm: "11:30", overdue: false },
    { id: 5, sel: false, k: "whatsapp", who: "Hugo Pinault",      role: "Resp. dév. · ES49",             tm: "14:00", overdue: false },
    { id: 6, sel: false, k: "call",     who: "Anne Leclerc",      role: "Achat · NextHabitat",           tm: "14:30", overdue: false },
    { id: 7, sel: false, k: "call",     who: "Élise Garnier",     role: "Gérante · Climatech LR",        tm: "15:30", overdue: false },
    { id: 8, sel: false, k: "linkedin", who: "Aïcha Boukerma",    role: "Dév. · Eco-Bât 35",             tm: "16:00", overdue: false },
    { id: 9, sel: false, k: "call",     who: "Vincent Aubry",     role: "PDG · Aubry Construction",      tm: "hier 17h", overdue: true },
    { id: 10, sel: false, k: "email",   who: "Yoann Plantier",    role: "Co-fondateur · Solaire Expert", tm: "hier 16h", overdue: true },
  ];

  const tabs = [
    { id: "today", l: "Aujourd'hui", n: 10, on: true },
    { id: "over",  l: "Retard",      n:  2 },
    { id: "week",  l: "Cette sem.",  n: 28 },
    { id: "skip",  l: "Reportés",    n:  4 },
  ];

  const ChannelIcon = (k) => k === "call" ? "phone" : k === "email" ? "mail" : k === "whatsapp" ? "whatsapp" : "linkedin";
  const channelColor = (k) => k === "call" ? "warn" : k === "email" ? "info" : k === "whatsapp" ? "ok" : "magic";

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
            <span className="cur">Démarchage</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher contact, scénario, séquence…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn primary sm"><Icon name="play" className="ico-sm" />Démarrer la file</button>
          </div>
        </header>

        <div className="ws-shell">
          <AcquisitionSubnav active="demarchage" />

          <div className="ws-content">
            <div className="tabs-strip">
              <div className="tab" aria-selected="true"><Icon name="target" className="ico-sm" />File du jour <span className="bd">10</span></div>
              <div className="tab"><Icon name="alert" className="ico-sm" />Retard <span className="bd">2</span></div>
              <div className="tab"><Icon name="calendar" className="ico-sm" />Cette semaine <span className="bd">28</span></div>
              <div className="tab"><Icon name="clock" className="ico-sm" />Reportés <span className="bd">4</span></div>
              <span className="grow" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                <Icon name="zap" className="ico-sm" style={{ color: "var(--accent)" }} />
                <span>Focus · traitez 1 contact à la fois</span>
              </div>
              <button className="btn ghost sm icon"><Icon name="settings" className="ico-sm" /></button>
            </div>

            <div className="ws-3col">

              {/* LEFT — Queue */}
              <aside className="ws-col-left">
                <div className="ws-col-hd">
                  <div className="ttl"><Icon name="layoutList" className="ico-xs" />File · 10 contacts</div>
                  <div className="sub">routée par séquences + score · règle 70/20/10 (call/email/social)</div>
                </div>
                <div className="ws-col-body">
                  {queue.map((t) => {
                    const initials = t.who.split(" ").map(w => w[0]).join("").slice(0, 2);
                    return (
                      <div key={t.id} className="cc-co-row" aria-selected={t.current ? "true" : "false"} style={{ gridTemplateColumns: "32px 1fr auto" }}>
                        <div className="contact-mini" style={{ padding: 0, background: "transparent", border: 0, gridTemplateColumns: "32px 0 0", margin: 0, height: 32 }}>
                          <div className="av" style={{ background: t.overdue ? "var(--danger)" : "var(--text)" }}>{initials}</div>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="nm">{t.who}</div>
                          <div className="det">{t.role}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <span className={`pill ${channelColor(t.k)} dot`} style={{ height: 20, padding: "0 6px" }}>
                            <Icon name={ChannelIcon(t.k)} className="ico-xs" />
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: t.overdue ? "var(--danger)" : "var(--text-4)" }}>{t.tm}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>

              {/* MAIN — Current contact + script */}
              <div className="ws-col-main">
                <div className="cc-main">

                  <div className="cc-hero">
                    <div className="hd-row">
                      <div className="av" style={{ background: "var(--magic)" }}>IV</div>
                      <div>
                        <h2>Inès Vandamme</h2>
                        <div className="role">Architecte associée · Solvert Aménagement · Vannes</div>
                      </div>
                      <div className="actions">
                        <button className="btn outline sm"><Icon name="linkedin" className="ico-sm" />Profil</button>
                        <button className="btn outline sm"><Icon name="user" className="ico-sm" />Fiche</button>
                        <button className="btn outline sm icon"><Icon name="moreV" className="ico-sm" /></button>
                      </div>
                    </div>

                    <div className="cc-quickfacts">
                      <div className="cc-quickfact">
                        <div className="k">Source</div>
                        <div className="v">LinkedIn · 2nd degré</div>
                      </div>
                      <div className="cc-quickfact">
                        <div className="k">Séquence</div>
                        <div className="v">Nurturing PME · J+14</div>
                      </div>
                      <div className="cc-quickfact">
                        <div className="k">Score</div>
                        <div className="v" style={{ color: "var(--warn)" }}>tiède · 54</div>
                      </div>
                      <div className="cc-quickfact">
                        <div className="k">Dernier contact</div>
                        <div className="v">il y a 4j · vue profil</div>
                      </div>
                    </div>
                  </div>

                  {/* Script card */}
                  <div className="dem-script">
                    <div className="h">
                      <h3>Script — InMail "intro PME"</h3>
                      <span className="meta">
                        <Icon name="branch" className="ico-xs" />variant B · taux réponse 32%
                      </span>
                    </div>
                    <div className="sb">Variables auto-remplies depuis le CRM · personnalisez avant envoi.</div>

                    <div className="scr">
                      <p>Bonjour <span className="var">{`{prenom}`}</span>,</p>
                      <p>J'ai vu que <span className="var">{`{entreprise}`}</span> a livré récemment plusieurs projets éco-rénovation autour de Vannes — bravo pour le travail sur la résidence Kerlann.</p>
                      <p>On accompagne aujourd'hui des cabinets d'architectes comme le vôtre à <strong>déléguer l'audit énergétique pré-projet</strong> à notre équipe RGE. Résultat : devis + dossier MaPrimeRénov' prêts en 48h, sans charge interne.</p>
                      <p>Est-ce que ça pourrait vous intéresser de jeter un œil ? J'ai 15 min jeudi à <span className="var">{`{creneau}`}</span>.</p>
                    </div>

                    <div className="dem-obj">
                      <div className="ob">
                        <div className="ttl">"On a déjà un BE partenaire"</div>
                        <div className="ans">Réponse : "Parfait — l'idée n'est pas de remplacer mais d'absorber les overflow projets. On peut tester sur 1 dossier sans engagement."</div>
                      </div>
                      <div className="ob">
                        <div className="ttl">"Pas le temps en ce moment"</div>
                        <div className="ans">Réponse : "Justement, c'est pour ça qu'on existe. 15 min jeudi pour vous montrer le process — vous décidez après."</div>
                      </div>
                      <div className="ob">
                        <div className="ttl">"Trop cher pour mes clients"</div>
                        <div className="ans">Réponse : "L'audit est financé par MaPrimeRénov' jusqu'à 1100€. On peut faire le calcul ensemble sur un de vos projets."</div>
                      </div>
                      <div className="ob">
                        <div className="ttl">"Envoyez-moi un mail"</div>
                        <div className="ans">Réponse : "Avec plaisir — je vous envoie ça après l'appel. Vous préférez un cas concret ou notre brochure courte ?"</div>
                      </div>
                    </div>
                  </div>

                  {/* Sticky CTA bar */}
                  <div className="dem-cta">
                    <div className="outcome-row">
                      <span className="out ok"><Icon name="check" className="ico-sm" />RDV pris</span>
                      <span className="out"><Icon name="clock" className="ico-sm" />À rappeler</span>
                      <span className="out warn"><Icon name="branch" className="ico-sm" />Objection</span>
                      <span className="out danger"><Icon name="x" className="ico-sm" />Pas intéressé</span>
                    </div>
                    <span style={{ width: 1, height: 24, background: "var(--border)" }} />
                    <button className="btn outline sm"><Icon name="note" className="ico-sm" />Note libre</button>
                    <button className="btn primary sm"><Icon name="arrowRight" className="ico-sm" />Suivant</button>
                  </div>
                </div>
              </div>

              {/* RIGHT — Sequence + history */}
              <aside className="ws-col-right">
                <div className="cc-block">
                  <h4><Icon name="flow" className="ico-xs" />Séquence · Nurturing PME</h4>
                  <div className="seq-dots" style={{ marginBottom: 12 }}>
                    <span className="d done" />
                    <span className="d done" />
                    <span className="d done" />
                    <span className="d cur" />
                    <span className="d" />
                    <span className="d" />
                    <span className="d" />
                  </div>
                  <div className="seq-step done">
                    <span className="ic"><Icon name="linkedin" className="ico-xs" /></span>
                    <span>1. Connexion LinkedIn</span>
                    <span className="tm">J+0</span>
                  </div>
                  <div className="seq-step done">
                    <span className="ic"><Icon name="check" className="ico-xs" /></span>
                    <span>2. Acceptée · vue profil 3×</span>
                    <span className="tm">J+2</span>
                  </div>
                  <div className="seq-step done">
                    <span className="ic"><Icon name="mail" className="ico-xs" /></span>
                    <span>3. Email "ressource gratuite"</span>
                    <span className="tm">J+7</span>
                  </div>
                  <div className="seq-step cur">
                    <span className="ic"><Icon name="linkedin" className="ico-xs" /></span>
                    <span>4. InMail intro PME</span>
                    <span className="tm">aujourd'hui</span>
                  </div>
                  <div className="seq-step">
                    <span className="ic"><Icon name="phone" className="ico-xs" /></span>
                    <span>5. Cold call si réponse</span>
                    <span className="tm">J+18</span>
                  </div>
                  <div className="seq-step">
                    <span className="ic"><Icon name="mail" className="ico-xs" /></span>
                    <span>6. Email relance courte</span>
                    <span className="tm">J+22</span>
                  </div>
                  <div className="seq-step">
                    <span className="ic"><Icon name="branch" className="ico-xs" /></span>
                    <span>7. Bifurcation auto</span>
                    <span className="tm">J+25</span>
                  </div>
                </div>

                <div className="cc-block">
                  <h4><Icon name="clock" className="ico-xs" />Historique court</h4>
                  <div className="cc-hist-row">
                    <span className="icw" style={{ background: "var(--info-tint)", color: "var(--info)" }}><Icon name="linkedin" className="ico-sm" /></span>
                    <div>
                      <div className="ttl">A vu votre profil</div>
                      <div className="det">3× cette semaine — signal de chaleur</div>
                    </div>
                    <div className="dt">il y a 4j</div>
                  </div>
                  <div className="cc-hist-row">
                    <span className="icw" style={{ background: "var(--action-tint)", color: "var(--action)" }}><Icon name="mail" className="ico-sm" /></span>
                    <div>
                      <div className="ttl">Email ouvert 2×</div>
                      <div className="det">Ressource "Guide audit énergétique"</div>
                    </div>
                    <div className="dt">il y a 7j</div>
                  </div>
                  <div className="cc-hist-row">
                    <span className="icw" style={{ background: "var(--info-tint)", color: "var(--info)" }}><Icon name="linkedin" className="ico-sm" /></span>
                    <div>
                      <div className="ttl">Connexion LinkedIn acceptée</div>
                      <div className="det">en 4h — bon signal</div>
                    </div>
                    <div className="dt">il y a 12j</div>
                  </div>
                </div>

                <div className="cc-block" style={{ borderBottom: 0 }}>
                  <h4><Icon name="info" className="ico-xs" />Contexte entreprise</h4>
                  <div className="side-kv">
                    <div className="row">
                      <div className="k">Taille</div>
                      <div className="v">8 salariés</div>
                    </div>
                    <div className="row">
                      <div className="k">CA estimé</div>
                      <div className="v">920 k€</div>
                    </div>
                    <div className="row">
                      <div className="k">Spécialité</div>
                      <div className="v">éco-rénovation PME</div>
                    </div>
                    <div className="row">
                      <div className="k">Projets type</div>
                      <div className="v">résidentiel + petit tertiaire</div>
                    </div>
                    <div className="row">
                      <div className="k">RGE</div>
                      <div className="v" style={{ color: "var(--ok)" }}>QualiPV + QualiPAC</div>
                    </div>
                  </div>
                </div>
              </aside>

            </div>

          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Mode focus · démarchage</span>
          <span className="sep">·</span>
          <span>file du jour 2/10 traités</span>
          <span className="sep">·</span>
          <span>séquence Nurturing PME · J+14</span>
          <span className="spacer" />
          <span>auto-save</span>
        </footer>
      </div>

      <div className="callout lt" style={{ left: 372, top: 230 }}>file routée par séquence + score · 70/20/10 channels</div>
      <div className="callout tp" style={{ left: 750, top: 410 }}>script + variables CRM + 4 objections pré-écrites = jamais perdu</div>
      <div className="callout rt" style={{ left: 1100, top: 230 }}>séquence visible · sait où on est dans le scénario</div>
    </div>
  );
}

window.StudioDemarchage = StudioDemarchage;
