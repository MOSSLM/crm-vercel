// rdv-screens-b.jsx — Types d'évènements + éditeur
const MODE_LB = { solo: ["Individuel", ""], rr: ["Round-robin", "rr"], col: ["Collectif", "col"] };

function ScreenTypes({ openPublic }) {
  const [edit, setEdit] = React.useState(null);
  const [act, setAct] = React.useState(() => Object.fromEntries(RV_TYPES.map(t => [t.id, t.active])));
  return (
    <>
      <div className="rv-ph">
        <div><h1>Types d'évènements</h1><div className="sub">Chaque type a son lien, sa durée, ses règles et son formulaire. C'est ce que l'invité choisit sur votre page.</div></div>
        <div className="actions"><Btn kind="outline" ic="eye" onClick={openPublic}>Aperçu invité</Btn><Btn kind="primary" ic="plus">Nouveau type</Btn></div>
      </div>
      <div className="rv-types">
        {RV_TYPES.map(t => {
          const on = act[t.id], loc = RV_LOC[t.loc], [mlb, mcls] = MODE_LB[t.mode];
          return (
            <div key={t.id} className={`rv-type ${on ? "" : "off"}`.trim()}>
              {t.mode !== "solo" && <span className={`modeb ${mcls}`}>{mlb}</span>}
              <div className="top">
                <i className="cdot" style={{ background: t.color }} />
                <div style={{ flex: 1, minWidth: 0, paddingRight: t.mode !== "solo" ? 84 : 0 }}>
                  <h3 className="t">{t.title}</h3>
                  <div className="slug">app.samadigitalstudio.fr/rdv/jean/{t.slug}</div>
                </div>
              </div>
              <p className="ds">{t.desc}</p>
              <div className="chips">
                <Chip ic="clock">{fmtDur(t.dur)}</Chip>
                <Chip ic={loc.ic}>{loc.lb}</Chip>
                {t.confirm && <Chip ic="hourglass">À valider</Chip>}
                {!!t.questions.length && <Chip ic="doc">{t.questions.length} question{t.questions.length > 1 ? "s" : ""}</Chip>}
                <Chip ic="bell">{t.reminders.length} rappel{t.reminders.length > 1 ? "s" : ""}</Chip>
                {t.mode === "rr" && <Chip ic="shuffle">{t.rr.length} agents</Chip>}
                {t.mode === "col" && <Chip ic="users">{t.col.length} participants</Chip>}
              </div>
              <div className="ft">
                {on ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{t.bookings30} résas · {t.conv} % tenus</span>
                  : <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-4)" }}>masqué de votre page</span>}
                <span className="sp" />
                <Btn kind="outline" size="xs" ic="copy">Lien</Btn>
                <Btn kind="outline" size="xs" ic="sliders" onClick={() => setEdit(t.id)}>Modifier</Btn>
                <Sw on={on} onClick={() => setAct(a => ({ ...a, [t.id]: !a[t.id] }))} />
              </div>
            </div>
          );
        })}
        <button className="rv-type" style={{ borderStyle: "dashed", boxShadow: "none", alignItems: "center", justifyContent: "center", color: "var(--text-3)", font: "inherit", fontSize: 12.5, cursor: "default", minHeight: 168, background: "transparent" }}>
          <Icon name="plus" className="ico-xl" style={{ color: "var(--text-4)" }} />Créer un type de rendez-vous
        </button>
      </div>
      {edit && <TypeEditor t={rvType(edit)} onClose={() => setEdit(null)} />}
    </>
  );
}

const TABS = [{ id: "gen", lb: "Général" }, { id: "dis", lb: "Disponibilité" }, { id: "form", lb: "Formulaire" }, { id: "attr", lb: "Attribution" }, { id: "rem", lb: "Rappels" }, { id: "adv", lb: "Avancé" }];
const COLORS = ["#E2552B", "#3B7DD8", "#2E9E6B", "#7A5AE0", "#C8881F", "#B5322F", "#14120E"];

