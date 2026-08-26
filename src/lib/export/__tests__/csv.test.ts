/**
 * Ce que le CSV doit faire pour qu'Excel français l'ouvre — et pour qu'il
 * n'exécute rien.
 */

import { champCsv, enTeteCsv, ligneCsv, nomFichier } from "../csv";

describe("champCsv", () => {
  it("rend les vides comme des vides, jamais comme « null »", () => {
    expect(champCsv(null)).toBe("");
    expect(champCsv(undefined)).toBe("");
    expect(champCsv("")).toBe("");
  });

  it("encadre dès qu'un caractère de structure apparaît", () => {
    // Le point-virgule est NOTRE séparateur : c'est lui qu'il faut protéger,
    // pas la virgule.
    expect(champCsv("Dupont; et fils")).toBe('"Dupont; et fils"');
    expect(champCsv("Plomberie, chauffage")).toBe("Plomberie, chauffage");
  });

  it("double les guillemets au lieu de les perdre", () => {
    expect(champCsv('Le "Vrai" Plombier')).toBe('"Le ""Vrai"" Plombier"');
  });

  it("garde les retours à la ligne d'une note, en encadrant", () => {
    expect(champCsv("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
  });

  it("neutralise une formule sans perdre le texte", () => {
    // Nos données viennent de scrapers et de formulaires publics : un nom
    // valant `=HYPERLINK(...)` s'exécuterait chez qui ouvre le fichier.
    // Les deux protections se cumulent : l'apostrophe neutralise la formule,
    // et les guillemets internes obligent en plus à encadrer le champ.
    expect(champCsv('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(champCsv("+33612345678")).toBe("'+33612345678");
    expect(champCsv("-5")).toBe("'-5");
    expect(champCsv("@societe")).toBe("'@societe");
  });

  it("ne préfixe pas un texte ordinaire", () => {
    expect(champCsv("Plomberie Dupont")).toBe("Plomberie Dupont");
    expect(champCsv(42)).toBe("42");
    expect(champCsv(false)).toBe("false");
  });

  it("sérialise un objet plutôt que de rendre [object Object]", () => {
    expect(champCsv({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe("ligneCsv", () => {
  it("sépare par point-virgule et termine en CRLF", () => {
    expect(ligneCsv(["a", "b"])).toBe("a;b\r\n");
  });
});

describe("enTeteCsv", () => {
  it("commence par le BOM, sans quoi Excel lit en ANSI", () => {
    const entete = enTeteCsv(["Nom", "Ville"]);
    expect(entete.charCodeAt(0)).toBe(0xfeff);
    expect(entete).toBe("﻿Nom;Ville\r\n");
  });
});

describe("nomFichier", () => {
  it("horodate, pour que deux exports ne se confondent pas", () => {
    expect(nomFichier("entreprises", "csv")).toMatch(/^entreprises-\d{8}\.csv$/);
  });
});
