/**
 * Ce que ce test tient : la couture entre `etatDemoDe` et `choisirSiteMontrable`.
 *
 * La définition de « démo prête » vit dans `choisirSiteMontrable` et sert déjà
 * la plaquette, le moteur d'automatisations et le cockpit RDV. Si elle change
 * ici sans changer là, un lien partirait chez un prospect depuis un écran
 * pendant qu'un autre écran dirait « pas prête ». Les cas ci-dessous sont donc
 * écrits sur le CONTRAT, pas sur l'implémentation.
 */
import {
  countByEtatDemo,
  etatDemoDe,
  ETAT_DEMO_AIDE,
  ETAT_DEMO_LABEL,
  ETAT_DEMO_ORDER,
  ETAT_DEMO_TAG,
} from "../etat-demo";
import { compteDuTri, trierLaFile } from "../demarchage-buckets";

const site = (p: Partial<Parameters<typeof etatDemoDe>[0] extends readonly (infer S)[] ? S : never> = {}) => ({
  id: "s1",
  ...p,
});

describe("etatDemoDe — les trois états", () => {
  it("rend « aucune » quand l'entreprise n'a aucun site", () => {
    expect(etatDemoDe([])).toBe("aucune");
    expect(etatDemoDe(null)).toBe("aucune");
    expect(etatDemoDe(undefined)).toBe("aucune");
  });

  it("rend « prete » pour un site publié", () => {
    expect(etatDemoDe([site({ is_published: true, build_stage: "a_faire" })])).toBe("prete");
  });

  it("rend « prete » pour un site marqué prêt sans être publié", () => {
    // C'est le cas de la vague du 03/09 : les démos partent en aperçu
    // `{siteId}.{SITE_DOMAIN}` sans jamais être déployées.
    expect(etatDemoDe([site({ is_published: false, build_stage: "pret" })])).toBe("prete");
  });

  it("rend « chantier » quand le site existe mais n'est ni publié ni prêt", () => {
    expect(etatDemoDe([site({ is_published: false, build_stage: "a_faire" })])).toBe("chantier");
  });

  it("IGNORE les gabarits, et ne les compte pas comme une démo", () => {
    // Un gabarit n'est la démo de personne. Le compter rendrait « chantier »
    // une entreprise qui n'a rien du tout.
    expect(etatDemoDe([site({ is_template: true, build_stage: "pret" })])).toBe("aucune");
  });

  it("prend le MEILLEUR site quand l'entreprise en a plusieurs", () => {
    // Une entreprise porte un site par tentative : lire le premier venu ferait
    // clignoter la couleur d'une exécution à l'autre. C'est la même règle que
    // `bestProjectIdByEnterprise`.
    expect(
      etatDemoDe([
        site({ id: "vieux", is_published: false, build_stage: "a_faire" }),
        site({ id: "bon", is_published: true, build_stage: "a_faire" }),
      ]),
    ).toBe("prete");
  });
});

describe("trierLaFile — remonter sans défaire l'ordre du jour", () => {
  // La liste d'entrée est TOUJOURS déjà dans `ordreDePassage` (posé par
  // `repartirLaJournee`) : ces cas vérifient que le tri la préserve à
  // l'intérieur de chaque groupe, ce qui est toute la raison d'être du tri
  // stable à une seule clé.
  const t = (nom: string, p: Record<string, unknown> = {}) => ({ nom, due_at: null, ...p });
  const noms = (l: readonly { nom: string }[]) => l.map((x) => x.nom);

  it("laisse la file intacte sur « passage »", () => {
    const l = [t("a"), t("b"), t("c")];
    expect(noms(trierLaFile(l, "passage"))).toEqual(["a", "b", "c"]);
  });

  it("remonte les démos prêtes, puis les chantiers, puis le reste", () => {
    const l = [
      t("rien", { demo_etat: "aucune" }),
      t("chantier", { demo_etat: "chantier" }),
      t("prete", { demo_etat: "prete" }),
    ];
    expect(noms(trierLaFile(l, "demo"))).toEqual(["prete", "chantier", "rien"]);
  });

  it("garde l'ordre du jour À L'INTÉRIEUR d'un groupe", () => {
    // Deux démos prêtes : celle qui était en tête de file y reste. Sans la
    // stabilité, le tri mélangerait un prospect chaud avec un tiède.
    const l = [
      t("chaud-pret", { demo_etat: "prete" }),
      t("froid-rien", { demo_etat: "aucune" }),
      t("tiede-pret", { demo_etat: "prete" }),
    ];
    expect(noms(trierLaFile(l, "demo"))).toEqual(["chaud-pret", "tiede-pret", "froid-rien"]);
  });

  it("remonte les mobiles", () => {
    const l = [t("fixe", { a_mobile: false }), t("mob", { a_mobile: true })];
    expect(noms(trierLaFile(l, "mobile"))).toEqual(["mob", "fixe"]);
  });

  it("NE RETIRE RIEN — c'est un tri, pas un filtre", () => {
    const l = [t("a", { a_mobile: true }), t("b"), t("c")];
    expect(trierLaFile(l, "mobile")).toHaveLength(3);
  });

  it("compte ce que le tri remonterait en tête", () => {
    const l = [t("a", { demo_etat: "prete" }), t("b", { demo_etat: "prete" }), t("c")];
    expect(compteDuTri(l, "demo")).toBe(2);
    // « passage » ne remonte rien en particulier : il les porte toutes.
    expect(compteDuTri(l, "passage")).toBe(3);
  });
});

/**
 * CE QUE LA FILE MONTRE de ces trois états — et la règle qui fait qu'elle n'en
 * montre pas trois.
 */
describe("les trois états, tels que la ligne les rend", () => {
  it("nomme et explique CHAQUE état, sans en oublier un", () => {
    // Le jour où un quatrième état apparaît, c'est ici que ça casse — pas à
    // l'écran, où un état sans libellé se rend en blanc et ne se voit pas.
    for (const e of ETAT_DEMO_ORDER) {
      expect(ETAT_DEMO_LABEL[e]).toBeTruthy();
      expect(ETAT_DEMO_AIDE[e]).toBeTruthy();
    }
    expect([...ETAT_DEMO_ORDER].sort()).toEqual(["aucune", "chantier", "prete"]);
  });

  it("n'écrit d'étiquette que là où il y a quelque chose à faire", () => {
    // 49 % de la file n'a pas de démo (03/09/2026) : une étiquette portée par
    // une ligne sur deux ne partage plus rien, elle décore. Son absence se lit,
    // et le liseré gris reste là pour l'infobulle.
    expect(ETAT_DEMO_TAG.prete).toBeTruthy();
    expect(ETAT_DEMO_TAG.chantier).toBeTruthy();
    expect(ETAT_DEMO_TAG.aucune).toBeNull();
  });

  it("compte chaque état — c'est ce que les pastilles annoncent", () => {
    const par = countByEtatDemo([
      { demo_etat: "prete" },
      { demo_etat: "prete" },
      { demo_etat: "chantier" },
      { demo_etat: null },
      {},
    ]);
    expect(par).toEqual({ prete: 2, chantier: 1, aucune: 0 });
  });
});
