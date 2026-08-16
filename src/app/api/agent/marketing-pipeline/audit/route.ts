import { z } from "zod";
import { json, jsonError } from "@/app/api/_lib/respond";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { withAuth } from "@/app/api/_lib/with-auth";
import { preflight } from "@/app/api/_lib/cors";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { getIssueDef } from "@/data/auditIssues";
import type { AuditAvantApres, AuditContent, AuditProblem } from "@/types";
import { logPipelineStep } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => preflight(req);

const bodySchema = z.object({
  action: z.enum(["create", "validate"]),
  opportunite_ids: z.array(z.string().uuid()).min(1).max(100),
});
type Body = z.infer<typeof bodySchema>;

/* ── Le garde-fou de la validation ───────────────────────────────────────── */
//
// CE QUI S'EST PASSÉ LE 12/08
// La validation faisait `SELECT id` puis `UPDATE statut='ready'` : elle ne
// LISAIT pas le document qu'elle déclarait prêt. 67 audits sont passés « prêts »
// en dix secondes, tous porteurs du contenu par défaut, mot pour mot le même —
// il a fallu `sql/ROLLBACK_20260814_devalidation_audits.sql` pour les défaire.
// « Prêt » veut dire « envoyable à un artisan » : ça se vérifie sur le contenu,
// pas sur la présence d'une ligne.
//
// CE QUI DISTINGUE UN AUDIT RÉDIGÉ D'UN GABARIT — deux marques, et elles sont
// laissées par la préparation (`/api/audit/preparation`), jamais par la création :
//   · `page2.problems[]` : la création pose les cartes du catalogue telles
//     quelles ; la préparation remplace `title` et `desc` par le texte écrit
//     pour CE prospect. Un titre identique au catalogue = personne n'a écrit.
//   · `page3.avant_apres` : absent du contenu par défaut. C'est le tableau des
//     mesures, le seul endroit du document qui parle de l'entreprise en face.
//     Vide, il ne reste qu'une plaquette.
// Un audit peut être excellent et ne pas encore être relu ; ces deux marques ne
// jugent pas la qualité, elles constatent qu'un travail a eu lieu.

/** Une carte de constat a-t-elle été écrite pour ce prospect ? */
function constatRedige(p: AuditProblem): boolean {
  const titre = (p.title ?? "").trim();
  const texte = (p.desc ?? "").trim();
  if (!titre || !texte) return false;
  const catalogue = p.key ? getIssueDef(p.key) : undefined;
  // Une carte libre (sans clé de catalogue) n'a pas pu naître d'un gabarit :
  // quelqu'un l'a forcément tapée.
  if (!catalogue) return true;
  return titre !== catalogue.problem.title.trim() || texte !== catalogue.problem.desc.trim();
}

/**
 * Ce qui manque à un audit pour être envoyable. Tableau vide = il est prêt.
 *
 * On renvoie les raisons plutôt qu'un booléen : l'agent doit savoir QUOI ouvrir,
 * sinon le refus n'est qu'un bouton qui ne marche pas.
 */
function raisonsDeRefus(contenu: unknown): string[] {
  const c = (contenu ?? {}) as Partial<AuditContent>;
  const raisons: string[] = [];

  const constats = (c.page2?.problems ?? []) as AuditProblem[];
  if (constats.length === 0) raisons.push("aucun constat");
  else if (!constats.some(constatRedige)) raisons.push("constats laissés au texte du catalogue");

  const lignes = (c.page3?.avant_apres ?? []) as AuditAvantApres[];
  const completes = lignes.filter(
    (l) => (l.avant ?? "").trim() !== "" && (l.apres ?? "").trim() !== "",
  );
  if (completes.length === 0) raisons.push("avant/après vide — aucune mesure dans le document");

  if (!(c.page1?.client_name ?? "").trim()) raisons.push("le client n'est pas nommé");

  return raisons;
}

/**
 * POST /api/agent/marketing-pipeline/audit
 *
 * Étape 4 du pipeline, côté agent : création puis validation de l'audit.
 * Côté admin, `createAudit` et `validateAudits` écrivent depuis le navigateur ;
 * on passe par le serveur pour l'agent afin de vérifier la propriété de
 * l'entreprise et de journaliser l'action.
 *
 * Le contenu de l'audit vient de `getDefaultAuditContent`, le même helper que
 * la création admin — les deux produisent le même document.
 */
