import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAlreadyHosted, rehostRemoteImage } from "@/lib/images/rehost-remote-image";

/**
 * Rapatrier le logo juste avant que la publication le fige.
 *
 * `publishSite` prend un instantané : `published_variables` est calculé au
 * moment de la publication et le site en ligne sert depuis ce gel, pas depuis
 * la base vivante. Une URL de logo qui pointe vers le site du client est donc
 * gravée dans l'instantané — la réparer en base après coup ne change rien au
 * site déjà publié, il faudrait le republier.
 *
 * D'où ce passage ici, et pas ailleurs : c'est le dernier moment où l'on peut
 * encore décider ce qui sera servi. Ce qu'on montre au prospect vient de chez
 * nous et survit à la refonte de son propre site.
 *
 * Deux colonnes portent le logo, et **celle du projet prime** (cf.
 * `applyProjectEnrichment`, qui écrase `entreprise.logo_url` quand le projet en
 * a un). Réparer la seule table `entreprises` serait donc sans effet dès qu'un
 * projet a son logo : les deux sont traitées.
 *
 * Ne bloque jamais une publication. Un hébergeur lent ou une image morte ne doit
 * pas rendre une démo impubliable devant un client : on publie avec ce qu'on a,
 * et le motif remonte à l'éditeur.
 */

export type EnsureHostedLogoResult = {
  /** URLs effectivement rapatriées, pour la trace. */
  repaired: string[];
  /**
   * Motifs d'échec, destinés à l'éditeur du CRM. Jamais rendus dans le site
   * publié : le prospect ne doit rien voir de cette mécanique.
   */
  warnings: string[];
};

type Target = { table: "entreprises" | "lead_magnet_projects"; id: string | number; url: string };

/**
 * Rapatrie les logos distants de l'entreprise et de son projet. Idempotent : une
 * URL déjà servie par nous est laissée telle quelle, sans requête réseau.
 */
export async function ensureHostedLogo(
  supabase: SupabaseClient,
  opts: { enterpriseId: number | null; projectId: string | null },
): Promise<EnsureHostedLogoResult> {
  const { enterpriseId, projectId } = opts;
  const out: EnsureHostedLogoResult = { repaired: [], warnings: [] };
  if (enterpriseId == null && !projectId) return out;

  const [entRes, projRes] = await Promise.all([
    enterpriseId != null
      ? supabase.from("entreprises").select("id, name, logo_url").eq("id", enterpriseId).single()
      : Promise.resolve({ data: null }),
    projectId
      ? supabase.from("lead_magnet_projects").select("id, logo_url").eq("id", projectId).single()
      : Promise.resolve({ data: null }),
  ]);

  const ent = entRes.data as { id: number; name: string | null; logo_url: string | null } | null;
  const proj = projRes.data as { id: string; logo_url: string | null } | null;

  const targets: Target[] = [];
  if (ent?.logo_url?.trim()) targets.push({ table: "entreprises", id: ent.id, url: ent.logo_url.trim() });
  if (proj?.logo_url?.trim()) {
    targets.push({ table: "lead_magnet_projects", id: proj.id, url: proj.logo_url.trim() });
  }

  const remote = targets.filter((t) => !isAlreadyHosted(supabase, t.url));
  if (remote.length === 0) return out;

  // Les deux colonnes portent presque toujours la MÊME adresse : on ne
  // télécharge qu'une fois par URL distincte, et les cibles qui la partagent
  // reçoivent le même résultat.
  const byUrl = new Map<string, Target[]>();
  for (const t of remote) {
    const list = byUrl.get(t.url);
    if (list) list.push(t);
    else byUrl.set(t.url, [t]);
  }

  await Promise.all(
    Array.from(byUrl.entries()).map(async ([url, sharing]) => {
      const res = await rehostRemoteImage(supabase, url, {
        entrepriseId: enterpriseId,
        imageType: enterpriseId != null ? "company" : "stock",
        tags: ["logo"],
        altText: ent?.name ? `Logo ${ent.name}` : null,
      });

      if (!res.ok) {
        out.warnings.push(
          `Logo non rapatrié (${res.error}) : il pointe encore vers ${new URL(url).host}.`,
        );
        return;
      }

      // On ne réécrit que les lignes qui portaient exactement cette adresse :
      // un logo changé à la main entre-temps garde le sien.
      await Promise.all(
        sharing.map((t) =>
          supabase.from(t.table).update({ logo_url: res.publicUrl }).eq("id", t.id).eq("logo_url", url),
        ),
      );
      out.repaired.push(url);
    }),
  );

  return out;
}
