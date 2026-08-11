import {
  construireMesures,
  sousTitreNote,
  LIBELLE_DEMO,
  MIN_ECHANTILLON_MEDIANE,
  NOTE_DEMO,
} from "../mesures";
import { mediane } from "../mediane-parc";
import type { AuditLu } from "@/lib/audit-site/lecture";

/**
 * Ces tests protègent les chiffres que le prospect lit.
 *
 * Chacun correspond à une façon précise de mentir sans s'en rendre compte :
 * recalculer la note, comparer deux instruments différents sur un même axe,
 * inventer une médiane sur quatre sites, ou présenter comme relevée une note
 * qu'on affirme.
 */

const BASE: AuditLu = {
  note_document: 37,
  note_document_base: 44,
  note_document_malus: [{ libelle: "Votre numéro ne se compose pas en un clic", points: 3 }],
  entreprise_id: 7,
  url_analysee: "https://exemple.fr",
  url_finale: "https://exemple.fr",
  http_status: 200,
  bloque: false,
  injoignable: false,
  note_globale: 37,
  libelle: "faible",
  axes: [],
  axes_masques: [],
  issue_keys: [],
  constats_google: [],
  alertes: [],
  ttfb_ms: null,
  chargement_ms: null,
  poids_octets: null,
  capture_url: null,
  note_globale_demo: null,
  analyse_le: "2026-07-12T19:47:00.000Z",
  psi_performance: null,
  psi_recupere_le: null,
};

const PREUVE = {
  cle: "cta",
  libelle: "Boutons d'action",
  valeur: "0",
  seuil: "2",
  poids: 20,
  verdict: "probleme" as const,
};

describe("construireMesures — la note ne se recalcule pas", () => {
  it("publie note_globale, jamais la moyenne des axes affichés", () => {
    const audit: AuditLu = {
      ...BASE,
      note_globale: 37,
      axes: [
        { id: "vitesse", note: 47, confiance: "haute", preuves: [], mesureGoogle: true, constats: [] },
        { id: "seo", note: 92, confiance: "haute", preuves: [], mesureGoogle: true, constats: [] },
        { id: "accessibilite", note: 71, confiance: "haute", preuves: [], mesureGoogle: true, constats: [] },
      ],
    };
    const m = construireMesures(audit);

    // La moyenne des axes vaut 70 : si elle apparaissait, c'est qu'un troisième
    // barème s'est glissé dans le rendu. La note publiée est celle du DOCUMENT,
    // calculée à partir de la mesure de Google — jamais recomposée ici.
    expect(m.noteGlobale).toBe(37);
    expect(m.reperes.prospect).toBe(37);
  });

  it("ne promet jamais que la note est la moyenne des axes", () => {
    const m = construireMesures(BASE, { valeur: 77, effectif: 430 });
    expect(sousTitreNote(m)).toBe("Comparée à 430 sites d’artisans mesurés");
    expect(sousTitreNote(m)).not.toMatch(/moyenne/i);
  });
});

describe("construireMesures — les axes viennent de la base", () => {
  it("suit le nombre d'axes mesurés, sans liste en dur", () => {
    const quatre = construireMesures({
      ...BASE,
      axes: ["vitesse", "seo", "conversion", "popularite"].map((id) => ({
        id: id as "vitesse",
        note: 50,
        confiance: "haute" as const,
        preuves: [],
      })),
    });
    expect(quatre.axes).toHaveLength(4);
    expect(quatre.mesureParGoogle).toBe(false);

    const six = construireMesures({
      ...BASE,
      axes: ["vitesse", "seo", "accessibilite", "bonnes_pratiques", "conversion", "popularite"].map(
        (id, i) => ({
          id: id as "vitesse",
          note: 50,
          confiance: "haute" as const,
          preuves: [],
          mesureGoogle: i < 4,
        }),
      ),
    });
    expect(six.axes).toHaveLength(6);
    expect(six.mesureParGoogle).toBe(true);
  });

  it("ne revendique « mesuré par Google » que sur les axes qui le sont", () => {
    const m = construireMesures({
      ...BASE,
      axes: [
        { id: "vitesse", note: 47, confiance: "haute", preuves: [], mesureGoogle: true },
        { id: "conversion", note: 58, confiance: "haute", preuves: [] },
      ],
    });
    expect(m.axes.find((a) => a.id === "vitesse")?.mesureGoogle).toBe(true);
    expect(m.axes.find((a) => a.id === "conversion")?.mesureGoogle).toBe(false);
  });

  it("nomme les axes non testés au lieu de les taire", () => {
    const m = construireMesures({ ...BASE, axes_masques: ["seo", "mobile"] });
    expect(m.axesNonTestes).toEqual(["Visibilité sur Google", "Sur téléphone"]);
  });

  it("résume un axe par son constat le plus coûteux, sinon sa preuve la plus lourde", () => {
    const m = construireMesures({
      ...BASE,
      axes: [
        {
          id: "vitesse",
          note: 47,
          confiance: "haute",
          preuves: [],
          mesureGoogle: true,
          constats: [
            {
              id: "render-blocking-insight",
              categorie: "performance",
              titre: "Requêtes de blocage du rendu",
              valeur: "Économies estimées : 3 650 ms",
              gainMs: 3650,
              gainOctets: null,
              elements: 3,
              verdict: "probleme",
            },
          ],
        },
        {
          id: "conversion",
          note: 58,
          confiance: "haute",
          preuves: [
            { ...PREUVE, cle: "mentions", libelle: "Mentions légales", valeur: "absentes", seuil: null, poids: 8 },
            PREUVE,
          ],
        },
      ],
    });
    expect(m.axes[0].valeur).toBe("Économies estimées : 3 650 ms");
    expect(m.axes[1].valeur).toBe("0"); // poids 20 l'emporte sur poids 8
  });
});

