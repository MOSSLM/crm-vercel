import { isBlacklisted } from "../_lib";

/**
 * UN DOMAINE BLACKLISTÉ COUVRE SES SOUS-DOMAINES.
 *
 * Le défaut qu'on répare ici était silencieux et durable : `facebook.com`
 * figurait dans `url_blacklist` depuis longtemps, et onze fiches sur
 * `fr-fr.facebook.com` continuaient de remonter dans la file de qualification.
 * Personne ne pouvait le voir autrement qu'en s'étonnant qu'une fiche déjà
 * écartée revienne — et on la réécartait à la main, une variante d'hôte à la
 * fois.
 *
 * Le test garde aussi la borne : blacklister un domaine ne doit pas attraper un
 * domaine qui finit par les mêmes lettres.
 */

const liste = (...domaines: string[]) => ({
  domains: new Set(domaines),
  urls: new Set<string>(),
});

const fiche = (url: string) => ({ canonical_url: url, site_web_canonique: null });

describe("le blacklist par domaine", () => {
  it("écarte le domaine lui-même", () => {
    expect(isBlacklisted(fiche("https://booking.com/hotel/fr/x"), liste("booking.com"))).toBe(true);
  });

  it("écarte ses sous-domaines, à n'importe quelle profondeur", () => {
    const bl = liste("facebook.com", "bluepillow.com");
    expect(isBlacklisted(fiche("https://fr-fr.facebook.com/pages/x"), bl)).toBe(true);
    expect(isBlacklisted(fiche("https://br.bluepillow.com/x"), bl)).toBe(true);
    expect(isBlacklisted(fiche("https://a.b.facebook.com/x"), bl)).toBe(true);
  });

  it("ignore le `www.`, qui n'est pas un sous-domaine distinct", () => {
    expect(isBlacklisted(fiche("https://www.action.com/fr"), liste("action.com"))).toBe(true);
  });

  it("n'attrape PAS un domaine qui finit par les mêmes lettres", () => {
    // Sans le point séparateur, `action.com` avalerait `notaction.com`, qui
    // appartient à quelqu'un d'autre.
    const bl = liste("action.com", "tereva.fr");
    expect(isBlacklisted(fiche("https://notaction.com"), bl)).toBe(false);
    expect(isBlacklisted(fiche("https://montereva.fr"), bl)).toBe(false);
  });

  it("laisse passer une entreprise sans site — il n'y a rien à comparer", () => {
    expect(
      isBlacklisted({ canonical_url: null, site_web_canonique: null }, liste("booking.com")),
    ).toBe(false);
  });

  it("laisse passer un site qui n'est pas dans la liste", () => {
    expect(isBlacklisted(fiche("https://clim-ouest.fr"), liste("booking.com"))).toBe(false);
  });
});
