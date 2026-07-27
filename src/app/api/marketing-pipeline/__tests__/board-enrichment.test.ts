import { isEnrichmentDone } from "../_board";

/**
 * L'étape « Enrichissement » du board Marketing & Web : c'est ce prédicat qui
 * débloque la carte « Validation données ». Le run passe par l'edge function
 * `enrich-lead-magnet`, qui n'écrit que `lead_magnet_projects` — d'où les cas
 * ci-dessous, qui verrouillent le fait que le statut du projet prime sur
 * l'ancienne table `automated_enrichment`.
 */
describe("isEnrichmentDone", () => {
  it("passe l'étape dès qu'un run marketing a réussi, sans ligne automated_enrichment", () => {
    expect(isEnrichmentDone({ statut: "framer", validated: false }, null)).toBe(true);
  });

  it("accepte aussi les statuts postérieurs du projet", () => {
    expect(isEnrichmentDone({ statut: "ready", validated: false }, null)).toBe(true);
    expect(isEnrichmentDone({ statut: "published", validated: false }, null)).toBe(true);
  });

  it("garde la carte « Enrichir » active tant qu'aucun run n'a abouti", () => {
    expect(isEnrichmentDone({ statut: "draft", validated: false }, null)).toBe(false);
    expect(isEnrichmentDone({ statut: "processing", validated: false }, null)).toBe(false);
    expect(isEnrichmentDone(null, null)).toBe(false);
  });

  it("garde la carte « Enrichir » active après un échec, même avec un ancien enrichissement", () => {
    expect(isEnrichmentDone({ statut: "failed", validated: false }, { status: "done" })).toBe(false);
  });

  it("ne régresse jamais une ligne déjà validée par un humain", () => {
    // Un ré-enrichissement repasse le statut à `draft` le temps du run.
    expect(isEnrichmentDone({ statut: "draft", validated: true }, null)).toBe(true);
    expect(isEnrichmentDone({ statut: "failed", validated: true }, null)).toBe(true);
  });

  it("accepte l'ancien pipeline quand il y a un projet à valider", () => {
    expect(isEnrichmentDone({ statut: "draft", validated: false }, { status: "done" })).toBe(true);
    expect(isEnrichmentDone({ statut: "draft", validated: false }, { status: null })).toBe(true);
  });

  it("ignore une ligne automated_enrichment non aboutie", () => {
    for (const status of ["pending", "queued", "running", "failed", "error"]) {
      expect(isEnrichmentDone({ statut: "draft", validated: false }, { status })).toBe(false);
    }
  });

  it("n'ouvre pas la validation sur un ancien enrichissement sans projet", () => {
    // Rien à valider : la carte suivante n'aurait qu'un bouton inerte.
    expect(isEnrichmentDone(null, { status: "done" })).toBe(false);
  });
});
