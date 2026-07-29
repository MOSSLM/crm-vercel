/**
 * @jest-environment node
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { rebuildSiteFromTemplate } from "../rebuild-site-from-template";
import { publishSite } from "../publish-site";

jest.mock("../publish-site", () => ({
  publishSite: jest.fn().mockResolvedValue({ ok: true }),
}));

/**
 * Refaire un site depuis un autre template.
 *
 * Ce qui compte ici : le site GARDE SON ID (donc son URL publiée, son audit et
 * son avancement) et prend le contenu du template choisi — avant, l'action
 * créait une démo de plus que le board n'affichait même pas. Et un site publié
 * doit être republié, sinon le public continue de servir l'ancien instantané.
 */

type Table = string;

interface Recorded {
  updates: Array<{ table: Table; payload: Record<string, unknown>; eq: [string, unknown] }>;
  deletes: Array<{ table: Table; eq: [string, unknown] }>;
  inserts: Array<{ table: Table; rows: Record<string, unknown>[] }>;
}

const TEMPLATE_SLICE = {
  style_guide: { tpl: true },
  sitemap: [{ slug: "/" }],
  site_config: { theme: "b" },
  content_overrides: null,
  shared_assets: { css: "b" },
  tweaks: { police: "Moderne" },
  is_claude_design: true,
  name: "Agence",
  is_template: true,
};

const TEMPLATE_INSTANCES = [
  { section_id: null, page_slug: "/", sort_order: 0, content: { __library: { section_id: "s-b" } }, blocks: [], custom_style: {}, is_hidden: false },
];

/**
 * Client Supabase minimal : juste assez de chaînage pour cette fonction, et il
 * enregistre les écritures pour qu'on puisse les vérifier.
 */
