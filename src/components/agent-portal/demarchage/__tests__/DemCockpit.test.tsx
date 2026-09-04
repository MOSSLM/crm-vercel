import React from "react";
import { render, screen } from "@testing-library/react";
import { DemCockpit } from "../DemCockpit";
import { requeteGoogle, urlRechercheGoogle } from "../recherche";
import { PARAM_TRAFIC_INTERNE } from "@/lib/analytics/trafic-interne";
import { ETAT_SITE_LABEL } from "@/lib/agent-portal/etat-site";
import type { CompanySite } from "../types";

/**
 * CE QUE CE FICHIER TIENT : les quatre règles du cockpit d'appel, qui se
 * défont toutes en silence.
 *
 *   · une tuile qui ne mène nulle part est RETIRÉE — sauf le site, dont
 *     l'absence est l'information ;
 *   · ouvrir NOTRE démo ne doit rien mesurer : sans `lienNonMesure`, GA4 compte
 *     la visite de l'agent comme celle du prospect, et la fiche remonte
 *     « chaud » au moment précis où on l'a au téléphone ;
 *   · l'audit et la plaquette n'ont PAS de tuile, et ce n'est pas un oubli :
 *     leurs compteurs s'incrémentent côté serveur, donc les ouvrir mentirait
 *     à la condition qui décide qu'un prospect est chaud ;
 *   · un brouillon de démo s'OUVRE quand même, et se dit brouillon ;
 *   · une adresse sans schéma ne finit JAMAIS dans un `href` — le navigateur
 *     la lirait comme un chemin relatif et emmènerait l'agent sur une page du
 *     CRM au milieu de son appel ;
 *   · la recherche Google est la MÊME que celle de la ligne « Site » de
 *     l'en-tête, parce qu'elles sortent du même module.
 *
 * Aucune de ces quatre ne casse un rendu : elles produisent un lien qui ouvre
 * la mauvaise page, ce qui se découvre au téléphone.
 */

const SITE_PUBLIE: CompanySite = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "Démo Clim Service",
  published_subdomain: "clim-service",
  published_domain: null,
  is_published: true,
  build_stage: "pret",
  paywall_enabled: false,
};

const SITE_BROUILLON: CompanySite = { ...SITE_PUBLIE, is_published: false, build_stage: "chantier" };

const base = {
  nom: "Clim Service",
  ville: "Meyzieu",
  siteUrl: null,
  etatSite: "inconnu" as const,
  site: null,
};

/** La tuile dont le libellé est `lb`, ou `null` — lien comme tuile éteinte. */
const tuile = (lb: string) =>
  screen.queryByText(lb)?.closest(".dm-eye") ?? null;

