"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon, Pill } from "./DemIcon";
import { demCh, isMessageKind } from "./channels";
import { COHORTE_INFO } from "./cohortes";
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
import type { CompanyBundle, DemarchagePatchBody, DemarchageTask, DemAudit } from "./types";

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
  busy,
  onPatch,
  onLogged,
  onNext,
  onReplied,
}: {
  task: DemarchageTask;
  company: CompanyBundle | null;
  audit: DemAudit;
  busy: boolean;
  onPatch: (body: Omit<DemarchagePatchBody, "id">) => void;
  onLogged: () => void;
  /** Passer à la tâche suivante de la file — le geste est le même partout. */
  onNext: () => void;
  /** Le prospect a répondu : l'attente est levée, la file doit se recharger. */
  onReplied: () => void;
}) {
  const ch = demCh(task.kind);
  const seq = task.sequence;
  const ent = one(task.entreprise);
  const contact = one(task.contact);
  const tel = useTelephonyOptional();

  /**
   * Appel à froid : ni séquence, ni étape, ni texte préparé par le moteur.
   *
   * La carte déduisait tout de la séquence — jusqu'au message d'erreur, qui
   * conseillait d'« ajouter un texte à l'étape dans la séquence » à quelqu'un
   * qui n'en a pas. Ce n'est pas un défaut de données à corriger : c'est le
   * mode de travail principal de la campagne, cent fois par jour.
   */
  const froid = task.hors_sequence === true;
  const cohorte = task.cohorte ?? null;

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
  /**
   * Les DEUX versions du modèle de l'étape — celle qu'on écrit à l'entreprise,
   * celle qu'on écrit à une personne — et rien d'autre.
   *
   * La carte proposait aussi toute la bibliothèque de modèles WhatsApp du
   * compte. Choisir « Relance J+7 » sur une étape « Premier contact » n'a
   * pourtant aucun sens : la séquence a DÉJÀ décidé quoi dire, et le moteur l'a
   * rendu avec les variables de ce prospect-là. Le seul choix qui reste ouvert
   * est celui que le pipeline commercial propose déjà sur sa carte WhatsApp :
   * à l'entreprise, ou au contact.
   *
   * `versionsPreparees` est la lecture commune de ce couple : les trois
   * surfaces qui traitent une tâche ne peuvent donc pas montrer trois textes
   * différents du même message.
   */
  const versions = useMemo(() => versionsPreparees(task.payload), [task.payload]);
  const [variant, setVariant] = useState<MessageVariant>(versions[0]?.variant ?? "company");
  const [msg, setMsg] = useState(versions[0]?.message ?? "");
  useEffect(() => {
    setVariant(versions[0]?.variant ?? "company");
    setMsg(versions[0]?.message ?? "");
    setNote("");
    setOutcome(null);
  }, [task.id, versions]);

  /** Bascule de version : le texte change sous les yeux, y compris s'il a été retouché. */
  const pickVersion = (v: MessageVariant) => {
    setVariant(v);
    setMsg(versions.find((x) => x.variant === v)?.message ?? "");
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
      onReplied();
    } catch {
      toast.error("Action impossible");
    }
  };

  // ── issues ──────────────────────────────────────────────────────────────
  /**
   * Les issues proposées sur CETTE carte.
   *
   * Sur un message, celles qui supposent une réponse du prospect (`releasesWait`
   * : « A répondu », « A répondu, peu intéressé ») n'ont rien à y faire — au
   * moment où on envoie, personne n'a encore répondu. Les y laisser imposait un
   * double geste absurde : cocher « a répondu » sur la carte WhatsApp, puis
   * cocher « a répondu » une seconde fois sur l'attente pour débloquer la suite.
   * La réponse se déclare à UN seul endroit : la tâche d'attente.
   *
   * Sur un appel, elles restent : on a la personne au bout du fil, sa réaction
   * est immédiate et c'est bien là qu'on la note.
   */
  const outcomes = useMemo(
    () => (isMessageKind(task.kind) ? STEP_OUTCOMES.filter((o) => !o.releasesWait) : STEP_OUTCOMES),
    [task.kind],
  );

  const chosen = outcome ? findOutcome(outcome) : null;

  /**
   * « Fait » : l'action a été faite, il n'y a rien de plus à en dire.
   *
   * C'est le cas ordinaire d'un premier contact — on envoie, personne ne
   * répond dans la seconde. La tâche se ferme, le moteur avance l'inscription,
   * et la séquence se gare sur son étape d'attente : c'est cette ligne-là qui
   * revient dans la file, et depuis laquelle on enchaîne. Renseigner une issue
   * reste possible juste en dessous, mais n'est plus un péage.
   */
  const markDone = () =>
    onPatch({
      status: "done",
      opportunite_id: task.opportunite_id ?? undefined,
      note: note.trim() || undefined,
    });

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
            {seq?.stepIndex != null
              ? ` · étape ${seq.stepIndex}/${seq.totalSteps}`
              : froid
                ? " · à froid"
                : ""}
          </div>
          <div className="su">
            {seq?.stepLabel || task.title || (froid ? "Premier contact — jamais appelée" : ch.lb)}
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
            {/* Message à froid : la zone de saisie est vide et le restera — le
                moteur n'a rien rendu, faute d'étape. On le dit, plutôt que de
                laisser croire à un modèle qui n'a pas chargé.
                `versionsPreparees` rend TOUJOURS une version, fût-elle vide :
                c'est le texte qu'on teste, jamais le nombre de versions. */}
            {froid && !versions.some((v) => v.message.trim()) && (
              <div className="dm-hint">
                <Icon name="info" className="ico-sm" />
                Message à froid : aucun modèle préparé.{" "}
                {cohorte ? COHORTE_INFO[cohorte].argument : "Écris le message, il partira tel quel."}
              </div>
            )}

            {/* Les deux versions du modèle de l'étape — le même geste que la
                carte WhatsApp du pipeline commercial. Une seule version
                préparée ⇒ aucun choix affiché, plutôt qu'un faux choix. */}
            {versions.length > 1 && (
              <div className="dm-variant" role="group" aria-label="Version du message">
                {versions.map((v) => (
                  <button
                    key={v.variant}
                    type="button"
                    className="dm-variant-b"
                    aria-pressed={variant === v.variant}
                    title={VARIANT_LABELS[v.variant].hint}
                    onClick={() => pickVersion(v.variant)}
                  >
                    <Icon name={v.variant === "contact" ? "user" : "building"} className="ico-xs" />
                    {VARIANT_LABELS[v.variant].tab}
                  </button>
                ))}
              </div>
            )}

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

            {/* Le geste qui ferme la tâche, juste sous l'envoi et impossible à
                rater : c'est LUI qu'on cherche une fois le message parti. La
                séquence enchaîne alors sur son attente de réponse, et c'est
                là — pas ici — qu'on déclarera que le prospect a répondu. */}
            <button className="dm-cta big ok" disabled={busy} onClick={markDone}>
              <Icon name="check" className="ico-lg" />
              Message envoyé — c&apos;est fait
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
                ) : froid ? (
                  /* Un appel à froid N'A PAS de script préparé, et ce n'est pas
                     une anomalie : il n'y a pas d'étape où en ranger un. Lui
                     afficher l'avertissement de séquence enverrait corriger
                     quelque chose qui n'existe pas — cent fois par jour. */
                  <div className="dm-hint">
                    <Icon name="info" className="ico-sm" />
                    Appel à froid : aucun texte préparé, c&apos;est normal.{" "}
                    {cohorte ? `${COHORTE_INFO[cohorte].argument} ` : ""}La trame générique et les
                    objections sont dans l&apos;onglet à côté.
                  </div>
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
              {/* Une attente n'est pas un cul-de-sac : rien à faire ici tant
                  que le prospect n'a pas réagi, donc on enchaîne. */}
              <button className="btn outline sm" onClick={onNext} style={{ justifyContent: "center" }}>
                <Icon name="arrowRight" className="ico-sm" />
                Tâche suivante
              </button>
            </div>
          </>
        )}

        {/* ── issue : commune à l'appel et au message ── */}
        {task.kind !== "wait" && (
          <>
            <div className="dm-lbl">
              Issue de l&apos;échange
              <span>facultatif</span>
            </div>
            <div className="dm-outs">
              {outcomes.map((o) => (
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

            {/* Sans issue choisie, c'est « Fait » : l'action est faite, la
                séquence passe en attente et la file enchaîne. Dès qu'une issue
                est cochée, le même bouton l'enregistre — un seul bouton, jamais
                deux gestes concurrents.

                Sur un message, « Fait » vit déjà en gros sous l'envoi : ce
                bouton-ci n'apparaît donc que pour enregistrer une issue. */}
            {(!isMessageKind(task.kind) || outcome) && (
              <button
                className="dm-cta"
                style={{ ["--k" as string]: outcome ? "var(--text)" : "var(--ok)" }}
                disabled={busy}
                onClick={outcome ? saveOutcome : markDone}
              >
                <Icon name="check" className="ico-sm" />
                {chosen ? `Enregistrer l'issue · ${chosen.label}` : "Fait"}
              </button>
            )}

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
