import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * LES NOTES D'UN PROSPECT — les écrire depuis n'importe où, les relire partout.
 *
 * LE GRIEF : « à toutes les étapes on doit pouvoir noter ce que le client a
 * dit, et consulter les notes très facilement partout où on a une tâche avec ce
 * client ». Une note ne pouvait jusqu'ici s'écrire qu'en BOUCLANT une tâche
 * (`PATCH /api/agent/tasks`, champ `note`) : ce que le prospect dit au
 * troisième message d'une conversation n'avait donc nulle part où aller tant
 * qu'on n'avait pas fini quelque chose. C'est exactement l'information qu'on
 * perd.
 *
 * ON N'INVENTE AUCUNE TABLE. Une note est une ligne `email_logs` en
 * `channel:'note'`, `direction:'interne'` — la même forme que celle écrite par
 * la fin de tâche et par la conversation admin. Une table séparée aurait obligé
 * chaque écran à fusionner deux sources dans le bon ordre : trois occasions de
 * diverger, et le projet a déjà tranché ce point
 * (`sql/20260815_notes_de_demarchage.sql`).
 *
 * ⚠️ `to_email` est NOT NULL sur `email_logs` : une note passe la contrainte
 * avec une chaîne vide, exactement comme les notes existantes. Ce n'est pas une
 * élégance, c'est la condition pour ne pas avoir deux tables.
 */

const NoteSchema = z.object({
  entreprise_id: z.coerce.number().int().positive(),
  texte: z.string().trim().min(1).max(4000),
  contact_id: z.string().uuid().optional().nullable(),
  opportunite_id: z.string().uuid().optional().nullable(),
  /** L'étape de séquence d'où la note est prise, quand il y en a une. */
  step_id: z.string().max(80).optional().nullable(),
});
type NoteBody = z.infer<typeof NoteSchema>;

export type NoteAgent = {
  id: string;
  texte: string;
  le: string;
  auteur: string | null;
  /** Le titre que la note portait — l'issue d'un échange, le plus souvent. */
  motif: string | null;
};

/**
 * Le garde de propriété, identique à `/api/agent/history` : sa propre
 * entreprise, ou une entreprise encore au pool. Écrit avec le client de
 * service, donc c'est ici — et pas dans RLS — que la règle vit.
 */
async function autorise(
  sc: ReturnType<typeof getServiceClient>,
  entrepriseId: number,
  userId: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  const { data } = await sc
    .from("entreprises")
    .select("owner_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (!data) return "not_found";
  const ownerId = (data as { owner_id?: string | null }).owner_id ?? null;
  return !ownerId || ownerId === userId ? "ok" : "forbidden";
}

export const GET = withAuth({ role: "freelance" }, async ({ user, req, cors }) => {
  const url = new URL(req.url);
  const entrepriseId = Number(url.searchParams.get("entreprise_id"));
  if (!Number.isFinite(entrepriseId) || entrepriseId <= 0) {
    return jsonError("entreprise_id requis", 400, {}, cors);
  }
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100);

  const sc = getServiceClient();
  const droit = await autorise(sc, entrepriseId, user.id);
  if (droit === "not_found") return jsonError("not_found", 404, {}, cors);
  if (droit === "forbidden") return jsonError("forbidden", 403, {}, cors);

  const { data, error } = await sc
    .from("email_logs")
    .select("id, subject, body_text, sent_at, auteur_id")
    .eq("entreprise_id", entrepriseId)
    .eq("channel", "note")
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) return jsonError(error.message, 500, {}, cors);

  // Le nom de l'auteur, en une requête et jamais une par ligne. Sans lui, « je
  // ne vois pas les notes de Bilal » resterait vrai à la lettre : on les
  // verrait, sans savoir de qui elles sont.
  const auteurs = [...new Set((data ?? []).map((r) => r.auteur_id).filter((v): v is string => !!v))];
  const noms = new Map<string, string>();
  if (auteurs.length > 0) {
    const { data: profils } = await sc
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", auteurs);
    for (const p of profils ?? []) {
      noms.set(p.id as string, ((p.full_name as string | null) || (p.email as string | null)) ?? "");
    }
  }

  const notes: NoteAgent[] = (data ?? []).map((r) => ({
    id: r.id as string,
    texte: (r.body_text as string | null) ?? "",
    le: r.sent_at as string,
    auteur: r.auteur_id ? (noms.get(r.auteur_id as string) || null) : null,
    // « Note » est le sujet par défaut : le répéter sous chaque ligne
    // n'apprendrait rien. Un motif d'issue, lui, situe ce qui a été dit.
    motif: (r.subject as string | null) && r.subject !== "Note" ? (r.subject as string) : null,
  }));

  return json({ notes }, { headers: cors });
});

export const POST = withAuth<NoteBody>(
  { role: "freelance", body: NoteSchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();
    const droit = await autorise(sc, body.entreprise_id, user.id);
    if (droit === "not_found") return jsonError("not_found", 404, {}, cors);
    if (droit === "forbidden") return jsonError("forbidden", 403, {}, cors);

    const { data, error } = await sc
      .from("email_logs")
      .insert({
        channel: "note",
        auteur_id: user.id,
        direction: "interne",
        entreprise_id: body.entreprise_id,
        contact_id: body.contact_id ?? null,
        opportunite_id: body.opportunite_id ?? null,
        step_id: body.step_id ?? null,
        to_email: "",
        subject: "Note",
        body_text: body.texte,
        status: "sent",
      })
      .select("id, sent_at")
      .single();

    if (error) return jsonError(error.message, 500, {}, cors);
    return json({ id: data.id, le: data.sent_at }, { headers: cors });
  },
);
