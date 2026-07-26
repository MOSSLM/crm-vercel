import { resolvePreviewSlug } from "../preview-slug";

const inst = (page_slug: string, is_hidden = false) => ({ page_slug, is_hidden });

describe("resolvePreviewSlug", () => {
  it("renders the requested page when it exists", () => {
    const instances = [inst("/"), inst("/a-propos")];
    expect(resolvePreviewSlug(instances, [{ slug: "/" }, { slug: "/a-propos" }], "/")).toEqual({
      slug: "/",
      fellBack: false,
    });
    expect(resolvePreviewSlug(instances, null, "/a-propos")).toEqual({
      slug: "/a-propos",
      fellBack: false,
    });
  });

  it("falls back to the first sitemap page when the design has no home", () => {
    // A ZIP without index.html produces no "/" slug (fileNameToSlug), which used
    // to 404 the bare preview subdomain.
    const instances = [inst("/services"), inst("/accueil")];
    const sitemap = [{ slug: "/accueil" }, { slug: "/services" }];
    expect(resolvePreviewSlug(instances, sitemap, "/")).toEqual({
      slug: "/accueil",
      fellBack: true,
    });
  });

  it("falls back to the first instance when the sitemap is empty or stale", () => {
    const instances = [inst("/accueil"), inst("/contact")];
    expect(resolvePreviewSlug(instances, [], "/")).toEqual({ slug: "/accueil", fellBack: true });
    expect(resolvePreviewSlug(instances, [{ slug: "/disparue" }], "/")).toEqual({
      slug: "/accueil",
      fellBack: true,
    });
  });

  it("skips hidden pages", () => {
    const instances = [inst("/accueil", true), inst("/contact")];
    expect(resolvePreviewSlug(instances, [{ slug: "/accueil" }, { slug: "/contact" }], "/")).toEqual({
      slug: "/contact",
      fellBack: true,
    });
    // Explicitly asking for a hidden page is still a 404.
    expect(resolvePreviewSlug(instances, null, "/accueil")).toBeNull();
  });

  it("skips fallback candidates gated by a missing service tag", () => {
    const instances = [inst("/clim"), inst("/plomberie")];
    const sitemap = [{ slug: "/clim" }, { slug: "/plomberie" }];
    const isAllowed = (slug: string) => slug !== "/clim";
    expect(resolvePreviewSlug(instances, sitemap, "/", isAllowed)).toEqual({
      slug: "/plomberie",
      fellBack: true,
    });
  });

  it("does NOT fall back for an explicitly requested page", () => {
    // A deep link to a page that doesn't exist must stay a 404 rather than
    // silently render something else.
    expect(resolvePreviewSlug([inst("/")], [{ slug: "/" }], "/tarifs")).toBeNull();
  });

  it("returns null when there is nothing renderable", () => {
    expect(resolvePreviewSlug([], [], "/")).toBeNull();
    expect(resolvePreviewSlug([inst("/", true)], [{ slug: "/" }], "/")).toBeNull();
  });
});
