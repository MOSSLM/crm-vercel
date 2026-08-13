import { z } from "zod";
import { preflight } from "@/app/api/_lib/cors";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { AUTO_IMAGE_ZONES } from "@/lib/site-builder/claude-design/auto-image-zones";
import { appliquerTiragePourSite } from "@/lib/site-builder/claude-design/appliquer-tirage";
import {
  companyTags,
  loadDesignPages,
  loadLibrary,
  placedSlots,
  zoneTargets,
  type ZoneTarget,
} from "@/lib/site-builder/claude-design/design-pages";
import { drawImageSets, seededRandom, type LibraryImage } from "@/lib/site-builder/claude-design/draw-image-sets";
import { enregistrerTirage, lireTirages, type SlotTire } from "@/lib/site-builder/claude-design/tirage-entreprise";
import { serviceTagKey } from "@/utils/serviceTags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  /** Restreindre à ces sites. Sinon : tout le parc des designs Claude. */
  site_ids: z.array(z.string().uuid()).optional(),
  /** Restreindre aux entreprises d'un propriétaire (le commercial). */
  owner_id: z.string().uuid().optional(),
  /** Ne rien écrire, dire seulement ce qui serait fait. */
  dry_run: z.boolean().optional(),
  /** Retirer au sort pour les sites dont la bande a été perdue. À `false`, on
   *  se contente d'adopter ce qui est en place et de signaler les perdus. */
  retirer_si_perdu: z.boolean().optional(),
});
type Body = z.infer<typeof bodySchema>;

type Etat =
  /** Un tirage enregistré existait : reposé tel quel sur les pages. */
  | "repose"
  /** La bande en place est propre : adoptée comme tirage de référence, et figée. */
  | "adopte"
  /** La bande était celle du gabarit : nouveau tirage. */
  | "retire"
  /** Bande perdue, mais `retirer_si_perdu` était à faux. */
  | "perdu"
  | "ignore"
  | "erreur";

interface Ligne {
  siteId: string;
  entrepriseId: number | null;
  nom: string | null;
  enLigne: boolean;
  etat: Etat;
  detail?: string;
  emplacements?: number;
  remplacees?: number;
}

/**
 * La signature d'une bande : la valeur brute des jeux d'images, emplacement par
 * emplacement, sur la première page qui porte la zone.
 *
 * Elle sert à répondre à UNE question : cette bande a-t-elle été tirée pour
 * cette entreprise, ou est-ce celle du gabarit recopiée telle quelle ? Les deux
 * se comparent octet pour octet parce qu'elles sortent du même balisage et
 * portent donc les mêmes chemins. C'est la version applicative du `md5` qui a
 * servi au diagnostic du 12/08/2026 : 33 sites partageaient exactement la
 * signature de « template CVC - Verdure ».
 */
function signatureBande(target: ZoneTarget): string {
  const { page, slots } = target.pages[0];
  return slots
    .map((slot) => {
      const entry = page.overrides[`${slot.path}:image_set`] as { value?: string } | undefined;
      return `${slot.order}=${typeof entry?.value === "string" ? entry.value : ""}`;
    })
    .join("|");
}

/** Les signatures de bande de tous les gabarits — ce qu'un site ne doit PAS
 *  porter s'il a été tiré pour lui-même. */
