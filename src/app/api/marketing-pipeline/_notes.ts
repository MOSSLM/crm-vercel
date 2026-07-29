import { getServiceClient } from "@/app/api/_lib/service-client";
import { isMissingTable } from "@/app/api/_lib/require-capability";

/**
 * Notes / tickets du marketing pipeline.
 *
 * Un agent qui doute d'un site ou d'un audit ouvre un ticket au lieu de
 * corriger à l'aveugle ; l'admin le voit sur la même ligne du board, répond
 * dans le fil et le clôt. Logique partagée entre la route admin
 * (`/api/marketing-pipeline/notes`) et la route agent
 * (`/api/agent/marketing-pipeline/notes`) : `ownerId` posé restreint tout aux
 * entreprises attribuées à cet agent.
 *
 * Tant que `sql/20260729_marketing_pipeline_notes.sql` n'est pas appliqué, les
 * lectures renvoient « aucun ticket » plutôt que de faire tomber le board —
 * même parti pris que `enrichment_validated` dans `_board.ts`.
 */

export const NOTE_SUBJECTS = ["enrichment", "site", "audit", "other"] as const;
export type NoteSubject = (typeof NOTE_SUBJECTS)[number];

export const NOTE_SEVERITIES = ["info", "probleme", "bloquant"] as const;
export type NoteSeverity = (typeof NOTE_SEVERITIES)[number];

export const NOTE_STATUSES = ["open", "in_progress", "resolved"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export interface NoteMessage {
  id: string;
  author_id: string | null;
  author_name: string;
  author_role: "agent" | "admin";
  body: string;
  created_at: string;
}

export interface Note {
  id: string;
  opportunite_id: string;
  entreprise_id: number | null;
  subject: NoteSubject;
  severity: NoteSeverity;
  title: string;
  status: NoteStatus;
  created_by: string | null;
  created_by_name: string;
  created_by_role: "agent" | "admin";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  company_name: string | null;
  messages: NoteMessage[];
}

/** Compteurs par opportunité, pour les badges du board. */
export interface NoteSummary {
  open: number;
  total: number;
  /** Étapes qui portent au moins un ticket non résolu (badge sur la carte). */
  open_subjects: NoteSubject[];
}

export type NotesResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

const NOTE_COLUMNS =
  "id, opportunite_id, entreprise_id, subject, severity, title, status, created_by, created_by_role, created_at, updated_at, resolved_at";

type NoteRow = {
  id: string;
  opportunite_id: string;
  entreprise_id: number | null;
  subject: string | null;
  severity: string | null;
  title: string | null;
  status: string | null;
  created_by: string | null;
  created_by_role: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const asSubject = (v: unknown): NoteSubject =>
  NOTE_SUBJECTS.includes(v as NoteSubject) ? (v as NoteSubject) : "other";
const asSeverity = (v: unknown): NoteSeverity =>
  NOTE_SEVERITIES.includes(v as NoteSeverity) ? (v as NoteSeverity) : "probleme";
const asStatus = (v: unknown): NoteStatus =>
  NOTE_STATUSES.includes(v as NoteStatus) ? (v as NoteStatus) : "open";
const asRole = (v: unknown): "agent" | "admin" => (v === "admin" ? "admin" : "agent");

/** Entreprises attribuées à un agent (null = pas de restriction, côté admin). */
async function ownedEntrepriseIds(ownerId?: string): Promise<number[] | null> {
  if (!ownerId) return null;
  const { data } = await getServiceClient()
    .from("entreprises")
    .select("id")
    .eq("owner_id", ownerId);
  return (data ?? []).map((e) => Number(e.id));
}

/** Noms d'affichage des auteurs (agents comme admins). */
async function displayNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();
  const { data } = await getServiceClient()
    .from("user_profiles")
    .select("id, full_name, email")
    .in("id", unique);
  const m = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { id: string; full_name: string | null; email: string | null };
    m.set(r.id, r.full_name?.trim() || r.email || "Utilisateur");
  }
  return m;
}

/**
 * Compteurs de tickets par opportunité — ce que le board pose sur chaque ligne.
 * Ne lève jamais : sans table (migration non appliquée) la map est vide.
 */
