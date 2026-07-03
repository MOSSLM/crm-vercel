"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Phone,
  MessageCircle,
  Mail,
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
type Contact = { first_name: string | null; last_name: string | null; tel: string | null };
type Entreprise = { id: number; name: string | null; telephone: string | null };
type Enrollment = {
  id: string;
  automation_id: string;
  current_step: number;
  status: string;
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
  payload: { message?: string; script?: string; phone?: string; linkedin?: string } | null;
  contact: Contact | Contact[] | null;
  entreprise: Entreprise | Entreprise[] | null;
};
type OwnedContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  tel: string | null;
  entreprise_id: number;
  entreprise_nom: string | null;
};

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
  // Launch picker state: which sequence is open + selected company/contact.
  const [launching, setLaunching] = useState<string | null>(null);
  const [pickedEnt, setPickedEnt] = useState<string>("");
  const [pickedContact, setPickedContact] = useState<string>("");
  const [openScript, setOpenScript] = useState<string | null>(null);

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

  const companies = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of contacts) {
      if (!map.has(c.entreprise_id)) map.set(c.entreprise_id, c.entreprise_nom ?? "Sans nom");
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [contacts]);

  const entContacts = useMemo(
    () => contacts.filter((c) => String(c.entreprise_id) === pickedEnt),
    [contacts, pickedEnt],
  );

  const openLauncher = (seqId: string) => {
    setLaunching((cur) => (cur === seqId ? null : seqId));
    setPickedEnt("");
    setPickedContact("");
  };

  const launch = async (seqId: string) => {
    if (!pickedEnt || !pickedContact) {
      toast.error("Choisis une entreprise et un contact.");
      return;
    }
    setBusy(`launch-${seqId}`);
    try {
      const res = await authedFetch("/api/agent/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation_id: seqId,
          entreprise_id: Number(pickedEnt),
          contact_id: pickedContact,
        }),
      });
      if (res.status === 409) {
        const err = await res.json().catch(() => null);
        toast.error(
          err?.error === "sequence_inactive"
            ? "Cette séquence n'est plus active."
            : "Ce contact est déjà inscrit dans cette séquence.",
        );
        return;
      }
      if (!res.ok) throw new Error();
      toast.success("Séquence lancée sur le prospect !");
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
                          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                            <select
                              value={pickedEnt}
                              onChange={(e) => {
                                setPickedEnt(e.target.value);
                                setPickedContact("");
                              }}
                              className="h-9 rounded-md border bg-background px-3 text-sm"
                            >
                              <option value="">Entreprise…</option>
                              {companies.map(([id, name]) => (
                                <option key={id} value={String(id)}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={pickedContact}
                              onChange={(e) => setPickedContact(e.target.value)}
                              disabled={!pickedEnt}
                              className="h-9 rounded-md border bg-background px-3 text-sm"
                            >
                              <option value="">
                                {pickedEnt && entContacts.length === 0
                                  ? "Aucun contact — ajoute d'abord un contact"
                                  : "Contact…"}
                              </option>
                              {entContacts.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Contact"}
                                  {c.tel ? ` · ${c.tel}` : ""}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              disabled={disabled || !pickedEnt || !pickedContact}
                              onClick={() => launch(seq.id)}
                            >
                              <Play className="mr-1 h-4 w-4" /> Lancer
                            </Button>
                            {companies.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                Aucun prospect attribué — demande une attribution dans Entreprises.
                              </span>
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
                  return (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
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
    </div>
  );
}
