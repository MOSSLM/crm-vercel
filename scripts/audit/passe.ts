/**
 * La passe de mesure d'une entreprise : analyse, PageSpeed, netlinking.
 *
 * LES MÊMES FONCTIONS QUE LES ROUTES, sans la couche d'authentification. Les
 * routes `POST /api/audit-site/{id}`, `.../pagespeed` et `.../netlinking` ne
 * font rien d'autre que vérifier la session puis appeler `analyserEntreprise`,
 * `mesurerEtEnregistrer` et `mesurerNetlinking`. Les rappeler ici, avec le
 * client de service, produit exactement la même ligne en base — c'est la
 * condition pour que ce script reste utilisable sans devenir une seconde
 * implémentation qui divergerait au premier changement de barème.
 *
 * L'ORDRE N'EST PAS INTERCHANGEABLE. L'analyse détermine l'adresse réellement
 * atteinte après redirections ; PageSpeed doit mesurer CETTE page-là, sans quoi
 * les chiffres portent sur une autre que celle qu'on a notée. Le netlinking suit
 * pour la même raison : c'est le domaine servi aujourd'hui qui compte, pas celui
 * de la fiche.
 *
 *   npx ts-node -r ./scripts/_shim-server-only.js -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
 *     scripts/audit/passe.ts <entrepriseId>
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyserEntreprise } from "@/lib/audit-site/service";
import { mesurerEtEnregistrer, psiEstFraiche } from "@/lib/audit-site/pagespeed";
import { lireAudit } from "@/lib/audit-site/lecture";
import {
  domaineDe,
  mesurerNetlinking,
  netlinkingEstFrais,
  preuvesNetlinking,
} from "@/lib/audit-site/netlinking";

function chargerEnv(): void {
  const chemin = resolve(process.cwd(), ".env.local");
  if (!existsSync(chemin)) return;
  for (const ligne of readFileSync(chemin, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function client(): SupabaseClient {
  const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
    /^https?:\/\//.test(v ?? ""),
  );
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error("Adresse Supabase valide et clé de service requises (.env.local).");
  return createClient(url, cle, { auth: { persistSession: false } });
}

async function main(): Promise<void> {
  chargerEnv();
  const entrepriseId = Number(process.argv[2]);
  if (!Number.isFinite(entrepriseId)) throw new Error("Usage : passe.ts <entrepriseId>");

  const sb = client();

  /**
   * LES QUALIFICATIONS RGE SE LISENT À PART, et ce détail change le résultat.
   *
   * La preuve « qualification RGE mise en avant » vaut `inconnu` — donc hors
   * dénominateur, donc aucun constat — quand l'appelant ne fournit pas la liste
   * des qualifications détenues. Le premier essai de ce script l'a perdue, et
   * avec elle `rge_not_highlighted` : le constat le plus vendable du dossier
   * Doussot, quatre qualifications Qualibat valides jusqu'en 2030 et citées
   * nulle part sur le site.
   *
   * On ne peut pas prendre la vue `v_audit_site_a_rafraichir` : c'est une FILE
   * d'attente, pas une source de contexte — une entreprise fraîchement analysée
   * en sort. On reproduit donc ici son sous-select, à l'identique : détenues,
   * non retirées, non expirées.
   *
   * La route du bouton lit la table sans ces champs et perd la même chose. Un
   * défaut à corriger de son côté.
   */
  const { data: rge } = await sb
    .from("entreprise_rge_qualifications")
    .select("code_qualification, nom_qualification, date_fin, retiree_le")
    .eq("entreprise_id", entrepriseId)
    .is("retiree_le", null);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const qualifications = [
    ...new Set(
      ((rge ?? []) as Array<{ code_qualification: string; nom_qualification: string | null; date_fin: string | null }>)
        .filter((q) => !q.date_fin || q.date_fin >= aujourdhui)
        .map((q) => q.nom_qualification ?? q.code_qualification),
    ),
  ];

  const { data: ent } = await sb
    .from("entreprises")
    .select("id, name, site_web_canonique, canonical_url, nombre_avis, note_moyenne, ville, telephone")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (!ent) throw new Error(`Entreprise ${entrepriseId} introuvable.`);
  const e = ent as Record<string, unknown>;

  console.log(`── ${e.name} (${entrepriseId})`);
  console.log(`   contexte  ${qualifications.length} qualification(s) RGE valide(s)`);

  // 1. L'analyse maison. Elle détermine l'URL finale et remplit les preuves.
  const res = await analyserEntreprise(sb, {
    entreprise_id: entrepriseId,
    url: ((e.site_web_canonique as string) ?? (e.canonical_url as string)) || "",
    nom: (e.name as string) ?? null,
    nombre_avis: (e.nombre_avis as number) ?? null,
    note_moyenne: e.note_moyenne == null ? null : Number(e.note_moyenne),
    ville: (e.ville as string) ?? null,
    telephone: (e.telephone as string) ?? null,
    qualifications_rge: qualifications.length > 0 ? qualifications : null,
  });
  console.log(
    `   analyse   ${res.statut} · note de tri ${res.note_globale ?? "—"} · ${res.issue_keys.length} constat(s)`,
  );

  const lu = await lireAudit(sb, entrepriseId);
  if (!lu.disponible || !lu.audit) throw new Error("Analyse illisible après écriture.");
  const url = lu.audit.url_finale ?? lu.audit.url_analysee;
  if (!url) throw new Error("Aucune URL à mesurer.");

  // 2. PageSpeed — quarante secondes, à ne lancer que sur qui va être démarché.
  if (psiEstFraiche(lu.audit.psi_recupere_le)) {
    console.log("   pagespeed mesure de moins de trente jours, conservée");
  } else {
    const psi = await mesurerEtEnregistrer(sb, entrepriseId, url);
    console.log(
      psi.ok
        ? `   pagespeed perf ${psi.mesure.performance ?? "—"} · seo ${psi.mesure.seo ?? "—"} · a11y ${psi.mesure.accessibilite ?? "—"} · bp ${psi.mesure.bonnesPratiques ?? "—"}`
        : `   pagespeed ÉCHEC — ${psi.erreur}`,
    );
  }

  // 3. Netlinking — un appel, gratuit, et sans clé il ne se plaint pas : l'axe
  //    n'existe simplement pas.
  const { data: ligne } = await sb
    .from("entreprises_audit_site")
    .select("detail")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();
  const detail = ((ligne as { detail?: Record<string, unknown> } | null)?.detail ?? {}) as Record<
    string,
    unknown
  >;

  const domaine = domaineDe(url);
  if (!domaine) {
    console.log("   netlinking aucun domaine à interroger");
  } else if (netlinkingEstFrais(detail.netlinking_le as string | undefined)) {
    console.log("   netlinking mesure de moins de trente jours, conservée");
  } else {
    const rangs = await mesurerNetlinking([domaine]);
    const preuves = preuvesNetlinking(rangs.get(domaine) ?? null);
    if (preuves.length === 0) {
      console.log("   netlinking pas de mesure (clé absente, quota, ou domaine inconnu)");
    } else {
      await sb
        .from("entreprises_audit_site")
        .update({
          detail: { ...detail, netlinking: preuves, netlinking_le: new Date().toISOString() },
        })
        .eq("entreprise_id", entrepriseId);
      console.log(`   netlinking ${preuves[0].valeur} (seuil ${preuves[0].seuil})`);
    }
  }

  const final = await lireAudit(sb, entrepriseId);
  if (final.disponible && final.audit) {
    const a = final.audit;
    console.log(`   → note du document ${a.note_document ?? "—"} · ${a.libelle ?? ""}`);
    console.log(`     axes : ${a.axes.map((x) => `${x.id} ${x.note}`).join(" · ") || "aucun"}`);
    if (a.axes_masques.length) console.log(`     masqués : ${a.axes_masques.join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
