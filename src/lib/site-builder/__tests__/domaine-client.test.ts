import { enregistrementsDns, normaliserDomaineClient } from "../domaine-client";

const DOMAINE_AGENCE = "samadigitalstudio.fr";

describe("normaliserDomaineClient", () => {
  it("réduit une saisie collée à la forme stockée en base", () => {
    // Ce qu'un opérateur colle réellement : l'URL complète prise dans le navigateur.
    expect(normaliserDomaineClient("https://www.Plomberie-Dupont.fr/contact")).toEqual({
      ok: true,
      domaine: "plomberie-dupont.fr",
    });
  });

  it("accepte un sous-domaine du client", () => {
    expect(normaliserDomaineClient("pro.exemple.fr")).toEqual({ ok: true, domaine: "pro.exemple.fr" });
  });

  it("refuse un sous-domaine de chez nous — la ligne serait irrésoluble", () => {
    // Le routage cherche un sous-domaine dans published_subdomain, jamais dans
    // published_domain : la valeur serait écrite, le site annoncé en ligne, et
    // l'hôte répondrait 404 avec un journal vide.
    const verdict = normaliserDomaineClient(`client.${DOMAINE_AGENCE}`);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.erreur).toMatch(/sous-domaine/);
  });

  it("refuse l'apex de l'agence", () => {
    expect(normaliserDomaineClient(DOMAINE_AGENCE).ok).toBe(false);
  });

  it("refuse un hôte d'infrastructure", () => {
    expect(normaliserDomaineClient("crm-vercel.vercel.app").ok).toBe(false);
    expect(normaliserDomaineClient("localhost").ok).toBe(false);
    expect(normaliserDomaineClient("127.0.0.1").ok).toBe(false);
  });

  it("refuse une saisie libre", () => {
    expect(normaliserDomaineClient("le site du client").ok).toBe(false);
    expect(normaliserDomaineClient("").ok).toBe(false);
    expect(normaliserDomaineClient("exemple").ok).toBe(false);
  });
});

describe("enregistrementsDns", () => {
  it("donne l'apex et le www pour un domaine nu, même quand la saisie portait www", () => {
    const lignes = enregistrementsDns("plomberie-dupont.fr");
    expect(lignes.map((l) => `${l.type} ${l.nom}`)).toEqual(["A @", "CNAME www"]);
    expect(lignes[0].pourquoi).toMatch(/plomberie-dupont\.fr/);
  });

  it("ne demande QU'UN CNAME pour un sous-domaine du client", () => {
    // La consigne du domaine nu ferait pointer l'apex `exemple.fr` chez nous —
    // c'est-à-dire déplacer le site principal du client — et enverrait
    // `www.exemple.fr` sur un site qui n'est pas le sien.
    const lignes = enregistrementsDns("pro.exemple.fr");
    expect(lignes.map((l) => `${l.type} ${l.nom}`)).toEqual(["CNAME pro"]);
    expect(lignes[0].pourquoi).toMatch(/exemple\.fr/);
  });
});
