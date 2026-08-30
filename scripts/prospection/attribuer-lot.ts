// Attribuer un lot à un agent, depuis ce poste — le bouton, sans le navigateur.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI IL EXISTE
// ─────────────────────────────────────────────────────────────────────────────
// « Attribuer le lot à un agent » est un bouton de la fiche d'un lot depuis le
// 30/08/2026. Mais un bouton n'existe qu'une fois DÉPLOYÉ : la répartition de la
// semaine 36 était figée dans deux lots, le code écrit, et 315 fiches restaient
// pourtant chez une seule personne parce que l'écran en production n'avait pas
// encore le bouton. Ce script est la même chose par la porte de service.
//
// Il redevient inutile dès que la branche est déployée — et c'est très bien :
// il ne DUPLIQUE rien. Il appelle `entreprisesDuLotAAttribuer` puis
// `assignProspectsToAgent`, exactement ce que fait `POST /api/admin/assign`,
// boucle comprise. Si la règle d'attribution change, elle change pour les deux.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QU'IL NE FAIT JAMAIS
// ─────────────────────────────────────────────────────────────────────────────
//   · Aucun `update entreprises set owner_id`. C'est tout l'objet de passer par
//     `assignProspectToAgent` : elle pose le propriétaire, REPREND l'affaire
//     existante au lieu d'en ouvrir une seconde, qualifie la fiche, et met en
//     séquence. Un update brut fabriquerait une fiche attribuée sans inscription
//     — invisible sur tous les écrans, et rien ne le signalerait.
//   · Il ne touche pas les fiches DÉJÀ chez l'agent visé : la population est
//     filtrée sur `owner_id` différent. Le relancer deux fois ne réécrit rien.
//
// ─────────────────────────────────────────────────────────────────────────────
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   ./scripts/audit/run.sh scripts/prospection/attribuer-lot.ts \
//     --lot "Semaine 36 — Bilal" --agent 76353de0-… [--dry-run]
//
// `--lot` accepte un identifiant ou un nom exact. `--dry-run` compte et montre
// la répartition par canal sans rien écrire — à jouer d'abord, toujours.

import * as fs from "fs";
import * as path from "path";

/**
 * `.env.local` chargé À LA MAIN, et avant tout import du code de production.
 *
 * `@/env` valide un schéma complet au premier `require`, et `getServiceClient`
 * le réclame paresseusement : si les variables ne sont pas déjà posées quand la
 * première requête part, le script meurt sur une erreur de schéma qui ne dit
 * rien de la cause. On les pose donc en tout premier — d'où les `await import`
 * plus bas plutôt que des imports statiques.
 *
 * Le dépôt n'a pas `dotenv` : douze lignes valent mieux qu'une dépendance pour
 * un fichier qu'on lit une fois.
 */
function chargerEnv(): void {
  const fichier = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(fichier)) throw new Error(".env.local introuvable");
  for (const ligne of fs.readFileSync(fichier, "utf8").split("\n")) {
    const t = ligne.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const cle = t.slice(0, i).trim();
    let valeur = t.slice(i + 1).trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"')) ||
      (valeur.startsWith("'") && valeur.endsWith("'"))
    ) {
      valeur = valeur.slice(1, -1);
    }
    if (!(cle in process.env)) process.env[cle] = valeur;
  }
}

/** Ce que la route traite au plus par appel. Repris tel quel, pas redéfini. */
const MAX_BATCH = 200;

const arg = (nom: string): string | null => {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const nombre = (n: number) => n.toLocaleString("fr-FR");

async function main(): Promise<void> {
  chargerEnv();

  const lotArg = arg("lot");
  const agentId = arg("agent");
  const dryRun = process.argv.includes("--dry-run");
  if (!lotArg || !agentId) {
    console.error("Usage : --lot <id|nom> --agent <uuid> [--dry-run]");
    process.exit(1);
  }

  const { getServiceClient } = await import("@/app/api/_lib/service-client");
  const { entreprisesDuLotAAttribuer, assignProspectsToAgent } = await import(
    "@/app/api/admin/_assign"
  );
  const sc = getServiceClient();

  // Le lot par identifiant ou par nom : à la main on écrit le nom, et se
  // tromper de numéro attribuerait la mauvaise population sans rien dire.
  let lotId: number;
  if (/^\d+$/.test(lotArg)) {
    lotId = Number(lotArg);
  } else {
    const { data, error } = await sc.from("lots").select("id, nom").eq("nom", lotArg).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Aucun lot nommé « ${lotArg} »`);
    lotId = Number(data.id);
  }

  const { data: agent } = await sc
    .from("user_profiles")
    .select("id, full_name")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) throw new Error(`Aucun agent ${agentId}`);
  const nomAgent = (agent.full_name as string | null) ?? agentId.slice(0, 8);

  console.log(`\nLot ${lotId} « ${lotArg} » → ${nomAgent}${dryRun ? "   [DRY RUN]" : ""}`);

  const premier = await entreprisesDuLotAAttribuer(lotId, agentId, MAX_BATCH);
  if ("error" in premier) throw new Error(premier.error);
  const total = premier.ids.length + premier.restant;
  console.log(`  ${nombre(total)} fiches changent de main.`);

  if (dryRun) {
    // La répartition par canal, parce que c'est elle qui décide du démarchage :
    // un mobile part en WhatsApp, un fixe en appel. Voir sur quoi on appuie
    // avant d'appuyer.
    const { data } = await sc
      .from("entreprises")
      .select("telephone, telephones")
      .in("id", premier.ids);
    const mobiles = (data ?? []).filter((e) => {
      const nums = [
        (e as { telephone?: string | null }).telephone ?? "",
        ...(((e as { telephones?: string[] | null }).telephones ?? []) as string[]),
      ];
      return nums.some((n) => /^(0[67]|33[67])/.test(String(n).replace(/[^0-9]/g, "")));
    }).length;
    console.log(`  sur le premier paquet de ${nombre(premier.ids.length)} : ${nombre(mobiles)} avec mobile`);
    console.log("  rien n'a été écrit.\n");
    return;
  }

  // LA BOUCLE EST CELLE DU BOUTON, bornée par `restant` et non par un compteur
  // à nous. Le filtre sur `owner_id` garantit qu'elle avance : ce qui vient
  // d'être attribué sort de la population suivante.
  let attribuees = 0;
  const echecs: { entreprise_id: number; error: string }[] = [];
  let restantPrecedent = Infinity;

  for (;;) {
    const pop = await entreprisesDuLotAAttribuer(lotId, agentId, MAX_BATCH);
    if ("error" in pop) throw new Error(pop.error);
    if (pop.ids.length === 0) break;

    const res = await assignProspectsToAgent(pop.ids, agentId);
    if (!res.ok) throw new Error(res.error);
    attribuees += res.assigned.length;
    echecs.push(...res.failed);
    console.log(`  … ${nombre(attribuees)} attribuées, ${nombre(pop.restant)} en attente`);

    if (pop.restant === 0 || pop.restant >= restantPrecedent) break;
    restantPrecedent = pop.restant;
  }

  console.log(`\n  ${nombre(attribuees)} fiches attribuées à ${nomAgent}.`);
  if (echecs.length > 0) {
    console.log(`  ${nombre(echecs.length)} échecs :`);
    const parMotif = new Map<string, number>();
    for (const e of echecs) parMotif.set(e.error, (parMotif.get(e.error) ?? 0) + 1);
    for (const [motif, n] of [...parMotif].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${nombre(n)} × ${motif}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
