// rdv-screens-d.jsx — Intégrations · Ma page (aperçu invité)
const EMBED_KINDS = [
  { id: "inline", ic: "layout", n: "Inline", d: "Le calendrier s'affiche dans la page." },
  { id: "floating", ic: "panelBottom", n: "Bouton flottant", d: "Bouton fixe en bas d'écran → popup." },
  { id: "popup", ic: "pointer", n: "Popup au clic", d: "N'importe quel bouton de votre site." },
];

function Code({ lines }) {
  return <div className="rv-code">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
}

function ScreenIntegrations() {
  const [kind, setKind] = React.useState("floating");
  const [target, setTarget] = React.useState("audit-visibilite");
  const [txt, setTxt] = React.useState("Prendre rendez-vous");
  const [pos, setPos] = React.useState("right");
  const url = `https://app.samadigitalstudio.fr/rdv/jean/${target}`;
  const snip = kind === "inline"
    ? [`<div class="sama-rdv" data-url="${url}"></div>`, `<script src="…/embed.js" async></script>`]
    : kind === "popup"
      ? [`<button data-sama-rdv-popup="${url}">${txt}</button>`, `<script src="…/embed.js" async></script>`]
      : [`<script src="…/embed.js" async`, `  data-button-url="${url}"`, `  data-button-text="${txt}"`, `  data-button-color="#E2552B"`, `  data-button-position="${pos}"></script>`];
  return (
    <>
      <div className="rv-ph">
        <div><h1>Intégrations</h1><div className="sub">Agendas connectés, emails, et le widget à coller sur vos sites clients ou votre landing.</div></div>
        <div className="actions"><Btn kind="outline" ic="ext">Documentation</Btn></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Stack gap={16}>
          <Blk title="Agendas connectés" ic="plug">
            <div className="rv-conn">
              <span className="lg"><Icon name="google" className="ico-lg" style={{ color: "#EA4335" }} /></span>
              <div><div className="n">Google Calendar<Pill kind="ok" dot>connecté</Pill></div><div className="e">jean@samadigitalstudio.fr · 3 agendas lus</div></div>
              <Row style={{ gap: 5 }}><Btn kind="outline" size="xs" ic="refresh">Resync</Btn><Btn kind="ghost" size="xs" ic="x" /></Row>
            </div>
            <div className="rv-conn">
              <span className="lg"><Icon name="microsoft" className="ico-lg" style={{ color: "#5E5E5E" }} /></span>
              <div><div className="n">Outlook / Microsoft 365</div><div className="e">non connecté</div></div>
              <Btn kind="outline" size="xs" ic="link">Connecter</Btn>
            </div>
            <div className="rv-conn">
              <span className="lg"><Icon name="calendar" className="ico-lg" style={{ color: "var(--accent-2)" }} /></span>
              <div><div className="n">Calendrier CRM<Pill kind="accent" dot>natif</Pill></div><div className="e">RDV, tâches et événements récurrents</div></div>
              <Sw on onClick={() => { }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>L'occupé de ces agendas est soustrait de vos créneaux, et chaque RDV confirmé y est créé — avec lien Google Meet automatique pour les visios.</div>
          </Blk>
          <Blk title="Emails & rappels" ic="mail" right={<Pill kind="ok" dot>Resend actif</Pill>}>
            <Stack gap={0}>
              {[["Confirmation à l'invité", "immédiat · avec .ics + lien de gestion", "ok"], ["Notification à l'hôte", "immédiat · in-app + email", "ok"], ["Rappel J-1 puis H-1", "cron toutes les 5 min", "ok"], ["Annulation / report", "aux deux parties", "ok"]].map(([n, d], i) => (
                <Row key={n} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--border)" : 0, gap: 9 }}>
                  <Icon name="check" className="ico-sm" style={{ color: "var(--ok)" }} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5 }}>{n}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>{d}</div></div>
                  <Btn kind="ghost" size="xs" ic="eye">Modèle</Btn>
                </Row>
              ))}
            </Stack>
          </Blk>
        </Stack>

        <Blk title="Intégrer sur un site" ic="code">
          <Stack gap={12}>
            <Field label="Quoi intégrer ?">
              <select className="rv-in" value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">Ma page complète (tous les types)</option>
                {RV_TYPES.filter(t => t.active).map(t => <option key={t.id} value={t.slug}>{t.title} ({t.dur} min)</option>)}
              </select>
            </Field>
            <div className="rv-kinds">
              {EMBED_KINDS.map(k => (
                <button key={k.id} className={`rv-kind ${kind === k.id ? "on" : ""}`.trim()} onClick={() => setKind(k.id)}>
                  <Icon name={k.ic} className="ico-lg" /><div className="n">{k.n}</div><div className="d">{k.d}</div>
                </button>
              ))}
            </div>
            {kind !== "inline" && (
              <div className="rv-grid2">
                <Field label="Texte du bouton"><input className="rv-in" value={txt} onChange={e => setTxt(e.target.value)} /></Field>
                {kind === "floating" && <Field label="Position"><Seg opts={[{ id: "left", lb: "Bas gauche" }, { id: "right", lb: "Bas droite" }]} val={pos} set={setPos} /></Field>}
              </div>
            )}
            <div>
              <span className="rv-lb">Aperçu sur le site client</span>
              <div className="rv-embed-prev" style={{ marginTop: 6 }}>
                <div className="fake"><i className="t" /><i style={{ width: "88%" }} /><i style={{ width: "72%" }} /><i style={{ width: "80%" }} /></div>
                {kind === "inline" ? <div className="inl">calendrier Cal.SAMA · hauteur auto</div>
                  : <div className={`fb ${pos === "left" ? "left" : ""}`.trim()}><Icon name="calendar" className="ico-sm" />{txt}</div>}
              </div>
            </div>
            <div>
              <Row style={{ marginBottom: 6 }}><span className="rv-lb">Snippet</span><span style={{ flex: 1 }} /><Btn kind="outline" size="xs" ic="copy">Copier</Btn></Row>
              <Code lines={snip} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>Préremplissage possible avec <code style={{ fontFamily: "var(--font-mono)", background: "var(--bg-2)", padding: "1px 4px", borderRadius: 4 }}>?name=&amp;email=</code>. L'iframe s'auto-redimensionne, la popup se ferme avec Échap.</div>
          </Stack>
        </Blk>
      </div>
    </>
  );
}