export const POST = withAuth<Body>(
  { role: "freelance", capability: "marketing_pipeline", body: bodySchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient();

    const { data: opps, error: oppErr } = await sc
      .from("opportunites")
      .select("id, entreprise_id, name")
      .in("id", body.opportunite_ids);
    if (oppErr) return jsonError(oppErr.message, 500, {}, cors);
    if (!opps || opps.length === 0) return jsonError("opportunite_introuvable", 404, {}, cors);

    const entIds = [...new Set(opps.map((o) => Number(o.entreprise_id)).filter(Number.isFinite))];
    const { data: owned } = await sc
      .from("entreprises")
      .select("id, name, ville, adresse, logo_url")
      .in("id", entIds)
      .eq("owner_id", user.id);

    const entById = new Map((owned ?? []).map((e) => [Number(e.id), e]));
    const allowed = opps.filter((o) => entById.has(Number(o.entreprise_id)));
    if (allowed.length === 0) return jsonError("entreprise_non_attribuee", 403, {}, cors);

    if (body.action === "validate") {
      const allowedOppIds = allowed.map((o) => o.id as string);
      const { data: audits, error: auditErr } = await sc
        .from("audits")
        // `content` EST LA RAISON D'ÊTRE DE CETTE REQUÊTE : sans lui, la
        // validation ne peut que faire confiance, et c'est exactement ce qui a
        // produit 67 audits « prêts » vides le 12/08.
        .select("id, opportunite_id, content")
        .in("opportunite_id", allowedOppIds);
      if (auditErr) return jsonError(auditErr.message, 500, {}, cors);
      if ((audits ?? []).length === 0) return jsonError("aucun_audit", 404, {}, cors);

      const auditParOpp = new Map(
        (audits ?? []).map((a) => [String(a.opportunite_id), a as { id: string; content: unknown }]),
      );

      // On trie AVANT d'écrire, opportunité par opportunité : un lot mixte doit
      // valider ce qui est prêt et nommer le reste. Refuser les 300 parce que
      // deux ne sont pas rédigés, c'est se faire contourner dès le lendemain.
      const aValider: Array<{ auditId: string; oppId: string; entrepriseId: number }> = [];
      const refuses: Array<{ opportunite_id: string; audit_id: string | null; raisons: string[] }> = [];

      for (const o of allowed) {
        const oppId = o.id as string;
        const audit = auditParOpp.get(oppId);
        if (!audit) {
          refuses.push({ opportunite_id: oppId, audit_id: null, raisons: ["aucun audit créé"] });
          continue;
        }
        const raisons = raisonsDeRefus(audit.content);
        if (raisons.length > 0) {
          refuses.push({ opportunite_id: oppId, audit_id: audit.id, raisons });
          continue;
        }
        aValider.push({ auditId: audit.id, oppId, entrepriseId: Number(o.entreprise_id) });
      }

      if (aValider.length === 0) {
        // 422 et non 200 : le bouton doit se voir refuser. `refuses` dit lequel
        // et pourquoi — le lot n'échoue pas « en bloc », il est motivé ligne à ligne.
        return jsonError("audits_non_rediges", 422, { validated: 0, refuses }, cors);
      }

      const { error } = await sc
        .from("audits")
        .update({ statut: "ready", updated_at: new Date().toISOString() })
        .in(
          "id",
          aValider.map((v) => v.auditId),
        );
      if (error) return jsonError(error.message, 500, {}, cors);

      // Le journal ne consigne QUE ce qui a été validé : un événement
      // `validate_audit` sur un audit refusé rendrait l'historique inutilisable
      // pour comprendre ce qui est réellement parti chez le prospect.
      await Promise.all(
        aValider.map((v) =>
          logPipelineStep({
            agentId: user.id,
            entrepriseId: v.entrepriseId,
            action: "validate_audit",
            metadata: { opportunite_id: v.oppId, audit_id: v.auditId },
          }),
        ),
      );
      return json({ ok: true, validated: aValider.length, refuses }, { headers: cors });
    }

    // action === "create" — on saute les opportunités qui ont déjà un audit.
    const allowedOppIds = allowed.map((o) => o.id as string);
    const { data: existing } = await sc
      .from("audits")
      .select("opportunite_id")
      .in("opportunite_id", allowedOppIds);
    const already = new Set((existing ?? []).map((a) => a.opportunite_id as string));

    const { data: sites } = await sc
      .from("sites")
      .select("enterprise_id, published_subdomain, published_domain, is_template")
      .in("enterprise_id", entIds);
    const demoByEnt = new Map<number, string | null>();
    for (const s of sites ?? []) {
      if (s.is_template === true || s.enterprise_id == null) continue;
      const url = s.published_domain
        ? String(s.published_domain).startsWith("http")
          ? String(s.published_domain)
          : `https://${s.published_domain}`
        : null;
      if (url) demoByEnt.set(Number(s.enterprise_id), url);
    }

    const toCreate = allowed.filter((o) => !already.has(o.id as string));
    if (toCreate.length === 0) {
      return json({ ok: true, created: 0, skipped: allowed.length }, { headers: cors });
    }

    const rows = toCreate.map((o) => {
      const ent = entById.get(Number(o.entreprise_id));
      const demoUrl = demoByEnt.get(Number(o.entreprise_id)) ?? undefined;
      return {
        opportunite_id: o.id,
        entreprise_nom: ent?.name ?? o.name ?? null,
        entreprise_ville: ent?.ville ?? null,
        entreprise_logo_url: ent?.logo_url ?? null,
        demo_site_url: demoUrl ?? null,
        content: getDefaultAuditContent({
          entreprise_nom: ent?.name ?? undefined,
          entreprise_adresse: ent?.adresse ?? undefined,
          entreprise_ville: ent?.ville ?? undefined,
          demo_url: demoUrl,
        }),
        statut: "draft",
      };
    });

    const { error } = await sc.from("audits").insert(rows);
    if (error) return jsonError(error.message, 500, {}, cors);

    await Promise.all(
      toCreate.map((o) =>
        logPipelineStep({
          agentId: user.id,
          entrepriseId: Number(o.entreprise_id),
          action: "create_audit",
          metadata: { opportunite_id: o.id },
        }),
      ),
    );

    return json(
      { ok: true, created: rows.length, skipped: allowed.length - rows.length },
      { headers: cors },
    );
  },
);
