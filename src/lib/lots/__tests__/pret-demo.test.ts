/**
 * Ce que le comptage « prêtes pour la démo » doit garantir.
 *
 * LE TEST QUI COMPTE EST LE DERNIER : il fige l'alignement entre les causes que
 * la fonction SQL rend et les règles que l'écran applique
 * (`SITE_REQUIRED`). Les deux définitions vivent forcément à deux endroits — on
 * ne peut pas appliquer des règles TypeScript à 60 000 fiches pour rendre un
 * compteur — donc c'est ce test qui tient la couture. Le pendant existant,
 * `missing-for-site.test.ts`, tient déjà celle entre l'écran et l'API.
 */

import {
  MANQUES,
  lirePretDemo,
  logosAPrendre,
  partPrete,
  type LignePretDemo,
} from "../pret-demo";
import { SITE_REQUIRED } from "@/components/marketing-pipeline/required-fields";

const ligne = (over: Partial<LignePretDemo> = {}): LignePretDemo => ({
  lot_id: 2,
  total: 524,
  pretes: 322,
  sans_ville: 20,
  sans_code_postal: 20,
  sans_telephone: 1,
  sans_service_tags: 196,
  note_incoherente: 0,
  avec_logo: 12,
  logo_sur_le_site: 205,
  logo_sur_reseau: 0,
  logo_introuvable: 105,
  ...over,
});

describe("lirePretDemo", () => {
  it("convertit les compteurs, que PostgREST les rende en nombre ou en chaîne", () => {
    // `count(*)` est un bigint : selon la taille, il arrive en nombre ou en
    // texte. Un `"196" > 0` serait vrai, mais un `"196" + 1` vaudrait "1961".
    const p = lirePretDemo(ligne({ total: "524", pretes: "322", sans_service_tags: "196" }));
    expect(p.total).toBe(524);
    expect(p.pretes).toBe(322);
    expect(p.manques.find((m) => m.cle === "service_tags")?.nombre).toBe(196);
  });

  it("n'affiche pas les causes à zéro", () => {
    const p = lirePretDemo(ligne());
    expect(p.manques.map((m) => m.cle)).toEqual([
      "service_tags",
      "ville",
      "code_postal",
      "telephone",
    ]);
    expect(p.manques.some((m) => m.cle === "note")).toBe(false);
  });

  it("classe les causes par effort, pas par fréquence", () => {
    // Le téléphone est la cause la plus RARE de l'exemple (1) et reste en
    // dernier : c'est la plus coûteuse à combler. Les tags viennent d'abord
    // parce qu'ils se trient en série.
    const p = lirePretDemo(ligne({ sans_telephone: 9999 }));
    expect(p.manques[0].cle).toBe("service_tags");
    expect(p.manques[p.manques.length - 1].cle).toBe("telephone");
  });
});

describe("partPrete", () => {
  it("rend une part et jamais NaN sur un lot vide", () => {
    expect(partPrete(lirePretDemo(ligne()))).toBeCloseTo(322 / 524);
    expect(partPrete(lirePretDemo(ligne({ total: 0, pretes: 0 })))).toBe(0);
  });
});

describe("logosAPrendre", () => {
  it("ne compte QUE les logos qui existent quelque part", () => {
    // 105 introuvables ne sont pas du retard : ces entreprises n'ont aucune URL.
    // Les additionner ferait passer une impossibilité pour du travail en attente.
    const p = lirePretDemo(ligne());
    expect(logosAPrendre(p)).toBe(205);
    expect(p.logo.introuvable).toBe(105);
  });

  it("additionne site et réseau social, qui portent tous deux une image", () => {
    expect(logosAPrendre(lirePretDemo(ligne({ logo_sur_le_site: 3, logo_sur_reseau: 4 })))).toBe(7);
  });
});

describe("alignement avec les règles de l'écran", () => {
  it("couvre exactement les règles de SITE_REQUIRED qui portent une cause", () => {
    // `SITE_REQUIRED` porte cinq règles : Nom, Ville, Code postal, Téléphone,
    // Service tags, plus la Note (conditionnelle). Le nom n'a PAS de cause :
    // les 60 445 fiches vivantes en ont un, et une entreprise sans nom ne
    // serait pas une entreprise. Les autres doivent toutes être comptées.
    const attendues = new Set(["Ville", "Code postal", "Téléphone", "Service tags", "Note moyenne"]);
    const libellesDesRegles = new Set(
      SITE_REQUIRED.map((r) => r.label).filter((l) => l !== "Nom"),
    );
    expect(libellesDesRegles).toEqual(attendues);

    // Une cause dans MANQUES pour chacune, et pas une de plus.
    expect(Object.keys(MANQUES).sort()).toEqual(
      ["code_postal", "note", "service_tags", "telephone", "ville"].sort(),
    );
  });

  it("garde le logo HORS des causes — il n'est plus une exigence", () => {
    // 738 fiches sur 60 445 ont un logo. Le remettre en cause rendrait 98 % du
    // parc « pas prêt » pour une raison que personne ne peut combler.
    expect(Object.keys(MANQUES)).not.toContain("logo");
    expect(SITE_REQUIRED.some((r) => r.field === "lm_logo_url")).toBe(false);
  });
});
