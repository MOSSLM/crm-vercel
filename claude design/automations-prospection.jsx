// automations-prospection.jsx — Démarchage page (manual queue + monitoring)

function ProspectionPage() {
  const [activeTab, setActiveTab] = useState("today");
  const [selectedTaskId, setSelectedTaskId] = useState(PROSPECTION_QUEUE[0].id);
  const [detailTab, setDetailTab] = useState("action");

  const filter = PROSPECTION_TABS.find((t) => t.id === activeTab)?.filter || (() => true);
  const tasks = PROSPECTION_QUEUE.filter(filter);
  const selected = PROSPECTION_QUEUE.find((t) => t.id === selectedTaskId) || tasks[0];

  return (
    <div className="pros-page">
      {/* LEFT side — queue */}
      <div className="pros-side">
        <div className="pros-side-hd">
          <h2>Démarchage</h2>
          <div className="subline">
            <b style={{ color: "var(--text)" }}>14</b> tâches à traiter aujourd'hui ·
            {" "}<span style={{ color: "var(--danger)" }}>1 en retard</span>
          </div>
        </div>
        <div className="pros-side-tabs">
          {PROSPECTION_TABS.map((tab) => {
            const count = PROSPECTION_QUEUE.filter(tab.filter).length;
            return (
              <button key={tab.id} className="pros-side-tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}>
                <XI name={tab.icon} className="ico-sm" />
                {tab.label}
                <span className="num">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="pros-list">
          {tasks.map((task) => (
            <ProsTaskRow key={task.id} task={task}
                         selected={selectedTaskId === task.id}
                         onClick={() => { setSelectedTaskId(task.id); setDetailTab("action"); }} />
          ))}
          {tasks.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
              <XI name="checkBig" className="ico-xl" style={{ color: "var(--ok)", marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>
                Tout est traité 🎉
              </div>
              <div style={{ fontSize: 12 }}>Aucune tâche {activeTab === "today" ? "à faire aujourd'hui" : "dans cette catégorie"}.</div>
            </div>
          )}
          <div style={{ padding: "14px 14px 30px" }}>
            <div style={{
              padding: 14,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              textAlign: "center",
              fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.45,
            }}>
              <XI name="pin" className="ico-sm" style={{ color: "var(--text-4)", marginBottom: 6 }} />
              <div style={{ color: "var(--text-2)", fontWeight: 500, marginBottom: 2 }}>Mode focus</div>
              Travaillez en zen — chaque clic « fait » avance automatiquement vers la suivante.
            </div>
          </div>
        </div>
      </div>

      {/* CENTER — detail */}
      <div className="pros-main">
        <div className="pros-main-inner">
          {selected ? (
            <ProsDetail task={selected} tab={detailTab} setTab={setDetailTab} />
          ) : (
            <div style={{ padding: 80, textAlign: "center", color: "var(--text-3)" }}>
              Sélectionnez une tâche dans la file.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — sequence monitoring + history */}
      <div className="pros-aside">
        {selected && <ProsAside task={selected} />}
      </div>
    </div>
  );
}

// ── Single queue row in left column ───────────────────────────────────────
function ProsTaskRow({ task, selected, onClick }) {
  const seq = supaRow("sequences", task.sequenceId);
  return (
    <div className="pros-task-row"
         data-kind={task.kind}
         data-overdue={task.overdue ? "true" : "false"}
         aria-selected={selected}
         onClick={onClick}>
      <span className="av">{task.contact.initials}</span>
      <div style={{ minWidth: 0 }}>
        <div className="name">
          {task.contact.first} {task.contact.last}
        </div>
        <div className="sub">
          {task.contact.company} · {task.contact.role}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span className="kind-chip" style={{ width: 18, height: 18, borderRadius: 4 }}>
            <XI name={task.kind === "call" ? "phone" :
                      task.kind === "whatsapp" ? "whatsapp" :
                      task.kind === "linkedin" ? "linkedin" :
                      "mail"} className="ico-xs" />
          </span>
          <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            {seq?.name?.split(" · ")[0] || "Séquence"}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
            · étape {task.currentStep}/{task.progressTotal}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span className="kind-chip">
          <XI name={task.kind === "call" ? "phone" :
                    task.kind === "whatsapp" ? "whatsapp" :
                    task.kind === "linkedin" ? "linkedin" :
                    "mail"} className="ico-sm" />
        </span>
        <span className="time">{task.overdue ? "↻ hier" : task.time}</span>
      </div>
    </div>
  );
}

// ── Center detail card ────────────────────────────────────────────────────
function ProsDetail({ task, tab, setTab }) {
  const c = task.contact;
  const seq = supaRow("sequences", task.sequenceId);

  return (
    <div className="pros-card">
      <div className="pros-card-hd">
        <span className="av">{c.initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 className="name">{c.first} {c.last}</h2>
            <span className="pill accent">{task.kind === "call" ? "Appel à passer" :
                                            task.kind === "whatsapp" ? "WhatsApp à envoyer" :
                                            task.kind === "linkedin" ? "Connexion LinkedIn" :
                                            "Email à valider"}</span>
            {task.overdue && <span className="pill danger"><XI name="warning" className="ico-xs" />En retard</span>}
          </div>
          <div className="role">
            {c.role} · <b style={{ color: "var(--text-2)" }}>{c.company}</b> · {c.city}
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost sm icon" title="Snooze"><XI name="snooze" className="ico-sm" /></button>
          <button className="btn ghost sm icon" title="Passer"><XI name="skip" className="ico-sm" /></button>
          <button className="btn outline sm">
            <XI name="externalLink" className="ico-sm" />Ouvrir la fiche
          </button>
        </div>
      </div>

      <div className="pros-tabs">
        <button aria-selected={tab === "action"}    onClick={() => setTab("action")}><XI name="bolt" className="ico-sm" />Action</button>
        <button aria-selected={tab === "context"}   onClick={() => setTab("context")}><XI name="company" className="ico-sm" />Contexte</button>
        <button aria-selected={tab === "history"}   onClick={() => setTab("history")}><XI name="history" className="ico-sm" />Historique</button>
        <div style={{ flex: 1 }} />
        <span className="pill"><XI name="flame" className="ico-xs" />{seq?.name}</span>
      </div>

      {tab === "action" && <ProsAction task={task} />}
      {tab === "context" && <ProsContext task={task} />}
      {tab === "history" && <ProsHistoryDetail task={task} />}

      {/* Sticky CTA bar */}
      <div className="pros-cta-bar">
        {task.kind === "call" && (
          <>
            <button className="btn outline" style={{ flex: "0 0 auto" }}>
              <XI name="snooze" className="ico-sm" />Snooze 1h
            </button>
            <button className="btn outline" style={{ flex: "0 0 auto" }}>
              <XI name="x" className="ico-sm" />Boîte vocale
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn outline">
              <XI name="phoneOut" className="ico-sm" />Composer {c.phone}
            </button>
            <button className="btn ok">
              <XI name="checkBig" className="ico-sm" />Marquer fait
            </button>
          </>
        )}
        {task.kind === "whatsapp" && (
          <>
            <button className="btn outline" style={{ flex: "0 0 auto" }}>
              <XI name="edit" className="ico-sm" />Éditer le message
            </button>
            <button className="btn outline" style={{ flex: "0 0 auto" }}>
              <XI name="snooze" className="ico-sm" />Snooze
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn outline">
              <XI name="copyClip" className="ico-sm" />Copier
            </button>
            <button className="btn ok">
              <XI name="whatsapp" className="ico-sm" />Ouvrir WhatsApp Web
            </button>
          </>
        )}
        {task.kind === "linkedin" && (
          <>
            <button className="btn outline">
              <XI name="copyClip" className="ico-sm" />Copier le message
            </button>
            <button className="btn outline">
              <XI name="skip" className="ico-sm" />Passer
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn outline">
              <XI name="externalLink" className="ico-sm" />Ouvrir profil
            </button>
            <button className="btn ok">
              <XI name="checkBig" className="ico-sm" />Marquer fait
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Action panel (script / message) ──────────────────────────────────────
function ProsAction({ task }) {
  const c = task.contact;
  if (task.kind === "call") {
    return (
      <>
        <div className="pros-section">
          <h3><XI name="phone" className="ico-sm" />Coordonnées</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <KeyVal label="Téléphone direct" mono value={c.phone} icon="phoneOut" copyable />
            <KeyVal label="Email" mono value={c.email} icon="mail" copyable />
            <KeyVal label="Standard entreprise" mono value="04 78 12 45 80" icon="phone" copyable />
            <KeyVal label="LinkedIn" value="mathilde-bertin" icon="linkedin" linkable />
          </div>
        </div>
        <div className="pros-section">
          <h3><XI name="doc" className="ico-sm" />Script d'appel — découverte 3 min</h3>
          <div className="pros-script">
            <p>
              <span className="obj">Accroche.</span> Bonjour <span className="var">{c.first}</span>,
              Lucas de Sama Digital. Je vous appelle parce que j'ai vu que
              <span className="var"> {c.company}</span> a lancé un projet solaire récemment —
              vous avez 30 secondes pour que je vous explique pourquoi je vous contacte ?
            </p>
            <p>
              <span className="obj">Pitch.</span> On aide les acteurs locaux du solaire à doubler
              leur volume de leads qualifiés en 90 jours, sans agence — via un système qui automatise
              la prospection. <span className="var">{c.first}</span>, est-ce un sujet pour vous ?
            </p>
            <p>
              <span className="obj">Découverte.</span> Comment générez-vous vos prospects aujourd'hui ?
              Combien fermez-vous par mois ? Quel canal vous frustre ?
            </p>
            <p>
              <span className="obj">Close.</span> Le mieux c'est qu'on en discute 20 min mardi
              ou jeudi prochain — vous avez une préférence ?
            </p>
          </div>
        </div>
        <div className="pros-section">
          <h3><XI name="ai" className="ico-sm" />Notes Claude sur ce contact</h3>
          <div style={{
            background: "var(--magic-tint)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: "var(--magic)", fontWeight: 600, fontSize: 11 }}>
              <XI name="ai" className="ico-sm" />SCORE IA · 84/100
            </div>
            Profil ICP fort. Solaris Lyon est en croissance (recrutement de 8 personnes sur LinkedIn ces 60 derniers jours).
            Mathilde a liké 2 posts sur l'automatisation commerciale en mars. Probablement <b>frustrée par la
            génération de leads sortants</b>. À jouer sur l'angle "système prédictible".
          </div>
        </div>
        <div className="pros-section">
          <h3><XI name="task" className="ico-sm" />Résultat de l'appel</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {[
              { lbl: "Pas de réponse", icon: "phone", color: "var(--text-3)" },
              { lbl: "Boîte vocale",   icon: "phone", color: "var(--text-3)" },
              { lbl: "Pas intéressé(e)", icon: "x", color: "var(--danger)" },
              { lbl: "Rappel demandé",  icon: "snooze", color: "var(--warn)" },
              { lbl: "Intéressé → RDV", icon: "cal", color: "var(--ok)" },
              { lbl: "Mauvais contact", icon: "user", color: "var(--text-3)" },
            ].map((o) => (
              <button key={o.lbl} className="btn outline sm" style={{ justifyContent: "flex-start", height: 32 }}>
                <XI name={o.icon} className="ico-sm" style={{ color: o.color }} />{o.lbl}
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }
  if (task.kind === "whatsapp") {
    return (
      <>
        <div className="pros-section">
          <h3><XI name="whatsapp" className="ico-sm" />Message à envoyer</h3>
          <div className="pros-msg-card">
            <div className="hd">
              <XI name="whatsapp" className="ico-sm" style={{ color: "var(--ok)" }} />
              <span>via Lucas Martin · +33 6 12 34 56 78</span>
              <span className="grow" />
              <span>vers {c.phone}</span>
            </div>
            <div className="body-msg">
              Bonjour <span className="var">{c.first}</span>, je suis Lucas de Sama Digital.{"\n\n"}
              Je vous écris suite à mon email de la semaine dernière sur l'audit gratuit de votre génération de leads.{"\n\n"}
              Je sais que WhatsApp est plus pratique — je vous laisse l'opportunité de me répondre à votre rythme.{"\n\n"}
              <span className="var">{c.company}</span> a une approche intéressante du marché lyonnais, je serais curieux d'échanger 15 min cette semaine.
            </div>
            <div className="ft">
              <button className="btn ghost xs"><XI name="edit" className="ico-xs" />Éditer</button>
              <button className="btn ghost xs"><XI name="refresh" className="ico-xs" />Régénérer avec Claude</button>
            </div>
          </div>
        </div>
        <div className="pros-section">
          <h3><XI name="bell" className="ico-sm" />Procédure</h3>
          <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.7 }}>
            <li>Cliquez sur <b>Copier</b> ci-dessous pour copier le message dans le presse-papier.</li>
            <li>Cliquez sur <b>Ouvrir WhatsApp Web</b> — la conversation avec {c.first} s'ouvre.</li>
            <li>Collez et envoyez. <b>Marquez fait</b> ici quand c'est envoyé.</li>
          </ol>
        </div>
      </>
    );
  }
  if (task.kind === "linkedin") {
    return (
      <>
        <div className="pros-section">
          <h3><XI name="linkedin" className="ico-sm" />Demande de connexion</h3>
          <div className="pros-msg-card">
            <div className="hd">
              <XI name="linkedin" className="ico-sm" style={{ color: "var(--info)" }} />
              <span>via votre profil LinkedIn · 280/300 caractères</span>
            </div>
            <div className="body-msg">
              Bonjour <span className="var">{c.first}</span>, je découvre <span className="var">{c.company}</span> et je trouve votre approche intéressante — pas de pitch, juste une mise en relation pour échanger sur l'écosystème solaire en Auvergne-Rhône-Alpes. Bonne journée.
            </div>
            <div className="ft">
              <button className="btn ghost xs"><XI name="edit" className="ico-xs" />Éditer</button>
              <button className="btn ghost xs"><XI name="refresh" className="ico-xs" />Régénérer</button>
            </div>
          </div>
        </div>
        <div className="pros-section">
          <h3><XI name="user" className="ico-sm" />Profil LinkedIn</h3>
          <div style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            display: "flex", gap: 12, alignItems: "center",
          }}>
            <span style={{
              width: 44, height: 44, borderRadius: 8,
              background: "var(--bg-3)",
              backgroundImage: "repeating-linear-gradient(135deg, rgba(20,18,14,.06) 0 6px, transparent 6px 12px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-4)",
            }}><XI name="linkedin" className="ico-lg" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{c.first} {c.last}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c.role} chez {c.company}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                linkedin.com/in/{c.first.toLowerCase()}-{c.last.toLowerCase()}
              </div>
            </div>
            <button className="btn outline sm">
              <XI name="externalLink" className="ico-sm" />Ouvrir
            </button>
          </div>
        </div>
      </>
    );
  }
  return null;
}

// ── KeyVal pair used in coordonnées section ──────────────────────────────
function KeyVal({ label, value, mono, icon, copyable, linkable }) {
  return (
    <div style={{
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 7,
      padding: "8px 10px",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {icon && <XI name={icon} className="ico-sm" style={{ color: "var(--text-3)", flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 500 }}>
          {label}
        </div>
        <div style={{
          fontSize: 12.5, color: "var(--text)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
          fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{value}</div>
      </div>
      {copyable && <button className="btn ghost xs icon" title="Copier"><XI name="copyClip" className="ico-xs" /></button>}
      {linkable && <button className="btn ghost xs icon" title="Ouvrir"><XI name="externalLink" className="ico-xs" /></button>}
    </div>
  );
}

// ── Context tab ──────────────────────────────────────────────────────────
function ProsContext({ task }) {
  const c = task.contact;
  return (
    <>
      <div className="pros-section">
        <h3><XI name="company" className="ico-sm" />Entreprise</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <KeyVal label="Nom" value={c.company} icon="company" />
          <KeyVal label="Effectif" mono value="22 personnes" icon="users" />
          <KeyVal label="Secteur" value="Solaire B2B / B2C" icon="flame" />
          <KeyVal label="Ville" value={c.city} icon="building" />
          <KeyVal label="Site" mono value="solaris-lyon.fr" icon="globe" linkable />
          <KeyVal label="Croissance" value="+38% effectif (12 mois)" icon="bolt" />
        </div>
      </div>
      <div className="pros-section">
        <h3><XI name="tag" className="ico-sm" />Tags & segments</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span className="pill accent">Hot</span>
          <span className="pill info">Cible ICP</span>
          <span className="pill magic">Solaire 69</span>
          <span className="pill warn">Recrutement actif</span>
          <span className="pill ok">A liké posts auto</span>
        </div>
      </div>
      <div className="pros-section">
        <h3><XI name="opportunity" className="ico-sm" />Opportunité liée</h3>
        <div style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          display: "flex", gap: 12, alignItems: "center",
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: 7,
            background: "var(--accent-tint)", color: "var(--accent-2)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <XI name="opportunity" className="ico" />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Système prospection automatisé · Solaris Lyon</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Pipeline « Prospection sortante » · stage <b>Séquence en cours</b>
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, letterSpacing: "-.01em" }}>
            12 000 €
          </div>
        </div>
      </div>
    </>
  );
}

// ── History detail tab ───────────────────────────────────────────────────
function ProsHistoryDetail({ task }) {
  return (
    <div className="pros-section">
      <h3><XI name="history" className="ico-sm" />Historique complet</h3>
      <div style={{ position: "relative", paddingLeft: 14 }}>
        <div style={{ position: "absolute", left: 10, top: 8, bottom: 8, width: 1, background: "var(--border)" }} />
        {task.history.map((h, i) => (
          <div key={i} className="hist-row" style={{ paddingLeft: 4, position: "relative" }}>
            <span className={`ic-wrap ${h.state || ""}`}>
              <XI name={h.kind === "email" ? "mail" :
                        h.kind === "call" ? "phone" :
                        h.kind === "linkedin" ? "linkedin" :
                        h.kind === "whatsapp" ? "whatsapp" :
                        "bolt"} className="ico-sm" />
            </span>
            <div className="text">
              <div className="ttl">{h.title}</div>
              <div className="det">via séquence · étape {i + 1}</div>
            </div>
            <span className="time">{h.time}</span>
          </div>
        ))}
        <div className="hist-row">
          <span className="ic-wrap info"><XI name="bolt" className="ico-sm" /></span>
          <div className="text">
            <div className="ttl">Entrée dans la séquence</div>
            <div className="det">Solaris Lyon a atteint le stage <b>À qualifier</b></div>
          </div>
          <span className="time">il y a 12 j</span>
        </div>
      </div>
    </div>
  );
}

// ── Right aside: sequence progress + history ─────────────────────────────
function ProsAside({ task }) {
  const seq = supaRow("sequences", task.sequenceId);

  // mocked sequence steps display (7 dots)
  const steps = Array.from({ length: task.progressTotal }, (_, i) => i + 1);

  return (
    <>
      <div className="blk">
        <h4>Position dans la séquence</h4>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", marginBottom: 8 }}>
          {seq?.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {steps.map((idx) => {
            const done = idx < task.currentStep;
            const cur  = idx === task.currentStep;
            const kind = idx === 1 ? "email" :
                         idx === 2 ? "linkedin" :
                         idx === 3 ? "wait" :
                         idx === 4 ? "call" :
                         idx === 5 ? "email" :
                         idx === 6 ? "whatsapp" : "email";
            return (
              <div key={idx} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 8px",
                borderRadius: 5,
                background: cur ? "var(--accent-tint)" : "transparent",
                fontSize: 11.5,
                color: done ? "var(--text-3)" : cur ? "var(--accent-2)" : "var(--text-2)",
              }}>
                <span className="seq-dots">
                  <span className={`dot ${done ? "done" : cur ? "cur" : ""}`} />
                </span>
                <XI name={kind === "email" ? "mail" :
                          kind === "linkedin" ? "linkedin" :
                          kind === "wait" ? "clock" :
                          kind === "call" ? "phone" :
                          kind === "whatsapp" ? "whatsapp" :
                          "mail"}
                    className="ico-sm" />
                <span style={{ flex: 1 }}>
                  {kind === "email" ? "Email" :
                   kind === "linkedin" ? "LinkedIn" :
                   kind === "wait" ? "Délai 2j" :
                   kind === "call" ? "Appel" :
                   kind === "whatsapp" ? "WhatsApp" : "Email"}
                  {cur && <span style={{ marginLeft: 6 }} className="pill accent">à faire</span>}
                </span>
                {done && <XI name="check" className="ico-xs" style={{ color: "var(--ok)" }} />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="blk">
        <h4>Stats séquence</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <StatMini value={seq?.active} label="actifs" />
          <StatMini value={seq?.finished} label="finis" />
          <StatMini value="58%" label="ouverture" color="var(--info)" />
          <StatMini value="31%" label="réponse" color="var(--ok)" />
        </div>
      </div>
      <div className="blk">
        <h4>Historique récent</h4>
        <div>
          {task.history.slice().reverse().map((h, i) => (
            <div key={i} className="hist-row">
              <span className={`ic-wrap ${h.state || ""}`}>
                <XI name={h.kind === "email" ? "mail" :
                          h.kind === "call" ? "phone" :
                          h.kind === "linkedin" ? "linkedin" :
                          h.kind === "whatsapp" ? "whatsapp" :
                          "bolt"} className="ico-sm" />
              </span>
              <div className="text">
                <div className="ttl" style={{ fontSize: 11.5 }}>{h.title}</div>
              </div>
              <span className="time">{h.time}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="blk">
        <h4>Actions</h4>
        <div style={{ display: "grid", gap: 6 }}>
          <button className="btn outline sm" style={{ justifyContent: "flex-start" }}>
            <XI name="snooze" className="ico-sm" />Snooze 24h
          </button>
          <button className="btn outline sm" style={{ justifyContent: "flex-start" }}>
            <XI name="pause" className="ico-sm" />Pauser la séquence
          </button>
          <button className="btn outline sm" style={{ justifyContent: "flex-start", color: "var(--danger)" }}>
            <XI name="trash" className="ico-sm" />Sortir de la séquence
          </button>
        </div>
      </div>
    </>
  );
}

function StatMini({ value, label, color = "var(--text)" }) {
  return (
    <div style={{
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: 7,
      padding: "8px 10px",
    }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1, color, letterSpacing: "-.01em" }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {label}
      </div>
    </div>
  );
}

Object.assign(window, { ProspectionPage });
