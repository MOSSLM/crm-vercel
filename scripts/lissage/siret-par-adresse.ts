/**
 * Rattraper les SIRET manquants d'un portefeuille, en une passe.
 *
 * POURQUOI UN SCRIPT ET PAS L'ÉCRAN. La file de lissage traite vingt lignes par
 * tick, quatre fois par heure : elle est faite pour entretenir un parc, pas pour
 * rattraper une vague. Ce script appelle EXACTEMENT les mêmes fonctions —
 * `chercherCandidats`, `enregistrerCandidats`, `identiteEvidente`,
 * `identiteProbable`, `validerCandidat` — dans le même ordre. Il ne connaît
 * aucune règle qui lui soit propre, et c'est la condition pour qu'il ne fasse
 * jamais diverger la base de ce que l'app produirait.
 *
 * DEUX PHASES SÉPARÉES, comme le registre des bots l'impose : chercher n'écrit
 * que des CANDIDATS, décider écrit le SIRET. Relancer la phase 1 est sans
 * conséquence ; c'est ce qui rend la collecte reprenable.
 *
 * Lancement (le shim rend les modules `server-only` importables) :
 *   TS_NODE_BASEURL=. npx ts-node -r ./scripts/_shim-server-only.js \
 *     -r tsconfig-paths/register \
 *     -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","isolatedModules":false,"baseUrl":"."}' \
 *     scripts/lissage/siret-par-adresse.ts [--ecrire]
 *
 * Sans `--ecrire`, la phase 2 dit ce qu'elle ferait sans rien écrire.
 */
import { createClient } from "@supabase/supabase-js";

import { chercherCandidats, enregistrerCandidats, validerCandidat } from "@/lib/donnees-publiques/resolution";
import {
  fichesAChoisir,
  identiteEvidente,
  identiteProbable,
  type CandidatSiret,
  type FicheDuParc,
} from "@/lib/lissage/choix-siret";

const OWNERS = ["76353de0-ac50-4645-9530-8be2db55c7a3", "66ee3ab7-0ec4-4f4c-995b-d33f58cab585"];
const ECRIRE = process.argv.includes("--ecrire");

// La garde `/^https?:\/\//` existe à cause du caviardage du scanner de secrets :
// `NEXT_PUBLIC_SUPABASE_URL` rend une empreinte hexadécimale, pas une URL.
const url = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].find((v) =>
  /^https?:\/\//.test(v ?? ""),
);
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("env Supabase absente");
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);

type Ligne = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  google_reviews_5star: unknown;
};

/** Le TEXTE des avis, jamais le nom de leur auteur — qui est le client. */
const textesDesAvis = (brut: unknown): string[] | null => {
  if (!Array.isArray(brut)) return null;
  const t = brut
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>).text : null))
    .filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return t.length > 0 ? t : null;
};

