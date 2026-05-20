// automations-sequences.jsx — Sequence list + Prospection Sequence builder

const { Fragment } = React;

// ──────────────────────────────────────────────────────────────────────────
//  SEQUENCES LIST
// ──────────────────────────────────────────────────────────────────────────
function SequencesList({ onOpen, onNew }) {
  return (
    <div className="alist-page">
      <div className="alist-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Séquences de prospection</h1>
          <div className="desc">
            Cadences multi-canal alternant emails automatiques et actions manuelles (appels, WhatsApp, LinkedIn).
          </div>
        </div>
        <button className="btn outline sm">
          <XI name="template" className="ico-sm" />Templates
        </button>
        <button className="btn accent" onClick={onNew}>
          <XI name="plus" className="ico-sm" />Nouvelle séquence
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <SummaryCard icon="flame" color="var(--accent)" bg="var(--accent-tint)"
                     value={SUPA.sequences.rows.reduce((s, r) => s + r.active, 0)}
                     label="Prospects actifs" desc="dans une séquence" />
        <SummaryCard icon="mailOpen" color="var(--info)" bg="var(--info-tint)"
                     value="58%" label="Taux d'ouverture" desc="moyenne 7 derniers jours" />
        <SummaryCard icon="phone" color="var(--manual)" bg="var(--manual-tint)"
                     value="14" label="Tâches du jour" desc="appels + WhatsApp à traiter" />
        <SummaryCard icon="checkBig" color="var(--ok)" bg="var(--ok-tint)"
                     value="31%" label="Taux de réponse" desc="cible : > 22%" />
      </div>

      <div className="alist-table">
        <div className="seq-list-row" style={{
          background: "var(--bg-2)", borderBottom: "1px solid var(--border)",
          fontSize: 10.5, fontWeight: 600, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: ".06em", padding: "8px 14px",
        }}>
          <div />
          <div>Nom</div>
          <div>Pipeline · Stage</div>
          <div>Progression</div>
          <div>Réponse</div>
          <div>Active</div>
          <div />
        </div>
        {SUPA.sequences.rows.map((seq) => (
          <SequenceListRow key={seq.id} seq={seq} onOpen={() => onOpen(seq)} />
        ))}
      </div>
    </div>
  );
}

function SequenceListRow({ seq, onOpen }) {
  // Mock — pretend the sample sequence has full data, others are derived
  const isMain = seq.id === "seq_solaire69";
  const pipeline = supaRow("pipelines", "pip_prosp");
  const stage    = supaRow("stages", "st_p_raw");
  const total = seq.active + seq.paused + seq.finished;
  const finishedPct = total === 0 ? 0 : Math.round((seq.finished / total) * 100);
  const replyRate = 0.22 + Math.random() * 0.2;

  return (
    <div className="seq-list-row" onClick={onOpen}>
      <div className="kind-ic" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
        <XI name="flame" className="ico" />
      </div>
      <div>
        <div className="name" style={{ fontSize: 13, fontWeight: 500 }}>{seq.name}</div>
        <div className="sub" style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
          {seq.steps} étapes · multi-canal · cadence L-V 8h–19h
        </div>
      </div>
      <div className="col-trigger">
        <span className="ic" style={{ background: "var(--accent-tint)", color: "var(--accent-2)" }}>
          <XI name="pipeline" className="ico-sm" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pipeline.name}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            stage = {stage.name}
          </div>
        </div>
      </div>
      <div>
        <div className="progress" title={`${seq.finished} terminés / ${seq.active} actifs / ${seq.paused} en pause`}>
          <i style={{ width: `${finishedPct}%` }} />
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
          {seq.active} actifs · {seq.finished} terminés
        </div>
      </div>
      <div className="col-meta" style={{ textAlign: "left" }}>
        <span className="big" style={{ color: replyRate > .3 ? "var(--ok)" : "var(--text)" }}>{Math.round(replyRate * 100)}%</span>
        <span style={{ marginLeft: 0 }}>répondu</span>
      </div>
      <div className="col-status">
        <StatusBadge status="on" />
      </div>
      <div>
        <button className="btn ghost xs icon"><XI name="more" className="ico-sm" /></button>
      </div>
    </div>
  );
}

