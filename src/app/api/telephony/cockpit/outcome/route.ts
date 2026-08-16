/**
 * POST /api/telephony/cockpit/outcome
 *
 * L'issue d'un appel du cockpit : la disposition choisie et la note, posées sur
 * l'historique de l'entreprise.
 *
 * CE QUI NE MARCHAIT PAS
 * La route écrivait dans `public.opportunite_notes`. Cette table N'EXISTE PAS en
 * production — `to_regclass('public.opportunite_notes')` vaut NULL — et l'erreur
 * retournée par PostgREST n'était pas lue : la route répondait `{ok:true}` quoi
 * qu'il arrive, l'interface affichait « Issue enregistrée », et rien n'était
 * écrit nulle part. À cent appels par jour, c'est l'historique d'une semaine de
 * campagne qui disparaissait sans un seul message d'erreur.
 *
 * LE CHEMIN QUI MARCHE, ET IL EXISTAIT DÉJÀ
 * `PATCH /api/agent/tasks` journalise ses issues dans `email_logs` avec
 * `channel:'note'` et un `outcome` : c'est ce que `/api/agent/history` sert et ce
 * que `DemHisto` sait déjà afficher (icône « note », le libellé en titre, la note
 * en corps). On écrit au même endroit, dans la même forme — un appel du cockpit
 * et une issue d'étape se lisent alors dans le même fil, ce qui est bien ce
 * qu'elles sont : deux fois « voilà ce qui s'est dit ».
 *
 * `entreprise_id` N'EST PAS FACULTATIF : sans contact, `/api/agent/history`
 * filtre sur lui seul. Une note posée sans entreprise serait écrite… et jamais
 * relue, ce qui revient au bug de départ en plus discret. On la résout depuis
 * l'opportunité, et c'est aussi ce qui nous donne son propriétaire.
 *
 * `outcome` N'EST PAS QUE DE L'AFFICHAGE : l'entonnoir de campagne
 * (`/api/agent/entonnoir`) compte l'étage « a répondu » en relisant cette
 * colonne. D'où le vocabulaire partagé de `@/lib/telephony/dispositions`, qui
 * dit lesquelles de ces issues prouvent qu'un humain a parlé.
 */

import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { preflight } from "@/app/api/_lib/cors";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { cockpitOutcomeSchema, type CockpitOutcomePayload } from "@/app/api/_lib/schemas";
import { libelleDisposition } from "@/lib/telephony/dispositions";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

export const POST = withAuth<CockpitOutcomePayload>(
  { role: "freelance", body: cockpitOutcomeSchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    // Un identifiant mal formé tombe ici aussi (le SELECT échoue sur le cast
    // uuid) : dans les deux cas, l'affaire n'est pas atteignable.
    const { data: oppRaw, error: oppErr } = await sc
      .from("opportunites")
      .select("id, entreprise_id, owner_id")
      .eq("id", body.opportunite_id)
      .maybeSingle();
    const opp = oppRaw as { id: string; entreprise_id: number | null; owner_id: string | null } | null;
    if (oppErr || !opp) return jsonError("opportunite_introuvable", 404, {}, cors);
    if (opp.owner_id && opp.owner_id !== user.id) {
      return jsonError("opportunite_non_attribuee", 403, {}, cors);
    }

    const libelle = libelleDisposition(body.disposition);
    const note = (body.note ?? "").trim();

    const { error } = await sc.from("email_logs").insert({
      channel: "note",
      entreprise_id: opp.entreprise_id ?? null,
      opportunite_id: opp.id,
      outcome: body.disposition,
      to_email: "",
      subject: `Appel — ${libelle}`,
      body_text: note,
      status: "sent",
    });

    // LE POINT DE TOUT LE CORRECTIF. On ne répond « enregistré » qu'après avoir
    // regardé l'erreur : c'est ce contrôle manquant, et non la table absente,
    // qui a rendu la panne invisible pendant des semaines.
    if (error) return jsonError(error.message, 500, {}, cors);

    // ── La première touche, comme dans `PATCH /api/agent/tasks` ────────────
    // Un appel passé depuis le cockpit est une touche sortante au même titre
    // qu'une tâche de démarchage bouclée. Ne le poser que dans l'autre route
    // ferait dépendre l'âge d'une entreprise de l'ÉCRAN par lequel on l'a
    // appelée — et la comparaison des cohortes au même âge ne veut plus rien
    // dire dès qu'un appel passe par ici.
    //
    // `.is(..., null)` garde le sens du mot « première » ; best-effort, parce
    // que l'appel a eu lieu et qu'une colonne de mesure ne doit jamais faire
    // perdre son issue.
    if (opp.entreprise_id != null) {
      try {
        await sc
          .from("entreprises")
          .update({ premiere_touche_le: new Date().toISOString() })
          .eq("id", opp.entreprise_id)
          .is("premiere_touche_le", null);
      } catch {
        // la mesure est perdue pour cette entreprise, l'issue reste enregistrée
      }
    }

    return json({ ok: true, entreprise_id: opp.entreprise_id ?? null }, { headers: cors });
  },
);