describe("DemCockpit — ce qu'on ouvre pendant que ça sonne", () => {
  it("n'affiche aucune tuile morte : sans démo, sans audit, sans plaquette, il n'en reste que deux", () => {
    render(<DemCockpit {...base} />);
    expect(tuile("Sa démo")).toBeNull();
    expect(tuile("Son audit")).toBeNull();
    expect(tuile("Sa plaquette")).toBeNull();
    // Le site et Google restent : c'est le cockpit minimal d'un appel à froid.
    expect(document.querySelectorAll(".dm-eye")).toHaveLength(2);
  });

  it("garde la tuile du site même vide, et y écrit l'état plutôt que rien", () => {
    render(<DemCockpit {...base} etatSite="absent" />);
    const t = tuile("Son site");
    expect(t).not.toBeNull();
    // Éteinte — il n'y a rien à ouvrir — mais elle DIT ce qu'on a constaté.
    expect(t).toHaveAttribute("data-off", "1");
    expect(t?.tagName).toBe("SPAN");
    expect(t).toHaveTextContent(ETAT_SITE_LABEL.absent);
  });

  it("ouvre le site du prospect sur son hôte, et l'affiche sans le www", () => {
    render(<DemCockpit {...base} siteUrl="https://www.clim-service.fr/accueil" />);
    const t = tuile("Son site");
    expect(t).toHaveAttribute("href", "https://www.clim-service.fr/accueil");
    expect(t).toHaveTextContent("clim-service.fr");
  });

  it("ne pose JAMAIS une adresse sans schéma dans un href — le piège du lien relatif", () => {
    render(<DemCockpit {...base} siteUrl="clim-service.fr" />);
    const t = tuile("Son site");
    // Normalisée en https, jamais rendue telle quelle : `href="clim-service.fr"`
    // enverrait le navigateur sur /clim-service.fr du CRM.
    expect(t).toHaveAttribute("href", "https://clim-service.fr");
  });

  it("refuse une saisie qui n'est pas une adresse plutôt que d'ouvrir n'importe quoi", () => {
    render(<DemCockpit {...base} siteUrl="je ne sais pas" />);
    const t = tuile("Son site");
    expect(t).toHaveAttribute("data-off", "1");
    expect(t).not.toHaveAttribute("href");
  });

  it("ouvre une démo publiée et la dit en ligne", () => {
    render(<DemCockpit {...base} site={SITE_PUBLIE} />);
    const t = tuile("Sa démo");
    expect(t).toHaveAttribute("href", expect.stringContaining("clim-service."));
    expect(t).toHaveTextContent("en ligne");
  });

  it("ouvre AUSSI un brouillon — on le regarde avant d'appeler, on ne l'envoie pas", () => {
    render(<DemCockpit {...base} site={SITE_BROUILLON} />);
    const t = tuile("Sa démo");
    expect(t?.tagName).toBe("A");
    expect(t).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
    // Le mot compte : sans lui, on promet au téléphone un site à moitié fait.
    expect(t).toHaveTextContent("brouillon");
  });

  it("cherche « nom + ville », exactement comme la ligne « Site » de l'en-tête", () => {
    render(<DemCockpit {...base} />);
    const t = tuile("Google");
    expect(t).toHaveAttribute("href", urlRechercheGoogle("Clim Service", "Meyzieu"));
    expect(t).toHaveAttribute("title", expect.stringContaining("Clim Service Meyzieu"));
    expect(requeteGoogle("Clim Service", "Meyzieu")).toBe("Clim Service Meyzieu");
  });

  it("cherche le nom seul quand la ville manque, et le dit", () => {
    render(<DemCockpit {...base} ville={null} />);
    expect(tuile("Google")).toHaveTextContent("nom seul");
  });

  it("ne propose pas de recherche sans nom : une page d'accueil Google ne sert à rien", () => {
    render(<DemCockpit {...base} nom={null} ville={null} />);
    expect(tuile("Google")).toBeNull();
  });

  it("n'ouvre NI l'audit NI la plaquette — leurs compteurs s'écrivent côté serveur", () => {
    // Le geste existe ailleurs (la fiche). Ici il fabriquerait le signal
    // `plaquette_vue` que S2 lit pour décider qu'un prospect est chaud.
    render(<DemCockpit {...base} site={SITE_PUBLIE} siteUrl="https://clim-service.fr" />);
    expect(tuile("Son audit")).toBeNull();
    expect(tuile("Sa plaquette")).toBeNull();
    expect(document.querySelectorAll(".dm-eye")).toHaveLength(3);
  });

  it("marque la visite de la démo comme interne — sinon l'agent se fabrique un prospect chaud", () => {
    render(<DemCockpit {...base} site={SITE_PUBLIE} />);
    const href = tuile("Sa démo")?.getAttribute("href") ?? "";
    expect(new URL(href).searchParams.get(PARAM_TRAFIC_INTERNE)).toBe("1");
  });

  it("ne marque PAS le site du prospect : ce n'est pas le nôtre, il n'y a rien à exclure", () => {
    render(<DemCockpit {...base} siteUrl="https://clim-service.fr" />);
    expect(tuile("Son site")).toHaveAttribute("href", "https://clim-service.fr");
  });

  it("ouvre tout dans un onglet neuf, sans donner la main à la page ouverte", () => {
    render(<DemCockpit {...base} site={SITE_PUBLIE} siteUrl="https://clim-service.fr" />);
    const liens = document.querySelectorAll("a.dm-eye");
    expect(liens.length).toBeGreaterThan(0);
    liens.forEach((a) => {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    });
  });
});
