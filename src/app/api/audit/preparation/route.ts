import { json, jsonError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { construireDossier, universDe } from "@/lib/audit/dossier";
import { validerPreparation } from "@/lib/audit/preparation";
import { construirePage5 } from "@/lib/audit/offres-audit";
import { getDefaultAuditContent } from "@/lib/audit/default-content";
import { problemsFromKeys, solutionsFromKeys, renumberSolutions } from "@/data/auditIssues";
import type { AuditContent } from "@/types";

/**
 * `POST /api/audit/preparation` — accepter une rédaction, sous contrat.
 *
 * Corps attendu : `{ opportunite_id, entreprise_id, preparation }`.
 *
 * Ce que fait cette route, dans l'ordre : elle reconstruit le dossier — donc
 * l'univers du dicible —, soumet la rédaction aux quatre règles, écrit ce qui
 * passe, et RÉPOND CE QUI NE PASSE PAS. Les rejets sont nommés un par un :
 * c'est ce qui permet à l'appelant de corriger plutôt que de deviner, et c'est
 * la différence entre un garde-fou et un mur.
 *
 * Le repli n'est pas un échec. Une rédaction entièrement rejetée laisse l'audit
 * avec le texte du catalogue : moins ajusté, toujours vrai, toujours envoyable.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let body: { opportunite_id?: string; entreprise_id?: number; preparation?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON invalide.", 400);
  }

  const opportuniteId = body.opportunite_id;
  const entrepriseId = Number(body.entreprise_id);
  if (!opportuniteId || !Number.isFinite(entrepriseId)) {
    return jsonError("opportunite_id et entreprise_id requis.", 400);
  }

  const sb = getServiceClient();

  const dossier = await construireDossier(sb, entrepriseId);
  if (!dossier) return jsonError("Entreprise introuvable.", 404);

  const verdict = validerPreparation(body.preparation, universDe(dossier));

  // Rien n'a survécu : on le dit, on n'écrit pas, et l'audit garde le catalogue.
  if (!verdict.retenue) {
    return json({ applique: false, motif: "aucune carte ne franchit le contrat", rejets: verdict.rejets });
  }

  const p = verdict.retenue;
  const cles = p.cartes.map((c) => c.cle);

  // L'audit existant, ou un document neuf : préparer ne doit pas exiger qu'on
  // ait d'abord ouvert l'éditeur.
  const { data: existant } = await sb
    .from("audits")
    .select("id, content")
    .eq("opportunite_id", opportuniteId)
    .maybeSingle();

  const base: AuditContent =
    ((existant as { content?: AuditContent } | null)?.content) ??
    getDefaultAuditContent({
      entreprise_nom: dossier.entreprise.nom ?? undefined,
      entreprise_ville: dossier.entreprise.ville ?? undefined,
    });

  // Les cartes gardent leur CLÉ de catalogue — c'est elle qui rattache la carte
  // à sa preuve dans tous les rendus. Seuls le titre et le texte sont ceux du
  // rédacteur : la personnalisation porte sur les mots, jamais sur le verdict.
  const problems = problemsFromKeys(cles).map((carte) => {
    const redigee = p.cartes.find((c) => c.cle === carte.key);
    return redigee ? { ...carte, title: redigee.titre, desc: redigee.texte } : carte;
  });

  const content: AuditContent = {
    ...base,
    page2: {
      ...base.page2,
      problems,
      section_intro: p.intro ?? base.page2.section_intro,
    },
    page3: { ...base.page3, solutions: renumberSolutions(solutionsFromKeys(cles)) },
    page5: construirePage5(base.page5, dossier.offres, cles),
  };

  const ligne = {
    opportunite_id: opportuniteId,
    content,
    statut: "draft" as const,
    updated_at: new Date().toISOString(),
  };

  const { error } = existant
    ? await sb.from("audits").update(ligne).eq("id", (existant as { id: string }).id)
    : await sb.from("audits").insert(ligne);

  if (error) return jsonError(`Écriture impossible : ${error.message}`, 500);

  return json({
    applique: true,
    cartes: cles,
    offres: p.offres,
    accroche: p.accroche ?? null,
    // Nommés même en cas de succès partiel : une carte silencieusement écartée
    // se remarque trois semaines plus tard, devant un prospect.
    rejets: verdict.rejets,
  });
}
