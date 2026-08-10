import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nombresDe, validerPreparation, type UniversDicible } from "../preparation";

/**
 * La skill ne doit pas enseigner quelque chose de faux.
 *
 * `.claude/skills/preparer-audit/SKILL.md` montre un exemple de soumission
 * « qui passe ». Un agent le recopie, l'adapte, et en déduit la forme attendue.
 * Si le contrat évolue sans que l'exemple suive, la skill devient la source la
 * plus autorisée d'une erreur — et l'agent se fera rejeter en croyant appliquer
 * la consigne.
 *
 * Ce test lit le fichier réellement livré, en extrait l'exemple, et le soumet à
 * la vraie validation. C'est la seule façon de garantir que la documentation et
 * le code disent la même chose dans six mois.
 */

const SKILL = join(process.cwd(), ".claude/skills/preparer-audit/SKILL.md");

/** Les blocs ```json du fichier, dans l'ordre. */
function blocsJson(markdown: string): string[] {
  return [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/**
 * Un univers calqué sur ce qu'un vrai dossier renverrait pour l'exemple :
 * le serveur mesuré à 3,4 s contre un seuil de 800 ms, et deux offres au
 * catalogue. Le « 9 » du formulaire n'y est PAS — il doit arriver par
 * l'observation, exactement comme en production.
 */
function universDeLExemple(): UniversDicible {
  return {
    preuvesEnEchec: new Set(["ttfb"]),
    constatsEmis: new Set(["slow_site"]),
    offresProposables: new Set(["site_demo_cle_en_main", "GMB_RELANCE_AVIS"]),
    // Construit avec `nombresDe`, jamais à la main : c'est ainsi que le vrai
    // dossier le remplit, virgules normalisées comprises. Une fixture écrite en
    // dur dériverait le jour où la normalisation change.
    nombres: new Set(nombresDe("3,4 s 800 ms")),
  };
}

describe("la skill preparer-audit", () => {
  const markdown = readFileSync(SKILL, "utf-8");

  it("annonce un déclencheur qui couvre les formulations courantes", () => {
    const description = /description:(.*)/.exec(markdown)?.[1] ?? "";
    for (const mot of ["préparer un audit", "remplir un audit", "auditer une entreprise"]) {
      expect(description.toLowerCase()).toContain(mot);
    }
  });

  it("montre un exemple qui franchit réellement le contrat", () => {
    const exemple = JSON.parse(blocsJson(markdown)[0]);
    const v = validerPreparation(exemple, universDeLExemple());

    // Le message compte autant que l'échec : sans lui, un rejet oblige à relire
    // tout le fichier pour trouver ce qui a bougé.
    expect(v.rejets).toEqual([]);
    expect(v.retenue?.cartes).toHaveLength(2);
  });

  it("montre une carte qui ne tient QUE par son observation", () => {
    // « 9 champs » n'est mesuré par rien : la seconde carte de l'exemple ne
    // tient que parce que l'observation `champs_formulaire` l'accompagne. En la
    // retirant, la carte perd son fondement et tombe en règle 1 — c'est
    // exactement la démonstration que l'exemple doit faire à l'agent, et elle
    // cesserait d'être vraie si quelqu'un rattachait la carte à une preuve
    // mesurée « pour faire plus sûr ».
    const exemple = JSON.parse(blocsJson(markdown)[0]);
    const sansObservations = { ...exemple, observations: [] };

    expect(validerPreparation(sansObservations, universDeLExemple()).rejets).toContainEqual(
      expect.objectContaining({ regle: 1, quoi: "form_not_accessible" }),
    );
  });

  it("n'écrit nulle part un champ `apres` dans ses exemples", () => {
    // La colonne droite vient du catalogue. Un exemple qui la montrerait
    // apprendrait à un agent à soumettre ce que le schéma refuse.
    for (const bloc of blocsJson(markdown)) {
      expect(bloc).not.toMatch(/"apres"/);
    }
  });

  it("liste ce que l'agent ne remplit jamais", () => {
    // La moitié utile de la consigne. Une skill qui n'énumère que ce qu'on peut
    // écrire laisse croire que le reste est négociable.
    expect(markdown).toContain("Ce que tu ne remplis jamais");
    for (const interdit of ["note", "médiane", "Après", "prix"]) {
      expect(markdown).toContain(interdit);
    }
  });
});
