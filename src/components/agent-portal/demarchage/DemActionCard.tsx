"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon, Pill } from "./DemIcon";
import { demCh, isMessageKind } from "./channels";
import { DEM_OBJECTIONS } from "./DemObjections";
import { SCRIPT_STEPS } from "@/lib/telephony/call-script";
import { VARIANT_LABELS, versionsPreparees, type MessageVariant } from "@/lib/automations/variables";
import { STEP_OUTCOMES, stepOutcome as findOutcome, type StepOutcomeId } from "@/lib/sales-pipeline/stages";
import type { StageRole } from "@/lib/opportunites/stage-roles";
import { authedFetch } from "@/utils/authedFetch";
import { lienWhatsApp } from "@/lib/prospects/canal";
import { one } from "@/components/agent-portal/format";
import { useTelephonyOptional } from "@/components/telephony/CallProvider";
import { placeCallback } from "@/lib/telephony/client";
import { demoShareUrl } from "@/lib/site-builder/demo-share-url";
import type { CompanyBundle, DemarchagePatchBody, DemarchageTask, DemAudit, DemTemplates } from "./types";

/** Effet de chaque issue sur l'étape de l'affaire. */
const OUTCOME_ROLE: Partial<Record<StepOutcomeId, StageRole>> = {
  answered: "contacte",
  lukewarm: "interesse",
  not_interested: "perdu",
  blocked: "perdu",
};

/** L'issue → la teinte du bouton, dans le vocabulaire de la feuille de style. */
const TONE: Record<string, string> = {
  ok: "ok",
  info: "info",
  warn: "warn",
  danger: "danger",
  muted: "",
};

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Remplace les `{{variables}}` d'un modèle et les met en évidence à l'écran. */
function fillVars(txt: string, vars: Record<string, string>): string {
  return txt.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
}

function ScriptLine({ text, vars }: { text: string; vars: Record<string, string> }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((s, i) =>
        /^\{\{\w+\}\}$/.test(s) ? (
          <span key={i} className="dm-var">
            {fillVars(s, vars)}
          </span>
        ) : (
          <span key={i}>{s}</span>
        ),
      )}
    </>
  );
}

