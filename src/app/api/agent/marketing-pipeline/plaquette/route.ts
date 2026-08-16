import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { assurerJetonsPlaquette } from "@/lib/audit/plaquette";
import {
  MESSAGE_MIGRATION_PLAQUETTE,
  fonctionPlaquetteAbsente,
  urlPlaquette,
} from "@/lib/audit/plaquette-lien";
import { logPipelineStep } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  // 300 = la cohorte B entière. Les routes voisines plafonnent à 50 ou 100
  // parce qu'un lot y déclenche un travail par ligne (clonage de site, appel
  // de modèle) ; ici tout le lot tient dans UN aller-retour SQL, et couper la
  // sélection à 50 obligerait l'agent à cliquer six fois pour préparer la
  // cohorte — six occasions d'en oublier un morceau.
  entreprise_ids: z.array(z.coerce.number().int().positive()).min(1).max(300),
});
type Body = z.infer<typeof bodySchema>;

type Echec = { entreprise_id: number; nom: string | null; motif: string };

/**
 * POST /api/agent/marketing-pipeline/plaquette
 *
 * Prépare la plaquette d'une sélection : un jeton par entreprise, et le lien qui
 * va avec. Le document, lui, est le même pour tout le monde — c'est l'URL qui
 * change, pour qu'une ouverture s'attribue à quelqu'un.
 *
 * IDEMPOTENTE, et il faut que ça se voie dans la réponse. Rejouer l'action sur
 * une sélection déjà traitée ne crée pas un second jeton (`on conflict` +
 * `coalesce` côté SQL) : les liens déjà partis par WhatsApp continuent
 * d'ouvrir. `creees` et `deja` disent lequel des deux cas s'est produit, ligne
 * par ligne — sans ça, un agent qui reclique croirait avoir tout refait.
 *
 * ÉCHECS GROUPÉS, JAMAIS EN BLOC. Une entreprise non attribuée ou disparue ne
 * fait pas échouer les 299 autres : elle est nommée avec son motif, comme les
 * `refuses` de la validation d'audits.
 */
export const POST = withAuth<Body>(
  { role: "freelance", capability: "marketing_pipeline", body: bodySchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    // Un même identifiant coché deux fois (la sélection peut mêler plusieurs
    // opportunités d'une même entreprise) ne doit compter qu'une fois : sinon
    // le total annoncé dépasse le nombre de liens réellement fabriqués.
    const demandes = [...new Set(body.entreprise_ids)];

    // Même garde que `assertOwnsEntreprise` — `entreprises.owner_id` —, posée
    // en UNE requête : une sélection fait jusqu'à 300 lignes, et la version
    // unitaire ferait 300 allers-retours pour la même réponse. C'est déjà ce
    // que font les routes `site` et `audit` sur leurs lots.
    const { data: possedees, error: erreurProprio } = await sc
      .from("entreprises")
      .select("id, name")
      .in("id", demandes)
      .eq("owner_id", user.id);
    if (erreurProprio) return jsonError(erreurProprio.message, 500, {}, cors);

    const nomParId = new Map(
      (possedees ?? []).map((e) => [Number(e.id), (e.name as string | null) ?? null]),
    );
    const autorisees = [...nomParId.keys()];
    if (autorisees.length === 0) return jsonError("entreprise_non_attribuee", 403, {}, cors);

    const echecs: Echec[] = demandes
      .filter((id) => !nomParId.has(id))
      .map((id) => ({
        entreprise_id: id,
        // Pas de nom : on ne lit pas la fiche d'une entreprise qui n'est pas
        // attribuée à cet agent, même pour l'afficher dans un message d'erreur.
        nom: null,
        motif: "entreprise non attribuée",
      }));

    const { jetons, erreur } = await assurerJetonsPlaquette(sc, autorisees, user.id);
    if (erreur) {
      // La migration manquante se distingue d'une panne : elle se corrige en
      // jouant un fichier, et le message doit dire lequel. Un « erreur 500 »
      // enverrait chercher un bug dans le code.
      if (fonctionPlaquetteAbsente(erreur)) {
        return jsonError(MESSAGE_MIGRATION_PLAQUETTE, 503, {}, cors);
      }
      return jsonError(erreur.message, 500, {}, cors);
    }

    const parId = new Map(jetons.map((j) => [j.entrepriseId, j]));
    for (const id of autorisees) {
      if (parId.has(id)) continue;
      // La fonction SQL ne rend que les entreprises qui existent encore : une
      // ligne supprimée entre l'affichage du board et le clic tombe ici.
      echecs.push({ entreprise_id: id, nom: nomParId.get(id) ?? null, motif: "entreprise introuvable" });
    }

    const liens = jetons.map((j) => ({
      entreprise_id: j.entrepriseId,
      nom: nomParId.get(j.entrepriseId) ?? null,
      url: urlPlaquette(j.jeton),
      deja: j.dejaPrete,
    }));
    const creees = jetons.filter((j) => !j.dejaPrete);

    // Le journal ne consigne QUE les créations : un événement par reclic ferait
    // croire, en relisant l'historique, qu'on a préparé la cohorte quatre fois.
    await Promise.all(
      creees.map((j) =>
        logPipelineStep({
          agentId: user.id,
          entrepriseId: j.entrepriseId,
          action: "create_plaquette",
          metadata: { url: urlPlaquette(j.jeton) },
        }),
      ),
    );

    return json(
      { ok: true, creees: creees.length, deja: jetons.length - creees.length, liens, echecs },
      { headers: cors },
    );
  },
);