function TypeEditor({ t, onClose }) {
  const [tab, setTab] = React.useState("gen");
  const [dur, setDur] = React.useState(t.dur);
  const [color, setColor] = React.useState(t.color);
  const [loc, setLoc] = React.useState(t.loc);
  const [mode, setMode] = React.useState(t.mode);
  const [confirm, setConfirm] = React.useState(t.confirm);
  const [qs, setQs] = React.useState(t.questions);
  const [rem, setRem] = React.useState(t.reminders);
  const [deleg, setDeleg] = React.useState(true);
  const preview = ["09:00", "09:30", "10:00", "10:30", "11:00"].slice(0, dur >= 45 ? 3 : 5);
  return (
    <div className="rv-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rv-drawer" role="dialog" aria-modal="true">
        <div className="rv-dr-hd">
          <span style={{ width: 30, height: 30, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="calCog" className="ico-lg" style={{ color: "#fff" }} /></span>
          <div style={{ flex: 1 }}><h2 className="t">{t.title}</h2><div className="s">/rdv/jean/{t.slug} · {fmtDur(dur)}</div></div>
          <button className="cx" onClick={onClose}><Icon name="x" className="ico-sm" /></button>
        </div>
        <div className="rv-dr-tabs">{TABS.map(x => <button key={x.id} className={tab === x.id ? "on" : ""} onClick={() => setTab(x.id)}>{x.lb}</button>)}</div>
        <div className="rv-dr-bd">
          {tab === "gen" && <>
            <Blk title="Identité">
              <Stack gap={11}>
                <Field label="Titre"><input className="rv-in" defaultValue={t.title} /></Field>
                <Field label="Lien public" hint="Modifiable — les anciens liens seront redirigés pendant 30 jours."><Row style={{ gap: 0 }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-4)", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRight: 0, borderRadius: "7px 0 0 7px", height: 30, display: "flex", alignItems: "center", padding: "0 7px" }}>/rdv/jean/</span><input className="rv-in mono" style={{ borderRadius: "0 7px 7px 0" }} defaultValue={t.slug} /></Row></Field>
                <Field label="Description affichée à l'invité"><textarea className="rv-in" rows={3} defaultValue={t.desc} /></Field>
              </Stack>
            </Blk>
            <Blk title="Format">
              <Stack gap={12}>
                <Field label="Durée"><Row style={{ gap: 8 }}><Seg opts={[15, 20, 30, 45, 60, 90].map(m => ({ id: m, lb: `${m}′` }))} val={dur} set={setDur} accent /><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-4)" }}>ou <input className="rv-in mono" style={{ width: 54, height: 24, display: "inline-block" }} defaultValue={dur} /> min</span></Row></Field>
                <Field label="Lieu">
                  <div className="rv-grid3">
                    {Object.entries(RV_LOC).slice(0, 6).map(([k, v]) => (
                      <button key={k} className={`rv-kind ${loc === k ? "on" : ""}`.trim()} style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 7 }} onClick={() => setLoc(k)}>
                        <Icon name={v.ic} className="ico-sm" /><span style={{ fontSize: 11.5, fontWeight: 500 }}>{v.lb}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                {loc === "in_person" && <Field label="Adresse communiquée à l'invité"><input className="rv-in" placeholder="12 rue des Artisans, 94400 Vitry-sur-Seine" /></Field>}
                <Field label="Couleur (agenda + page publique)">
                  <Row style={{ gap: 6 }}>{COLORS.map(c => <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: 7, background: c, border: color === c ? "2px solid var(--text)" : "1px solid var(--border-2)", boxShadow: color === c ? "0 0 0 2px var(--bg)" : "none", cursor: "default" }} />)}</Row>
                </Field>
              </Stack>
            </Blk>
          </>}

          {tab === "dis" && <>
            <Blk title="Planning utilisé" right={<Btn kind="ghost" size="xs" ic="ext">Modifier mes horaires</Btn>}>
              <select className="rv-in"><option>Horaires de travail (par défaut) · Europe/Paris</option><option>Créneaux visite terrain</option><option>Horaires étendus (sam. inclus)</option></select>
            </Blk>
            <Blk title="Règles de créneaux">
              <Stack gap={11}>
                <div className="rv-grid2">
                  <Field label="Intervalle de départ" hint="Créneaux toutes les X min."><select className="rv-in" defaultValue={t.interval}>{[15, 20, 30, 60].map(m => <option key={m} value={m}>{m} min</option>)}</select></Field>
                  <Field label="Préavis minimum" hint="Pas de réservation dans l'immédiat."><select className="rv-in" defaultValue={t.notice}>{[60, 120, 240, 720, 1440, 2880].map(m => <option key={m} value={m}>{fmtMin(m)} avant</option>)}</select></Field>
                </div>
                <div className="rv-grid2">
                  <Field label="Battement avant"><select className="rv-in" defaultValue={t.buffer[0]}>{[0, 5, 10, 15, 30, 45].map(m => <option key={m} value={m}>{m} min</option>)}</select></Field>
                  <Field label="Battement après"><select className="rv-in" defaultValue={t.buffer[1]}>{[0, 5, 10, 15, 30, 45].map(m => <option key={m} value={m}>{m} min</option>)}</select></Field>
                </div>
                <div className="rv-grid3">
                  <Field label="Fenêtre de résa"><select className="rv-in" defaultValue={t.window}>{[7, 14, 21, 30, 45, 60].map(m => <option key={m} value={m}>{m} jours</option>)}</select></Field>
                  <Field label="Max / jour"><input className="rv-in mono" defaultValue={t.maxDay} /></Field>
                  <Field label="Max / semaine"><input className="rv-in mono" defaultValue={t.maxWeek} /></Field>
                </div>
              </Stack>
            </Blk>
            <Blk title="Aperçu · jeudi 30 juillet" ic="eye">
              <Row style={{ gap: 6, flexWrap: "wrap" }}>{preview.map(s => <span key={s} className="rv-sc" style={{ width: 62, height: 28 }}>{s}</span>)}<Chip line>+{dur >= 45 ? 4 : 6} autres</Chip></Row>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 9, lineHeight: 1.5 }}>Calculé sur vos horaires, moins l'occupé réel (RDV, calendrier CRM, Google Agenda), les battements et le préavis.</div>
            </Blk>
          </>}

          {tab === "form" && <>
            <Blk title="Toujours demandé">
              <div className="rv-q sys"><span className="qi"><Icon name="user" className="ico-xs" /></span><div><div className="ql">Nom complet</div><div className="qt">obligatoire · système</div></div><Pill>fixe</Pill><span /></div>
              <div className="rv-q sys" style={{ marginTop: 6 }}><span className="qi"><Icon name="mail" className="ico-xs" /></span><div><div className="ql">Email</div><div className="qt">obligatoire · système</div></div><Pill>fixe</Pill><span /></div>
            </Blk>
            <Blk title="Vos questions" right={<span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-4)" }}>{qs.length}/8</span>}>
              {qs.map((q, i) => {
                const [ic, lb] = QT[q.type];
                return (
                  <div key={q.id} className="rv-q">
                    <span className="qi"><Icon name={ic} className="ico-xs" /></span>
                    <div style={{ minWidth: 0 }}><div className="ql">{q.label}</div><div className="qt">{lb}{q.options ? ` · ${q.options.length} choix` : ""}</div></div>
                    <Row style={{ gap: 6 }}>{q.required && <Pill kind="accent">requis</Pill>}<Icon name="drag" className="ico-sm" style={{ color: "var(--text-4)" }} /></Row>
                    <Btn kind="ghost" size="xs" ic="trash" onClick={() => setQs(qs.filter((_, j) => j !== i))} />
                  </div>
                );
              })}
              <button className="rv-add" onClick={() => setQs([...qs, { id: `n${qs.length}`, label: "Nouvelle question", type: "text", required: false }])}><Icon name="plus" className="ico-sm" />Ajouter une question</button>
              <div className="rv-hairline" />
              <Row style={{ gap: 7, flexWrap: "wrap" }}>
                <span className="rv-lb" style={{ width: "100%", marginBottom: 2 }}>Modèles rapides</span>
                {["Budget estimé", "Nombre de salariés", "Comment nous avez-vous connus ?", "Site actuel", "Urgence du projet"].map(m => <button key={m} className="btn outline xs" onClick={() => setQs([...qs, { id: m, label: m, type: "text", required: false }])}><Icon name="plus" className="ico-xs" />{m}</button>)}
              </Row>
            </Blk>
            <Blk title="Après le choix du créneau">
              <div className="rv-opt-row"><div className="tx"><div className="n">Autoriser l'ajout d'invités</div><div className="d">L'invité peut mettre des collègues en copie de l'invitation.</div></div><Sw on onClick={() => { }} /></div>
              <div className="rv-opt-row"><div className="tx"><div className="n">Champ téléphone obligatoire</div><div className="d">Utile pour les RDV téléphoniques et les visites.</div></div><Sw on={loc === "phone" || loc === "in_person"} onClick={() => { }} /></div>
              <div className="rv-opt-row"><div className="tx"><div className="n">Redirection après réservation</div><div className="d">Sinon, page de confirmation Cal.SAMA.</div></div><input className="rv-in mono" style={{ width: 210 }} placeholder="https://…/merci" /></div>
            </Blk>
          </>}

          {tab === "attr" && <>
            <Blk title="Qui reçoit ce rendez-vous">
              <Stack gap={7}>
                {[
                  { id: "solo", ic: "user", n: "Individuel", d: "Uniquement vous. Le créneau vient de votre planning." },
                  { id: "rr", ic: "shuffle", n: "Round-robin", d: "Réparti à tour de rôle entre plusieurs commerciaux, selon leur charge." },
                  { id: "col", ic: "users", n: "Collectif", d: "Plusieurs personnes présentes — le créneau n'apparaît que si tout le monde est libre." },
                ].map(o => (
                  <button key={o.id} className={`rv-attr-row ${mode === o.id ? "on" : ""}`.trim()} style={{ gridTemplateColumns: "26px 1fr auto", textAlign: "left", font: "inherit" }} onClick={() => setMode(o.id)}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: mode === o.id ? "var(--accent)" : "var(--bg-2)", color: mode === o.id ? "#fff" : "var(--text-3)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name={o.ic} className="ico-sm" /></span>
                    <div><div className="n">{o.n}</div><div className="r">{o.d}</div></div>
                    {mode === o.id && <Icon name="check" className="ico-sm" style={{ color: "var(--accent-2)" }} />}
                  </button>
                ))}
              </Stack>
            </Blk>
            {mode !== "solo" && (
              <Blk title={mode === "rr" ? "Rotation" : "Participants requis"} right={<Btn kind="ghost" size="xs" ic="plus">Ajouter</Btn>}>
                <Stack gap={6}>
                  {(mode === "rr" ? ["u2", "u3", "u4"] : ["u1", "u5", "u4"]).map((id, i) => {
                    const h = rvHost(id);
                    return (
                      <Row key={id} style={{ padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 8, gap: 10 }}>
                        <Av id={id} size={26} />
                        <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{h.n}</div><div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{h.job} · {[9, 7, 11][i] || 4} RDV cette semaine</div></div>
                        {mode === "rr" ? <Row style={{ gap: 6 }}><span className="rv-lb">poids</span><select className="rv-in mono" style={{ width: 58, height: 26 }} defaultValue={i === 2 ? "0.5" : "1"}><option>1</option><option>0.5</option><option>2</option></select></Row>
                          : <Pill kind={i === 0 ? "accent" : ""}>{i === 0 ? "organisateur" : "requis"}</Pill>}
                        <Btn kind="ghost" size="xs" ic="trash" />
                      </Row>
                    );
                  })}
                </Stack>
                {mode === "rr" && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 9, lineHeight: 1.5 }}>Prochain dans la rotation : <b>Malik Oueslati</b>. Un poids de 0,5 donne deux fois moins de RDV.</div>}
              </Blk>
            )}
            <Blk title="Délégation">
              <div className="rv-opt-row"><div className="tx"><div className="n">Un agent peut déléguer à son closer</div><div className="d">Le RDV pris pendant un appel peut être passé à Hugo Ferrand — jamais à un autre agent.</div></div><Sw on={deleg} onClick={() => setDeleg(!deleg)} /></div>
              <div className="rv-opt-row"><div className="tx"><div className="n">Zone géographique prioritaire</div><div className="d">Pour les visites : l'agent le plus proche du chantier passe devant dans la rotation.</div></div><Sw on={loc === "in_person"} onClick={() => { }} /></div>
            </Blk>
          </>}

          {tab === "rem" && <>
            <Blk title="Validation">
              <div className="rv-opt-row"><div className="tx"><div className="n">Demander ma validation</div><div className="d">L'invité reçoit « demande envoyée », vous validez depuis Réservations ou l'email.</div></div><Sw on={confirm} onClick={() => setConfirm(!confirm)} /></div>
              <div className="rv-opt-row"><div className="tx"><div className="n">Annulation possible jusqu'à</div><div className="d">Passé ce délai, l'invité doit vous contacter.</div></div><select className="rv-in" style={{ width: 130 }} defaultValue="1440"><option value="0">à tout moment</option><option value="240">4 h avant</option><option value="1440">24 h avant</option></select></div>
            </Blk>
            <Blk title="Rappels automatiques" right={<Btn kind="ghost" size="xs" ic="plus">Ajouter</Btn>}>
              <Stack gap={6}>
                {rem.map((m, i) => (
                  <Row key={m} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, gap: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--warn-tint)", color: "var(--warn)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="bell" className="ico-xs" /></span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>Email · {fmtMin(m)} avant</div><div style={{ fontSize: 10.5, color: "var(--text-3)" }}>à l'invité et à l'hôte · avec lien de report</div></div>
                    <Btn kind="ghost" size="xs" ic="trash" onClick={() => setRem(rem.filter(x => x !== m))} />
                  </Row>
                ))}
                {!rem.length && <div className="rv-empty">Aucun rappel — risque de no-show.</div>}
              </Stack>
            </Blk>
            <Blk title="Notifications internes">
              <div className="rv-opt-row"><div className="tx"><div className="n">Notification in-app à l'hôte</div><div className="d">Nouvelle résa, annulation, report.</div></div><Sw on onClick={() => { }} /></div>
              <div className="rv-opt-row"><div className="tx"><div className="n">Créer une tâche de préparation</div><div className="d">Tâche CRM « préparer le RDV » 1 h avant, assignée à l'hôte.</div></div><Sw on={t.dur >= 45} onClick={() => { }} /></div>
            </Blk>
          </>}

          {tab === "adv" && <>
            <Blk title="Rattachement CRM">
              <div className="rv-opt-row"><div className="tx"><div className="n">Rapprocher le contact par email</div><div className="d">Sinon, création d'un contact + entreprise.</div></div><Sw on onClick={() => { }} /></div>
              <div className="rv-opt-row"><div className="tx"><div className="n">Créer une opportunité</div><div className="d">Pipeline « Acquisition », étape « RDV pris ».</div></div><Sw on onClick={() => { }} /></div>
              <div className="rv-opt-row"><div className="tx"><div className="n">Catégorie dans le calendrier CRM</div><div className="d">Visible par l'équipe et dans l'espace agent.</div></div><select className="rv-in" style={{ width: 150 }}><option>Rendez-vous</option><option>Qualification</option><option>Production</option></select></div>
            </Blk>
            <Blk title="Diffusion">
              <Stack gap={9}>
                <Row style={{ gap: 7 }}><Btn kind="outline" ic="copy">Copier le lien</Btn><Btn kind="outline" ic="code">Snippet embed</Btn><Btn kind="outline" ic="mail">Envoyer par email</Btn></Row>
                <div className="rv-opt-row"><div className="tx"><div className="n">Visible sur ma page publique</div><div className="d">Décoché : accessible uniquement par lien direct.</div></div><Sw on onClick={() => { }} /></div>
              </Stack>
            </Blk>
            <Blk title="Zone de risque">
              <Row><div style={{ flex: 1, fontSize: 11.5, color: "var(--text-3)" }}>Supprimer ce type conserve les réservations passées mais casse les liens partagés.</div><Btn kind="danger" ic="trash">Supprimer</Btn></Row>
            </Blk>
          </>}
        </div>
        <div className="rv-dr-ft">
          <Btn kind="ghost" ic="eye">Aperçu</Btn>
          <span className="sp" />
          <Btn kind="subtle" onClick={onClose}>Annuler</Btn>
          <Btn kind="accent" ic="check" onClick={onClose}>Enregistrer</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenTypes, TypeEditor });
