/**
 * Garde-fou de frontière entre `src/env.ts` et ses lecteurs.
 *
 * `env.ts` ne laisse passer que les variables qu'il nomme TROIS fois : dans le
 * schéma zod, dans l'objet passé à `safeParse`, et dans le destructuring
 * d'export. Les lecteurs GA4/Clarity, eux, ne lisent pas `process.env` : ils
 * font `require("@/env")`. Une variable oubliée dans l'une des trois listes est
 * donc invisible pour eux MÊME QUAND VERCEL LA FOURNIT, et l'oubli est
 * silencieux : le radar affiche « non configuré », exactement ce qu'il
 * afficherait si la clé n'existait pas.
 *
 * C'est ce qui s'est produit entre le 15 et le 16 août 2026 : un commit sur le
 * scraper Google Maps (8c358ad) a réécrit `env.ts` et emporté GA4_PROPERTY_ID,
 * GA4_SERVICE_ACCOUNT_KEY et CLARITY_API_TOKEN des trois listes d'un coup.
 * Aucun test ne traversait cette frontière — d'où celui-ci.
 */

import { readFileSync } from "fs";
import { join } from "path";

const REQUISES = {
  SUPABASE_URL: "https://exemple.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "cle-de-service",
  GMAPS_API_TOKEN: "jeton-gmaps",
} as const;

const CLES_RADAR = ["GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_KEY", "CLARITY_API_TOKEN"] as const;

const original = { ...process.env };

/** Recharge `@/env` (et donc ses lecteurs) avec l'environnement courant. */
function rechargerAvec(vars: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = { ...original, ...REQUISES } as NodeJS.ProcessEnv;
  for (const cle of CLES_RADAR) delete process.env[cle];
  for (const [cle, valeur] of Object.entries(vars)) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
}

afterEach(() => {
  process.env = original;
});

describe("env.ts expose les clés du radar à ceux qui les lisent", () => {
  it("getGa4Config() voit GA4_PROPERTY_ID et GA4_SERVICE_ACCOUNT_KEY", () => {
    rechargerAvec({
      GA4_PROPERTY_ID: "123456789",
      GA4_SERVICE_ACCOUNT_KEY: '{"client_email":"radar@exemple.iam.gserviceaccount.com"}',
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGa4Config } = require("@/lib/analytics-radar/ga4-client");

    expect(getGa4Config()).toEqual({
      propertyId: "123456789",
      serviceAccountKey: '{"client_email":"radar@exemple.iam.gserviceaccount.com"}',
    });
  });

  it("getClarityToken() voit CLARITY_API_TOKEN", () => {
    rechargerAvec({ CLARITY_API_TOKEN: "jeton-clarity" });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getClarityToken } = require("@/lib/analytics-radar/clarity-client");

    expect(getClarityToken()).toBe("jeton-clarity");
  });

  it("sans les clés, l'état « non configuré » reste possible", () => {
    rechargerAvec({});

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGa4Config } = require("@/lib/analytics-radar/ga4-client");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getClarityToken } = require("@/lib/analytics-radar/clarity-client");

    expect(getGa4Config()).toBeNull();
    expect(getClarityToken()).toBeNull();
  });

  it("une clé posée à moitié ne passe pas pour une configuration valide", () => {
    rechargerAvec({ GA4_PROPERTY_ID: "123456789" });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getGa4Config } = require("@/lib/analytics-radar/ga4-client");

    expect(getGa4Config()).toBeNull();
  });

  it("chaque clé optionnelle déclarée est réellement exportée", () => {
    rechargerAvec({
      GA4_PROPERTY_ID: "123456789",
      GA4_SERVICE_ACCOUNT_KEY: "{}",
      CLARITY_API_TOKEN: "jeton-clarity",
      PAGESPEED_API_KEY: "cle-pagespeed",
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const env = require("@/env") as Record<string, unknown>;

    // Le destructuring d'export est la troisième liste, celle qu'on oublie :
    // une clé validée par le schéma mais absente d'ici vaut `undefined` chez
    // le lecteur, sans le moindre message.
    expect(env.GA4_PROPERTY_ID).toBe("123456789");
    expect(env.GA4_SERVICE_ACCOUNT_KEY).toBe("{}");
    expect(env.CLARITY_API_TOKEN).toBe("jeton-clarity");
    expect(env.PAGESPEED_API_KEY).toBe("cle-pagespeed");
  });
});

/**
 * Le garde-fou générique, celui qui vaut pour les variables pas encore écrites.
 *
 * Une variable doit figurer dans les trois listes de `env.ts` ; n'en tenir que
 * deux ne produit aucune erreur, ni au build ni au démarrage — juste une
 * fonctionnalité éteinte. On compare donc les trois listes entre elles à la
 * lecture du fichier, pour que l'oubli devienne bruyant quelle que soit la
 * variable concernée.
 */
describe("les trois listes de env.ts nomment exactement les mêmes variables", () => {
  const source = readFileSync(join(__dirname, "..", "env.ts"), "utf8").split("\n");

  /** Noms majuscules d'un bloc délimité, à l'indentation donnée. */
  function noms(debut: string, fin: string, motif: RegExp): string[] {
    const i = source.findIndex((l) => l.startsWith(debut));
    expect(i).toBeGreaterThanOrEqual(0);
    const j = source.findIndex((l, k) => k > i && l.startsWith(fin));
    expect(j).toBeGreaterThan(i);
    return source
      .slice(i + 1, j)
      .map((l) => l.match(motif)?.[1])
      .filter((n): n is string => !!n);
  }

  const schema = noms("const envSchema = z", "  })", /^ {4}([A-Z][A-Z0-9_]*):/);
  const luesDepuisProcessEnv = noms(
    "const envResult = envSchema.safeParse({",
    "});",
    /^ {2}([A-Z][A-Z0-9_]*): process\.env\./,
  );
  const exportees = noms("export const {", "} = envResult.data;", /^ {2}([A-Z][A-Z0-9_]*),/);

  it("le schéma et la lecture de process.env couvrent le même ensemble", () => {
    expect(schema.length).toBeGreaterThan(10); // le découpage tient encore
    expect([...luesDepuisProcessEnv].sort()).toEqual([...schema].sort());
  });

  it("tout ce qui est validé est aussi exporté", () => {
    expect([...exportees].sort()).toEqual([...schema].sort());
  });
});