async function main() {
  const { data, error } = await sb
    .from("entreprises")
    .select("id, name, ville, code_postal, adresse, google_reviews_5star")
    .in("owner_id", OWNERS)
    .is("archived_at", null)
    .is("merged_into_id", null)
    .or("siret.is.null,siret.eq.")
    .order("id");
  if (error) throw new Error(error.message);
  const fiches = (data ?? []) as Ligne[];
  console.log(`${fiches.length} fiches sans SIRET`);

  // ── Phase 1 : chercher. N'écrit que des candidats.
  let cherchees = 0;
  for (const f of fiches) {
    if (!f.name && !f.adresse) continue;
    try {
      const candidats = await chercherCandidats({
        entreprise_id: f.id,
        name: f.name,
        ville: f.ville,
        code_postal: f.code_postal,
        adresse: f.adresse,
        avis: textesDesAvis(f.google_reviews_5star),
      });
      const n = await enregistrerCandidats(sb, f.id, candidats);
      cherchees += 1;
      if (n > 0) console.log(`  #${f.id} ${f.name} → ${n} candidat(s), meilleur ${candidats[0]?.score}`);
    } catch (e) {
      console.log(`  #${f.id} ERREUR ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`phase 1 terminée : ${cherchees} fiches interrogées`);

  // ── Phase 2 : décider. Les deux mêmes portes que l'app, dans le même ordre.
  const { data: brut } = await sb
    .from("entreprise_siret_candidats")
    .select("id, entreprise_id, siret, denomination, enseignes, adresse, code_postal, ville, etat_administratif, naf_code, score, score_detail")
    .in("entreprise_id", fiches.map((f) => f.id))
    .eq("statut", "propose");

  const candidats: CandidatSiret[] = ((brut ?? []) as Record<string, unknown>[]).map((l) => ({
    id: String(l.id),
    entrepriseId: Number(l.entreprise_id),
    siret: String(l.siret),
    denomination: (l.denomination as string | null) ?? null,
    enseignes: (l.enseignes as string[] | null) ?? [],
    adresse: (l.adresse as string | null) ?? null,
    codePostal: (l.code_postal as string | null) ?? null,
    ville: (l.ville as string | null) ?? null,
    etatAdministratif: (l.etat_administratif as string | null) ?? null,
    nafCode: (l.naf_code as string | null) ?? null,
    score: Number(l.score ?? 0),
    detail: (l.score_detail as CandidatSiret["detail"]) ?? null,
  }));

  const duParc: FicheDuParc[] = fiches.map((f) => ({
    entrepriseId: f.id,
    nom: f.name,
    ville: f.ville,
    codePostal: f.code_postal,
  }));

  // ── DEUX FICHES QUI DÉSIGNENT LA MÊME ENTREPRISE NE SE TRANCHENT PAS SEULES.
  //
  // Contrôle de LOT, que `identiteProbable` ne peut pas faire : elle juge une
  // fiche à la fois. Vu le 03/09 sur « Mc Froid Chaud » (55 rue Henri
  // Rochefort) et « MAXENERGIES » (3 rue Joseph Cugnot) — deux adresses, deux
  // enseignes, le même Christophe Maximilien, et le même SIREN retenu des deux
  // côtés. L'une des deux est fausse, ou ce sont deux établissements et il faut
  // savoir lequel : dans les deux cas, c'est un œil qu'il faut.
  const decisions = new Map<number, { siret: string; regle: string; parLeNom: boolean }>();
  for (const fiche of fichesAChoisir(candidats, duParc)) {
    const evident = identiteEvidente(fiche);
    const probable = evident ? null : identiteProbable(fiche);
    const retenu = evident ?? probable?.candidat ?? null;
    if (!retenu) continue;
    decisions.set(fiche.fiche.entrepriseId, {
      siret: retenu.siret,
      regle: evident ? "quatre critères concordants" : `règle élargie — ${probable!.regle}`,
      // Un rapprochement par INITIALES ou par AVIS n'est pas une concordance de
      // nom : c'est une présomption sur la personne. Elle suffit seule, elle ne
      // suffit plus quand deux fiches se disputent la même entreprise.
      parLeNom: /^(raison sociale|nom complet|enseigne|sigle)/.test(
        retenu.detail?.nomCompareA ?? "",
      ),
    });
  }
  const parSiren = new Map<string, number>();
  for (const d of decisions.values()) {
    const siren = d.siret.slice(0, 9);
    parSiren.set(siren, (parSiren.get(siren) ?? 0) + 1);
  }

  let ecrits = 0;
  let refuses = 0;
  for (const fiche of fichesAChoisir(candidats, duParc)) {
    const decision = decisions.get(fiche.fiche.entrepriseId);
    if (!decision) continue;
    // Deux ÉTABLISSEMENTS d'une même entreprise sur deux fiches est normal —
    // deux agences, deux adresses. Ce qui ne l'est pas, c'est d'y arriver sans
    // que le NOM concorde : le rapprochement ne tient alors qu'à une personne,
    // et rien ne dit laquelle des deux fiches est laquelle.
    if ((parSiren.get(decision.siret.slice(0, 9)) ?? 0) > 1 && !decision.parLeNom) {
      console.log(`  ~ #${fiche.fiche.entrepriseId} ${fiche.fiche.nom} → ${decision.siret} ÉCARTÉ : SIREN disputé par deux fiches, et le nom ne tranche pas`);
      continue;
    }
    const retenu = { siret: decision.siret };
    const regle = decision.regle;
    if (!ECRIRE) {
      console.log(`  #${fiche.fiche.entrepriseId} ${fiche.fiche.nom} → ${retenu.siret} (${regle})`);
      continue;
    }
    // ⚠️ `validerCandidat` réinterroge le registre. C'est lui, et non les
    // lignes candidates, qui dit si l'entreprise est encore vivante.
    const r = await validerCandidat(sb, {
      entreprise_id: fiche.fiche.entrepriseId,
      siret: retenu.siret,
      decide_par: null,
      source: regle.startsWith("quatre") ? "resolution_auto" : "resolution_elargie",
      commentaire: regle,
    });
    if (r.ok) {
      ecrits += 1;
      console.log(`  ✔ #${fiche.fiche.entrepriseId} ${fiche.fiche.nom} → ${retenu.siret} — ${regle}${r.avertissements.length ? ` ⚠ ${r.avertissements.join(" ; ")}` : ""}`);
    } else {
      refuses += 1;
      console.log(`  ✖ #${fiche.fiche.entrepriseId} ${fiche.fiche.nom} → ${retenu.siret} — ${r.erreur}`);
    }
  }
  console.log(ECRIRE ? `phase 2 : ${ecrits} écrits, ${refuses} refusés` : "phase 2 : simulation");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