function SummaryCard({ icon, color, bg, value, label, desc }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <span style={{
        width: 36, height: 36, borderRadius: 8,
        background: bg, color: color,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <XI name={icon} className="ico-lg" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, lineHeight: 1, letterSpacing: "-.01em" }}>
          {value}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  SEQUENCE BUILDER
// ──────────────────────────────────────────────────────────────────────────
function SequenceBuilder({ sequence, onBack }) {
  const [seq, setSeq] = useState(sequence);
  const [selectedId, setSelectedId] = useState(seq.steps[0].id);
  const [showPicker, setShowPicker] = useState(null);  // null | { afterId } | { before }

  const selectedStep = seq.steps.find((s) => s.id === selectedId);

  const updateStep = useCallback((id, patch) => {
    setSeq((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => s.id === id ? { ...s, ...patch } : s),
    }));
  }, []);

  const updateSeq = useCallback((patch) => {
    setSeq((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <>
      {/* LEFT — sequence settings + step library */}
      <div className="pane" style={{ minWidth: 260 }}>
        <div className="pane-hd">
          <div className="title-row">
            <button className="btn ghost sm icon" onClick={onBack} title="Retour"><XI name="chevleft" className="ico-sm" /></button>
            <XI name="flame" className="ico-sm" style={{ color: "var(--accent)" }} />
            <span>Séquence</span>
          </div>
        </div>
        <div className="pane-body">
          <Section label="Cible" defaultOpen>
            <Field label="Pipeline" required hint="opps entrent ici">
              <SupaSelect table="pipelines" value={seq.pipeline}
                          icon="pipeline"
                          onChange={(v) => updateSeq({ pipeline: v, stage: null })} />
            </Field>
            <Field label="Stage d'entrée" required>
              <SupaSelect table="stages" value={seq.stage}
                          icon="kanban"
                          disabled={!seq.pipeline}
                          filterFK={seq.pipeline ? { pipeline_id: seq.pipeline } : null}
                          onChange={(v) => updateSeq({ stage: v })} />
            </Field>
            <Field label="Stage de sortie automatique" hint="si réponse">
              <SupaSelect table="stages" value="st_p_replied"
                          icon="kanban"
                          filterFK={seq.pipeline ? { pipeline_id: seq.pipeline } : null} />
            </Field>
          </Section>

          <Section label="Règles d'envoi" defaultOpen>
            <Field label="Cadence">
              <select className="select" defaultValue="bizday">
                <option value="bizday">Lun-Ven · 8h–19h</option>
                <option value="all">7j/7 · 8h–19h</option>
                <option value="custom">Personnalisée…</option>
              </select>
            </Field>
            <Field label="Fuseau horaire">
              <select className="select" defaultValue="Paris">
                <option>Europe/Paris</option>
                <option>UTC</option>
              </select>
            </Field>
            <ToggleRow label="Sortir si réponse"
                       desc="Stoppe automatiquement la séquence si le contact répond à un email."
                       checked={seq.exitOnReply} onChange={(v) => updateSeq({ exitOnReply: v })}
                       accent />
            <ToggleRow label="Sortir si désinscription" checked />
            <ToggleRow label="Limiter à 1 envoi / jour / contact" checked />
          </Section>

          <Section label="Attribution" defaultOpen={false}>
            <Field label="Owners (round-robin)">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(seq.ownerRR || []).map((uid) => {
                  const u = supaRow("users", uid);
                  return u ? (
                    <div key={uid} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "4px 8px", background: "var(--surface-2)",
                      border: "1px solid var(--border)", borderRadius: 6,
                    }}>
                      <Av user={u} size={20} />
                      <span style={{ fontSize: 12, flex: 1 }}>{u.name}</span>
                      <span className="pill">{u.role}</span>
                      <button className="btn ghost xs icon"><XI name="x" className="ico-xs" /></button>
                    </div>
                  ) : null;
                })}
                <button className="btn outline xs" style={{ alignSelf: "flex-start" }}>
                  <XI name="plus" className="ico-xs" />Ajouter un owner
                </button>
              </div>
            </Field>
          </Section>

          <Section label="Variables disponibles" defaultOpen={false}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { v: "{{contact.first_name}}", desc: "Prénom du contact" },
                { v: "{{contact.last_name}}",  desc: "Nom" },
                { v: "{{company.name}}",       desc: "Entreprise" },
                { v: "{{company.city}}",       desc: "Ville de l'entreprise" },
                { v: "{{contact.role}}",       desc: "Poste" },
                { v: "{{owner.first_name}}",   desc: "Prénom du SDR" },
                { v: "{{calendar_link}}",      desc: "Lien Cal" },
              ].map((x) => (
                <div key={x.v} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "4px 6px",
                }}>
                  <code style={{
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    background: "var(--accent-tint)", color: "var(--accent-2)",
                    padding: "1px 5px", borderRadius: 3,
                  }}>{x.v}</code>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>{x.desc}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* CENTER — vertical step list */}
      <div className="pane" style={{ background: "transparent" }}>
        <div className="pane-hd">
          <div className="title-row">
            <XI name="flame" className="ico-sm" style={{ color: "var(--accent)" }} />
            <span>{seq.name}</span>
            <span className="pill accent">Séquence</span>
          </div>
          <div className="actions">
            <button className="btn ghost xs"><XI name="play" className="ico-xs" />Tester sur un contact</button>
            <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 4px" }} />
            <button className="btn outline xs"><XI name="pause" className="ico-xs" />Pause</button>
            <button className="btn ok xs"><XI name="power" className="ico-xs" />Activer</button>
          </div>
        </div>
        <div className="seq-host">
          <div className="seq-stage">
            <SequenceSummary seq={seq} />

            {/* Entry node */}
            <div style={{
              background: "var(--text)", color: "var(--bg)",
              padding: "12px 16px", borderRadius: 10,
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: "var(--shadow-2)",
            }}>
              <XI name="bolt" className="ico" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Entrée — opportunité atteint le stage</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                  {supaRow("pipelines", seq.pipeline)?.name} · {supaRow("stages", seq.stage)?.name}
                </div>
              </div>
              <span className="pill" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>déclencheur</span>
            </div>

            {seq.steps.map((step, i) => (
              <Fragment key={step.id}>
                <div className="seq-conn">
                  {step.day > 0 && (
                    <span className="wait-chip">
                      <XI name="clock" className="ico-xs" />
                      J+{step.day}
                      {step.sendAt && ` · ${step.sendAt}`}
                    </span>
                  )}
                </div>
                <SeqStep step={step} index={i + 1}
                         isSelected={selectedId === step.id}
                         onSelect={() => setSelectedId(step.id)} />
              </Fragment>
            ))}

            <div className="seq-conn" />
            <button className="add-step-pill" onClick={() => setShowPicker({})}>
              <XI name="plus" className="ico-sm" />Ajouter une étape
            </button>

            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <div className="flow-end"><XI name="flag" className="ico-sm" />Fin de séquence</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — step inspector */}
      <div className="pane">
        <SeqStepInspector step={selectedStep} updateStep={(p) => updateStep(selectedId, p)} seq={seq} />
      </div>

      {showPicker && (
        <SeqStepPickerModal onClose={() => setShowPicker(null)} />
      )}
    </>
  );
}

