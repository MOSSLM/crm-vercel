"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Phone,
  MessageCircle,
  Mail,
  MailPlus,
  Linkedin,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Hourglass,
  Play,
  Workflow,
  X,
} from "lucide-react";
import { one } from "@/components/agent-portal/format";

type Step = { id: string; kind: string; day: number; label: string | null };
type Sequence = { id: string; name: string | null; description: string | null; steps: Step[] };
type Contact = { first_name: string | null; last_name: string | null; tel: string | null; email?: string | null };
type Entreprise = { id: number; name: string | null; telephone: string | null; email?: string | null };
type Enrollment = {
  id: string;
  automation_id: string;
  current_step: number;
  status: string;
  /** `no_email` quand la séquence est arrêtée faute d'adresse. */
  hold_reason: string | null;
  sequence_name: string | null;
  total_steps: number;
  entreprise: Entreprise | Entreprise[] | null;
  contact: Contact | Contact[] | null;
};
type SeqTask = {
  id: string;
  kind: string | null;
  title: string | null;
  due_at: string | null;
  enrollment_id: string | null;
  payload: {
    message?: string;
    script?: string;
    phone?: string;
    linkedin?: string;
    audit_url?: string | null;
    demo_url?: string | null;
  } | null;
  contact: Contact | Contact[] | null;
  entreprise: Entreprise | Entreprise[] | null;
};
type OwnedContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  tel: string | null;
  email: string | null;
  is_decision_maker: boolean | null;
  entreprise_id: number;
  entreprise_nom: string | null;
  /** Adresse de la fiche entreprise — le repli qu'utilisent les séquences. */
  entreprise_email: string | null;
};

/** Une adresse exploitable, ou `null`. Même règle que le régulateur. */
function usableEmail(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  linkedin: Linkedin,
  task: Linkedin,
  wait: Hourglass,
};

const KIND_LABEL: Record<string, string> = {
  call: "Appel",
  whatsapp: "WhatsApp",
  email: "Email auto",
  linkedin: "LinkedIn",
  task: "Tâche",
  wait: "Attente",
};

const STATUS_LABEL: Record<string, string> = {
  active: "En cours",
  paused: "En pause",
  finished: "Terminée",
  replied: "A répondu",
  exited: "Sortie",
};

function contactName(c: Contact | null): string {
  return c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "";
}