export function DemActionCard({
  task,
  company,
  audit,
  templates,
  busy,
  onPatch,
  onLogged,
  onNext,
}: {
  task: DemarchageTask;
  company: CompanyBundle | null;
  audit: DemAudit;
  templates: DemTemplates | null;
  busy: boolean;
  onPatch: (body: Omit<DemarchagePatchBody, "id">) => void;
  onLogged: () => void;
  onNext: () => void;
}) {
  const ch = demCh(task.kind);
  const seq = task.sequence;
  const ent = one(task.entreprise);
  const contact = one(task.contact);
  const tel = useTelephonyOptional();

  const dec = company?.contacts.find((c) => c.is_decision_maker) ?? company?.contacts[0] ?? null;
  const ctName = dec
    ? `${dec.first_name ?? ""} ${dec.last_name ?? ""}`.trim()
    : `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim();
  const firstName = ctName.split(" ")[0] || "";

  const vars = useMemo(
    () => ({
      prenom: firstName,
      nom: ctName,
      entreprise: company?.entreprise.name ?? ent?.name ?? "",
      ville: company?.entreprise.ville ?? ent?.ville ?? "",
      score: audit?.note_globale != null ? String(audit.note_globale) : "",
      demo: company?.site && company.site.is_published ? demoShareUrl(company.site) : "",
      org: company?.entreprise.name ?? ent?.name ?? "",
    }),
    [firstName, ctName, company, ent, audit],
  );

  // ── état partagé ────────────────────────────────────────────────────────
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<StepOutcomeId | null>(null);
  const [snoozeDate, setSnoozeDate] = useState(tomorrow());

  // ── message ─────────────────────────────────────────────────────────────
  const stepVersions = useMemo(() => {
    const main = { id: "step", name: "Modèle de l'étape", body: task.payload?.message ?? "" };
    const alt = task.payload?.variantAlt;
    return alt?.message
      ? [main, { id: "step-alt", name: alt.variant === "contact" ? "avec le prénom" : "sans le prénom", body: alt.message }]
      : [main];
  }, [task.payload]);

  const libraryTemplates = useMemo(() => {
    if (!templates) return [];
    const lib = task.kind === "linkedin" ? templates.whatsapp : templates.whatsapp;
    return lib.map((t) => ({ id: t.id, name: t.name, body: t.body }));
  }, [templates, task.kind]);

  const allTemplates = useMemo(() => [...stepVersions, ...libraryTemplates], [stepVersions, libraryTemplates]);
  const [tplId, setTplId] = useState(stepVersions[0]?.id ?? "step");
  const [msg, setMsg] = useState(stepVersions[0]?.body ?? "");
  useEffect(() => {
    setTplId(stepVersions[0]?.id ?? "step");
    setMsg(stepVersions[0]?.body ?? "");
    setNote("");
    setOutcome(null);
  }, [task.id, stepVersions]);

  const pickTpl = (id: string) => {
    const t = allTemplates.find((x) => x.id === id);
    if (!t) return;
    setTplId(id);
    setMsg(t.id.startsWith("step") ? t.body : fillVars(t.body, vars));
  };

  const [att, setAtt] = useState({ demo: false, audit: false });
  useEffect(() => setAtt({ demo: false, audit: false }), [task.id]);

  const demoUrl = company?.site && company.site.is_published ? demoShareUrl(company.site) : null;
  const auditUrl = task.payload?.audit_url as string | undefined;
  const body = msg + (att.demo && demoUrl ? `\n\n${demoUrl}` : "") + (att.audit && auditUrl ? `\n\n${auditUrl}` : "");

  const phones = useMemo(() => {
    const raw = [
      task.payload?.phone,
      ...(company?.contacts.map((c) => c.tel) ?? []),
      company?.entreprise.telephone,
      ent?.telephone,
    ].filter((v): v is string => !!v && v.trim() !== "");
    return [...new Set(raw)];
  }, [task.payload?.phone, company, ent]);
  const [phone, setPhone] = useState(phones[0] ?? "");
  useEffect(() => setPhone(phones[0] ?? ""), [phones]);

  const linkedinUrl =
    (task.payload?.linkedin as string | undefined) ??
    company?.contacts.find((c) => c.linkedin_url)?.linkedin_url ??
    null;

  const [sending, setSending] = useState(false);

  const logMessage = async (channel: "whatsapp" | "linkedin", to: string) => {
    try {
      const res = await authedFetch("/api/messages/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          contact_id: task.contact_id,
          entreprise_id: task.entreprise_id,
          opportunite_id: task.opportunite_id,
          to_email: to,
          to_name: ctName || ent?.name,
          subject: channel === "whatsapp" ? "Message WhatsApp" : "Message LinkedIn",
          body_text: body,
        }),
      });
      if (!res.ok) throw new Error();
      onLogged();
    } catch {
      toast.error("Message ouvert, mais pas journalisé.");
    }
  };

  const send = async () => {
    setSending(true);
    try {
      if (task.kind === "whatsapp") {
        const url = lienWhatsApp(phone, body);
        if (!url) {
          toast.error("Ce numéro n'est pas exploitable sur WhatsApp.");
          return;
        }
        window.open(url, "_blank");
        await logMessage("whatsapp", phone);
      } else {
        if (!linkedinUrl) {
          toast.error("Aucun profil LinkedIn connu.");
          return;
        }
        await navigator.clipboard.writeText(body).catch(() => {});
        window.open(linkedinUrl, "_blank");
        await logMessage("linkedin", linkedinUrl);
        toast.success("Message copié dans le presse-papiers.");
      }
    } finally {
      setSending(false);
    }
  };

  // ── appel ───────────────────────────────────────────────────────────────
  const [scriptStep, setScriptStep] = useState(0);
  const [ob, setOb] = useState<number | null>(null);
  const [calling, setCalling] = useState(false);

  /**
   * Ce que la SÉQUENCE a préparé pour cet appel-là, et rien d'autre.
   *
   * Le moteur rend le script au moment de créer la tâche et pose les DEUX
   * versions dans son payload (`versionsPreparees` est la seule lecture de ce
   * couple, partagée avec le pipeline commercial et le tableau des tâches à la
   * main). On ne recalcule donc rien ici : afficher un texte reconstitué dans
   * le navigateur, c'est risquer de faire lire autre chose que ce qui a été
   * préparé.
   *
   * La carte s'ouvre sur ce texte seul. L'argumentaire générique et les
   * objections — les mêmes pour tous les prospects — passent derrière un
   * onglet : ils aident quand on cale, ils ne sont pas ce qu'on lit en
   * décrochant.
   */
  const callVersions = useMemo(() => versionsPreparees(task.payload), [task.payload]);
  const [callVariant, setCallVariant] = useState<MessageVariant>(callVersions[0]?.variant ?? "company");
  const [callTab, setCallTab] = useState<"script" | "aide">("script");
  useEffect(() => {
    setScriptStep(0);
    setOb(null);
    setCallVariant(callVersions[0]?.variant ?? "company");
    setCallTab("script");
  }, [task.id, callVersions]);

  const callScript =
    callVersions.find((v) => v.variant === callVariant)?.message ?? callVersions[0]?.message ?? "";
  const scriptName = typeof task.payload?.scriptName === "string" ? task.payload.scriptName : null;

  const callPhone = (task.payload?.phone as string | undefined) || phones[0] || null;
  const call = async () => {
    if (!callPhone) return;
    setCalling(true);
    try {
      if (tel) {
        await tel.dial({
          to: callPhone,
          contactId: task.contact_id,
          entrepriseId: task.entreprise_id,
          opportuniteId: task.opportunite_id,
        });
      } else {
        const res = await placeCallback({
          to: callPhone,
          contact_id: task.contact_id,
          entreprise_id: task.entreprise_id,
          opportunite_id: task.opportunite_id,
        });
        if (res.ok) toast.success("Appel lancé", { description: "Votre téléphone va sonner." });
        else toast.error("Appel impossible", { description: res.error });
      }
    } finally {
      setCalling(false);
    }
  };

  // ── attente ─────────────────────────────────────────────────────────────
  const declareReply = async () => {
    if (!task.enrollment_id) return;
    try {
      const res = await authedFetch(`/api/automations/enrollments/${task.enrollment_id}/reply`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload?.message || payload?.error || "Reprise impossible");
        return;
      }
      toast.success(
        payload?.rattrapage
          ? "Demi-tour — la séquence repart sur la suite « il a répondu »"
          : "Séquence reprise — étape suivante planifiée",
      );
      onNext();
    } catch {
      toast.error("Action impossible");
    }
  };

  // ── issues ──────────────────────────────────────────────────────────────
  const chosen = outcome ? findOutcome(outcome) : null;
  const saveOutcome = () => {
    if (!chosen || !outcome) return;
    if (chosen.needsNote && !note.trim()) {
      toast.error("Ajoute une note pour cette issue.");
      return;
    }
    const status = outcome === "later" || (outcome === "no_answer" && task.kind === "call") ? "snoozed" : "done";
    onPatch({
      status,
      opportunite_id: task.opportunite_id ?? undefined,
      outcome: OUTCOME_ROLE[outcome],
      step_outcome: outcome,
      note: note.trim() || undefined,
      snooze_until:
        status === "snoozed" && outcome === "later"
          ? new Date(`${snoozeDate}T09:00:00`).toISOString()
          : undefined,
    });
  };

  const rdv = () =>
    onPatch({
      status: "done",
      opportunite_id: task.opportunite_id ?? undefined,
      outcome: "rdv",
      note: note.trim() || undefined,
    });

  return (
    <section className="dm-card" style={{ ["--k" as string]: ch.c, ["--kt" as string]: ch.c + "1a" }}>
      <div className="dm-card-h">
        <span className="ic">
          <Icon name={ch.ic} className="ico-sm" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="ti">
            {ch.cta}
            {seq?.stepIndex != null && ` · étape ${seq.stepIndex}/${seq.totalSteps}`}
          </div>
          <div className="su">
            {seq?.stepLabel || task.title || ch.lb}
            {ent?.name && <span style={{ color: "var(--text-4)" }}> · {ent.name}</span>}
          </div>
        </div>
        <div className="rt">
          <span className="dm-live" />
          <Pill kind={task.kind === "call" ? "warn" : "accent"}>à faire</Pill>
          <button className="btn outline sm" onClick={onNext}>
            Suivant
            <Icon name="arrowRight" className="ico-sm" />
          </button>
        </div>
      </div>

      <div className="dm-card-b">
        {/* ── message ── */}
        {isMessageKind(task.kind) && (
          <>
            <div className="dm-tpls">
              <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 2 }}>Modèles :</span>
              {allTemplates.map((t) => (
                <button key={t.id} className="dm-tpl" aria-pressed={tplId === t.id} onClick={() => pickTpl(t.id)}>
                  <Icon name="doc" className="ico-xs" />
                  {t.name}
                </button>
              ))}
            </div>

            <div className="dm-msg">
              <div className="subj">
                <Icon name={ch.ic} className="ico-sm" style={{ color: ch.c }} />
                <span style={{ fontWeight: 600 }}>{ctName || ent?.name}</span>
                {task.kind === "whatsapp" && phones.length > 1 ? (
                  <select
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{
                      border: 0,
                      background: "transparent",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-3)",
                      outline: "none",
                    }}
                  >
                    {phones.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                    {task.kind === "whatsapp" ? phone : linkedinUrl ? "profil LinkedIn" : "—"}
                  </span>
                )}
              </div>
              <textarea value={body} onChange={(e) => setMsg(e.target.value)} spellCheck="false" />
              <div className="ft">
                <button
                  className="dm-att"
                  aria-pressed={att.demo}
                  disabled={!demoUrl}
                  onClick={() => setAtt((a) => ({ ...a, demo: !a.demo }))}
                >
                  <Icon name="globe" className="ico-xs" />
                  {demoUrl ? "lien du site démo" : "démo non publiée"}
                </button>
                {auditUrl && (
                  <button className="dm-att" aria-pressed={att.audit} onClick={() => setAtt((a) => ({ ...a, audit: !a.audit }))}>
                    <Icon name="clipboard" className="ico-xs" />
                    rapport d&apos;audit
                  </button>
                )}
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--text-4)",
                  }}
                >
                  {body.length} car.
                </span>
              </div>
            </div>

            <button className="dm-cta" disabled={sending || busy} onClick={send}>
              <Icon name="send" className="ico-sm" />
              {ch.cta}
              {firstName ? ` à ${firstName}` : ""}
            </button>
          </>
        )}

        {/* ── appel ── */}
        {task.kind === "call" && (
          <>
            <div className="dm-tel">
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "var(--warn-tint)",
                  color: "var(--warn)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="phone" className="ico-sm" />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="num">{callPhone || "Aucun numéro connu"}</div>
                {ctName && (
                  <div className="who">
                    demander <strong>{ctName}</strong>
                    {dec?.role_title ? ` · ${dec.role_title}` : ""}
                  </div>
                )}
              </div>
            </div>

            <button className="dm-cta" disabled={!callPhone || calling || busy} onClick={call}>
              <Icon name="phone" className="ico-sm" />
              Appeler{firstName ? ` ${firstName}` : ""}
            </button>

            <div className="dm-tabs" role="tablist" aria-label="Contenu de l'appel">
              <button
                type="button"
                role="tab"
                className="dm-tab"
                aria-selected={callTab === "script"}
                onClick={() => setCallTab("script")}
              >
                <Icon name="flow" className="ico-xs" />
                Script de l&apos;étape
              </button>
              <button
                type="button"
                role="tab"
                className="dm-tab"
                aria-selected={callTab === "aide"}
                onClick={() => setCallTab("aide")}
              >
                <Icon name="layers" className="ico-xs" />
                Trame &amp; objections
                <span className="n">{SCRIPT_STEPS.length + DEM_OBJECTIONS.length}</span>
              </button>
            </div>

            {callTab === "script" ? (
              <div className="dm-say">
                <div className="hd">
                  <Icon name="phone" className="ico-xs" style={{ color: ch.c }} />
                  <span className="ti">Ce que la séquence a préparé</span>
                  {scriptName && <span className="src">{scriptName}</span>}
                </div>

                {/* La bascule change le texte SOUS LES YEUX : elle ne règle pas
                    quelque chose dont on verrait l'effet au prochain appel. */}
                {callVersions.length > 1 && (
                  <div className="dm-variant" role="group" aria-label="Version du script">
                    {callVersions.map((v) => (
                      <button
                        key={v.variant}
                        type="button"
                        className="dm-variant-b"
                        aria-pressed={callVariant === v.variant}
                        title={VARIANT_LABELS[v.variant].hint}
                        onClick={() => setCallVariant(v.variant)}
                      >
                        <Icon name={v.variant === "contact" ? "user" : "building"} className="ico-xs" />
                        {VARIANT_LABELS[v.variant].tab}
                      </button>
                    ))}
                  </div>
                )}

                {callScript.trim() ? (
                  <p className="tx">{callScript}</p>
                ) : (
                  <div className="dm-hint warn">
                    <Icon name="warning" className="ico-sm" />
                    Cette étape n&apos;a aucun script préparé. Ouvre la trame générique dans l&apos;onglet
                    à côté, ou ajoute un texte à l&apos;étape dans la séquence.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="dm-scr">
                  {SCRIPT_STEPS.map((s, i) => (
                    <div className="r" key={s.title} onClick={() => setScriptStep(i)}>
                      <span className="k">{s.title}</span>
                      <span className="v" style={i === scriptStep ? { color: "var(--text)" } : undefined}>
                        <ScriptLine text={s.body.replace(/\{(\w+)\}/g, "{{$1}}")} vars={vars} />
                      </span>
                    </div>
                  ))}
                </div>

                <div className="dm-objs">
                  {DEM_OBJECTIONS.map((o, i) => (
                    <div className="dm-ob" key={o.q} onClick={() => setOb(ob === i ? null : i)}>
                      <div className="q">
                        {o.q}
                        <Icon name={ob === i ? "minus" : "plus"} className="ico-xs" />
                      </div>
                      {ob === i && <div className="a">{o.a}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── attente de réponse ── */}
        {task.kind === "wait" && (
          <>
            <div className="dm-hint">
              <Icon name="info" className="ico-sm" />
              La séquence est en pause : elle attend que le prospect réponde. Rien ne partira tant que
              personne ne l&apos;aura déclaré ici.
            </div>
            <button className="dm-cta" disabled={busy} onClick={declareReply}>
              <Icon name="check" className="ico-sm" />
              Le prospect a répondu
            </button>
            <div className="dm-cta2">
              <a className="btn outline sm" href="#messages-history" style={{ justifyContent: "center" }}>
                <Icon name="layers" className="ico-sm" />
                Relire les échanges
              </a>
            </div>
          </>
        )}

        {/* ── issue : commune à l'appel et au message ── */}
        {task.kind !== "wait" && (
          <>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: ".08em",
              }}
            >
              Issue de l&apos;échange
            </div>
            <div className="dm-outs">
              {STEP_OUTCOMES.map((o) => (
                <button
                  key={o.id}
                  className={`dm-out ${TONE[o.tone] ?? ""}`.trim()}
                  aria-pressed={outcome === o.id}
                  title={o.note}
                  onClick={() => setOutcome(o.id as StepOutcomeId)}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {chosen?.needsDate && (
              <input
                type="date"
                className="dm-note"
                value={snoozeDate}
                onChange={(e) => setSnoozeDate(e.target.value)}
                style={{ minHeight: 0, height: 36 }}
              />
            )}

            <textarea
              className="dm-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Ce que dit ${firstName || "le prospect"}, son besoin, la prochaine étape…`}
            />

            {chosen && (
              <div className="dm-hint">
                <Icon name="flow" className="ico-sm" />
                {chosen.note} — la file se met à jour automatiquement.
              </div>
            )}

            <button
              className="dm-cta"
              style={{ ["--k" as string]: outcome ? "var(--text)" : "var(--text-4)" }}
              disabled={!outcome || busy}
              onClick={saveOutcome}
            >
              <Icon name="check" className="ico-sm" />
              Enregistrer l&apos;issue{chosen ? ` · ${chosen.label}` : ""}
            </button>

            <div className="dm-cta2">
              <button className="btn outline sm" disabled={busy} onClick={rdv} style={{ justifyContent: "center" }}>
                <Icon name="calendar" className="ico-sm" />
                RDV calé
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