// ── Summary card displayed above the steps ────────────────────────────────
function SequenceSummary({ seq }) {
  return (
    <div className="seq-summary">
      <div>
        <h2>{seq.name}</h2>
        <div className="meta">
          <span className="item"><XI name="pipeline" className="ico-sm" />{supaRow("pipelines", seq.pipeline)?.name}</span>
          <span className="item"><XI name="kanban" className="ico-sm" />{supaRow("stages", seq.stage)?.name}</span>
          <span className="item"><XI name="clock" className="ico-sm" />{seq.cadence}</span>
          <span className="item">
            <span style={{ display: "inline-flex", gap: -4 }}>
              {(seq.ownerRR || []).map((id, i) => {
                const u = supaRow("users", id);
                return u ? <Av key={id} user={u} size={20} ring={i === 0} /> : null;
              })}
            </span>
          </span>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><div className="v">{seq.stats.active}</div><div className="l">Actifs</div></div>
        <div className="stat"><div className="v">{seq.stats.replied}</div><div className="l">Répondus</div></div>
        <div className="stat" style={{ color: "var(--accent)" }}><div className="v">{seq.stats.booked}</div><div className="l">RDV pris</div></div>
      </div>
    </div>
  );
}

// ── A single sequence step ────────────────────────────────────────────────
function SeqStep({ step, index, isSelected, onSelect }) {
  const meta = stepMeta(step);
  return (
    <div className="seq-step" data-kind={step.kind} data-selected={isSelected}
         onClick={(e) => { e.stopPropagation(); onSelect?.(); }}>
      <div className="hd">
        <span className="num">{index}</span>
        <span className="ic-wrap"><XI name={meta.icon} className="ico" /></span>
        <div className="title" style={{ minWidth: 0 }}>
          <div>{meta.title}</div>
          <div className="sub">{meta.subtitle}</div>
        </div>
        {step.mode && (
          <span className={`step-mode-tag ${step.mode}`}>
            <XI name={step.mode === "auto" ? "bolt" : "cursor"} className="ico-xs" />
            {step.mode === "auto" ? "AUTO" : "MANUEL"}
          </span>
        )}
        <div className="tools">
          <button title="Dupliquer"><XI name="copyClip" className="ico-sm" /></button>
          <button title="Supprimer"><XI name="trash" className="ico-sm" /></button>
        </div>
      </div>
      <div className="body">
        {meta.preview}
        {meta.metaRow && (
          <div className="meta-row">
            {meta.metaRow.map((m, i) => (
              <span key={i} className="m">
                {m.icon && <XI name={m.icon} className="ico-xs" />}{m.lbl}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Compute step display metadata
function stepMeta(step) {
  if (step.kind === "email") {
    const tpl = supaRow("email_templates", step.template);
    return {
      icon: "mail",
      title: tpl?.name || "Email automatique",
      subtitle: "Envoi automatique via SendGrid",
      preview: (
        <div className="preview">
          <div className="subj">{tpl?.subject || "—"}</div>
          <div style={{ color: "var(--text-3)" }}>{tpl?.body_preview || ""}</div>
        </div>
      ),
      metaRow: [
        { icon: "clock", lbl: step.sendAt || "—" },
        step.trackOpens && { icon: "mailOpen", lbl: "track ouvertures" },
        step.trackClicks && { icon: "mouse", lbl: "track clics" },
      ].filter(Boolean),
    };
  }
  if (step.kind === "linkedin") {
    return {
      icon: "linkedin",
      title: step.label || "LinkedIn",
      subtitle: "Action manuelle — apparaîtra dans la file de démarchage",
      preview: (
        <div className="preview" style={{ fontStyle: "italic", color: "var(--text-2)" }}>
          {(step.message || "").split(/(\{\{[^}]+\}\})/).map((p, i) =>
            p.startsWith("{{") ? <span key={i} className="var-chip">{p}</span> : p
          )}
        </div>
      ),
      metaRow: [
        { icon: "user", lbl: "Connexion + InMail" },
      ],
    };
  }
  if (step.kind === "whatsapp") {
    const tpl = supaRow("whatsapp_templates", step.template);
    return {
      icon: "whatsapp",
      title: tpl?.name || "WhatsApp",
      subtitle: "Message pré-rédigé · à valider manuellement",
      preview: (
        <div className="preview">
          {tpl?.body_preview || ""}
        </div>
      ),
      metaRow: [
        { icon: "phone", lbl: "via numéro pro Lucas" },
      ],
    };
  }
  if (step.kind === "call") {
    const sc = supaRow("call_scripts", step.script);
    return {
      icon: "phone",
      title: sc?.name || "Appel à passer",
      subtitle: "Action manuelle — script prêt à lire dans la file de démarchage",
      preview: (
        <div className="preview">
          <span className="subj">Script :</span> {sc?.name || "Script de découverte"} —
          <span style={{ color: "var(--text-3)" }}> durée estimée {sc?.duration || step.duration}</span>
        </div>
      ),
      metaRow: [
        { icon: "phone", lbl: "appel sortant" },
      ],
    };
  }
  if (step.kind === "wait") {
    return {
      icon: "clock",
      title: "Attendre",
      subtitle: "Délai avant la prochaine étape",
      preview: null,
      metaRow: null,
    };
  }
  return { icon: "task", title: step.kind, subtitle: "", preview: null };
}

// ──────────────────────────────────────────────────────────────────────────
//  SEQUENCE STEP INSPECTOR
// ──────────────────────────────────────────────────────────────────────────
function SeqStepInspector({ step, updateStep, seq }) {
  if (!step) {
    return (
      <div className="pane-body" style={{ padding: 24, color: "var(--text-3)", textAlign: "center" }}>
        <XI name="cursor" className="ico-xl" style={{ color: "var(--text-4)", margin: "40px 0 14px" }} />
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>Aucune étape sélectionnée</div>
      </div>
    );
  }
  const meta = stepMeta(step);
  return (
    <div className="inspector">
      <div className="inspector-hd">
        <div className="top">
          <span className="ic-wrap" style={{
            background: step.kind === "email" ? "var(--action-tint)" :
                        step.kind === "call" ? "var(--manual-tint)" :
                        step.kind === "whatsapp" ? "var(--ok-tint)" :
                        step.kind === "linkedin" ? "var(--info-tint)" :
                        step.kind === "wait" ? "var(--delay-tint)" : "var(--manual-tint)",
            color: step.kind === "email" ? "var(--action)" :
                   step.kind === "call" ? "var(--manual)" :
                   step.kind === "whatsapp" ? "var(--ok)" :
                   step.kind === "linkedin" ? "var(--info)" :
                   step.kind === "wait" ? "var(--delay)" : "var(--manual)",
          }}>
            <XI name={meta.icon} className="ico" />
          </span>
          <h3>{meta.title}</h3>
          {step.mode && (
            <span className={`step-mode-tag ${step.mode}`} style={{ height: 18 }}>
              {step.mode === "auto" ? "AUTO" : "MANUEL"}
            </span>
          )}
        </div>
        <div className="desc">{meta.subtitle}</div>
      </div>

      <div className="inspector-body">
        <Section label="Timing" defaultOpen>
          <Field label="Envoyer à" hint="depuis le début">
            <div className="field-row">
              <input className="input mono" defaultValue={`J+${step.day}`} style={{ flex: 1 }} />
              {step.sendAt && (
                <input className="input mono" defaultValue={step.sendAt} style={{ flex: 1 }} />
              )}
            </div>
          </Field>
          {step.kind !== "wait" && (
            <Field label="Sauter si">
              <select className="select">
                <option>Le contact a déjà répondu</option>
                <option>Le contact n'a pas ouvert l'email précédent (2 jours)</option>
                <option>Jamais</option>
              </select>
            </Field>
          )}
        </Section>

        {step.kind === "email" && (
          <Section label="Email" defaultOpen>
            <Field label="Template" required>
              <SupaSelect table="email_templates" value={step.template}
                          icon="template"
                          onChange={(v) => updateStep({ template: v })} />
            </Field>
            <Field label="Expéditeur">
              <SupaSelect table="users" placeholder="round-robin" icon="user" />
            </Field>
            <Field label="Suivre dans le thread précédent">
              <SegFull value={step.threadFollow || "auto"}
                       options={[
                         { value: "auto", label: "Auto" },
                         { value: "new",  label: "Nouveau" },
                         { value: "reply",label: "Reply" },
                       ]} />
            </Field>
            <ToggleRow label="Tracker les ouvertures" checked={step.trackOpens}
                       onChange={(v) => updateStep({ trackOpens: v })} accent />
            <ToggleRow label="Tracker les clics" checked={step.trackClicks}
                       onChange={(v) => updateStep({ trackClicks: v })} accent />
            <ToggleRow label="A/B test du sujet" />
          </Section>
        )}

        {step.kind === "call" && (
          <Section label="Appel manuel" defaultOpen>
            <Field label="Script d'appel" required>
              <SupaSelect table="call_scripts" value={step.script}
                          icon="phone"
                          onChange={(v) => updateStep({ script: v })} />
            </Field>
            <Field label="Durée estimée">
              <input className="input mono" defaultValue={step.duration || "3 min"} />
            </Field>
            <Field label="Priorité">
              <SegFull value={step.priority || "normal"}
                       options={[
                         { value: "low",   label: "Faible" },
                         { value: "normal",label: "Normale" },
                         { value: "high",  label: "Haute" },
                       ]} />
            </Field>
            <ToggleRow label="Bloquer la séquence tant que non fait"
                       desc="Si l'opérateur n'a pas appelé après 48h, la séquence est mise en pause."
                       checked />
            <ToggleRow label="Notifier en cas de réponse positive" checked accent />
          </Section>
        )}

        {step.kind === "whatsapp" && (
          <Section label="WhatsApp manuel" defaultOpen>
            <Field label="Template" required>
              <SupaSelect table="whatsapp_templates" value={step.template}
                          icon="whatsapp"
                          onChange={(v) => updateStep({ template: v })} />
            </Field>
            <Field label="Numéro émetteur">
              <select className="select" defaultValue="lm">
                <option value="lm">Lucas Martin · +33 6 12 34 56 78</option>
                <option value="lm2">Numéro vert · +33 9 70 ...</option>
              </select>
            </Field>
            <ToggleRow label="Demander validation avant envoi" desc="L'opérateur ouvre WhatsApp pour cliquer envoyer." checked accent />
          </Section>
        )}

        {step.kind === "linkedin" && (
          <Section label="LinkedIn manuel" defaultOpen>
            <Field label="Action">
              <SegFull value={step.action || "connect"}
                       options={[
                         { value: "view",    label: "Vue profil" },
                         { value: "connect", label: "Connexion" },
                         { value: "inmail",  label: "InMail" },
                       ]} />
            </Field>
            <Field label="Message de connexion" hint={`${(step.message || "").length}/300`}>
              <textarea className="textarea" rows={4} defaultValue={step.message}
                        onBlur={(e) => updateStep({ message: e.target.value })} />
            </Field>
            <ToggleRow label="Skip si déjà connecté" checked />
          </Section>
        )}

        {step.kind === "wait" && (
          <Section label="Délai" defaultOpen>
            <Field label="Durée">
              <div className="field-row">
                <input className="input mono" defaultValue="2" style={{ flex: 1 }} />
                <select className="select" defaultValue="d" style={{ flex: 1.2 }}>
                  <option value="m">minutes</option>
                  <option value="h">heures</option>
                  <option value="d">jours ouvrés</option>
                  <option value="dc">jours calendaires</option>
                </select>
              </div>
            </Field>
            <Field label="Ou attendre jusqu'à">
              <select className="select">
                <option>(rien — délai fixe)</option>
                <option>Lundi prochain 9h</option>
                <option>Ouverture du dernier email</option>
              </select>
            </Field>
          </Section>
        )}

        <Section label="Aperçu" defaultOpen>
          <div style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            padding: 10,
            fontSize: 12, color: "var(--text-2)", lineHeight: 1.45,
          }}>
            Variables résolues pour <b style={{ color: "var(--text)" }}>Mathilde Bertin · Solaris Lyon</b> :
            <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
              {"{{contact.first_name}}"} → Mathilde<br />
              {"{{company.name}}"} → Solaris Lyon
            </div>
          </div>
          <button className="btn outline xs" style={{ marginTop: 8 }}>
            <XI name="eye" className="ico-xs" />Prévisualiser l'envoi
          </button>
        </Section>
      </div>
    </div>
  );
}

// ── Step picker (modal to add a new step) ─────────────────────────────────
function SeqStepPickerModal({ onClose }) {
  const cats = [
    { cat: "auto", label: "Étapes automatiques", items: [
      { icon: "mail", name: "Email", desc: "Envoi automatique d'un template" },
      { icon: "clock", name: "Attendre", desc: "Pause fixe ou jusqu'à un événement" },
    ]},
    { cat: "manual", label: "Étapes manuelles (file de démarchage)", items: [
      { icon: "phone",    name: "Appel téléphonique", desc: "Avec script pré-rédigé" },
      { icon: "whatsapp", name: "WhatsApp",           desc: "Message à valider et envoyer" },
      { icon: "linkedin", name: "LinkedIn",           desc: "Connexion ou InMail" },
      { icon: "task",     name: "Tâche personnalisée",desc: "Action libre à valider" },
    ]},
    { cat: "cond", label: "Logique", items: [
      { icon: "branch", name: "Branche conditionnelle", desc: "Si telle propriété → tel chemin" },
      { icon: "flag",   name: "Fin de séquence",        desc: "Sortir du flow" },
    ]},
  ];
  return ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="grow">
            <div className="title">Ajouter une étape à la séquence</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Alternez emails automatiques et actions manuelles pour rester humain.
            </div>
          </div>
          <button className="btn ghost sm icon" onClick={onClose}><XI name="x" className="ico-sm" /></button>
        </div>
        <div className="modal-body">
          {cats.map((c) => (
            <div key={c.cat}>
              <div className="picker-section-label">{c.label}</div>
              <div className="picker-grid">
                {c.items.map((it) => (
                  <div key={it.name} className={`picker-card ${c.cat === "auto" ? "action" : c.cat === "manual" ? "manual" : "cond"}`}>
                    <div className="top">
                      <span className="ic"><XI name={it.icon} className="ico" /></span>
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{it.name}</div>
                      </div>
                    </div>
                    <div className="desc">{it.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

Object.assign(window, {
  SequencesList, SequenceBuilder,
});