async function signaturesDesGabarits(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<Set<string>> {
  const signatures = new Set<string>();
  const { data } = await supabase
    .from("sites")
    .select("id")
    .eq("is_template", true)
    .eq("is_claude_design", true);

  for (const tpl of (data ?? []) as Array<{ id: string }>) {
    const charge = await loadDesignPages(supabase, tpl.id);
    if ("error" in charge) continue;
    for (const target of zoneTargets(charge.pages, AUTO_IMAGE_ZONES.map((z) => z.id))) {
      signatures.add(signatureBande(target));
    }
  }
  return signatures;
}

/** La bande tirée pour cette entreprise, prête à être enregistrée. */
function tirerBande(target: ZoneTarget, tags: string[], library: LibraryImage[], seed: number): SlotTire[] {
  const tirage = drawImageSets(
    { slotCount: target.slotCount, companyTags: tags, library, random: seededRandom(seed) },
    target.alts,
  );
  return tirage.slots.map((slot, i) => ({
    ordre: i + 1,
    url: slot.chosen?.url ?? "",
    alt: slot.chosen?.alt ?? target.alts[i] ?? "",
    tag: slot.leadTag,
    masque: slot.repeated || !slot.chosen?.url,
  }));
}

/**
 * POST /api/site-builder/admin/reappliquer-tirages
 *
 * Rattrapage du parc, à jouer une fois après la migration
 * `20260817_tirages_photos_entreprise.sql`.
 *
 * Le tirage de photos vient de changer de propriétaire : il appartient à
 * l'entreprise et non plus au JSON des pages (voir `tirage-entreprise.ts`).
 * Restent les sites d'avant, dont le tirage n'existe nulle part — et parmi eux
 * ceux qui l'ont carrément perdu lors d'une refonte depuis un modèle. Cette
 * route traite les trois cas :
 *
 *   - tirage déjà enregistré        → reposé sur les pages (et figé)
 *   - bande propre, jamais adoptée  → adoptée telle quelle, sans changer une
 *                                     seule photo : le parc validé à l'œil
 *                                     reste exactement comme il est
 *   - bande = celle du gabarit      → nouveau tirage, parce qu'il n'y a rien à
 *                                     sauver : ce sont les photos de personne
 *
 * Écrire ne suffit pas pour les sites EN LIGNE : le public sert l'instantané
 * de la dernière publication. La réponse les nomme (`aRepublier`) — la
 * republication reste un geste d'opérateur, elle change ce que voit le
 * prospect.
 */
export const POST = withAuth<Body>({ role: "admin", body: bodySchema }, async ({ body, cors }) => {
  const supabase = getServiceClient();
  const dryRun = body.dry_run === true;
  const retirerSiPerdu = body.retirer_si_perdu !== false;

  let q = supabase
    .from("sites")
    .select("id, name, enterprise_id, is_published")
    .eq("is_claude_design", true)
    .not("enterprise_id", "is", null);
  if (body.site_ids?.length) q = q.in("id", body.site_ids);

  const { data: sitesBruts, error } = await q;
  if (error) return jsonError(error.message, 500, {}, cors);

  let sites = (sitesBruts ?? []) as Array<{
    id: string; name: string | null; enterprise_id: number; is_published: boolean | null;
  }>;

  if (body.owner_id) {
    const { data: possedees } = await supabase
      .from("entreprises")
      .select("id")
      .eq("owner_id", body.owner_id);
    const ids = new Set(((possedees ?? []) as Array<{ id: number }>).map((e) => e.id));
    sites = sites.filter((s) => ids.has(s.enterprise_id));
  }

  const gabarits = await signaturesDesGabarits(supabase);
  // La médiathèque est la même pour deux entreprises de mêmes métiers : deux
  // cents sites ne valent pas deux cents lectures de deux mille lignes.
  const bibliothequeParMetiers = new Map<string, LibraryImage[]>();

  const lignes: Ligne[] = [];
  for (const site of sites) {
    const ligne: Ligne = {
      siteId: site.id,
      entrepriseId: site.enterprise_id,
      nom: site.name,
      enLigne: site.is_published === true,
      etat: "ignore",
    };

    try {
      const dejaEnregistre = (await lireTirages(supabase, site.enterprise_id)).some((t) => t.slots.length > 0);
      if (dejaEnregistre) {
        ligne.etat = "repose";
        if (!dryRun) {
          const res = await appliquerTiragePourSite(supabase, site.id, { entrepriseId: site.enterprise_id });
          ligne.emplacements = res.emplacements;
          ligne.remplacees = res.remplacees;
          if (!res.applique) { ligne.etat = "ignore"; ligne.detail = res.raison; }
        }
        lignes.push(ligne);
        continue;
      }

      const charge = await loadDesignPages(supabase, site.id);
      if ("error" in charge) { ligne.etat = "erreur"; ligne.detail = charge.error; lignes.push(ligne); continue; }
      const cibles = zoneTargets(charge.pages, AUTO_IMAGE_ZONES.map((z) => z.id));
      if (cibles.length === 0) { ligne.detail = "aucune zone photo dans ce design"; lignes.push(ligne); continue; }

      const tags = await companyTags(supabase, site.enterprise_id);
      let emplacements = 0;

      for (const target of cibles) {
        const bande = placedSlots(target, tags);
        const urls = bande.filter((s) => !s.hidden).map((s) => s.url);
        const perdue =
          bande.length === 0 ||
          gabarits.has(signatureBande(target)) ||
          new Set(urls).size !== urls.length;

        if (!perdue) {
          ligne.etat = "adopte";
          if (!dryRun) {
            await enregistrerTirage(supabase, {
              entrepriseId: site.enterprise_id,
              zoneId: target.zoneId,
              slots: bande.map((s) => ({
                ordre: s.order, url: s.url, alt: s.alt, tag: s.tag, masque: s.hidden,
              })),
            });
          }
          continue;
        }

        if (!retirerSiPerdu) { ligne.etat = "perdu"; continue; }
        if (tags.length === 0) { ligne.etat = "erreur"; ligne.detail = "entreprise sans service tag"; continue; }

        const cle = [...new Set(tags.map(serviceTagKey))].sort().join(",");
        let bibliotheque = bibliothequeParMetiers.get(cle);
        if (!bibliotheque) {
          const chargee = await loadLibrary(supabase, tags);
          if ("error" in chargee) { ligne.etat = "erreur"; ligne.detail = chargee.error; continue; }
          bibliotheque = chargee;
          bibliothequeParMetiers.set(cle, bibliotheque);
        }
        if (bibliotheque.length === 0) {
          ligne.etat = "erreur";
          ligne.detail = "aucune photo de la médiathèque ne porte ses métiers";
          continue;
        }

        ligne.etat = "retire";
        if (!dryRun) {
          // La graine dérive de l'entreprise : deux sites voisins ne repartent
          // pas sur la même bande, et un rejeu du rattrapage redonne la même.
          const seed = (site.enterprise_id * 2654435761) >>> 0;
          const slots = tirerBande(target, tags, bibliotheque, seed);
          await enregistrerTirage(supabase, {
            entrepriseId: site.enterprise_id, zoneId: target.zoneId, slots, seed,
          });
          emplacements += slots.filter((s) => !s.masque).length;
        }
      }

      // Une seule porte d'écriture sur les pages : la repose. Elle revérifie
      // les URLs contre la médiathèque, referme l'unicité et fige les jeux.
      if (!dryRun && (ligne.etat === "adopte" || ligne.etat === "retire")) {
        const res = await appliquerTiragePourSite(supabase, site.id, { entrepriseId: site.enterprise_id });
        ligne.emplacements = res.emplacements || emplacements;
        ligne.remplacees = res.remplacees;
        if (!res.applique) { ligne.etat = "erreur"; ligne.detail = res.raison; }
      }
    } catch (e) {
      ligne.etat = "erreur";
      ligne.detail = e instanceof Error ? e.message : "échec";
    }
    lignes.push(ligne);
  }

  const par = (etat: Etat) => lignes.filter((l) => l.etat === etat).length;
  return json(
    {
      dryRun,
      total: lignes.length,
      resume: {
        reposes: par("repose"),
        adoptes: par("adopte"),
        retires: par("retire"),
        perdus: par("perdu"),
        ignores: par("ignore"),
        erreurs: par("erreur"),
      },
      /** Sites en ligne dont la bande a changé : leur instantané public sert
       *  encore les anciennes photos tant qu'ils ne sont pas republiés. */
      aRepublier: lignes.filter((l) => l.enLigne && (l.etat === "retire" || l.etat === "repose")).map((l) => l.siteId),
      lignes,
    },
    { headers: cors },
  );
});
