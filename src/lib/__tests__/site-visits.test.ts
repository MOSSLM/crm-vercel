import {
  formatDuration,
  heatOf,
  isNoise,
  prettyPath,
  HEAT_RANK,
  NOISE_DURATION_MS,
  type SiteVisit,
  type SiteVisitSummary,
} from "@/lib/site-visits";

/** Agrégat « une seule visite courte », le cas le plus fréquent. */
function summary(over: Partial<SiteVisitSummary> = {}): SiteVisitSummary {
  return {
    entreprise_id: 1,
    visits: 1,
    total_duration_ms: 10_000,
    last_visit_at: "2026-08-05T10:00:00Z",
    first_visit_at: "2026-08-05T10:00:00Z",
    distinct_days: 1,
    distinct_contacts: 0,
    saw_intent_page: false,
    ...over,
  };
}

function visit(over: Partial<SiteVisit> = {}): SiteVisit {
  return {
    id: "v1",
    entreprise_id: 1,
    contact_id: null,
    contact_name: null,
    host: "ecotherme.samadigitalstudio.fr",
    entry_path: "/",
    paths: ["/"],
    page_views: 1,
    referrer: null,
    device: "desktop",
    duration_ms: 10_000,
    started_at: "2026-08-05T10:00:00Z",
    last_seen_at: "2026-08-05T10:00:10Z",
    ...over,
  };
}

describe("heatOf", () => {
  it("classe une entreprise sans visite en 'none'", () => {
    expect(heatOf(null).heat).toBe("none");
    expect(heatOf(summary({ visits: 0 })).heat).toBe("none");
  });

  it("classe une ouverture brève en 'cold'", () => {
    expect(heatOf(summary()).heat).toBe("cold");
  });

  it("passe en 'warm' au-delà du seuil de lecture", () => {
    expect(heatOf(summary({ total_duration_ms: 46_000 })).heat).toBe("warm");
  });

  it("passe en 'hot' sur un retour un autre jour", () => {
    const v = heatOf(summary({ distinct_days: 2 }));
    expect(v.heat).toBe("hot");
    expect(v.reason).toContain("2 jours");
  });

  // Une page tarifs consultée vaut le retour différé : les deux disent
  // « il compare », ce qui est le moment où l'appel sert à quelque chose.
  it("passe en 'hot' sur une page d'intention, même en une seule visite courte", () => {
    expect(heatOf(summary({ saw_intent_page: true })).heat).toBe("hot");
  });

  it("passe en 'blazing' quand plusieurs personnes ont ouvert", () => {
    const v = heatOf(summary({ distinct_contacts: 2 }));
    expect(v.heat).toBe("blazing");
    expect(v.reason).toContain("2 personnes");
  });

  it("passe en 'blazing' sur retour différé ET page d'intention", () => {
    expect(heatOf(summary({ distinct_days: 3, saw_intent_page: true })).heat).toBe("blazing");
  });

  // Le signal le plus fort doit gagner : une fiche à la fois multi-contacts et
  // multi-jours ne doit pas retomber sur la raison la plus faible.
  it("retient le signal le plus fort quand plusieurs s'appliquent", () => {
    const v = heatOf(summary({ distinct_contacts: 3, distinct_days: 4, saw_intent_page: true }));
    expect(v.heat).toBe("blazing");
    expect(v.reason).toContain("3 personnes");
  });

  it("ordonne les températures du plus froid au plus chaud", () => {
    expect(HEAT_RANK.none).toBeLessThan(HEAT_RANK.cold);
    expect(HEAT_RANK.cold).toBeLessThan(HEAT_RANK.warm);
    expect(HEAT_RANK.warm).toBeLessThan(HEAT_RANK.hot);
    expect(HEAT_RANK.hot).toBeLessThan(HEAT_RANK.blazing);
  });
});

describe("isNoise", () => {
  it("écarte une session plus courte que le seuil de bruit", () => {
    expect(isNoise(visit({ duration_ms: NOISE_DURATION_MS - 1 }))).toBe(true);
  });

  it("garde une session courte mais qui a navigué", () => {
    expect(isNoise(visit({ duration_ms: 5_000, page_views: 4 }))).toBe(false);
  });

  it("garde une session longue", () => {
    expect(isNoise(visit({ duration_ms: NOISE_DURATION_MS + 1 }))).toBe(false);
  });
});

describe("formatDuration", () => {
  it("reste en secondes sous la minute", () => {
    expect(formatDuration(45_000)).toBe("45 s");
  });

  it("passe en minutes au-delà", () => {
    expect(formatDuration(95_000)).toBe("1 min 35");
    expect(formatDuration(120_000)).toBe("2 min");
  });
});

describe("prettyPath", () => {
  it("nomme la racine 'Accueil'", () => {
    expect(prettyPath("/")).toBe("Accueil");
    expect(prettyPath("")).toBe("Accueil");
  });

  it("capitalise le dernier segment", () => {
    expect(prettyPath("/tarifs")).toBe("Tarifs");
    expect(prettyPath("/blog/nos-services")).toBe("Nos services");
  });

  it("ignore la query et le fragment", () => {
    expect(prettyPath("/contact?k=abc#form")).toBe("Contact");
  });

  it("tolère une barre oblique finale", () => {
    expect(prettyPath("/tarifs/")).toBe("Tarifs");
  });
});