const PV_STEPS = [{ id: "profile", lb: "Profil" }, { id: "slots", lb: "Créneaux" }, { id: "form", lb: "Formulaire" }, { id: "done", lb: "Confirmation" }];

function ScreenPage() {
  const [pv, setPv] = React.useState("slots");
  const [color, setColor] = React.useState("#E2552B");
  const [tid, setTid] = React.useState("et2");
  const startOf = { slots: 0, form: 1, done: 2 };
  return (
    <>
      <div className="rv-ph">
        <div><h1>Ma page</h1><div className="sub">Ce que voit le prospect : votre profil, l'ordre des types, le formulaire après le choix du créneau, et la confirmation.</div></div>
        <div className="actions"><Btn kind="outline" ic="copy">Copier le lien</Btn><Btn kind="accent" ic="check">Enregistrer</Btn></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 18, alignItems: "start" }}>
        <Stack gap={14}>
          <Blk title="Identité publique" ic="user">
            <Stack gap={11}>
              <Field label="Adresse de la page">
                <Row style={{ gap: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-4)", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRight: 0, borderRadius: "7px 0 0 7px", height: 30, display: "flex", alignItems: "center", padding: "0 7px" }}>…/rdv/</span>
                  <input className="rv-in mono" style={{ borderRadius: "0 7px 7px 0" }} defaultValue="jean" />
                </Row>
              </Field>
              <div className="rv-grid2">
                <Field label="Nom affiché"><input className="rv-in" defaultValue="Jean Moss" /></Field>
                <Field label="Rôle affiché"><input className="rv-in" defaultValue="Fondateur" /></Field>
              </div>
              <Field label="Accroche" hint="2 lignes max — c'est la première chose lue."><textarea className="rv-in" rows={2} defaultValue="Sites web, visibilité Google et acquisition pour les artisans et TPE d'Île-de-France." /></Field>
              <Field label="Couleur de marque"><Row style={{ gap: 6 }}>{["#E2552B", "#14120E", "#3B7DD8", "#2E9E6B", "#7A5AE0"].map(c => <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: 7, background: c, border: color === c ? "2px solid var(--text)" : "1px solid var(--border-2)", cursor: "default" }} />)}<span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>{color}</span></Row></Field>
              <div className="rv-opt-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}><div className="tx"><div className="n">Page active</div><div className="d">Désactivée, le lien renvoie une page introuvable.</div></div><Sw on onClick={() => { }} /></div>
            </Stack>
          </Blk>
          <Blk title="Présentation" ic="palette">
            <div className="rv-opt-row"><div className="tx"><div className="n">Photo de profil</div><div className="d">Sinon, initiales sur la couleur de marque.</div></div><Btn kind="outline" size="xs" ic="plus">Ajouter</Btn></div>
            <div className="rv-opt-row"><div className="tx"><div className="n">Afficher les durées et le lieu</div><div className="d">Sur chaque type, en pastilles.</div></div><Sw on onClick={() => { }} /></div>
            <div className="rv-opt-row"><div className="tx"><div className="n">Ordre des types</div><div className="d">Glissez-déposez dans « Types d'évènements ».</div></div><Chip ic="drag">manuel</Chip></div>
            <div className="rv-opt-row"><div className="tx"><div className="n">Langue de la page</div><div className="d">Détectée depuis le navigateur, sinon fixée.</div></div><select className="rv-in" style={{ width: 116 }}><option>Français</option><option>English</option></select></div>
            <div className="rv-opt-row"><div className="tx"><div className="n">Mention « propulsé par »</div><div className="d">Discrète, en bas du panneau sombre.</div></div><Sw on onClick={() => { }} /></div>
          </Blk>
          <Blk title="Formulaire de réservation" ic="doc" right={<Btn kind="ghost" size="xs" ic="ext">Par type</Btn>}>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.55, marginBottom: 10 }}>Les questions posées après le choix du créneau se règlent type par type. Ci-dessous, ce qui s'applique partout.</div>
            <div className="rv-opt-row"><div className="tx"><div className="n">Téléphone demandé par défaut</div><div className="d">Rempli automatiquement quand un agent réserve.</div></div><Sw on onClick={() => { }} /></div>
            <div className="rv-opt-row"><div className="tx"><div className="n">Case RGPD + lien mentions</div><div className="d">Obligatoire avant l'envoi.</div></div><Sw on onClick={() => { }} /></div>
            <div className="rv-opt-row"><div className="tx"><div className="n">Message de confirmation</div><div className="d">Affiché après réservation, avant les boutons agenda.</div></div><Btn kind="outline" size="xs" ic="note">Éditer</Btn></div>
          </Blk>
        </Stack>

        <div>
          <Row style={{ marginBottom: 10 }}>
            <Seg opts={PV_STEPS} val={pv} set={setPv} lg />
            <span style={{ flex: 1 }} />
            {pv !== "profile" && (
              <select className="rv-in" style={{ width: 190 }} value={tid} onChange={e => setTid(e.target.value)}>
                {RV_TYPES.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            )}
          </Row>
          <div className="rv-stage" style={{ padding: 0, overflow: "hidden", background: "var(--bg-3)" }}>
            <div style={{ width: "100%" }}>
              <Row style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-2)", background: "var(--bg-2)", gap: 10 }}>
                <Row style={{ gap: 5 }}>{["#E2552B", "#C8881F", "#2E9E6B"].map(c => <i key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: .8 }} />)}</Row>
                <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, height: 24, display: "flex", alignItems: "center", padding: "0 8px", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                  <Icon name="shield" className="ico-xs" style={{ color: "var(--ok)" }} />app.samadigitalstudio.fr/rdv/jean{pv !== "profile" ? `/${rvType(tid).slug}` : ""}
                </div>
                <Btn kind="ghost" size="xs" ic="ext" />
              </Row>
              <div style={{ padding: 24, display: "flex", justifyContent: "center", backgroundImage: "radial-gradient(rgba(20,18,14,.07) 1px,transparent 1px)", backgroundSize: "18px 18px" }}>
                {pv === "profile" ? <PublicProfile hostId="u1" /> : <BookingWidget key={pv + tid} typeId={tid} start={startOf[pv]} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { ScreenIntegrations, ScreenPage });
