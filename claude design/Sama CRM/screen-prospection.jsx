// screen-prospection.jsx
function ScreenProspection() {
  const queue = [
    { id: "t1",  k: "call",     who: "Julien Berthet",   role: "Dirigeant · Berthet & Fils",     tm: "10:30",   overdue: false },
    { id: "t2",  k: "linkedin", who: "Inès Vandamme",    role: "Architecte · Solvert Aménag.",  tm: "11:00",   overdue: false, current: true },
    { id: "t3",  k: "call",     who: "Romain Foucault",  role: "Chargé d'aff. · Mayenne Toiture", tm: "11:30", overdue: false },
    { id: "t4",  k: "email",    who: "Marion Tessier",   role: "Co-dirigeante · VHD",            tm: "14:00",   overdue: false },
    { id: "t5",  k: "whatsapp", who: "Hugo Pinault",     role: "Resp. dév. · ES49",              tm: "14:30",   overdue: false },
    { id: "t6",  k: "call",     who: "Mathieu Albert",   role: "Chargé d'études · Eco-Quanta",   tm: "15:00",   overdue: false },
    { id: "t7",  k: "call",     who: "Élise Garnier",    role: "Acheteuse · NextHabitat",        tm: "16:00",   overdue: false },
    { id: "t8",  k: "email",    who: "Yoann Plantier",   role: "Co-fondateur · SolaireExpert",   tm: "17:00",   overdue: false },
    { id: "t9",  k: "call",     who: "Vincent Aubry",    role: "PDG · Aubry Construction",       tm: "hier 17h", overdue: true },
    { id: "t10", k: "linkedin", who: "Aïcha Boukerma",   role: "Resp. dév. · Eco-Bât 35",        tm: "hier 16h", overdue: true },
  ];
  const [sel, setSel] = React.useState("t2");

  const tabs = [
    { id: "today", l: "Aujourd'hui", n: 10 },
    { id: "over",  l: "Retard",      n: 2 },
    { id: "week",  l: "Cette sem.",  n: 28 },
    { id: "skip",  l: "Reportés",    n: 4 },
  ];

  return (
    <div className="pros-3col">
      {/* LEFT — Queue */}
      <aside className="pros-left">
        <div className="pros-tabs-bar">
          {tabs.map((t, i) => (
            <button key={t.id} className="pros-tab" aria-selected={i === 0}>
              {t.l}<span className="nb">{t.n}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, alignItems: "center" }}>
          <Icon name="zap" className="ico-sm" style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1, fontSize: 11.5, color: "var(--text-2)" }}>
            Mode <strong>Focus</strong> — files traitée 1 par 1
          </div>
          <button className="btn xs ghost icon"><Icon name="settings" className="ico-sm" /></button>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {queue.map(t => (
            <div
              key={t.id}
              className="pros-q-row"
              data-k={t.k}
              data-overdue={t.overdue}
              aria-selected={t.id === sel}
              onClick={() => setSel(t.id)}
            >
              <div className="av">{t.who.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{t.who}</div>
                <div className="sb">{t.role}</div>
              </div>
              <div>
                <div className="kind">
                  <Icon
                    name={t.k === "call" ? "phone" : t.k === "email" ? "mail" : t.k === "whatsapp" ? "whatsapp" : "linkedin"}
                    className="ico-sm"
                  />
                </div>
                <div className="tm">{t.tm}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main className="pros-main">
        <div className="pros-hero">
          <div className="top">
            <div className="av">IV</div>
            <div>
              <h2>Inès Vandamme</h2>
              <div className="role">Architecte associée · Solvert Aménagement · Vannes</div>
            </div>
            <div className="actions">
              <button className="btn outline sm"><Icon name="ext" className="ico-sm" />LinkedIn</button>
              <button className="btn outline sm"><Icon name="user" className="ico-sm" />Fiche</button>
              <button className="btn outline sm icon"><Icon name="moreV" className="ico-sm" /></button>
            </div>
          </div>

          <div className="quickfacts">
            <div className="quickfact">
              <div className="k">Source</div>
              <div className="v">LinkedIn — 2nd degree</div>
            </div>
            <div className="quickfact">
              <div className="k">Séquence</div>
              <div className="v">Nurturing PME · J+14</div>
            </div>
            <div className="quickfact">
              <div className="k">Score</div>
              <div className="v"><Pill kind="warn" dot>tiède · 54</Pill></div>
            </div>
            <div className="quickfact">
              <div className="k">Dernière action</div>
              <div className="v">Email J+7 · ouvert ×2</div>
            </div>
          </div>
        </div>

        {/* Script */}
        <div className="script-card">
          <h3>Message à envoyer · LinkedIn</h3>
          <div className="sb">Connexion + premier message · variante "ref. commune Lucas"</div>
          <div className="scr">
            <p>
              Bonjour <span className="var">{`{{prenom}}`}</span>, j'ai vu votre projet de réhabilitation à
              Vannes — superbe travail sur la gestion thermique passive.
            </p>
            <p>
              Je travaille avec <span className="var">{`{{ref_commune}}`}</span> chez VHD sur leur bouquet
              rénovation. On a aidé 12 cabinets d'archi à structurer leur partie énergie : <strong>devis,
              aides, calculs RT</strong> en une seule plateforme.
            </p>
            <p>
              Ça vaut un café (visio 15 min) pour voir si on peut s'entraider ?<br />
              Belle journée — Lucas
            </p>
          </div>

          <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Objections probables
          </div>
          <div className="obj">
            <div className="ob">
              <div className="ttl">« On a déjà un BE partenaire »</div>
              <div className="ans">Justement — on ne remplace pas le BE, on outille leur partie comm/devis pour vous éviter d'attendre 3 semaines un retour.</div>
            </div>
            <div className="ob">
              <div className="ttl">« Pas le temps là »</div>
              <div className="ans">Aucun souci — 5 min plutôt que 15 ? Je te montre 1 cas client + tu me dis si ça matche.</div>
            </div>
          </div>
        </div>

        {/* Sticky CTA */}
        <div className="pros-cta">
          <div className="outcome">
            <button className="out ok"><Icon name="check" className="ico-sm" />Envoyé + connecté</button>
            <button className="out"><Icon name="send" className="ico-sm" />Envoyé sans connexion</button>
            <button className="out warn"><Icon name="clock" className="ico-sm" />Reporter</button>
            <button className="out danger"><Icon name="x" className="ico-sm" />Pas intéressé</button>
          </div>
          <span style={{ width: 1, height: 28, background: "var(--border)" }} />
          <button className="btn primary sm"><Icon name="arrowRight" className="ico-sm" />Suivant</button>
        </div>
      </main>

      {/* RIGHT */}
      <aside className="pros-right">
        <div className="blk">
          <h4>Séquence en cours</h4>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Nurturing PME</div>
          <div className="seq-dots" style={{ marginBottom: 12 }}>
            <span className="dot done" title="J0" />
            <span className="dot done" title="J3" />
            <span className="dot done" title="J7" />
            <span className="dot cur"  title="J14 — actuel" />
            <span className="dot"      title="J21" />
            <span className="dot"      title="J30" />
            <span className="dot"      title="J45" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5 }}>
            <div className="seq-step done"><span className="ic"><Icon name="mail" className="ico-xs" /></span><span>J0 — cold email</span><span className="tm">14 mai</span></div>
            <div className="seq-step done"><span className="ic"><Icon name="mail" className="ico-xs" /></span><span>J3 — bump cas client</span><span className="tm">17 mai</span></div>
            <div className="seq-step done"><span className="ic"><Icon name="mail" className="ico-xs" /></span><span>J7 — vidéo 30s</span><span className="tm">20 mai</span></div>
            <div className="seq-step cur"><span className="ic"><Icon name="linkedin" className="ico-xs" /></span><span>J14 — LinkedIn</span><span className="tm">auj.</span></div>
            <div className="seq-step"><span className="ic"><Icon name="phone" className="ico-xs" /></span><span>J21 — call</span><span className="tm">28 mai</span></div>
            <div className="seq-step"><span className="ic"><Icon name="mail" className="ico-xs" /></span><span>J30 — break-up</span><span className="tm">6 juin</span></div>
          </div>
        </div>

        <div className="blk">
          <h4>Contexte</h4>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <RowKV k="Entreprise" v="Solvert Aménagement" />
              <RowKV k="Effectif" v="4 salariés" />
              <RowKV k="Région" v="Bretagne sud" />
              <RowKV k="Site web" v={<span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-2)" }}>solvert.com ↗</span>} />
              <RowKV k="LinkedIn ami" v="Lucas Bernier · 2nd" />
            </div>
          </div>
        </div>

        <div className="blk">
          <h4>3 derniers signaux</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11.5 }}>
            <div style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 5, background: "var(--ok-tint)", color: "var(--ok)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="eye" className="ico-xs" />
              </span>
              <div>
                <div style={{ color: "var(--text)" }}>A ouvert ton email <em>"Tu connais MaPrimeRénov' 2026 ?"</em></div>
                <div style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginTop: 1 }}>il y a 6h · 2ème ouverture</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 5, background: "var(--info-tint)", color: "var(--info)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="ext" className="ico-xs" />
              </span>
              <div>
                <div style={{ color: "var(--text)" }}>A visité la page <em>tarifs</em> du site Sama</div>
                <div style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginTop: 1 }}>hier 18:24 · 1m12s</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 5, background: "var(--magic-tint)", color: "var(--magic)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="linkedin" className="ico-xs" />
              </span>
              <div>
                <div style={{ color: "var(--text)" }}>Solvert publie : "Recrutement chef de projet énergie"</div>
                <div style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginTop: 1 }}>il y a 2 j</div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

window.ScreenProspection = ScreenProspection;
