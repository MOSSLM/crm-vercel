import { construirePlaquette, rendrePlaquetteMobile } from "../plaquette";
import type { OffreAudit } from "../offres-audit";
import { corpsCompact, corpsPlaquette } from "@/utils/audit/htmlCompact";
import { fmtEur } from "@/utils/audit/htmlShared";
import { getDefaultAuditContent } from "../default-content";
import { mesuresVides } from "../mesures";

/**
 * Trois propriétés, et chacune correspond à une façon de se ridiculiser devant
 * trois cents prospects le 20 août :
 *
 *   1. la plaquette ne personnalise RIEN — pas un nom, pas une capture, pas un
 *      « préparé pour » ; c'est le document de toute la cohorte sans site ;
 *   2. son prix vient du catalogue, jamais du code ni d'un contenu figé ;
 *   3. son nombre de demi-pages est PAIR — `.sheet` en tient exactement deux et
 *      fait disparaître la suivante sans le moindre signal.
 */

const OFFRES: OffreAudit[] = [
  {
    code: "site-demo",
    nom: "Site clé en main (base démo)",
    description: "On part de votre site démo",
    prixHt: 490,
    mensuel: false,
    role: "socle",
    repondA: [],
    aPartirDe: true,
    hebergementMensuel: 19,
  },
  {
    code: "site-sur-mesure",
    nom: "Site sur mesure",
    description: "Conception entièrement personnalisée",
    prixHt: 1990,
    mensuel: false,
    role: "alternative",
    repondA: [],
    aPartirDe: true,
    hebergementMensuel: null,
  },
  {
    code: "pages-locales",
    nom: "Pages par commune",
    description: "Une page par ville couverte",
    prixHt: 390,
    mensuel: false,
    role: "addition",
    repondA: ["weak_local_seo"],
    aPartirDe: false,
    hebergementMensuel: null,
  },
];

const html = () => corpsPlaquette(construirePlaquette(OFFRES));

describe("construirePlaquette — un document sans destinataire", () => {
  it("vide les trois champs par lesquels un prospect entre dans le document", () => {
    const c = construirePlaquette(OFFRES);
    expect(c.page1.client_name).toBe("");
    expect(c.page1.client_meta).toBe("");
    expect(c.page1.demo_url).toBe("");
  });

  it("ne propose aucune addition — une addition sans constat est une vente forcée", () => {
    // `construirePage5` est appelé avec une liste de constats vide : c'est la
    // définition d'un document non personnalisé, et la seule chose qui empêche
    // la plaquette de conseiller des pages locales à quelqu'un dont on ignore
    // s'il en a besoin.
    const c = construirePlaquette(OFFRES);
    expect(c.page5.additional_services ?? []).toHaveLength(0);
    expect(corpsPlaquette(c)).not.toContain("Pages par commune");
  });

  it("n’annonce plus un audit dans sa date", () => {
    expect(construirePlaquette(OFFRES).page1.date).not.toContain("Audit");
    expect(construirePlaquette(OFFRES).page1.date).toContain("Nos offres");
  });
});

/*
 * Les montants attendus se construisent par `fmtEur`, jamais à la main : il
 * sépare le nombre du symbole par une espace insécable, et « 490 €" » tapé au
 * clavier ne matche donc rien. Une assertion qui ne peut pas matcher est un
 * test qui ne protège rien.
 */
describe("le prix vient du catalogue, jamais du code", () => {
  it("affiche le socle, son hébergement et l’alternative tels que les offres les donnent", () => {
    const rendu = html();
    expect(rendu).toContain(fmtEur(490));
    expect(rendu).toContain(fmtEur(19));
    expect(rendu).toContain(fmtEur(1990));
  });

  it("suit une hausse de tarif sans qu’on touche au rendu", () => {
    // Le vrai risque n'est pas qu'un prix soit faux aujourd'hui : c'est qu'il
    // soit recopié quelque part et devienne faux tout seul. `audits.content`
    // fige les prix — quatre audits en base annoncent encore 1490 € et
    // 89 €/mois. La plaquette, elle, n'est stockée nulle part.
    const augmentees = OFFRES.map((o) =>
      o.role === "socle" ? { ...o, prixHt: 690, hebergementMensuel: 29 } : o,
    );
    const rendu = corpsPlaquette(construirePlaquette(augmentees));
    expect(rendu).toContain(fmtEur(690));
    expect(rendu).toContain(fmtEur(29));
    expect(rendu).not.toContain(fmtEur(490));
  });

  it("ne réinjecte jamais les tarifs périmés du contenu par défaut", () => {
    const rendu = html();
    expect(rendu).not.toContain(fmtEur(1490));
    expect(rendu).not.toContain(fmtEur(89));
  });

  it("annonce le prix dès la couverture — un document ouvert à froid doit y répondre", () => {
    // La couverture est la seule page qu'on est sûr que le prospect lit.
    expect(html()).toMatch(new RegExp(`Nos tarifs[\\s\\S]{0,200}?${fmtEur(490)}`));
  });

  it("ne montre pas de bloc tarif vide quand le catalogue ne rend rien", () => {
    // Sans socle au catalogue, `construirePage5` retombe sur les tarifs du
    // contenu par défaut : la page tarifs reste remplie, donc la couverture
    // aussi. Ce qui ne doit jamais arriver, c'est un « Nos tarifs » suivi de rien.
    const rendu = corpsPlaquette(construirePlaquette([]));
    expect(rendu).not.toMatch(/Nos tarifs<\/div><div class="cover-client-name"><\/div>/);
  });
});

