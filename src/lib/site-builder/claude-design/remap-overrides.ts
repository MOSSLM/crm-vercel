/**
 * Moves a page's inline `__overrides` from one version of its markup to another.
 *
 * Overrides are keyed by a POSITIONAL path (`"3.1.0:image"` — element-child
 * indices from the page root), so they only stay correct as long as the markup
 * around them does. Two flows need to carry them across a markup swap:
 *
 *   - re-importing a page from an updated ZIP (`import-pages/route.ts`), where
 *     losing the match means losing photos an operator placed by hand;
 *   - copying the images of one template onto a sibling template
 *     (`copy-images/route.ts`) — the Claude export ships several variants whose
 *     bodies are identical, so a slot in "Classique" IS the same slot in "Brut".
 *
 * A slot is located through a ladder of increasingly permissive matchers, so a
 * redesign that renames classes or rewrites copy costs precision, not the whole
 * placement. Each tier records how it matched, and everything below `rank` is
 * reported as `uncertain` so the caller can flag it for review:
 *
 *   path   the same position still holds the same element — exact
 *   rank   same full signature, same occurrence number among its twins
 *   loose  same tag + own classes + id, ignoring the parent and the copy —
 *          survives a class added on a wrapper, which otherwise invalidates
 *          every direct child at once
 *   label  same `.ph-label` description — content identity, survives a full
 *          CSS refactor
 *   asset  same underlying image (the `src` resolved to the bundle-relative
 *          `original_path` of the uploaded asset) — independent of both
 *          structure and copy
 *
 * A target slot is claimed at most once, so two source slots can never collapse
 * onto the same element. Unmatched keys are returned in `dropped`; callers must
 * treat that as "needs a decision", never as "safe to delete".
 *
 * Pure + DOM-free (node-html-parser), so it runs in API routes and unit tests.
 */
import { parse, type HTMLElement } from "node-html-parser";

/** How a slot was located in the target markup, best first. */
export type MatchTier = "path" | "rank" | "loose" | "label" | "asset";

/** Tiers below this one are guesses worth showing to the operator. */
const CONFIDENT_TIERS: ReadonlySet<MatchTier> = new Set<MatchTier>(["path", "rank"]);

export interface RemapResult<T> {
  /** The overrides, re-keyed for the target markup. */
  overrides: Record<string, T>;
  /** Keys whose slot could not be located. NEVER silently discard these. */
  dropped: string[];
  /** Keys placed by a weaker matcher, or whose twin count changed — to review. */
  uncertain: string[];
  /** How each surviving key was matched, for reporting. */
  tierByKey: Record<string, MatchTier>;
}

export interface RemapOptions {
  /** Public image URL → bundle-relative path (`site_builder_assets.original_path`).
   *  Enables the `asset` tier; without it that tier is simply skipped. */
  assetPathByUrl?: Map<string, string>;
}

const ELEMENT_NODE = 1;

function elementChildren(node: HTMLElement): HTMLElement[] {
  return node.childNodes.filter((c) => c.nodeType === ELEMENT_NODE) as HTMLElement[];
}

/** Classes that carry no location meaning: theme variants and state flags.
 *  Mirrors `meaningfulClasses` in collect-image-placeholders.ts. */
function structuralClasses(el: HTMLElement): string[] {
  return (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => c !== "has-img" && !c.startsWith("ph--") && !c.startsWith("is-"))
    .sort();
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function labelOf(el: HTMLElement): string {
  const label = el.querySelector(".ph-label");
  return label ? collapse(label.text) : "";
}

/** Tag + own classes + id — no parent, no copy. */
function looseSignature(el: HTMLElement): string {
  return [
    el.tagName?.toLowerCase() ?? "",
    structuralClasses(el).join(" "),
    el.getAttribute("id") ?? "",
  ].join("|");
}

/** The loose signature plus everything that pins the element down: its copy,
 *  its service tag and its parent's shape. */
function strictSignature(el: HTMLElement): string {
  const parent = el.parentNode as HTMLElement | null;
  return [
    looseSignature(el),
    collapse(el.getAttribute("alt") ?? ""),
    el.getAttribute("data-svc") ?? el.getAttribute("data-service-tag") ?? "",
    labelOf(el),
    parent ? `${parent.tagName?.toLowerCase() ?? ""}.${structuralClasses(parent).join(" ")}` : "",
  ].join("|");
}

/** The image this element points at, as a bundle-relative path. Each template
 *  uploads its own copy of the same picture, so the URL differs between two
 *  designs while `original_path` ("images/hero.jpg") does not. */
function assetSignature(el: HTMLElement, assetPathByUrl?: Map<string, string>): string {
  if (!assetPathByUrl || assetPathByUrl.size === 0) return "";
  const src = el.getAttribute("src");
  if (!src) return "";
  const original = assetPathByUrl.get(src);
  return original ? `${el.tagName?.toLowerCase() ?? ""}|${original}` : "";
}

interface DocIndex {
  /** dotted path → its signatures, one per tier that applies. */
  sigsByPath: Map<string, Partial<Record<MatchTier, string>>>;
  /** tier → signature → dotted paths, in document order. */
  pathsBySig: Record<MatchTier, Map<string, string[]>>;
  /** dotted path → document order, so source slots resolve front to back. */
  orderByPath: Map<string, number>;
}

const FALLBACK_TIERS: MatchTier[] = ["rank", "loose", "label", "asset"];

function emptyPathsBySig(): Record<MatchTier, Map<string, string[]>> {
  return {
    path: new Map(),
    rank: new Map(),
    loose: new Map(),
    label: new Map(),
    asset: new Map(),
  };
}

/** Walks every element of a page body once, indexing it for every tier. */
function indexDocument(html: string, assetPathByUrl?: Map<string, string>): DocIndex {
  const sigsByPath = new Map<string, Partial<Record<MatchTier, string>>>();
  const pathsBySig = emptyPathsBySig();
  const orderByPath = new Map<string, number>();
  const root = parse(html) as unknown as HTMLElement;
  let order = 0;

  const add = (tier: MatchTier, sig: string, path: string): void => {
    const list = pathsBySig[tier].get(sig);
    if (list) list.push(path);
    else pathsBySig[tier].set(sig, [path]);
  };

  const walk = (node: HTMLElement, path: number[]): void => {
    const kids = elementChildren(node);
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      const childPath = [...path, i];
      const key = childPath.join(".");
      orderByPath.set(key, order++);

      const strict = strictSignature(child);
      const loose = looseSignature(child);
      const label = labelOf(child);
      const asset = assetSignature(child, assetPathByUrl);
      const sigs: Partial<Record<MatchTier, string>> = { path: strict, rank: strict, loose };
      add("rank", strict, key);
      add("loose", loose, key);
      if (label) { sigs.label = `${child.tagName?.toLowerCase() ?? ""}|${label}`; add("label", sigs.label, key); }
      if (asset) { sigs.asset = asset; add("asset", asset, key); }
      sigsByPath.set(key, sigs);

      walk(child, childPath);
    }
  };
  walk(root, []);

  return { sigsByPath, pathsBySig, orderByPath };
}

