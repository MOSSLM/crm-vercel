// /api/agent/plaquettes — la file des plaquettes du jour, prête à être envoyée.
//
// CE QUE L'ÉCRAN A BESOIN DE SAVOIR, ET RIEN D'AUTRE : à qui, quel message,
// quel numéro, et OÙ EST LE FICHIER. Le reste (l'historique, l'audit, la démo)
// vit sur la carte d'action ; ici on prépare une chaîne d'envoi, pas une fiche.
//
// LE LIEN DU PDF EST SIGNÉ ET COURT. Le seau `plaquettes-pdf` est privé, comme
// `audits-pdf` : ces documents nomment une entreprise et portent son prix. Une
// URL signée deux heures couvre largement une passe d'envoi et ne survit pas à
// un copier-coller oublié dans une conversation.
//
// UNE TÂCHE SANS PDF RESTE DANS LA LISTE, avec `pdf: null`. La masquer ferait
// disparaître un prospect de la file sans que personne ne sache pourquoi —
// alors que la cause est connue et se corrige en relançant la passe
// (`scripts/prospection/plaquettes-pdf.ts`).
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { lienWhatsApp } from "@/lib/prospects/canal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/** Deux heures : le temps d'une passe, pas celui d'un oubli. */
const VALIDITE_SECONDES = 2 * 60 * 60;

const BUCKET = "plaquettes-pdf";

type LigneTache = {
  id: string;
  entreprise_id: number | null;
  due_at: string | null;
  status: string;
  payload: Record<string, unknown> | null;
  entreprise: { id: number; name: string | null; ville: string | null } | { id: number; name: string | null; ville: string | null }[] | null;
  contact: { first_name: string | null; last_name: string | null; tel: string | null } | { first_name: string | null; last_name: string | null; tel: string | null }[] | null;
};

const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export const GET = withAuth({ role: "freelance" }, async ({ user, cors }) => {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("prospection_tasks")
    .select(
      "id, entreprise_id, due_at, status, payload, " +
        "entreprise:entreprises(id, name, ville), contact:contacts(first_name, last_name, tel)",
    )
    .eq("assignee_id", user.id)
    .in("status", ["pending", "snoozed"])
    .not("payload->>plaquette_url", "is", null)
    .order("due_at");
  if (error) return jsonError(error.message, 500, {}, cors);

  const lignes = (data ?? []) as unknown as LigneTache[];

  const plaquettes = await Promise.all(
    lignes.map(async (t) => {
      const ent = un(t.entreprise);
      const ct = un(t.contact);
      const message = typeof t.payload?.message === "string" ? t.payload.message : "";
      const tel = (typeof t.payload?.phone === "string" && t.payload.phone) || ct?.tel || null;
      const chemin = typeof t.payload?.plaquette_pdf === "string" ? t.payload.plaquette_pdf : null;

      let pdf: string | null = null;
      if (chemin) {
        const { data: signe } = await sb.storage
          .from(BUCKET)
          .createSignedUrl(chemin, VALIDITE_SECONDES, {
            // Le navigateur enregistre le fichier sous ce nom-là : sans lui, on
            // se retrouve avec quarante-neuf « plaquette.pdf (3) » et plus
            // aucun moyen de savoir laquelle va chez qui.
            download: (t.payload?.plaquette_pdf_nom as string) || true,
          });
        pdf = signe?.signedUrl ?? null;
      }

      return {
        id: t.id,
        entreprise: ent?.name ?? "Entreprise",
        ville: ent?.ville ?? null,
        prenom: ct?.first_name ?? null,
        tel,
        message,
        // Le lien est composé ICI et pas dans le navigateur : c'est le même
        // `lienWhatsApp` que la carte d'action, donc le même numéro nettoyé et
        // le même encodage. Deux compositions, ce serait deux résultats le jour
        // où l'une des deux change.
        whatsapp: lienWhatsApp(tel, message),
        pdf,
        pdfNom: (t.payload?.plaquette_pdf_nom as string) ?? null,
        pdfLe: (t.payload?.plaquette_pdf_le as string) ?? null,
        reportee: t.status === "snoozed",
        dueAt: t.due_at,
      };
    }),
  );

  return json(
    {
      plaquettes,
      sansPdf: plaquettes.filter((p) => !p.pdf).length,
      genereLe: new Date().toISOString(),
    },
    { headers: cors },
  );
});