describe("aucune trace de personnalisation", () => {
  /*
   * Ce qui est interdit, c'est ce qui DÉSIGNE le lecteur ou prétend l'avoir
   * mesuré : son nom, son secteur, la mention de confidentialité, tout ce qui
   * commence par « sur votre site ». Le « vous » commercial du catalogue —
   * « vos photos », « votre fiche Google » — n'en fait pas partie : c'est
   * l'adresse normale d'un document de vente, et l'interdire viderait la
   * plaquette de sa langue.
   */
  const INTERDITS = [
    "préparé pour",
    "Entreprise cliente",
    "Secteur · Ville",
    "Confidentiel",
    "sur votre site",
    "mesuré le",
  ];

  it.each(INTERDITS)("ne contient jamais « %s »", (mot) => {
    expect(html().toLowerCase()).not.toContain(mot.toLowerCase());
  });

  it("ne va chercher aucune capture — il n’y a pas de site à montrer", () => {
    const rendu = html();
    expect(rendu).not.toContain("<img src=");
    expect(rendu).not.toContain("mockup");
    expect(rendu).not.toContain("demo-push");
  });

  it("refuse de nommer quelqu’un même si on lui passe un contenu personnalisé", () => {
    // Le verrou est à l'ENTRÉE du rendu, pas seulement dans le constructeur.
    // Sans lui, un contenu d'audit passé par erreur sortirait le nom du
    // prospect, sa ville et le bloc « Allez voir votre site démo » sur un
    // document envoyé à toute une cohorte.
    const pollue = getDefaultAuditContent({
      entreprise_nom: "Menuiserie Berthier",
      entreprise_ville: "Antibes",
      demo_url: "https://berthier.sama.fr",
    });
    const rendu = corpsPlaquette(pollue);
    expect(rendu).not.toContain("Berthier");
    expect(rendu).not.toContain("Antibes");
    expect(rendu).not.toContain("berthier.sama.fr");
  });
});

describe("la mise en page tient dans les feuilles", () => {
  it("rend un nombre PAIR de demi-pages, deux par feuille", () => {
    const rendu = html();
    const feuilles = rendu.match(/<div class="sheet[ "]/g) ?? [];
    const demiPages = rendu.match(/<div class="half[ "]/g) ?? [];

    // Une demi-page en trop disparaîtrait sans aucun signal : `.sheet` est une
    // grille de deux rangées en `overflow:hidden`.
    expect(demiPages.length % 2).toBe(0);
    expect(demiPages).toHaveLength(feuilles.length * 2);
    expect(feuilles).toHaveLength(2);
  });

  it("numérote ses pieds sur le bon total", () => {
    const rendu = html();
    expect(rendu).toContain("01 / 2");
    expect(rendu).toContain("02 / 2");
    expect(rendu).not.toContain("/ 3");
  });
});

describe("l’audit n’a pas bougé", () => {
  // La plaquette a fait sortir trois valeurs écrites en dur des demi-pages
  // partagées. Le document qui les portait doit rendre exactement pareil.
  const AUDIT = getDefaultAuditContent({ entreprise_nom: "Menuiserie Berthier" });

  it("garde ses trois feuilles, son destinataire et sa mention de confidentialité", () => {
    const rendu = corpsCompact(AUDIT, mesuresVides());
    expect(rendu.match(/<div class="sheet[ "]/g)).toHaveLength(3);
    expect(rendu).toContain("Confidentiel · préparé pour Menuiserie Berthier");
    expect(rendu).toContain("01 / 3");
    expect(rendu).toContain("02 / 3");
    expect(rendu).toContain("03 / 3");
    expect(rendu).toContain("Document confidentiel préparé exclusivement pour Menuiserie Berthier");
  });

  it("remplit encore les vides plutôt que de laisser un trou dans le pied", () => {
    const anonyme = getDefaultAuditContent();
    expect(corpsCompact(anonyme, mesuresVides())).toContain(
      "Confidentiel · préparé pour Entreprise cliente",
    );
  });
});

describe("le rendu mobile — celui qu’on envoie par WhatsApp", () => {
  const mobile = () => rendrePlaquetteMobile(construirePlaquette(OFFRES));

  it("ne garde que les écrans qui ne parlent pas du site du lecteur", () => {
    const rendu = mobile();
    expect(rendu).not.toContain("Préparé pour");
    expect(rendu).not.toContain("relevé");
    expect(rendu).not.toContain("m-ring");
    expect(rendu).not.toContain("Comment nous avons");
  });

  it("garde bien le prix, les trois volets et le contact", () => {
    // Ces écrans sont repris de `htmlMobile.ts` par leur libellé : un libellé
    // renommé là-bas les retirerait de la plaquette sans rien casser, et
    // personne ne le verrait avant le prospect.
    const rendu = mobile();
    expect(rendu).toContain(fmtEur(490));
    expect(rendu).toContain(fmtEur(19));
    expect(rendu).toContain("Le suivi");
    expect(rendu).toContain("Sur Google");
    expect(rendu).toContain("07 49 19 67 15");
    expect(rendu.match(/<div class="screen/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("ouvre sur une couverture qui dit ce qu’on vend, et à qui", () => {
    const rendu = mobile();
    expect(rendu).toContain("Sites internet pour artisans");
    expect(rendu).toContain("Artisans du bâtiment");
  });

  it("numérote ses écrans sans jamais nommer de client", () => {
    const rendu = mobile();
    expect(rendu).toContain("SAMA · Agence digitale indépendante");
    expect(rendu).toContain("01 / ");
  });
});
