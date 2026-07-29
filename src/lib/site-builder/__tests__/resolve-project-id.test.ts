import { compareProjects, pickBestProject, resolveLeadMagnetProjectId } from "../resolve-project-id";

const P = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

describe("pickBestProject", () => {
  // La règle du board : « keep the validated one if any ». Sans elle, le builder
  // lisait un `draft` jamais enrichi pendant que la fiche écrivait sur le projet
  // validé — d'où des chiffres clés vides.
  it("prefers a validated project over a more recent draft", () => {
    const validated = P("a", { enrichment_validated: true, updated_at: "2026-01-01T00:00:00Z" });
    const recentDraft = P("b", { statut: "draft", updated_at: "2026-07-01T00:00:00Z" });
    expect(pickBestProject([recentDraft, validated])?.id).toBe("a");
  });

  it("falls back to pret_pour_lm, then to a terminal statut", () => {
    expect(pickBestProject([P("a", { statut: "draft" }), P("b", { pret_pour_lm: true })])?.id).toBe("b");
    expect(pickBestProject([P("a", { statut: "draft" }), P("b", { statut: "framer" })])?.id).toBe("b");
  });

  it("breaks ties by freshness, then created_at, then id — never at random", () => {
    const older = P("a", { updated_at: "2026-01-01T00:00:00Z" });
    const newer = P("b", { updated_at: "2026-06-01T00:00:00Z" });
    expect(pickBestProject([older, newer])?.id).toBe("b");

    const byCreated = [P("a", { created_at: "2026-01-01T00:00:00Z" }), P("b", { created_at: "2026-06-01T00:00:00Z" })];
    expect(pickBestProject(byCreated)?.id).toBe("b");

    // Rien pour départager : l'ordre doit rester le même d'un appel à l'autre.
    const twins = [P("zzz"), P("aaa")];
    expect(pickBestProject(twins)?.id).toBe("aaa");
    expect(pickBestProject([...twins].reverse())?.id).toBe("aaa");
  });

  it("returns null on an empty list", () => {
    expect(pickBestProject([])).toBeNull();
  });

  it("compareProjects is a usable comparator (stable sort input)", () => {
    const rows = [P("a", { statut: "draft" }), P("b", { enrichment_validated: true }), P("c", { pret_pour_lm: true })];
    expect([...rows].sort(compareProjects).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});

/** Client Supabase minimal : seules les formes d'appel réellement utilisées. */
function fakeSupabase(opts: {
  siteProjectId?: string | null;
  projects?: Array<Record<string, unknown>>;
}) {
  const calls: string[] = [];
  const projects = opts.projects ?? [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      if (table === "sites") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { lead_magnet_project_id: opts.siteProjectId ?? null }, error: null }),
            }),
          }),
        };
      }
      // lead_magnet_projects
      return {
        select: (_cols: string, options?: { count?: string; head?: boolean }) => ({
          eq: async () =>
            options?.head
              ? { count: projects.length, error: null }
              : { data: projects, error: null },
        }),
      };
    },
  };
}

describe("resolveLeadMagnetProjectId", () => {
  it("an explicit project id wins over everything", async () => {
    const sb = fakeSupabase({ siteProjectId: "from-site", projects: [P("ranked")] });
    const res = await resolveLeadMagnetProjectId(sb as any, {
      explicitProjectId: "explicit",
      siteId: "s1",
      enterpriseId: 7,
    });
    expect(res).toEqual({ projectId: "explicit", source: "explicit", candidates: 0 });
    expect(sb.calls).toHaveLength(0); // aucune requête inutile
  });

  // Le lien du site est la seule réponse non ambiguë : c'est lui qui enregistre
  // à quelle opportunité la démo appartient.
  it("uses the site link before ranking, and still counts the candidates", async () => {
    const sb = fakeSupabase({ siteProjectId: "from-site", projects: [P("a"), P("b"), P("c")] });
    const res = await resolveLeadMagnetProjectId(sb as any, { siteId: "s1", enterpriseId: 7 });
    expect(res.projectId).toBe("from-site");
    expect(res.source).toBe("site");
    expect(res.candidates).toBe(3);
  });

  it("ranks the enterprise's projects when the site has no link", async () => {
    const sb = fakeSupabase({
      siteProjectId: null,
      projects: [P("draft", { statut: "draft" }), P("valide", { enrichment_validated: true })],
    });
    const res = await resolveLeadMagnetProjectId(sb as any, { siteId: "s1", enterpriseId: 7 });
    expect(res).toEqual({ projectId: "valide", source: "ranked", candidates: 2 });
  });

  it("reports 'none' when the enterprise has no project at all", async () => {
    const sb = fakeSupabase({ siteProjectId: null, projects: [] });
    const res = await resolveLeadMagnetProjectId(sb as any, { siteId: "s1", enterpriseId: 7 });
    expect(res).toEqual({ projectId: null, source: "none", candidates: 0 });
  });

  it("reports 'none' without an enterprise and without a site link", async () => {
    const sb = fakeSupabase({ siteProjectId: null });
    const res = await resolveLeadMagnetProjectId(sb as any, {});
    expect(res.projectId).toBeNull();
    expect(res.source).toBe("none");
  });
});