function waLink(phone: string | null | undefined, message: string | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message ?? "")}`;
}

export default function AgentSequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [tasks, setTasks] = useState<SeqTask[]>([]);
  const [contacts, setContacts] = useState<OwnedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Launch picker state: which sequence is open + checked companies.
  const [launching, setLaunching] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [openScript, setOpenScript] = useState<string | null>(null);
  // Saisie manuelle d'une adresse manquante.
  const [emailTarget, setEmailTarget] = useState<{
    entrepriseId: number;
    name: string;
    current: string | null;
  } | null>(null);

  const load = async () => {
    try {
      const [seqRes, contactsRes] = await Promise.all([
        authedFetch("/api/agent/sequences"),
        authedFetch("/api/agent/contacts"),
      ]);
      if (seqRes.ok) {
        const data = await seqRes.json();
        setSequences((data.sequences ?? []) as Sequence[]);
        setEnrollments((data.enrollments ?? []) as Enrollment[]);
        setTasks((data.tasks ?? []) as SeqTask[]);
      }
      if (contactsRes.ok) setContacts(((await contactsRes.json()) ?? []) as OwnedContact[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Owned companies with their auto-picked contact (decision maker first,
  // then a contact with a phone number, then the first one).
  const companies = useMemo(() => {
    const byEnt = new Map<number, OwnedContact[]>();
    for (const c of contacts) {
      const list = byEnt.get(c.entreprise_id) ?? [];
      list.push(c);
      byEnt.set(c.entreprise_id, list);
    }
    return [...byEnt.entries()]
      .map(([id, list]) => {
        const contact =
          list.find((c) => c.is_decision_maker) ?? list.find((c) => c.tel) ?? list[0] ?? null;
        // Une entreprise est joignable par email si l'un de ses contacts a une
        // adresse, ou si sa fiche en porte une. Sinon l'étape email est
        // impossible : rien ne sera préparé, la séquence s'arrêtera là.
        const email =
          list.map((c) => usableEmail(c.email)).find(Boolean) ??
          usableEmail(list[0]?.entreprise_email) ??
          null;
        return {
          id,
          name: list[0]?.entreprise_nom ?? "Sans nom",
          contact,
          email,
          noEmail: !email,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

  /** Les entreprises qu'aucun email ne peut atteindre. */
  const withoutEmail = useMemo(() => companies.filter((c) => c.noEmail), [companies]);

  /** Une séquence qui n'envoie aucun email n'est pas concernée par l'alerte. */
  const anySequenceEmails = useMemo(
    () => sequences.some((s) => s.steps.some((step) => step.kind === "email")),
    [sequences],
  );

  const saveEmail = async (entrepriseId: number, email: string) => {
    setBusy(`email-${entrepriseId}`);
    try {
      const res = await authedFetch("/api/agent/sales-pipeline/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_id: entrepriseId, email }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          payload.error === "email_invalide"
            ? "Cette adresse n'est pas valide."
            : "Enregistrement impossible.",
        );
        return;
      }
      toast.success("Email enregistré — la séquence peut repartir.");
      setEmailTarget(null);
      await load();
    } catch {
      toast.error("Enregistrement impossible.");
    } finally {
      setBusy(null);
    }
  };

  // Companies already enrolled (active/paused) in a given sequence.
  const enrolledEnts = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const e of enrollments) {
      if (e.status !== "active" && e.status !== "paused") continue;
      const ent = one(e.entreprise);
      if (!ent?.id) continue;
      const set = map.get(e.automation_id) ?? new Set<number>();
      set.add(ent.id);
      map.set(e.automation_id, set);
    }
    return map;
  }, [enrollments]);

  const openLauncher = (seqId: string) => {
    setLaunching((cur) => (cur === seqId ? null : seqId));
    setPicked(new Set());
  };

  const togglePicked = (entId: number) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(entId)) next.delete(entId);
      else next.add(entId);
      return next;
    });
  };

  const launch = async (seqId: string) => {
    const items = companies
      .filter((c) => picked.has(c.id) && c.contact)
      .map((c) => ({ entreprise_id: c.id, contact_id: c.contact!.id }));
    if (items.length === 0) {
      toast.error("Coche au moins un prospect.");
      return;
    }
    setBusy(`launch-${seqId}`);
    try {
      const res = await authedFetch("/api/agent/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automation_id: seqId, items }),
      });
      if (res.status === 409) {
        toast.error("Cette séquence n'est plus active.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        enrolled: number;
        results: { status: string }[];
      };
      const already = data.results.filter((r) => r.status === "deja_inscrit").length;
      if (data.enrolled > 0) {
        toast.success(
          `${data.enrolled} prospect${data.enrolled > 1 ? "s" : ""} lancé${data.enrolled > 1 ? "s" : ""} dans la séquence !` +
            (already > 0 ? ` (${already} déjà inscrit${already > 1 ? "s" : ""})` : ""),
        );
      } else if (already > 0) {
        toast.error("Ces prospects sont déjà inscrits dans cette séquence.");
      } else {
        toast.error("Aucun prospect n'a pu être lancé.");
      }
      setLaunching(null);
      await load();
    } catch {
      toast.error("Lancement impossible.");
    } finally {
      setBusy(null);
    }
  };

  const completeTask = async (task: SeqTask) => {
    setBusy(task.id);
    try {
      const res = await authedFetch("/api/agent/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status: "done" }),
      });
      if (!res.ok) throw new Error();
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
      toast.success("Étape validée — la séquence continue.");
      // refresh enrollment progress in the background
      void load();
    } catch {
      toast.error("Action impossible.");
    } finally {
      setBusy(null);
    }
  };

  const copyMessage = async (message: string | undefined) => {
    if (!message) return;
    await navigator.clipboard.writeText(message);
    toast.success("Message copié.");
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Séquences</h1>
        <p className="text-sm text-muted-foreground">
          Les séquences que SAMA t&apos;a attribuées. Lance-les sur tes prospects, puis traite les
          étapes manuelles (WhatsApp, LinkedIn, appel) avant de passer à l&apos;appel.
        </p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {/* Sans email : dit dès le départ ce que la séquence ne pourra pas faire.
          Ces entreprises n'entrent pas dans la file d'envoi — aucun email n'est
          préparé pour elles tant qu'aucune adresse n'est saisie. */}
      {!loading && withoutEmail.length > 0 && anySequenceEmails && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-destructive">
                {withoutEmail.length} entreprise{withoutEmail.length > 1 ? "s" : ""} sans email
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Aucun envoi n&apos;est préparé pour {withoutEmail.length > 1 ? "elles" : "elle"} : elles ne
                figurent pas dans la file. Ajoute l&apos;adresse ici — elle est enregistrée sur la fiche
                entreprise, au même endroit que toutes les autres.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {withoutEmail.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-background px-2.5 py-1 text-xs hover:bg-muted"
                    onClick={() => setEmailTarget({ entrepriseId: c.id, name: c.name, current: null })}
                  >
                    <MailPlus className="h-3 w-3 text-destructive" />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Pending manual sequence steps */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Tâches du jour</h2>
            {tasks.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Aucune étape de séquence en attente.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => {
                  const contact = one(task.contact);
                  const ent = one(task.entreprise);
                  const Icon = (task.kind && KIND_ICON[task.kind]) || MessageCircle;
                  const message = task.payload?.message;
                  const phone = task.payload?.phone || contact?.tel || ent?.telephone || null;
                  const wa = task.kind === "whatsapp" ? waLink(phone, message) : null;
                  const disabled = busy === task.id;
                  return (
                    <Card key={task.id}>
                      <CardContent className="space-y-3 py-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <span
                              className="flex h-7 w-7 items-center justify-center rounded-md text-primary"
                              style={{ background: "var(--accent-tint)" }}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            {contactName(contact) || task.title || "Prospect"}
                            <span className="text-xs font-normal text-muted-foreground">
                              {KIND_LABEL[task.kind ?? ""] ?? task.kind}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            {ent?.id ? (
                              <Link
                                href={`/espace-agent/entreprises/${ent.id}`}
                                className="hover:underline"
                              >
                                {ent.name}
                              </Link>
                            ) : (
                              ent?.name
                            )}
                            {task.title ? ` · ${task.title}` : ""}
                          </div>
                        </div>

                        {message && (
                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                            {message}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {task.kind === "whatsapp" &&
                            (wa ? (
                              <Button size="sm" onClick={() => window.open(wa, "_blank")}>
                                <MessageCircle className="mr-1 h-4 w-4" /> Ouvrir WhatsApp
                              </Button>
                            ) : (
                              <Button size="sm" disabled>
                                Pas de numéro
                              </Button>
                            ))}
                          {task.kind === "call" &&
                            (phone ? (
                              <Button size="sm" asChild>
                                <a href={`tel:${phone}`}>
                                  <Phone className="mr-1 h-4 w-4" /> Appeler
                                </a>
                              </Button>
                            ) : (
                              <Button size="sm" disabled>
                                Pas de numéro
                              </Button>
                            ))}
                          {task.kind === "linkedin" && task.payload?.linkedin && (
                            <Button
                              size="sm"
                              onClick={() => window.open(task.payload?.linkedin, "_blank")}
                            >
                              <ExternalLink className="mr-1 h-4 w-4" /> Ouvrir LinkedIn
                            </Button>
                          )}
                          {message && (
                            <Button size="sm" variant="outline" onClick={() => copyMessage(message)}>
                              <Copy className="mr-1 h-4 w-4" /> Copier le message
                            </Button>
                          )}
                          {task.payload?.audit_url && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={task.payload.audit_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="mr-1 h-4 w-4" /> Audit
                              </a>
                            </Button>
                          )}
                          {task.payload?.demo_url && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={task.payload.demo_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="mr-1 h-4 w-4" /> Site démo
                              </a>
                            </Button>
                          )}
                          {task.kind === "call" && task.payload?.script && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setOpenScript((cur) => (cur === task.id ? null : task.id))
                              }
                            >
                              {openScript === task.id ? "Masquer le script" : "Voir le script"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={disabled}
                            onClick={() => completeTask(task)}
                          >
                            <Check className="mr-1 h-4 w-4" /> Marquer fait
                          </Button>
                        </div>

                        {task.kind === "call" && task.payload?.script && openScript === task.id && (
                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                            {task.payload.script}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Assigned sequences (read-only) */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Mes séquences</h2>
            {sequences.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Aucune séquence attribuée pour l&apos;instant — rapproche-toi de SAMA.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sequences.map((seq) => {
                  const isLaunching = launching === seq.id;
                  const disabled = busy === `launch-${seq.id}`;
                  // Une séquence sans étape email ne rend personne « bloqué ».
                  const seqHasEmail = seq.steps.some((s) => s.kind === "email");
                  const pickedNoEmail = companies.filter((c) => picked.has(c.id) && c.noEmail).length;
                  return (
                    <Card key={seq.id}>
                      <CardContent className="space-y-3 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium">
                              <span
                                className="flex h-7 w-7 items-center justify-center rounded-md text-primary"
                                style={{ background: "var(--accent-tint)" }}
                              >
                                <Workflow className="h-4 w-4" />
                              </span>
                              {seq.name || "Séquence"}
                            </div>
                            {seq.description && (
                              <p className="mt-1 text-xs text-muted-foreground">{seq.description}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={isLaunching ? "outline" : "default"}
                            onClick={() => openLauncher(seq.id)}
                          >
                            {isLaunching ? (
                              <>
                                <X className="mr-1 h-4 w-4" /> Annuler
                              </>
                            ) : (
                              <>
                                <Play className="mr-1 h-4 w-4" /> Lancer sur un prospect
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Read-only step timeline */}
                        <div className="flex flex-wrap gap-1.5">
                          {seq.steps.map((step) => {
                            const Icon = KIND_ICON[step.kind] || MessageCircle;
                            return (
                              <span
                                key={step.id}
                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                                title={step.label ?? KIND_LABEL[step.kind] ?? step.kind}
                              >
                                <Icon className="h-3 w-3" /> J+{step.day}
                              </span>
                            );
                          })}
                        </div>

                        {isLaunching && (
                          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                            {companies.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                Aucun prospect attribué — demande une attribution dans Entreprises.
                              </span>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Choisis les prospects à mettre dans la séquence
                                  </span>
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline"
                                    onClick={() => {
                                      const selectable = companies.filter(
                                        (c) =>
                                          c.contact && !enrolledEnts.get(seq.id)?.has(c.id),
                                      );
                                      setPicked((cur) =>
                                        cur.size === selectable.length
                                          ? new Set()
                                          : new Set(selectable.map((c) => c.id)),
                                      );
                                    }}
                                  >
                                    Tout sélectionner
                                  </button>
                                </div>
                                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                                  {companies.map((c) => {
                                    const alreadyIn = enrolledEnts.get(seq.id)?.has(c.id) ?? false;
                                    const noContact = !c.contact;
                                    const blocked = alreadyIn || noContact;
                                    return (
                                      <label
                                        key={c.id}
                                        className={
                                          "flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 " +
                                          (blocked ? "cursor-not-allowed opacity-50" : "hover:bg-muted/60")
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 accent-primary"
                                          checked={picked.has(c.id) && !blocked}
                                          disabled={blocked}
                                          onChange={() => togglePicked(c.id)}
                                        />
                                        <span className="min-w-0 flex-1">
                                          <span className="flex items-center gap-1.5">
                                            <span className="truncate font-medium">{c.name}</span>
                                            {c.noEmail && seqHasEmail && (
                                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                                <Mail className="h-2.5 w-2.5" />
                                                sans email
                                              </span>
                                            )}
                                          </span>
                                          <span className="block truncate text-xs text-muted-foreground">
                                            {alreadyIn
                                              ? "Déjà dans la séquence"
                                              : noContact
                                                ? "Aucun contact — ajoute d'abord un contact"
                                                : `${`${c.contact!.first_name ?? ""} ${c.contact!.last_name ?? ""}`.trim() || "Contact"}${c.contact!.tel ? ` · ${c.contact!.tel}` : ""}${c.contact!.is_decision_maker ? " · décideur" : ""}`}
                                          </span>
                                        </span>
                                        {c.noEmail && seqHasEmail && (
                                          <button
                                            type="button"
                                            className="shrink-0 text-xs text-primary hover:underline"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setEmailTarget({
                                                entrepriseId: c.id,
                                                name: c.name,
                                                current: null,
                                              });
                                            }}
                                          >
                                            Ajouter
                                          </button>
                                        )}
                                      </label>
                                    );
                                  })}
                                </div>
                                {seqHasEmail && pickedNoEmail > 0 && (
                                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                    <span>
                                      {pickedNoEmail} sélectionné{pickedNoEmail > 1 ? "s" : ""} sans email —
                                      l&apos;étape email ne partira pas pour {pickedNoEmail > 1 ? "eux" : "lui"},
                                      la séquence s&apos;y arrêtera.
                                    </span>
                                  </p>
                                )}
                                <Button
                                  size="sm"
                                  disabled={disabled || picked.size === 0}
                                  onClick={() => launch(seq.id)}
                                >
                                  <Play className="mr-1 h-4 w-4" />
                                  Lancer sur {picked.size || ""} prospect{picked.size > 1 ? "s" : ""}
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Running / past enrollments */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">En cours</h2>
            {enrollments.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Aucune séquence lancée pour l&apos;instant.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {enrollments.map((e) => {
                  const ent = one(e.entreprise);
                  const contact = one(e.contact);
                  const step = Math.min(e.current_step + 1, Math.max(e.total_steps, 1));
                  // Arrêtée faute d'adresse : le ticker pose ce motif, rien
                  // n'est préparé tant qu'on ne saisit pas d'email.
                  const blockedNoEmail =
                    e.hold_reason === "no_email" ||
                    (e.status === "active" && !usableEmail(contact?.email) && !usableEmail(ent?.email));
                  return (
                    <div
                      key={e.id}
                      className={
                        "flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3" +
                        (blockedNoEmail ? " border-destructive/40" : "")
                      }
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {ent?.id ? (
                            <Link
                              href={`/espace-agent/entreprises/${ent.id}`}
                              className="truncate hover:underline"
                            >
                              {ent.name || "Sans nom"}
                            </Link>
                          ) : (
                            <span className="truncate">{ent?.name || "Sans nom"}</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {contactName(contact)}
                          {e.sequence_name ? ` · ${e.sequence_name}` : ""}
                        </div>
                        {blockedNoEmail && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Sans email — étape bloquée, hors file
                            {ent?.id != null && (
                              <button
                                type="button"
                                className="underline"
                                onClick={() =>
                                  setEmailTarget({
                                    entrepriseId: ent.id,
                                    name: ent.name ?? "Entreprise",
                                    current: ent.email ?? null,
                                  })
                                }
                              >
                                ajouter l&apos;adresse
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        {e.total_steps > 0 && e.status !== "finished" && (
                          <span className="text-muted-foreground">
                            Étape {step}/{e.total_steps}
                          </span>
                        )}
                        <span
                          className={
                            "rounded-full border px-2 py-0.5 " +
                            (e.status === "active"
                              ? "border-transparent text-primary"
                              : "text-muted-foreground")
                          }
                          style={e.status === "active" ? { background: "var(--accent-tint)" } : undefined}
                        >
                          {STATUS_LABEL[e.status] ?? e.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {emailTarget && (
        <EmailModal
          name={emailTarget.name}
          current={emailTarget.current}
          busy={busy === `email-${emailTarget.entrepriseId}`}
          onClose={() => setEmailTarget(null)}
          onSubmit={(email) => void saveEmail(emailTarget.entrepriseId, email)}
        />
      )}
    </div>
  );
}

/**
 * Saisie manuelle de l'adresse d'une entreprise. Elle est enregistrée sur la
 * fiche entreprise — la même colonne que toutes les autres adresses du CRM — et
 * sert aussitôt de destinataire à la séquence quand le contact n'en a pas.
 */
function EmailModal({
  name,
  current,
  busy,
  onClose,
  onSubmit,
}: {
  name: string;
  current: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState(current ?? "");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary"
            style={{ background: "var(--accent-tint)" }}
          >
            <MailPlus className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Email de l&apos;entreprise</div>
            <div className="truncate text-xs text-muted-foreground">{name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !busy) onSubmit(email.trim());
          }}
        >
          <input
            type="email"
            autoFocus
            value={email}
            placeholder="contact@entreprise.fr"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">
            Enregistrée sur la fiche entreprise, au même endroit que toutes les autres adresses. La séquence
            reprend aussitôt : l&apos;étape email repasse dans la file d&apos;envoi.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={!valid || busy}>
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