/** Splits `"3.1.0:image"` into its path and kind. */
export function splitOverrideKey(key: string): { path: string; kind: string } {
  const i = key.lastIndexOf(":");
  return i < 0 ? { path: key, kind: "" } : { path: key.slice(0, i), kind: key.slice(i + 1) };
}

interface Resolution {
  path: string;
  tier: MatchTier;
  confident: boolean;
}

/**
 * Re-keys `overrides` (written against `fromHtml`) so they apply to `toHtml`.
 * Entries are carried over untouched — only their path changes.
 */
export function remapOverrides<T>(
  fromHtml: string,
  toHtml: string,
  overrides: Record<string, T>,
  opts: RemapOptions = {},
): RemapResult<T> {
  const keys = Object.keys(overrides ?? {});
  if (keys.length === 0) return { overrides: {}, dropped: [], uncertain: [], tierByKey: {} };

  const from = indexDocument(fromHtml, opts.assetPathByUrl);
  const to = indexDocument(toHtml, opts.assetPathByUrl);

  // Resolve front to back in the SOURCE document, so when two slots compete for
  // the same target the earlier one wins — the stable, predictable outcome.
  const paths = [...new Set(keys.map((k) => splitOverrideKey(k).path))].sort(
    (a, b) => (from.orderByPath.get(a) ?? 0) - (from.orderByPath.get(b) ?? 0),
  );

  const claimed = new Set<string>();
  const resolved = new Map<string, Resolution | null>();

  for (const path of paths) {
    const sigs = from.sigsByPath.get(path);
    if (!sigs) { resolved.set(path, null); continue; }

    // (1) The same position still holds the same element.
    if (!claimed.has(path) && to.sigsByPath.get(path)?.path === sigs.path) {
      claimed.add(path);
      resolved.set(path, { path, tier: "path", confident: true });
      continue;
    }

    // (2…5) Same element identity at this tier, matched on occurrence number.
    let found: Resolution | null = null;
    for (const tier of FALLBACK_TIERS) {
      const sig = sigs[tier];
      if (!sig) continue;
      const sourceTwins = from.pathsBySig[tier].get(sig) ?? [];
      const targetTwins = to.pathsBySig[tier].get(sig) ?? [];
      if (targetTwins.length === 0) continue;

      const rank = sourceTwins.indexOf(path);
      const preferred = rank >= 0 ? targetTwins[rank] : undefined;
      const pick = preferred && !claimed.has(preferred)
        ? preferred
        : targetTwins.find((p) => !claimed.has(p));
      if (!pick) continue;

      // A twin added or removed shifts every following slot by one: the match is
      // plausible but must be eyeballed.
      const sameShape = sourceTwins.length === targetTwins.length && pick === preferred;
      claimed.add(pick);
      found = { path: pick, tier, confident: CONFIDENT_TIERS.has(tier) && sameShape };
      break;
    }
    resolved.set(path, found);
  }

  const out: Record<string, T> = {};
  const dropped: string[] = [];
  const uncertain: string[] = [];
  const tierByKey: Record<string, MatchTier> = {};
  for (const key of keys) {
    const { path, kind } = splitOverrideKey(key);
    const hit = resolved.get(path);
    if (!hit) { dropped.push(key); continue; }
    const nextKey = kind ? `${hit.path}:${kind}` : hit.path;
    out[nextKey] = overrides[key];
    tierByKey[nextKey] = hit.tier;
    if (!hit.confident) uncertain.push(nextKey);
  }
  return { overrides: out, dropped, uncertain, tierByKey };
}
