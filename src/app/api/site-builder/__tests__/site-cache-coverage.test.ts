/**
 * The preview caches a site's render inputs, tagged `site:{siteId}`, and every
 * route that writes something the preview shows must drop that tag. That is a
 * human process spread over a dozen files, and the failure mode — "my edit
 * doesn't show up" — is worse than the slowness the cache is there to fix.
 *
 * So it is checked mechanically: any route file under a `[siteId]` segment that
 * exports a mutating verb must reference `invalidateSiteCache`. A new route
 * fails this test before it can ship a stale preview.
 *
 * Routes that only CREATE a new site have nothing to invalidate — a site nobody
 * has previewed yet has no cache entry. They are listed explicitly rather than
 * pattern-matched, so adding one is a deliberate act.
 */
import { readFileSync, readdirSync } from "fs";
import { join, relative, sep } from "path";

const API_ROOT = join(process.cwd(), "src/app/api/site-builder");
const MUTATING_VERB = /export\s+const\s+(POST|PUT|PATCH|DELETE)\b/;

/**
 * Routes that mutate but cannot make a preview stale. Each needs a reason, so
 * "it was failing the test" is never enough to get on the list.
 */
const EXEMPT: Record<string, string> = {
  "claude/[siteId]/duplicate/route.ts":
    "clones into a NEW site; the source site's output is unchanged and the clone has no cache entry yet",
  "claude/[siteId]/create-demo/route.ts":
    "same — clones the template into a new demo site",
  "sites/[siteId]/deploy-batch/route.ts":
    "clones + publishes NEW sites per company; [siteId] is only the template it reads",
  "sites/[siteId]/validate-lm/route.ts":
    "moves an opportunité to another pipeline stage; touches no column the site renders",
  "sites/[siteId]/versions/route.ts":
    "appends a site_versions snapshot row; restoring one is what changes the site, and that route does invalidate",
  "sites/[siteId]/redirections/plan/route.ts":
    "POST parce qu'il prend un corps, mais il n'écrit RIEN : il lit l'ancien site du client et rend une proposition. L'enregistrement est un second geste, sur PUT /redirections, qui invalide",
  "sites/[siteId]/brief/route.ts":
    "writes only site_briefs — an internal sales document; nothing it stores is read by the renderer",
};

function routeFilesUnderSiteId(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) routeFilesUnderSiteId(full, out);
    else if (entry.name === "route.ts") {
      const rel = relative(API_ROOT, full);
      if (rel.split(sep).includes("[siteId]")) out.push(rel);
    }
  }
  return out;
}

describe("site cache invalidation coverage", () => {
  const routes = routeFilesUnderSiteId(API_ROOT);

  it("finds the [siteId] routes at all (guards against a moved directory)", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes)("%s invalidates the site cache when it mutates", (rel) => {
    const source = readFileSync(join(API_ROOT, rel), "utf8");
    if (!MUTATING_VERB.test(source)) return; // read-only route
    if (EXEMPT[rel.split(sep).join("/")]) {
      // Exempt routes must stay exempt: adding a call here means the reason
      // above is wrong and should be corrected rather than quietly outgrown.
      expect(source).not.toContain("invalidateSiteCache");
      return;
    }
    expect(source).toContain("invalidateSiteCache");
  });

  it("has no stale entries in the exemption list", () => {
    const known = new Set(routes.map((r) => r.split(sep).join("/")));
    expect(Object.keys(EXEMPT).filter((r) => !known.has(r))).toEqual([]);
  });
});