describe("construireMesures — la réglette", () => {
  it("affiche le démo à 99, et son libellé ne dit pas « mesuré »", () => {
    const m = construireMesures(BASE);
    expect(m.reperes.demo).toBe(NOTE_DEMO);
    expect(NOTE_DEMO).toBe(99);
    expect(LIBELLE_DEMO).not.toMatch(/mesur|relev/i);
  });

  it("masque la médiane sous le seuil d'échantillon", () => {
    const maigre = construireMesures(BASE, {
      valeur: 51,
      effectif: MIN_ECHANTILLON_MEDIANE - 1,
    });
    expect(maigre.reperes.mediane).toBeNull();

    const suffisant = construireMesures(BASE, { valeur: 77, effectif: 430 });
    expect(suffisant.reperes.mediane).toBe(77);
  });

  it("masque la médiane quand elle n'a pas pu être lue", () => {
    expect(construireMesures(BASE, null).reperes.mediane).toBeNull();
    expect(construireMesures(BASE, { valeur: null, effectif: 430 }).reperes.mediane).toBeNull();
  });
});

describe("construireMesures — la date affichée", () => {
  it("date du relevé Google quand c'est lui qui parle", () => {
    const m = construireMesures({
      ...BASE,
      psi_recupere_le: "2026-08-01T10:00:00.000Z",
      axes: [{ id: "vitesse", note: 47, confiance: "haute", preuves: [], mesureGoogle: true }],
    });
    expect(m.mesureLe).toBe("2026-08-01T10:00:00.000Z");
  });

  it("date de notre analyse sinon", () => {
    expect(construireMesures(BASE).mesureLe).toBe("2026-07-12T19:47:00.000Z");
  });
});

describe("construireMesures — les constats citables", () => {
  it("préfixe les constats Google et garde nos clés de preuves telles quelles", () => {
    const m = construireMesures({
      ...BASE,
      constats_google: [
        {
          id: "image-alt",
          categorie: "accessibility",
          titre: "Les éléments d'image possèdent des attributs [alt]",
          valeur: null,
          gainMs: null,
          gainOctets: null,
          elements: 11,
          verdict: "probleme",
        },
      ],
      axes: [{ id: "conversion", note: 58, confiance: "haute", preuves: [PREUVE] }],
    });

    expect(m.constats.map((c) => c.cle)).toEqual(["google:image-alt", "cta"]);
  });

  it("n'expose ni les preuves réussies ni les non mesurées", () => {
    const m = construireMesures({
      ...BASE,
      axes: [
        {
          id: "conversion",
          note: 58,
          confiance: "haute",
          preuves: [
            PREUVE,
            { ...PREUVE, cle: "tel", verdict: "ok" },
            { ...PREUVE, cle: "avis", verdict: "inconnu", valeur: null },
          ],
        },
      ],
    });
    expect(m.constats.map((c) => c.cle)).toEqual(["cta"]);
  });
});

describe("mediane", () => {
  it("rend un entier, sur liste paire comme impaire", () => {
    expect(mediane([10, 20, 30])).toBe(20);
    expect(mediane([10, 20, 30, 41])).toBe(25);
    expect(mediane([])).toBeNull();
  });
});

describe("la valeur qui résume un axe", () => {
  it("prend la preuve la plus FORTE, pas la plus lourde", () => {
    // Le cas qui a imposé la distinction : une carte « Rapidité 10/100 » qui
    // affichait « 1,3 s » — le serveur, poids 35 mais raté de 120 ms — alors
    // que la page pesait 5,7 Mo pour un seuil à 2 Mo. Le prospect lisait une
    // note sévère justifiée par un chiffre qui lui paraît correct, et cessait
    // de croire la note.
    const m = construireMesures({
      ...BASE,
      axes: [
        {
          id: "vitesse",
          note: 10,
          confiance: "haute",
          preuves: [
            { ...PREUVE, cle: "ttfb", libelle: "Serveur", valeur: "1,3 s", poids: 35, gravite: 0.33 },
            { ...PREUVE, cle: "poids", libelle: "Poids", valeur: "5,7 Mo", poids: 25, gravite: 0.93 },
          ],
        },
      ],
    });
    expect(m.axes[0].valeur).toBe("5,7 Mo");
  });
});
