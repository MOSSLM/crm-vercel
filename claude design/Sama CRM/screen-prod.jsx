// screen-production.jsx
function ScreenProduction() {
  const [view, setView] = React.useState("editor"); // editor | pipeline

  return (
    <div className="prod-page">
      <aside className="prod-side">
        <div className="prod-side-hd">
          <h2>Catalogue</h2>
          <div className="sub">Glisse un élément dans le devis</div>
        </div>

        <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ position: "relative" }}>
            <Icon name="search" className="ico-sm" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
            <input placeholder="Filtrer le catalogue…" style={{
              width: "100%", height: 30,
              padding: "0 8px 0 30px",
              border: "1px solid var(--border)",
              borderRadius: 7, background: "var(--surface-2)",
              fontSize: 12, outline: "none",
            }} />
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {window.PROD_CATALOG.map(grp => (
            <div className="prod-cat" key={grp.cat}>
              <div className="cat-title">{grp.cat}</div>
              {grp.items.map(it => (
                <div className="catalog-row" key={it.id} data-k={it.k}>
                  <div className="ic-w"><Icon name={ICON_FOR_KIND[it.k]} className="ico-sm" /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{it.name}</div>
                    <div className="ref">{it.ref}</div>
                  </div>
                  <div className="pr">{it.price.toLocaleString("fr-FR")} €</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="devis-host">
        <div className="devis-toolbar">
          <button className="btn ghost sm" onClick={() => setView("pipeline")} aria-pressed={view === "pipeline"}>
            <Icon name="kanban" className="ico-sm" />Pipeline des devis
          </button>
          <button className="btn ghost sm" onClick={() => setView("editor")} aria-pressed={view === "editor"}>
            <Icon name="doc" className="ico-sm" />Devis en cours
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn ghost sm"><Icon name="eye" className="ico-sm" />Aperçu PDF</button>
          <button className="btn ghost sm"><Icon name="download" className="ico-sm" />PDF</button>
          <button className="btn outline sm"><Icon name="copy" className="ico-sm" />Dupliquer</button>
          <button className="btn primary sm"><Icon name="send" className="ico-sm" />Envoyer au client</button>
        </div>

        {view === "editor" ? <DevisEditor /> : <DevisPipeline />}
      </div>
    </div>
  );
}

const ICON_FOR_KIND = {
  pac: "flame", pv: "sun", iso: "snow", batt: "battery", chau: "droplet", vmc: "windturb", serv: "tools",
};

function DevisEditor() {
  const d = window.DEVIS_CURRENT;
  const aidesTotal = d.aides.reduce((a, x) => a + x.v, 0);
  const reste = d.ttc - aidesTotal;

  const stages = [
    { id: "1", lb: "Brouillon",    s: "done" },
    { id: "2", lb: "Bureau d'études",   s: "done" },
    { id: "3", lb: "Validation",   s: "current" },
    { id: "4", lb: "Envoyé client", s: "" },
    { id: "5", lb: "Signé", s: "" },
  ];

  return (
    <>
      <div style={{ padding: "10px 18px 4px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="devis-stage-pipe">
          {stages.map((s, i) => (
            <div key={s.id} className={`devis-stage ${s.s}`}>
              <span className="num">{s.id}</span>
              {s.lb}
            </div>
          ))}
        </div>
      </div>

      <div className="devis-paper-wrap">
        <div className="devis-paper">
          <div className="devis-hd">
            <div>
              <h2 className="bm">Devis énergie · maison Pelletier</h2>
              <div className="corp">
                THERMALIS SAS · 14 quai des Carmes — 49000 Angers<br />
                SIRET 891 247 332 00018 · RGE Qualisol & QualiPAC · TVA FR12 891247332
              </div>
            </div>
            <div className="ref">
              <div className="lb">Référence</div>
              <div className="v">{d.ref}</div>
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                Émis le {d.date}<br />
                Validité {d.validity}
              </div>
            </div>
          </div>

          <div className="devis-parties">
            <div className="devis-party">
              <h5>Émetteur</h5>
              <div className="nm">Thermalis · Lucas Bernier</div>
              <div className="addr">
                14 quai des Carmes<br />
                49000 Angers<br />
                lucas@thermalis.fr · +33 2 41 32 18 04
              </div>
            </div>
            <div className="devis-party">
              <h5>Client</h5>
              <div className="nm">{d.client.name}</div>
              <div className="addr">
                {d.client.addr.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}
                Contact : {d.client.contact}
              </div>
            </div>
          </div>

          <div className="devis-table">
            <div className="devis-row hd-row">
              <span></span>
              <span>Désignation</span>
              <span style={{ textAlign: "right" }}>Qté</span>
              <span style={{ textAlign: "right" }}>Unité</span>
              <span style={{ textAlign: "right" }}>PU HT</span>
              <span style={{ textAlign: "right" }}>Montant</span>
            </div>
            {d.rows.map((r, i) => (
              <div className="devis-row" key={i} data-k={r.k}>
                <div className="ic-w"><Icon name={ICON_FOR_KIND[r.k]} className="ico-sm" /></div>
                <div>
                  <div className="nm">{r.name}</div>
                  <div className="ds">{r.desc}</div>
                  <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-4)" }}>{r.ref}</div>
                </div>
                <div className="nb">{r.qty}</div>
                <div className="nb">{r.unit}</div>
                <div className="pr">{r.price.toLocaleString("fr-FR")}</div>
                <div className="ttl">{r.amount.toLocaleString("fr-FR")} €</div>
              </div>
            ))}
            <button className="devis-add"><Icon name="plus" className="ico-sm" />Glisser un produit ou cliquer pour ajouter</button>
          </div>

          <div className="devis-totals">
            <div className="devis-aides">
              <div className="ti">
                <Icon name="check" className="ico-sm" />Aides applicables · estimation
              </div>
              {d.aides.map((a, i) => (
                <div className="ai-row" key={i}>
                  <span>{a.lb}</span>
                  <span className="v">– {a.v.toLocaleString("fr-FR")} €</span>
                </div>
              ))}
              <div className="ai-tot">
                <span>Total aides déductibles</span>
                <span className="v">– {aidesTotal.toLocaleString("fr-FR")} €</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
                Calcul basé sur revenus déclarés <strong>"Bleu"</strong>. Sous réserve éligibilité dossier — pré-instruction auto Sama.
              </div>
            </div>

            <div className="devis-sums">
              <div className="sm">
                <span>Total HT</span>
                <span className="v">{d.ht.toLocaleString("fr-FR")} €</span>
              </div>
              <div className="sm">
                <span>TVA ({d.tva_rate})</span>
                <span className="v">{d.tva.toLocaleString("fr-FR")} €</span>
              </div>
              <div className="sm tot">
                <span>Total TTC</span>
                <span className="v">{d.ttc.toLocaleString("fr-FR")} €</span>
              </div>
              <div className="sm reste">
                <span>Reste à charge</span>
                <span className="v">{reste.toLocaleString("fr-FR")} €</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                soit ~ {Math.round(reste / 84).toLocaleString("fr-FR")} €/mois sur 84 mois
              </div>
            </div>
          </div>

          <div style={{
            padding: "16px 36px 28px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
            fontSize: 11, color: "var(--text-3)", lineHeight: 1.6,
          }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-4)", marginBottom: 6 }}>Conditions</div>
              Acompte de 30% à la signature, solde à la fin des travaux. Garantie décennale incluse.
              Délai de pose estimé : 4 à 6 semaines après acceptation.
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-4)", marginBottom: 6 }}>Bon pour accord</div>
              <div style={{
                border: "1px dashed var(--border-strong)",
                borderRadius: 8, height: 64,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-4)", fontSize: 11, fontStyle: "italic",
              }}>
                Signature client — DocuSign envoyé à la validation
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DevisPipeline() {
  const pipe = window.OFFERS_PIPE;
  const recent = window.RECENT_DEVIS;
  const total = pipe.reduce((a, s) => a + s.value, 0);

  return (
    <div style={{ padding: "22px 24px 80px", overflow: "auto" }}>
      {/* Pipe summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 18 }}>
        {pipe.map(s => (
          <div key={s.stage} style={{ background: "var(--bg)", padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".06em", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, background: s.color, borderRadius: "50%" }} />{s.stage}
            </div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, lineHeight: 1, letterSpacing: "-.01em", marginTop: 6 }}>
              {Math.round(s.value / 1000)}<span style={{ fontSize: 13, color: "var(--text-3)", marginLeft: 2 }}>k€</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>
              {s.count} devis
            </div>
          </div>
        ))}
      </div>

      {/* Recent devis list */}
      <div className="card">
        <div className="card-hd">
          <h3>Derniers devis</h3>
          <span className="meta">trié par récence · {recent.length} sur 33</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="btn outline sm"><Icon name="filter" className="ico-sm" />Filtres</button>
            <button className="btn accent sm"><Icon name="plus" className="ico-sm" />Nouveau devis</button>
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 120px 120px 100px 80px", padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", gap: 12 }}>
            <span>Référence</span><span>Client</span><span style={{ textAlign: "right" }}>Montant TTC</span><span>Stade</span><span>Âge</span><span>Owner</span>
          </div>
          {recent.map((d, i) => (
            <div key={d.ref} style={{
              display: "grid", gridTemplateColumns: "120px 1fr 120px 120px 100px 80px",
              padding: "12px 18px", alignItems: "center", gap: 12,
              borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : 0,
              fontSize: 12.5,
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-2)" }}>{d.ref}</span>
              <span style={{ fontWeight: 500, letterSpacing: "-.005em" }}>{d.client}</span>
              <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{eur(d.amt)}</span>
              <span>
                <Pill kind={d.stage === "Signé" ? "ok" : d.stage === "Brouillon" ? "" : d.stage === "Relancé" ? "warn" : d.stage === "Négociation" ? "magic" : "accent"} dot>{d.stage}</Pill>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{d.age}</span>
              <span>
                <Avatar initials={d.owner} color={d.owner === "LB" ? "#E2552B" : "#2B7FB8"} size={22} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
        <Icon name="info" className="ico-sm" style={{ color: "var(--info)" }} />
        Total pipe offres ouvert : <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{eur(total - 312400)}</strong>
        — taux de signature moyen <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>41%</strong>
        sur les 90 derniers jours.
      </div>
    </div>
  );
}

window.ScreenProduction = ScreenProduction;
