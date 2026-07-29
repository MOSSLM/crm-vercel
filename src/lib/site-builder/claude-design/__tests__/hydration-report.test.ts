import { buildHydrationReport, mergeHydrationReports } from "../hydration-report";

const VARS: Record<string, string> = {
  "entreprise.nom": "Clim Pro",
  "entreprise.annee_experience": "12",
  "entreprise.clients_count": "",
  __service_tags: '["Climatisation"]',
};

const bySeverity = (html: string, vars: Record<string, string> | null) =>
  Object.fromEntries(
    buildHydrationReport(html, vars).findings.map((f) => [f.name, f.severity]),
  );

describe("buildHydrationReport", () => {
  it("flags an unrecognised token — the silent-empty failure mode", () => {
    const html = `<p>{{ entreprise.annees_dexperience }} ans</p>`;
    const report = buildHydrationReport(html, VARS);
    expect(report.unknown).toBe(1);
    expect(report.findings[0].name).toBe("entreprise.annees_dexperience");
    expect(report.findings[0].hint).toMatch(/non reconnu/i);
  });

  // Un alias toléré ne doit jamais être signalé comme une faute d'orthographe :
  // au pire il est vide, comme n'importe quel token canonique.
  it("accepts a tolerated alias as a known token", () => {
    expect(bySeverity(`<p>{{ entreprise.annees_experience }}</p>`, VARS)).toEqual({
      "entreprise.annees_experience": "empty",
    });
    // Rempli par le résolveur (finalizeEnterpriseVariables) → plus rien à signaler.
    const filled = { ...VARS, "entreprise.annees_experience": "12" };
    expect(bySeverity(`<p>{{ entreprise.annees_experience }}</p>`, filled)).toEqual({
      "entreprise.annees_experience": "ok",
    });
  });

  it("separates a recognised-but-empty token from a filled one", () => {
    const out = bySeverity(`<p>{{ entreprise.nom }} · {{ entreprise.clients_count }}</p>`, VARS);
    expect(out["entreprise.nom"]).toBe("ok");
    expect(out["entreprise.clients_count"]).toBe("empty");
  });

  it("cannot judge emptiness without a company, but still checks spelling", () => {
    const report = buildHydrationReport(`<p>{{ entreprise.clients_count }} {{ entreprise.zzz }}</p>`, null);
    expect(report.empty).toBe(0);
    expect(report.unknown).toBe(1);
  });

  it("reports brackets left untokenised (they ship literally)", () => {
    const report = buildHydrationReport(`<p>[Nom de l'entreprise] — [Un truc inventé]</p>`, VARS);
    expect(report.brackets).toBe(2);
  });

  it("counts occurrences and sorts the worst first", () => {
    const html = `<p>{{ entreprise.nom }} {{ entreprise.zzz }} {{ entreprise.zzz }} {{ entreprise.clients_count }}</p>`;
    const report = buildHydrationReport(html, VARS);
    expect(report.findings[0].severity).toBe("unknown");
    expect(report.findings[0].count).toBe(2);
    expect(report.findings[1].severity).toBe("empty");
  });

  it("returns an empty report for empty html", () => {
    expect(buildHydrationReport("", VARS).findings).toEqual([]);
  });
});

describe("mergeHydrationReports", () => {
  it("sums the counters across pages", () => {
    const a = buildHydrationReport(`<p>{{ entreprise.zzz }}</p>`, VARS);
    const b = buildHydrationReport(`<p>{{ entreprise.clients_count }} [Inventé]</p>`, VARS);
    expect(mergeHydrationReports([{ slug: "/", report: a }, { slug: "/contact", report: b }]))
      .toEqual({ unknown: 1, empty: 1, brackets: 1 });
  });
});