export async function noteSummaries(
  opportuniteIds: string[],
): Promise<Map<string, NoteSummary>> {
  const out = new Map<string, NoteSummary>();
  if (opportuniteIds.length === 0) return out;

  const { data, error } = await getServiceClient()
    .from("marketing_pipeline_notes")
    .select("opportunite_id, subject, status")
    .in("opportunite_id", opportuniteIds);

  if (error) {
    if (!isMissingTable(error)) console.warn("marketing_pipeline_notes read failed:", error.message);
    return out;
  }

  for (const row of (data ?? []) as Array<{ opportunite_id: string; subject: string | null; status: string | null }>) {
    const cur = out.get(row.opportunite_id) ?? { open: 0, total: 0, open_subjects: [] };
    cur.total += 1;
    if (asStatus(row.status) !== "resolved") {
      cur.open += 1;
      const s = asSubject(row.subject);
      if (!cur.open_subjects.includes(s)) cur.open_subjects.push(s);
    }
    out.set(row.opportunite_id, cur);
  }
  return out;
}

export interface ListNotesOptions {
  /** Restreint aux entreprises attribuées à cet agent. */
  ownerId?: string;
  /** Un seul dossier (vue « fil » ouverte depuis une ligne du board). */
  opportuniteId?: string;
  /** `open` = tout ce qui n'est pas résolu. Absent = tout. */
  status?: "open" | NoteStatus;
  limit?: number;
}

/** Les tickets + leur fil, du plus récemment mis à jour au plus ancien. */
export async function listNotes(opts: ListNotesOptions = {}): Promise<NotesResult<Note[]>> {
  const sc = getServiceClient();

  let query = sc
    .from("marketing_pipeline_notes")
    .select(NOTE_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(opts.limit ?? 300);

  if (opts.opportuniteId) query = query.eq("opportunite_id", opts.opportuniteId);
  if (opts.status === "open") query = query.neq("status", "resolved");
  else if (opts.status) query = query.eq("status", opts.status);

  if (opts.ownerId) {
    const owned = await ownedEntrepriseIds(opts.ownerId);
    if (!owned || owned.length === 0) return { ok: true, data: [] };
    query = query.in("entreprise_id", owned);
  }

  const { data, error } = await query;
  if (error) {
    // Migration non appliquée : le board doit continuer à fonctionner.
    if (isMissingTable(error)) return { ok: true, data: [] };
    return { ok: false, error: error.message, status: 500 };
  }

  const rows = (data ?? []) as NoteRow[];
  if (rows.length === 0) return { ok: true, data: [] };

  const noteIds = rows.map((r) => r.id);
  const entIds = [...new Set(rows.map((r) => r.entreprise_id).filter((v): v is number => v != null))];

  const [{ data: msgData }, { data: entData }] = await Promise.all([
    sc
      .from("marketing_pipeline_note_messages")
      .select("id, note_id, author_id, author_role, body, created_at")
      .in("note_id", noteIds)
      .order("created_at", { ascending: true }),
    entIds.length > 0
      ? sc.from("entreprises").select("id, name").in("id", entIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string | null }> }),
  ]);

  const msgRows = (msgData ?? []) as Array<{
    id: string;
    note_id: string;
    author_id: string | null;
    author_role: string | null;
    body: string | null;
    created_at: string;
  }>;

  const names = await displayNames([
    ...rows.map((r) => r.created_by),
    ...msgRows.map((m) => m.author_id),
  ]);

  const companyById = new Map(
    ((entData ?? []) as Array<{ id: number; name: string | null }>).map((e) => [Number(e.id), e.name ?? null]),
  );

  const messagesByNote = new Map<string, NoteMessage[]>();
  for (const m of msgRows) {
    const list = messagesByNote.get(m.note_id) ?? [];
    list.push({
      id: m.id,
      author_id: m.author_id,
      author_name: (m.author_id && names.get(m.author_id)) || "Utilisateur",
      author_role: asRole(m.author_role),
      body: m.body ?? "",
      created_at: m.created_at,
    });
    messagesByNote.set(m.note_id, list);
  }

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      opportunite_id: r.opportunite_id,
      entreprise_id: r.entreprise_id,
      subject: asSubject(r.subject),
      severity: asSeverity(r.severity),
      title: r.title ?? "Note",
      status: asStatus(r.status),
      created_by: r.created_by,
      created_by_name: (r.created_by && names.get(r.created_by)) || "Utilisateur",
      created_by_role: asRole(r.created_by_role),
      created_at: r.created_at,
      updated_at: r.updated_at,
      resolved_at: r.resolved_at,
      company_name: r.entreprise_id != null ? companyById.get(r.entreprise_id) ?? null : null,
      messages: messagesByNote.get(r.id) ?? [],
    })),
  };
}

const MISSING_TABLE_MESSAGE =
  "Tickets indisponibles : applique la migration sql/20260729_marketing_pipeline_notes.sql";

