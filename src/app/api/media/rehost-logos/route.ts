/**
 * `POST /api/media/rehost-logos` — rapatrier les logos restés chez le client.
 *
 * Jusqu'ici, un logo saisi sous forme d'URL était stocké tel quel : nos démos
 * affichaient une image servie par le site du prospect. Cent dix-neuf fiches
 * étaient dans ce cas, dont cent dix-huit sur des entreprises qualifiées. Le
 * jour où l'un d'eux refait son site, le logo disparaît de la démo qu'on lui
 * montre, et personne ne le voit venir.
 *
 * Cette reprise aspire ces images dans notre bucket puis réécrit les deux
 * colonnes qui les portent — `entreprises.logo_url` et
 * `lead_magnet_projects.logo_url`, qui sont identiques dans les cent dix-huit
 * cas. Rejouable sans dommage : une URL déjà chez nous est ignorée.
 */

import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { mediaRehostLogosSchema, type MediaRehostLogosPayload } from "@/app/api/_lib/schemas";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { isAlreadyHosted, rehostRemoteImage } from "@/lib/images/rehost-remote-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = (req: Request) => preflight(req);

/**
 * Budget sous `maxDuration` : mieux vaut un résultat partiel avec un curseur
 * qu'une 504 qui ne dit ni ce qui a été fait ni où reprendre. Même choix que
 * `marketing-pipeline/reenrich`.
 */
const BUDGET_MS = 200_000;

/**
 * Téléchargements menés de front. Quatre suffit à tenir le parc en un appel
 * sans marteler les hébergeurs des clients.
 */
const CONCURRENCY = 4;

type EntrepriseRow = { id: number; name: string | null; logo_url: string | null };

type Outcome = {
  entreprise_id: number;
  name: string | null;
  old_url: string;
  new_url?: string;
  projects_updated?: number;
  error?: string;
};

export const POST = withAuth<MediaRehostLogosPayload>(
  { role: "admin", body: mediaRehostLogosSchema },
  async ({ body, cors }) => {
    const startedAt = Date.now();
    const supabase = getServiceClient();
    const { dry_run: dryRun = false, entreprise_ids: ids, after_id: afterId } = body;
    const limit = body.limit ?? 200;

    let query = supabase
      .from("entreprises")
      .select("id, name, logo_url")
      .not("logo_url", "is", null)
      .neq("logo_url", "")
      .order("id", { ascending: true })
      .limit(limit);

    if (ids?.length) query = query.in("id", ids);
    if (afterId != null) query = query.gt("id", afterId);

    const { data, error } = await query;
    if (error) return jsonError(error.message, 500, {}, cors);

    // Le tri « déjà chez nous » se fait ici et non en SQL : l'hôte de notre
    // stockage n'est connu que du client Supabase, et un `like '%supabase%'`
    // se tromperait sur un domaine de stockage personnalisé.
    const rows = (data ?? []) as EntrepriseRow[];
    const todo = rows.filter((r) => r.logo_url && !isAlreadyHosted(supabase, r.logo_url));

    const lastScanned = rows.length ? rows[rows.length - 1].id : null;
    const scanExhausted = rows.length < limit;

    if (dryRun) {
      return json(
        {
          dry_run: true,
          scanned: rows.length,
          to_rehost: todo.length,
          already_hosted: rows.length - todo.length,
          next_after_id: scanExhausted ? null : lastScanned,
          items: todo.map((r) => ({ entreprise_id: r.id, name: r.name, old_url: r.logo_url })),
        },
        { headers: cors },
      );
    }

    const outcomes: Outcome[] = [];
    let budgetSpent = false;
    let lastDone: number | null = null;

    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > BUDGET_MS) {
        budgetSpent = true;
        break;
      }

      const slice = todo.slice(i, i + CONCURRENCY);
      const batch = await Promise.all(
        slice.map(async (row): Promise<Outcome> => {
          const oldUrl = row.logo_url as string;
          const res = await rehostRemoteImage(supabase, oldUrl, {
            entrepriseId: row.id,
            imageType: "company",
            tags: ["logo"],
            altText: row.name ? `Logo ${row.name}` : null,
          });
          if (!res.ok) {
            return { entreprise_id: row.id, name: row.name, old_url: oldUrl, error: res.error };
          }

          const { error: entErr } = await supabase
            .from("entreprises")
            .update({ logo_url: res.publicUrl })
            .eq("id", row.id);
          if (entErr) {
            return { entreprise_id: row.id, name: row.name, old_url: oldUrl, error: entErr.message };
          }

          // Les projets qui affichaient exactement la même URL suivent. On cible
          // sur l'ancienne valeur : un projet dont le logo avait été changé à la
          // main garde le sien.
          const { data: touched, error: projErr } = await supabase
            .from("lead_magnet_projects")
            .update({ logo_url: res.publicUrl })
            .eq("entreprise_id", row.id)
            .eq("logo_url", oldUrl)
            .select("id");

          return {
            entreprise_id: row.id,
            name: row.name,
            old_url: oldUrl,
            new_url: res.publicUrl,
            projects_updated: projErr ? 0 : (touched?.length ?? 0),
            ...(projErr ? { error: `logo repris, projets non mis à jour : ${projErr.message}` } : {}),
          };
        }),
      );

      outcomes.push(...batch);
      lastDone = slice[slice.length - 1].id;
    }

    const failed = outcomes.filter((o) => o.error && !o.new_url);
    const succeeded = outcomes.filter((o) => o.new_url);

    // Il reste du travail si le budget a sauté en cours de lot, ou si le
    // balayage s'est arrêté sur la limite sans avoir vu la fin du parc.
    const nextAfterId = budgetSpent ? lastDone : scanExhausted ? null : lastScanned;

    return json(
      {
        dry_run: false,
        scanned: rows.length,
        rehosted: succeeded.length,
        failed: failed.length,
        already_hosted: rows.length - todo.length,
        projects_updated: succeeded.reduce((n, o) => n + (o.projects_updated ?? 0), 0),
        budget_spent: budgetSpent,
        next_after_id: nextAfterId,
        items: outcomes,
      },
      { headers: cors },
    );
  },
);
