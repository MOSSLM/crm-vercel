/**
 * Les métiers MIS DE CÔTÉ — le troisième axe des réglages de tags.
 *
 * Trois propriétés à tenir, et chacune correspond à une faute qu'on peut
 * commettre en croyant bien faire :
 *
 *  1. LE DÉFAUT EST « ON VEND ». Une ligne absente ne met rien de côté, sinon
 *     tout libellé nouveau disparaîtrait des files sans que personne ne le voie.
 *  2. LA PRÉSENCE SUFFIT. Pas d'exception « il fait aussi de la clim » : un
 *     poseur d'isolation recevrait une démo sans sa page principale.
 *  3. L'ABSENCE DE TAG N'EST PAS UNE INFORMATION. Une fiche non enrichie ne
 *     porte rien ; l'écarter pour ça écarterait tout le stock à lisser.
 */
import {
  estMiseDeCote,
  isServiceTagDemarchable,
  porteUnMetierVendu,
  type ServiceTagSetting,
} from "@/utils/serviceTags";

/** Les réglages tels qu'ils sont en base depuis le 29/08/2026. */
const reglages: ServiceTagSetting[] = [
  { tag: "Isolation des murs par l'extérieur", allowed: true, demarchable: false },
  { tag: "Fenêtres de toit", allowed: true, demarchable: false },
  { tag: "Pompe à chaleur : chauffage", allowed: true, demarchable: true },
  { tag: "climatisation", allowed: true, demarchable: true },
];

describe("isServiceTagDemarchable", () => {
  it("laisse passer un tag qu'aucune ligne ne mentionne", () => {
    // Le défaut, et il est le même que celui d'`allowed` : sans ligne, on vend.
    expect(isServiceTagDemarchable("Travaux d'efficacité énergétique", reglages)).toBe(true);
  });

  it("écarte un tag explicitement fermé", () => {
    expect(isServiceTagDemarchable("Isolation des murs par l'extérieur", reglages)).toBe(false);
  });

  it("résout par clé canonique, pas par graphie", () => {
    // Sans ça, la population reviendrait par la porte d'à côté au premier
    // import qui capitalise autrement.
    expect(isServiceTagDemarchable("ISOLATION DES MURS PAR L'EXTÉRIEUR", reglages)).toBe(false);
    expect(isServiceTagDemarchable("isolation-des-murs-par-l-exterieur", reglages)).toBe(false);
  });

  it("ne met rien de côté quand les réglages sont absents", () => {
    // Une lecture en échec doit rendre une file trop large, jamais une
    // population qui disparaît sans explication.
    expect(isServiceTagDemarchable("Isolation des murs par l'extérieur", null)).toBe(true);
    expect(isServiceTagDemarchable("Isolation des murs par l'extérieur", [])).toBe(true);
  });
});

describe("estMiseDeCote", () => {
  it("écarte dès qu'UN métier est fermé, même avec un métier vendu à côté", () => {
    // La règle du propriétaire : « isolation les exclut pour le moment, c'est
    // un service FORT, on peut pas présenter un site démo sans ça. »
    expect(
      estMiseDeCote(["Pompe à chaleur : chauffage", "Isolation des murs par l'extérieur"], reglages),
    ).toBe(true);
  });

  it("garde une fiche dont aucun métier n'est fermé", () => {
    expect(estMiseDeCote(["Pompe à chaleur : chauffage", "climatisation"], reglages)).toBe(false);
  });

  it("ne met JAMAIS de côté une fiche sans aucun tag", () => {
    // 196 des 524 garées sont dans ce cas : elles ne sont pas hors métier,
    // elles ne sont pas encore enrichies. Les écarter viderait le stock.
    expect(estMiseDeCote([], reglages)).toBe(false);
    expect(estMiseDeCote(null, reglages)).toBe(false);
  });
});

describe("porteUnMetierVendu", () => {
  it("ne reconnaît que les métiers EXPLICITEMENT déclarés vendables", () => {
    // « Travaux d'efficacité énergétique » (35 979 fiches) est une étiquette RGE
    // générique : elle ne prouve aucun métier, donc elle ne compte pas.
    expect(porteUnMetierVendu(["Travaux d'efficacité énergétique"], reglages)).toBe(false);
    expect(porteUnMetierVendu(["Pompe à chaleur : chauffage"], reglages)).toBe(true);
  });

  it("ne rattrape rien — c'est un compteur, pas une exception", () => {
    // Une fiche mixte reste mise de côté ; ce prédicat sert seulement à dire
    // combien reviendront en premier le jour du déblocage.
    const tags = ["Pompe à chaleur : chauffage", "Fenêtres de toit"];
    expect(estMiseDeCote(tags, reglages)).toBe(true);
    expect(porteUnMetierVendu(tags, reglages)).toBe(true);
  });
});
