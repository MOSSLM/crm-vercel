/**
 * LE COCKPIT D'APPEL RENDU EN HTML, pour REGARDER ce que les tuiles donnent.
 *
 * Même raison que `dem-rail-dump.manual.tsx` : jsdom ne met rien en page. Une
 * grille `auto-fit` qui se replie mal, une tuile éteinte qu'on ne distingue
 * plus d'une tuile vivante, un nom d'hôte tronqué au milieu du domaine — rien
 * de tout ça ne se voit par `toHaveAttribute()`. Ce fichier sort le DOM réel
 * avec `dem-skin.css`, aux DEUX largeurs qui comptent (le centre d'un
 * 13 pouces, et un téléphone) et dans les deux thèmes.
 *
 * Exclu de la suite (`\.manual\.` de `jest.config.ts`), lancé à la main :
 *
 *     DEM_DUMP=/tmp/cockpit.html npx jest \
 *       --testMatch='**\/dem-cockpit-dump.manual.tsx' --testPathIgnorePatterns='/node_modules/'
 *
 * `--testPathIgnorePatterns` est NÉCESSAIRE, sinon jest écarte le fichier
 * qu'on vient de désigner et répond « No tests found ».
 */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { DemCockpit } from "../DemCockpit";
import type { CompanySite } from "../types";

const site = (over: Partial<CompanySite> = {}): CompanySite => ({
  id: "11111111-2222-3333-4444-555555555555",
  name: "Démo",
  published_subdomain: "clim-france-energie",
  published_domain: null,
  is_published: true,
  build_stage: "pret",
  paywall_enabled: false,
  ...over,
});

/** Les cinq états qu'un agent rencontre vraiment dans une journée d'appels. */
const CAS = [
  {
    ti: "Chaud complet — démo publiée, site connu, audit envoyé",
    p: {
      nom: "CLIM FRANCE ENERGIE",
      ville: "Meyzieu",
      siteUrl: "https://www.climfrance-energie.fr/nos-services",
      etatSite: "present" as const,
      site: site(),
      auditUrl: "https://rapport.samadigitalstudio.fr/c4c0406334d8632c",
      auditNote: 72,
      plaquetteUrl: "https://app.samadigitalstudio.fr/plaquette/xyz",
    },
  },
  {
    ti: "Démo en chantier — on la regarde, on ne l'envoie pas",
    p: {
      nom: "Froid Service",
      ville: "Pia",
      siteUrl: null,
      etatSite: "absent" as const,
      site: site({ is_published: false, build_stage: "chantier", published_subdomain: null }),
      auditUrl: null,
      auditNote: null,
      plaquetteUrl: null,
    },
  },
  {
    ti: "Appel à froid — le cockpit minimal, deux tuiles",
    p: {
      nom: "CLIMAT TEC - Patrice JULLIEN ( artisan chauffagiste / frigoriste )",
      ville: "Saint-Jean-De-Galaure",
      siteUrl: null,
      etatSite: "inconnu" as const,
      site: null,
      auditUrl: null,
      auditNote: null,
      plaquetteUrl: null,
    },
  },
  {
    ti: "Un hôte long — il doit se couper à la fin, pas au milieu du domaine",
    p: {
      nom: "Zenplomberie",
      ville: "Épinay-sous-Sénart",
      siteUrl: "https://www.zenplomberie-urgence-depannage-chauffagiste.fr",
      etatSite: "present" as const,
      site: null,
      auditUrl: null,
      auditNote: null,
      plaquetteUrl: null,
    },
  },
  {
    ti: "Site constaté absent — la tuile éteinte porte l'information",
    p: {
      nom: "E.C.C.S",
      ville: "Dompierre-sur-Mer",
      siteUrl: null,
      etatSite: "absent" as const,
      site: site({ published_subdomain: "eccs" }),
      auditUrl: "https://rapport.samadigitalstudio.fr/abc",
      auditNote: null,
      plaquetteUrl: null,
    },
  },
];

it("sort le cockpit en HTML", () => {
  const blocs = CAS.map(({ ti, p }) => {
    const { container } = render(<DemCockpit {...p} />);
    return `<h3>${ti}</h3><div class="dm-skin"><div class="carte">${container.innerHTML}</div></div>`;
  }).join("");

  const css = fs.readFileSync(path.join(__dirname, "..", "dem-skin.css"), "utf8");
  const sortie = process.env.DEM_DUMP || "/tmp/cockpit.html";
  const sombre = !!process.env.DEM_DUMP_DARK;

  fs.writeFileSync(
    sortie,
    `<!doctype html><meta charset="utf-8"><title>Cockpit d'appel</title><style>
      html,body{margin:0;font-family:-apple-system,system-ui,sans-serif}
      body{background:${sombre ? "#15171B" : "#F8F8F9"};color:${sombre ? "#E7E8EA" : "#15171B"};padding:20px}
      h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;margin:26px 0 10px}
      h3{font-size:12px;font-weight:500;opacity:.65;margin:16px 0 6px}
      /* Les deux largeurs qui décident : le centre d'un 13 pouces, et un
         téléphone. La grille auto-fit doit se replier entre les deux. */
      .col{display:flex;flex-direction:column}
      .bureau .carte{width:520px}
      .mobile .carte{width:330px}
      ${css}
    </style>${sombre ? '<div class="dark">' : ""}
      <div class="col bureau"><h2>Bureau — colonne centrale 520 px</h2>${blocs}</div>
      <div class="col mobile"><h2>Téléphone — 330 px</h2>${blocs}</div>
    ${sombre ? "</div>" : ""}`,
  );
  expect(fs.existsSync(sortie)).toBe(true);
});
