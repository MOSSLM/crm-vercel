/**
 * Ce que ces tests protègent : un logo distant qu'on aspire vient d'un serveur
 * qu'on ne contrôle pas. Il ment sur le type, il renvoie des pages d'erreur en
 * 200, il expire — et l'URL elle-même peut venir d'un enrichissement
 * automatique, donc viser n'importe quoi. Chaque cas ci-dessous est un de ces
 * accidents, vérifié pour qu'il n'écrive rien en base.
 */

import { isAlreadyHosted, rehostRemoteImage, sniffImageMime } from "../rehost-remote-image";

jest.mock("../optimize-image", () => ({
  optimizeImageUpload: jest.fn(async (input: Uint8Array, mime: string) => ({
    bytes: Buffer.from(input),
    contentType: mime,
    ext: mime.split("/")[1] ?? "bin",
    width: 64,
    height: 64,
  })),
}));

/** `TextEncoder` manque sous jsdom ; ces marqueurs sont de l'ASCII pur. */
const ascii = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));

const OUR_HOST = "https://proj.supabase.co/storage/v1/object/public/media-library";

/** Client Supabase réduit à ce que la brique appelle vraiment. */
function fakeSupabase(over: { uploadError?: string; insertError?: string } = {}) {
  const uploaded: { path: string }[] = [];
  const inserted: Record<string, unknown>[] = [];
  const removed: string[][] = [];

  const client = {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${OUR_HOST}/${path}` } }),
        upload: async (path: string) => {
          if (over.uploadError) return { error: { message: over.uploadError } };
          uploaded.push({ path });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (over.insertError) return { error: { message: over.insertError } };
        inserted.push(row);
        return { error: null };
      },
    }),
  };

  return { client: client as never, uploaded, inserted, removed };
}

function mockFetchOnce(body: Uint8Array | string, init: { status?: number; type?: string } = {}) {
  const bytes = typeof body === "string" ? ascii(body) : body;
  global.fetch = jest.fn(async () => ({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: new Headers(init.type ? { "content-type": init.type } : {}),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })) as unknown as typeof fetch;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 30, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

afterEach(() => jest.restoreAllMocks());

describe("sniffImageMime", () => {
  it("reconnaît les formats aux octets, pas à l'extension", () => {
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(GIF)).toBe("image/gif");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
  });

  it("reconnaît un SVG, y compris précédé d'une déclaration XML", () => {
    expect(sniffImageMime(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      "image/svg+xml",
    );
    expect(sniffImageMime(ascii('<?xml version="1.0"?><svg viewBox="0 0 1 1"/>'))).toBe(
      "image/svg+xml",
    );
  });

  it("rejette une page HTML — le cas du 200 qui n'est pas une image", () => {
    expect(sniffImageMime(ascii("<!doctype html><html><body>404</body></html>"))).toBeNull();
  });

  it("rejette un contenu trop court pour être identifié", () => {
    expect(sniffImageMime(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("rehostRemoteImage — ce qu'on refuse d'aller chercher", () => {
  it("refuse une URL vide ou illisible", async () => {
    const { client } = fakeSupabase();
    await expect(rehostRemoteImage(client, "")).resolves.toMatchObject({ ok: false });
    await expect(rehostRemoteImage(client, "pas une url")).resolves.toMatchObject({ ok: false });
  });

  it("refuse les protocoles autres que http(s)", async () => {
    const { client } = fakeSupabase();
    const res = await rehostRemoteImage(client, "file:///etc/passwd");
    expect(res).toMatchObject({ ok: false });
    expect((res as { error: string }).error).toMatch(/protocole/i);
  });

  it.each([
    "http://localhost/logo.png",
    "http://127.0.0.1/logo.png",
    "http://10.0.0.5/logo.png",
    "http://192.168.1.20/logo.png",
    "http://172.16.4.4/logo.png",
    "http://169.254.169.254/latest/meta-data/", // métadonnées cloud
    "http://[::1]/logo.png",
  ])("refuse l'hôte privé %s", async (url) => {
    const { client } = fakeSupabase();
    global.fetch = jest.fn() as unknown as typeof fetch;
    const res = await rehostRemoteImage(client, url);
    expect(res).toMatchObject({ ok: false, error: "Hôte privé refusé" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("laisse passer un hôte public qui ressemble à une plage privée", async () => {
    const { client } = fakeSupabase();
    mockFetchOnce(PNG, { type: "image/png" });
    await expect(
      rehostRemoteImage(client, "https://172.32.0.1/logo.png", { entrepriseId: 1 }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("rehostRemoteImage — idempotence", () => {
  it("ne retélécharge pas une image déjà servie par nous", async () => {
    const { client, uploaded } = fakeSupabase();
    global.fetch = jest.fn() as unknown as typeof fetch;

    const res = await rehostRemoteImage(client, `${OUR_HOST}/company/deja.webp`, { entrepriseId: 7 });

    expect(res).toMatchObject({ ok: true, alreadyHosted: true });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(uploaded).toHaveLength(0);
  });

  it("isAlreadyHosted distingue notre hôte d'un hôte tiers", () => {
    const { client } = fakeSupabase();
    expect(isAlreadyHosted(client, `${OUR_HOST}/company/x.webp`)).toBe(true);
    expect(isAlreadyHosted(client, "https://site-client.fr/logo.png")).toBe(false);
    expect(isAlreadyHosted(client, "pas une url")).toBe(false);
  });
});

describe("rehostRemoteImage — ce que le serveur distant renvoie", () => {
  it("rejette une page HTML servie en 200 à la place de l'image", async () => {
    const { client, uploaded } = fakeSupabase();
    mockFetchOnce("<!doctype html><html>Not found</html>", { type: "text/html" });

    const res = await rehostRemoteImage(client, "https://site-client.fr/logo.png", { entrepriseId: 3 });

    expect(res).toMatchObject({ ok: false, error: "Le contenu n'est pas une image" });
    expect(uploaded).toHaveLength(0);
  });

  it("croit les octets plutôt que le Content-Type du serveur", async () => {
    const { client, inserted } = fakeSupabase();
    mockFetchOnce(PNG, { type: "application/octet-stream" });

    const res = await rehostRemoteImage(client, "https://site-client.fr/logo", { entrepriseId: 3 });

    expect(res).toMatchObject({ ok: true });
    expect(inserted[0].mime_type).toBe("image/png");
  });

  it("remonte le statut HTTP en clair", async () => {
    const { client } = fakeSupabase();
    mockFetchOnce(PNG, { status: 403, type: "image/png" });
    await expect(rehostRemoteImage(client, "https://site-client.fr/logo.png", { entrepriseId: 3 })).resolves.toMatchObject(
      { ok: false, error: "HTTP 403" },
    );
  });

  it("rejette une réponse vide", async () => {
    const { client } = fakeSupabase();
    mockFetchOnce(new Uint8Array(0), { type: "image/png" });
    await expect(rehostRemoteImage(client, "https://site-client.fr/logo.png", { entrepriseId: 3 })).resolves.toMatchObject(
      { ok: false, error: "Réponse vide" },
    );
  });

  it("ne laisse pas une panne réseau remonter en exception", async () => {
    const { client } = fakeSupabase();
    global.fetch = jest.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(
      rehostRemoteImage(client, "https://site-client.fr/logo.png", { entrepriseId: 3 }),
    ).resolves.toMatchObject({ ok: false, error: "Téléchargement impossible" });
  });
});

describe("rehostRemoteImage — écriture", () => {
  it("range l'image et inscrit la ligne de médiathèque", async () => {
    const { client, uploaded, inserted } = fakeSupabase();
    mockFetchOnce(PNG, { type: "image/png" });

    const res = await rehostRemoteImage(client, "https://site-client.fr/img/logo.png", {
      entrepriseId: 42,
      tags: ["logo"],
      altText: "Logo Untel",
    });

    expect(res).toMatchObject({ ok: true, alreadyHosted: false });
    expect(uploaded[0].path).toMatch(/^company\//);
    expect(inserted[0]).toMatchObject({
      image_type: "company",
      entreprise_id: 42,
      service_tags: ["logo"],
      alt_text: "Logo Untel",
      file_name: "logo.png",
    });
    // La provenance reste lisible en médiathèque, sans la chaîne de requête.
    expect(String(inserted[0].description)).toContain("https://site-client.fr/img/logo.png");
  });

  it("exige une entreprise pour une image d'entreprise", async () => {
    const { client } = fakeSupabase();
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(
      rehostRemoteImage(client, "https://site-client.fr/logo.png", { imageType: "company" }),
    ).resolves.toMatchObject({ ok: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retire l'objet stocké si la ligne en base échoue, pour ne pas laisser d'orphelin", async () => {
    const { client, removed } = fakeSupabase({ insertError: "colonne inconnue" });
    mockFetchOnce(PNG, { type: "image/png" });

    const res = await rehostRemoteImage(client, "https://site-client.fr/logo.png", { entrepriseId: 5 });

    expect(res).toMatchObject({ ok: false, error: "colonne inconnue" });
    expect(removed).toHaveLength(1);
    expect(removed[0][0]).toMatch(/^company\//);
  });

  it("n'inscrit rien en base si le stockage refuse l'objet", async () => {
    const { client, inserted } = fakeSupabase({ uploadError: "bucket plein" });
    mockFetchOnce(PNG, { type: "image/png" });

    const res = await rehostRemoteImage(client, "https://site-client.fr/logo.png", { entrepriseId: 5 });

    expect(res).toMatchObject({ ok: false, error: "bucket plein" });
    expect(inserted).toHaveLength(0);
  });
});
