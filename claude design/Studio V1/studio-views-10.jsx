// studio-views-10.jsx — Opportunity Detail page

function StudioOpportunityDetail() {
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
            <span>Opportunités</span>
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">SARL Dumas BTP</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="ext" className="ico-sm" />Site</button>
            <button className="btn primary sm"><Icon name="phone" className="ico-sm" />Appeler</button>
          </div>
        </header>

        <div className="ws-shell">
          <AcquisitionSubnav active="opportunities" />

          <div className="ws-content detail-page">

            <div className="detail-hd-bar">
              <a className="detail-back"><Icon name="chevleft" className="ico-sm" />Retour</a>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                OPP-2026-0247 · liée à <strong style={{ color: "var(--text)" }}>Audit PAC + isolation 2026</strong> · pipeline principal
              </div>
              <span className="grow" />
              <button className="btn outline sm"><Icon name="copy" className="ico-sm" />Dupliquer</button>
              <button className="btn outline sm"><Icon name="edit" className="ico-sm" />Éditer</button>
              <button className="btn outline sm icon"><Icon name="moreV" className="ico-sm" /></button>
            </div>

            <div className="detail-body">

              {/* MAIN */}
              <div className="detail-main">

                {/* Hero */}
                <div>
                  <div className="dh">
                    <div className="av">SD</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h1>SARL Dumas BTP</h1>
                      <div className="ctx">
                        <span className="it"><Icon name="mappin" className="ico-xs" />5 av. Jean Jaurès, Toulouse</span>
                        <span style={{ color: "var(--text-4)" }}>·</span>
                        <span className="it"><Icon name="globe" className="ico-xs" />dumas-btp.com</span>
                        <span style={{ color: "var(--text-4)" }}>·</span>
                        <span className="it"><Icon name="phone" className="ico-xs" />+33 5 61 23 45 67</span>
                      </div>
                    </div>
                    <div className="actions">
                      <button className="btn outline sm"><Icon name="phone" className="ico-sm" /></button>
                      <button className="btn outline sm"><Icon name="mail" className="ico-sm" /></button>
                      <button className="btn outline sm"><Icon name="linkedin" className="ico-sm" /></button>
                      <button className="btn outline sm"><Icon name="whatsapp" className="ico-sm" /></button>
                    </div>
                  </div>

                  {/* meta strip */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                    <span className="pill dot" style={{ background: "var(--danger-tint)", color: "var(--danger)" }}>
                      <Icon name="arrowUp" className="ico-xs" />priorité haute
                    </span>
                    <span className="pill">rénovation</span>
                    <span className="pill">RGE</span>
                    <span className="pill magic"><Icon name="clock" className="ico-xs" />site ancien</span>
                    <span style={{ color: "var(--text-4)" }}>·</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-3)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ok)" }} />
                      Lead magnet ready
                    </span>
                    <span style={{ color: "var(--text-4)" }}>·</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>créée le 02/06 · MAJ il y a 2h</span>
                  </div>
                </div>

                {/* Stage stepper */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Étape pipeline</div>
                  <div className="stepper">
                    <div className="step-it done"><span className="dot" />Qualifié</div>
                    <div className="step-it current"><span className="dot" />Cold call</div>
                    <div className="step-it"><span className="dot" />RDV vente</div>
                    <div className="step-it"><span className="dot" />Devis</div>
                    <div className="step-it"><span className="dot" />Signature</div>
                  </div>
                </div>

                {/* Lead magnet card */}
                <div className="card">
                  <div className="card-hd">
                    <h3>Lead magnet — page personnalisée</h3>
                    <span className="meta">prête depuis 2j</span>
                  </div>
                  <div style={{ padding: "0 18px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div className="asset-card" style={{ margin: 0 }}>
                      <div className="thumb">
                        <div className="browser">
                          <div className="dots"><i /><i /><i /></div>
                          <div className="body">
                            <div className="hh" style={{ background: "var(--accent)", width: "70%" }} />
                            <div className="ln m" />
                            <div className="ln s" />
                            <div className="row"><span className="b" /><span className="b gh" /></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
                        Page <strong>thermalis.fr/audit/dumas-btp</strong> générée pour SARL Dumas BTP. Personnalisée avec leur logo, services et 3 témoignages de clients similaires.
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: "var(--text-3)" }}>
                        <span><Icon name="eye" className="ico-xs" style={{ verticalAlign: "-2px" }} /> <b style={{ color: "var(--text)" }}>0</b> vues</span>
                        <span><Icon name="clock" className="ico-xs" style={{ verticalAlign: "-2px" }} /> non visitée</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                        <button className="btn outline sm"><Icon name="eye" className="ico-sm" />Aperçu</button>
                        <button className="btn outline sm"><Icon name="link" className="ico-sm" />Copier le lien</button>
                        <button className="btn primary sm"><Icon name="send" className="ico-sm" />Envoyer</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes timeline */}
                <div className="card">
                  <div className="card-hd">
                    <h3>Conversations & notes</h3>
                    <span className="meta">7 entrées</span>
                  </div>

                  <div className="notes-list">
                    <div className="note-it" data-k="call">
                      <span className="icw"><Icon name="phone" className="ico-sm" /></span>
                      <div>
                        <div className="meta-line">
                          <Icon name="phone" className="ico-xs" />
                          <b>Appel sortant</b>
                          <span>·</span><span>Mathieu Dumas (fils)</span>
                          <span>·</span><span>5'42"</span>
                          <span style={{ marginLeft: "auto" }}>il y a 2j · 14:32</span>
                        </div>
                        <div className="body">
                          Pas de réponse — laissé message vocal pour M. Dumas père. Mathieu (le fils) a confirmé que <i>M. Dumas père</i> est le décideur, à rappeler en début de semaine prochaine après 14h.
                        </div>
                      </div>
                    </div>

                    <div className="note-it" data-k="email">
                      <span className="icw"><Icon name="mail" className="ico-sm" /></span>
                      <div>
                        <div className="meta-line">
                          <Icon name="mail" className="ico-xs" />
                          <b>Email envoyé</b>
                          <span>·</span><span>template "Première approche PAC"</span>
                          <span>·</span><span style={{ color: "var(--ok)" }}>ouvert 2× · cliqué 0×</span>
                          <span style={{ marginLeft: "auto" }}>il y a 8j</span>
                        </div>
                        <div className="body">
                          Envoyé le mardi 28 mai à 09:00. Ouvert dans la journée + relancé via signature 4j plus tard. Pas de clic sur les CTAs — relancer par téléphone vu l'engagement email.
                        </div>
                      </div>
                    </div>

                    <div className="note-it" data-k="linkedin">
                      <span className="icw"><Icon name="linkedin" className="ico-sm" /></span>
                      <div>
                        <div className="meta-line">
                          <Icon name="linkedin" className="ico-xs" />
                          <b>InMail envoyé</b>
                          <span>·</span><span>variant B "intro RGE"</span>
                          <span style={{ marginLeft: "auto" }}>il y a 12j</span>
                        </div>
                        <div className="body">
                          Pas de réponse encore. Profil vu 3× depuis envoi — bon signal.
                        </div>
                      </div>
                    </div>

                    <div className="note-it" data-k="call">
                      <span className="icw"><Icon name="msgSquare" className="ico-sm" /></span>
                      <div>
                        <div className="meta-line">
                          <Icon name="note" className="ico-xs" />
                          <b>Note libre</b>
                          <span>·</span><span>Lucas</span>
                          <span style={{ marginLeft: "auto" }}>il y a 14j</span>
                        </div>
                        <div className="body">
                          Identifié sur Google Maps. Bonne présence locale, certifié <i>RGE QualiPAC</i> depuis 2018. Site marketing assez ancien — opportunité Framer site neuf en + de l'audit PAC.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Note composer */}
                  <div className="note-composer">
                    <div className="channel-pick">
                      <span className="b" aria-pressed="true"><Icon name="phone" className="ico-sm" />Appel</span>
                      <span className="b"><Icon name="mail" className="ico-sm" />Email</span>
                      <span className="b"><Icon name="linkedin" className="ico-sm" />LinkedIn</span>
                      <span className="b"><Icon name="whatsapp" className="ico-sm" />WhatsApp</span>
                      <span className="b"><Icon name="note" className="ico-sm" />Note libre</span>
                    </div>
                    <textarea defaultValue="Décrivez l'échange, l'objection, la prochaine étape…" />
                    <div className="ft">
                      <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                        <Icon name="attach" className="ico-xs" style={{ verticalAlign: "-2px" }} /> joindre un fichier
                      </span>
                      <span className="spacer" />
                      <button className="btn ghost sm"><Icon name="calendar" className="ico-sm" />Planifier RDV</button>
                      <button className="btn primary sm"><Icon name="check" className="ico-sm" />Ajouter au journal</button>
                    </div>
                  </div>
                </div>

              </div>

              {/* SIDE */}
              <aside className="detail-side">

                <div>
                  <div className="value-edit">
                    <span className="lb">Valeur estimée</span>
                    <span className="val">2 580 €</span>
                    <Icon name="edit" className="ico-xs" style={{ color: "var(--text-4)" }} />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Informations</div>
                  <div className="side-kv">
                    <div className="row">
                      <div className="k">Pipeline</div>
                      <div className="v">Principal</div>
                    </div>
                    <div className="row">
                      <div className="k">Offre liée</div>
                      <div className="v">Audit PAC + isolation 2026</div>
                    </div>
                    <div className="row">
                      <div className="k">Priorité</div>
                      <div className="v" style={{ color: "var(--danger)" }}>haute</div>
                    </div>
                    <div className="row">
                      <div className="k">Source lead</div>
                      <div className="v">Google Search</div>
                    </div>
                    <div className="row">
                      <div className="k">Assignée à</div>
                      <div className="v">Lucas Bernier</div>
                    </div>
                    <div className="row">
                      <div className="k">Créée</div>
                      <div className="v mono">02/06/2026</div>
                    </div>
                    <div className="row">
                      <div className="k">MAJ</div>
                      <div className="v mono">il y a 2h</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Contacts · 2</span>
                    <button className="btn ghost sm icon"><Icon name="plus" className="ico-sm" /></button>
                  </div>
                  <div className="contact-mini">
                    <div className="av">MD</div>
                    <div>
                      <div className="nm">M. Dumas (père)</div>
                      <div className="role">Dirigeant · décideur</div>
                    </div>
                    <div className="actions">
                      <span className="b"><Icon name="phone" className="ico-sm" /></span>
                      <span className="b"><Icon name="mail" className="ico-sm" /></span>
                    </div>
                  </div>
                  <div className="contact-mini">
                    <div className="av alt">MD</div>
                    <div>
                      <div className="nm">Mathieu Dumas</div>
                      <div className="role">Chargé d'affaires · fils</div>
                    </div>
                    <div className="actions">
                      <span className="b"><Icon name="phone" className="ico-sm" /></span>
                      <span className="b"><Icon name="linkedin" className="ico-sm" /></span>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Séquence active</div>
                  <div style={{ padding: 12, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>Relance devis J+7</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, fontFamily: "var(--font-mono)" }}>étape 3 / 6 · email + SMS</div>
                    <div className="seq-dots" style={{ marginTop: 8 }}>
                      <span className="d done" />
                      <span className="d done" />
                      <span className="d cur" />
                      <span className="d" />
                      <span className="d" />
                      <span className="d" />
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>RDV à venir</div>
                  <div style={{ padding: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon name="calendar" className="ico-sm" style={{ color: "var(--accent)" }} />
                      <div style={{ fontWeight: 500 }}>Audit terrain</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                      jeu. 12 juin · 14:30 · 1h30
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Zone danger</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button className="btn outline sm" style={{ justifyContent: "flex-start", color: "var(--text-2)" }}>
                      <Icon name="eyeOff" className="ico-sm" />Masquer cette opp.
                    </button>
                    <button className="btn outline sm" style={{ justifyContent: "flex-start", color: "var(--danger)", borderColor: "rgba(181,50,47,.2)" }}>
                      <Icon name="trash" className="ico-sm" />Supprimer définitivement
                    </button>
                  </div>
                </div>

              </aside>

            </div>

          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Connecté</span>
          <span className="sep">·</span>
          <span>opp · OPP-2026-0247</span>
          <span className="sep">·</span>
          <span>SARL Dumas BTP · 2 580 €</span>
          <span className="spacer" />
          <span>auto-save synced</span>
        </footer>
      </div>

      <div className="callout tp" style={{ left: 760, top: 250 }}>stepper visuel · 1 clic pour faire avancer</div>
      <div className="callout rt" style={{ left: 1080, top: 540 }}>composer note multi-channel · pas besoin de modal</div>
    </div>
  );
}

window.StudioOpportunityDetail = StudioOpportunityDetail;
