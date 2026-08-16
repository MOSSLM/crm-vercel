import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

/**
 * Les doublons : les voir, les simuler, les fusionner.
 *
 * DEUX FONCTIONS SQL EXISTAIENT DÉJÀ, SANS AUCUN APPELANT.
 * `doublons_suggeres` détecte, `fusionner_entreprises` fusionne — 450 lignes
 * avec essai à blanc réel, archivage avant écriture, et repointage des 41 clés
 * étrangères LUES DANS LE CATALOGUE (donc une table ajoutée demain est traitée
 * sans qu'on y repense). La seule façon de s'en servir était d'écrire du SQL.
 *
 * ELLES ÉTAIENT AUSSI CASSÉES : `fusionner_entreprises` échouait à chaque appel
 * sur `digest() does not exist`, parce que son `search_path` figé ne contenait
 * pas `extensions` et que la colonne générée `dedupe_key_v3` en a besoin.
 * Corrigé par `sql/20260817_reparer_fusion_search_path.sql`.
 *
 * L'ESSAI À BLANC N'EST PAS UNE COURTOISIE, C'EST LE CŒUR DU DISPOSITIF.
 * La méthode `siren` ne trouve pas des doublons mais les ÉTABLISSEMENTS d'une
 * même entreprise — deux adresses réelles, deux SIRET, un seul SIREN. Les
 * fusionner effacerait un établissement qui existe. Aucune heuristique ne
 * remplace un humain qui lit le rapport ; l'écran doit donc rendre ce rapport
 * impossible à sauter.
 */

const METHODES = new Set(["toutes", "siren", "telephone", "domaine", "nom_ville", "geo"]);

type LigneGrappe = {
  methode: string;
  cle: string;
  entreprise_ids: (number | string)[];
  taille: number;
  apercu: string | null;
  total_grappes: number | string;
};

/** Ce qu'on montre d'un membre pour choisir la gagnante sans ouvrir sa fiche. */
type Membre = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  siret: string | null;
  telephone: string | null;
  site: string | null;
  sources: string[] | null;
  cohorte_demarchage: string | null;
  owner_id: string | null;
  premiere_touche_le: string | null;
  created_at: string;
};

export const GET = withAuth({ role: "admin" }, async ({ req, cors }) => {
  const sp = new URL(req.url).searchParams;
  const methode = sp.get("methode") ?? "toutes";
  if (!METHODES.has(methode)) return jsonError("méthode inconnue", 400, {}, cors);

  const limite = Math.min(Math.max(Number(sp.get("limite")) || 25, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);

  const sc = getServiceClient();
  const { data, error } = await sc.rpc("doublons_suggeres", {
    p_methode: methode,
    p_limite: limite,
    p_offset: offset,
  });
  if (error) return jsonError(error.message, 500, {}, cors);

  const grappes = (data ?? []) as unknown as LigneGrappe[];
  const total = grappes.length > 0 ? Number(grappes[0].total_grappes) : 0;

  // Les membres de TOUTES les grappes en UNE requête : une par grappe ferait
  // vingt-cinq allers-retours pour un écran.
  const ids = [...new Set(grappes.flatMap((g) => g.entreprise_ids.map(Number)))];
  const membreParId = new Map<number, Membre>();
  if (ids.length > 0) {
    const { data: lignes, error: erreurMembres } = await sc
      .from("entreprises")
      .select(
        "id, name, ville, code_postal, adresse, siret, telephone, site_web_canonique, canonical_url, sources, cohorte_demarchage, owner_id, premiere_touche_le, created_at",
      )
      .in("id", ids);
    if (erreurMembres) return jsonError(erreurMembres.message, 500, {}, cors);

    for (const l of (lignes ?? []) as unknown as (Membre & {
      site_web_canonique: string | null;
      canonical_url: string | null;
    })[]) {
      membreParId.set(Number(l.id), {
        ...l,
        id: Number(l.id),
        site: l.site_web_canonique ?? l.canonical_url ?? null,
      });
    }
  }

  const items = grappes.map((g) => {
    const membres = g.entreprise_ids
      .map((id) => membreParId.get(Number(id)))
      .filter((m): m is Membre => m != null);

    // Les deux avertissements que l'écran doit porter, calculés ici parce que
    // c'est ici qu'on a la donnée. Ils ne bloquent rien : ils se lisent.
    const enCohorte = membres.filter((m) => m.cohorte_demarchage != null).length;
    const dejaTouchees = membres.filter((m) => m.premiere_touche_le != null).length;

    return {
      methode: g.methode,
      cle: g.cle,
      apercu: g.apercu,
      membres,
      // Fusionner deux fiches d'une même cohorte la fait RÉTRÉCIR d'une unité :
      // la campagne se mesure sur une population, et cette population change.
      retrecit_cohorte: enCohorte >= 2,
      deja_demarchee: dejaTouchees > 0,
    };
  });

  return json({ items, total, methode, limite, offset }, { headers: cors });
});

const fusionSchema = z.object({
  gagnante: z.number().int().positive(),
  perdantes: z.array(z.number().int().positive()).min(1).max(20),
  // `true` = on simule et on rend le rapport ; `false` = on écrit.
  dry_run: z.boolean(),
  // La contrainte `entreprises_archive_reason_valide` n'accepte qu'une liste
  // fermée de motifs. « doublon » est le seul qui décrive une fusion.
  raison: z.literal("doublon").default("doublon"),
});
type FusionBody = z.infer<typeof fusionSchema>;

export const POST = withAuth<FusionBody>(
  { role: "admin", body: fusionSchema },
  async ({ body, cors }) => {
    if (body.perdantes.includes(body.gagnante)) {
      return jsonError("La gagnante ne peut pas être aussi perdante", 400, {}, cors);
    }

    const sc = getServiceClient();
    const { data, error } = await sc.rpc("fusionner_entreprises", {
      p_gagnante: body.gagnante,
      p_perdantes: body.perdantes,
      p_choix: {},
      p_dry_run: body.dry_run,
      p_raison: body.raison,
    });

    if (error) {
      // Les refus de la fonction sont des MESSAGES, pas des pannes : « ces
      // perdantes sont déjà la cible d'une fusion », « la gagnante est
      // archivée »… Ils disent quoi faire, et doivent arriver tels quels à
      // l'écran plutôt que d'être remplacés par une erreur 500 générique.
      const refus = /fusionner_entreprises\s*:/.test(error.message ?? "");
      return jsonError(error.message, refus ? 409 : 500, {}, cors);
    }

    return json({ rapport: data }, { headers: cors });
  },
);