function fakeClient(opts: {
  site: Record<string, unknown> | null;
  template?: Record<string, unknown> | null;
  templateInstances?: Record<string, unknown>[];
  siteInstances?: Record<string, unknown>[];
  insertError?: { message: string };
}) {
  const rec: Recorded = { updates: [], deletes: [], inserts: [] };

  const client = {
    from(table: Table) {
      return {
        select(_columns: string) {
          void _columns;
          return {
            eq(_col: string, value: unknown) {
              const rows =
                table === "sites"
                  ? value === "tpl-b"
                    ? [opts.template === undefined ? TEMPLATE_SLICE : opts.template]
                    : [opts.site]
                  : value === "tpl-b"
                    ? opts.templateInstances ?? TEMPLATE_INSTANCES
                    : opts.siteInstances ?? [];
              const payload = { data: rows.filter(Boolean), error: null };
              return {
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                then: (resolve: (v: unknown) => unknown) => Promise.resolve(payload).then(resolve),
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: async (col: string, value: unknown) => {
              rec.updates.push({ table, payload, eq: [col, value] });
              return { error: null };
            },
          };
        },
        delete() {
          return {
            eq: async (col: string, value: unknown) => {
              rec.deletes.push({ table, eq: [col, value] });
              return { error: null };
            },
          };
        },
        insert: async (rows: Record<string, unknown>[]) => {
          rec.inserts.push({ table, rows });
          return { error: opts.insertError ?? null };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, rec };
}

const site = (over: Record<string, unknown> = {}) => ({
  id: "site-1",
  name: "Plomberie Durand",
  enterprise_id: 42,
  is_template: false,
  is_published: false,
  published_subdomain: null,
  published_domain: null,
  source_template_id: "tpl-a",
  ...over,
});

beforeEach(() => (publishSite as jest.Mock).mockClear());

describe("rebuildSiteFromTemplate", () => {
  it("applique le template sur le site existant, sans en créer un nouveau", async () => {
    const { client, rec } = fakeClient({ site: site() });
    const res = await rebuildSiteFromTemplate(client, "site-1", "tpl-b");

    expect(res.ok).toBe(true);
    expect(res.templateName).toBe("Agence");
    expect(res.templateChanged).toBe(true);

    // Le site est mis à jour, pas recréé : aucune insertion dans `sites`.
    expect(rec.inserts.some((i) => i.table === "sites")).toBe(false);
    const update = rec.updates.find((u) => u.table === "sites");
    expect(update?.eq).toEqual(["id", "site-1"]);
    expect(update?.payload).toMatchObject({
      style_guide: TEMPLATE_SLICE.style_guide,
      shared_assets: TEMPLATE_SLICE.shared_assets,
      tweaks: TEMPLATE_SLICE.tweaks,
      is_claude_design: true,
      source_template_id: "tpl-b",
    });
    // L'entreprise et l'étape du kanban ne sont pas touchées : c'est le même site.
    expect(update?.payload).not.toHaveProperty("enterprise_id");
    expect(update?.payload).not.toHaveProperty("build_stage");
  });

  it("remplace les sections du site par celles du template", async () => {
    const { client, rec } = fakeClient({
      site: site(),
      siteInstances: [{ section_id: null, page_slug: "/", sort_order: 0, content: {}, blocks: [], custom_style: {}, is_hidden: false }],
    });
    await rebuildSiteFromTemplate(client, "site-1", "tpl-b");

    expect(rec.deletes).toContainEqual({ table: "site_section_instances", eq: ["site_id", "site-1"] });
    const inserted = rec.inserts.find((i) => i.table === "site_section_instances");
    expect(inserted?.rows).toHaveLength(1);
    expect(inserted?.rows[0]).toMatchObject({ site_id: "site-1", page_slug: "/" });
  });

  it("republie un site déjà en ligne, pour que le public suive", async () => {
    const { client } = fakeClient({
      site: site({ is_published: true, published_subdomain: "plomberie-durand" }),
    });
    const res = await rebuildSiteFromTemplate(client, "site-1", "tpl-b");

    expect(res.republished).toBe(true);
    expect(publishSite).toHaveBeenCalledWith(expect.anything(), "site-1", {
      subdomain: "plomberie-durand",
      domain: undefined,
    });
  });

  it("ne republie pas un site qui n'était pas en ligne", async () => {
    const { client } = fakeClient({ site: site() });
    const res = await rebuildSiteFromTemplate(client, "site-1", "tpl-b");
    expect(res.republished).toBe(false);
    expect(publishSite).not.toHaveBeenCalled();
  });

  it("signale un simple rafraîchissement quand le template ne change pas", async () => {
    const { client } = fakeClient({ site: site({ source_template_id: "tpl-b" }) });
    const res = await rebuildSiteFromTemplate(client, "site-1", "tpl-b");
    expect(res.templateChanged).toBe(false);
  });

  it("refuse un template sans page plutôt que de vider le site", async () => {
    const { client, rec } = fakeClient({ site: site(), templateInstances: [] });
    const res = await rebuildSiteFromTemplate(client, "site-1", "tpl-b");

    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
    expect(rec.deletes).toHaveLength(0);
  });

  it("remet les anciennes sections si l'insertion échoue", async () => {
    const previous = [{ section_id: null, page_slug: "/", sort_order: 0, content: { keep: true }, blocks: [], custom_style: {}, is_hidden: false }];
    const { client, rec } = fakeClient({
      site: site(),
      siteInstances: previous,
      insertError: { message: "boom" },
    });
    const res = await rebuildSiteFromTemplate(client, "site-1", "tpl-b");

    expect(res.ok).toBe(false);
    // Deux insertions : celle qui échoue, puis la restauration.
    const inserts = rec.inserts.filter((i) => i.table === "site_section_instances");
    expect(inserts).toHaveLength(2);
    expect(inserts[1].rows[0]).toMatchObject({ site_id: "site-1", content: { keep: true } });
  });

  it("refuse de refaire un template", async () => {
    const { client } = fakeClient({ site: site({ is_template: true }) });
    const res = await rebuildSiteFromTemplate(client, "site-1", "tpl-b");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("refuse un site qui se refait depuis lui-même", async () => {
    const { client } = fakeClient({ site: site() });
    const res = await rebuildSiteFromTemplate(client, "site-1", "site-1");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});