/** Garde de propriété : un agent n'écrit que sur ses entreprises. */
async function assertOwnership(opportuniteId: string, ownerId?: string): Promise<NotesResult<number | null>> {
  const { data: opp, error } = await getServiceClient()
    .from("opportunites")
    .select("id, entreprise_id")
    .eq("id", opportuniteId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!opp) return { ok: false, error: "opportunite_introuvable", status: 404 };

  const entrepriseId = opp.entreprise_id == null ? null : Number(opp.entreprise_id);
  if (!ownerId) return { ok: true, data: entrepriseId };

  if (entrepriseId == null) return { ok: false, error: "entreprise_non_attribuee", status: 403 };
  const { data: ent } = await getServiceClient()
    .from("entreprises")
    .select("id, owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (!ent || ent.owner_id !== ownerId) {
    return { ok: false, error: "entreprise_non_attribuee", status: 403 };
  }
  return { ok: true, data: entrepriseId };
}

export interface CreateNoteInput {
  opportuniteId: string;
  subject: NoteSubject;
  severity: NoteSeverity;
  title: string;
  body: string;
  authorId: string;
  authorRole: "agent" | "admin";
  /** Posé côté agent : restreint aux entreprises qui lui sont attribuées. */
  ownerId?: string;
}

/** Ouvre un ticket + son premier message (la description). */
export async function createNote(input: CreateNoteInput): Promise<NotesResult<{ id: string }>> {
  const owned = await assertOwnership(input.opportuniteId, input.ownerId);
  if (!owned.ok) return owned;

  const sc = getServiceClient();
  const { data, error } = await sc
    .from("marketing_pipeline_notes")
    .insert({
      opportunite_id: input.opportuniteId,
      entreprise_id: owned.data,
      subject: input.subject,
      severity: input.severity,
      title: input.title,
      status: "open",
      created_by: input.authorId,
      created_by_role: input.authorRole,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (isMissingTable(error)) return { ok: false, error: MISSING_TABLE_MESSAGE, status: 503 };
    return { ok: false, error: error?.message ?? "creation_impossible", status: 500 };
  }

  const noteId = (data as { id: string }).id;
  const body = input.body.trim();
  if (body) {
    await sc.from("marketing_pipeline_note_messages").insert({
      note_id: noteId,
      author_id: input.authorId,
      author_role: input.authorRole,
      body,
    });
  }
  return { ok: true, data: { id: noteId } };
}

/** Charge un ticket en vérifiant que le caller a le droit d'y toucher. */
async function loadNoteForWrite(
  noteId: string,
  ownerId?: string,
): Promise<NotesResult<{ id: string; opportunite_id: string; status: string | null }>> {
  const { data, error } = await getServiceClient()
    .from("marketing_pipeline_notes")
    .select("id, opportunite_id, status")
    .eq("id", noteId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { ok: false, error: MISSING_TABLE_MESSAGE, status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }
  if (!data) return { ok: false, error: "note_introuvable", status: 404 };

  const row = data as { id: string; opportunite_id: string; status: string | null };
  const owned = await assertOwnership(row.opportunite_id, ownerId);
  if (!owned.ok) return owned;
  return { ok: true, data: row };
}

export async function addNoteMessage(input: {
  noteId: string;
  body: string;
  authorId: string;
  authorRole: "agent" | "admin";
  ownerId?: string;
}): Promise<NotesResult<{ id: string }>> {
  const note = await loadNoteForWrite(input.noteId, input.ownerId);
  if (!note.ok) return note;

  const sc = getServiceClient();
  const { data, error } = await sc
    .from("marketing_pipeline_note_messages")
    .insert({
      note_id: input.noteId,
      author_id: input.authorId,
      author_role: input.authorRole,
      body: input.body.trim(),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "message_impossible", status: 500 };

  // Une réponse remonte le ticket en tête de liste, et rouvre ce qui était clos :
  // répondre à un ticket résolu, c'est dire qu'il ne l'était pas.
  const reopened = asStatus(note.data.status) === "resolved";
  await sc
    .from("marketing_pipeline_notes")
    .update({
      updated_at: new Date().toISOString(),
      ...(reopened ? { status: "open", resolved_at: null, resolved_by: null } : {}),
    })
    .eq("id", input.noteId);

  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function setNoteStatus(input: {
  noteId: string;
  status: NoteStatus;
  actorId: string;
  ownerId?: string;
}): Promise<NotesResult<{ status: NoteStatus }>> {
  const note = await loadNoteForWrite(input.noteId, input.ownerId);
  if (!note.ok) return note;

  const resolved = input.status === "resolved";
  const { error } = await getServiceClient()
    .from("marketing_pipeline_notes")
    .update({
      status: input.status,
      updated_at: new Date().toISOString(),
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? input.actorId : null,
    })
    .eq("id", input.noteId);
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: { status: input.status } };
}
