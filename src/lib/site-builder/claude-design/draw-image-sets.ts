/**
 * Draws the photos of an auto-filled zone (see auto-image-zones.ts) from the
 * media library, for one company's trades.
 *
 * What lands on the slot is an `:image_set` — a list of tagged candidates of
 * which the renderer keeps exactly ONE, the best match for the company being
 * displayed (see image-set.ts#pickCandidate). That shape is what makes a single
 * draw correct on a template AND on every demo cloned from it: a plumber's site
 * resolves the plumbing candidate, an electrician's the electrical one, without
 * anyone re-picking photos per company.
 *
 * Two rules give the CURRENT company a good-looking band rather than merely a
 * correct one:
 *
 *  1. **Round-robin over its trades.** Slot 1 leads with the company's first
 *     service, slot 2 with the second, and so on, wrapping. A company doing
 *     climatisation + plomberie gets an alternating band, not six air
 *     conditioners. `pickCandidate` breaks a score tie on ORDER, so leading a
 *     slot's list with the trade we want for that slot is what selects it.
 *  2. **No repeats.** A photo that has been drawn is never drawn again in the
 *     band. Trade pools OVERLAP — a photo tagged "climatisation" AND
 *     "ventilation" belongs to both — so the ledger has to be kept across trades
 *     (see `createChooser`), not per trade: counting per trade is what used to
 *     put the same photo on two slots of a two-trade company. A pool too small
 *     to cover its slots wraps around and is reported, rather than silently
 *     repeating.
 *
 * Every other trade still gets a candidate in each set, so a company that is not
 * the one drawn for is served too — that is the whole point of a set, and those
 * candidates avoid repeating down the band as well. The universal ("all") images
 * close the list as the last resort.
 *
 * An operator who does not like a photo can swap it (`redrawSlot`) or pick one
 * by hand from the library (`chooseSlotImage`); both rebuild a whole set, so a
 * hand-edited slot still serves every other company.
 *
 * Pure + side-effect free; the shuffle takes its randomness as an argument so
 * the tests are deterministic and a "re-draw" is just a new seed.
 */
import { serviceTagKey } from "@/utils/serviceTags";
import { MEDIA_LIBRARY_UNIVERSAL_TAG } from "@/types";
import type { ImageSetCandidate } from "./image-set";

export interface LibraryImage {
  id: string;
  url: string;
  /** The library item's own `service_tags` (may contain the universal tag). */
  tags: string[];
  alt?: string;
}

export interface DrawInput {
  /** How many slots the zone has (6 for the réalisations band). */
  slotCount: number;
  /** The company's service tags, in the order they should alternate. */
  companyTags: string[];
  /** Library items to draw from — already filtered to the relevant tags. */
  library: LibraryImage[];
  /** `[0,1)` source; pass a seeded generator for reproducible draws. */
  random?: () => number;
}

export interface DrawnSlot {
  /** Candidates for this slot, ordered — index 0 is what the drawn company gets. */
  candidates: ImageSetCandidate[];
  /** The library item the CURRENT company will see, for the panel's preview. */
  chosen: LibraryImage | null;
  /** Which trade this slot leads with (canonical key), or null when the company
   *  has no tag at all and the slot falls back to universal images. */
  leadTag: string | null;
}

export interface PoolReport {
  /** Canonical tag key. */
  tag: string;
  /** Label as written on the library items / the company. */
  label: string;
  /** How many library images carry this tag. */
  available: number;
  /** How many distinct photos this draw needs from that tag. */
  needed: number;
}

export interface DrawResult {
  slots: DrawnSlot[];
  /** Per-trade stock vs need — drives the "importe encore des photos" warning. */
  pools: PoolReport[];
  /** Trades of the company with NO image at all in the library. */
  emptyTags: string[];
}

/** Fisher-Yates, on a copy. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function isUniversal(img: LibraryImage): boolean {
  if (!img.tags || img.tags.length === 0) return true;
  return img.tags.map(serviceTagKey).includes(MEDIA_LIBRARY_UNIVERSAL_TAG);
}

/** Library items per canonical tag key. An image tagged for two trades sits in
 *  BOTH pools — it is a real photo of both jobs. Which is why the draw cannot
 *  count per pool: only a ledger kept across trades (`createChooser`) knows the
 *  photo has already been placed. */
function poolsByTag(library: readonly LibraryImage[]): Map<string, LibraryImage[]> {
  const pools = new Map<string, LibraryImage[]>();
  for (const img of library) {
    if (!img.url) continue;
    for (const raw of img.tags ?? []) {
      const key = serviceTagKey(raw);
      if (!key || key === MEDIA_LIBRARY_UNIVERSAL_TAG) continue;
      const pool = pools.get(key);
      if (pool) pool.push(img);
      else pools.set(key, [img]);
    }
  }
  return pools;
}

function toCandidate(img: LibraryImage, tags: string[], fallbackAlt: string): ImageSetCandidate {
  return { url: img.url, tags, alt: img.alt?.trim() || fallbackAlt || undefined };
}

/** Everything a draw derives from its inputs before touching a single slot.
 *  Shared by the full draw and the single-slot redraw so both compose a set the
 *  same way — a slot rebuilt on its own must stay indistinguishable from one the
 *  full draw produced. */
interface DrawContext {
  /** Canonical key → the label as the company writes it. */
  labelByKey: Map<string, string>;
  /** The company's trades that the library can actually serve, in order. */
  usable: string[];
  /** Canonical key → that trade's pool, already shuffled for this draw. */
  shuffled: Map<string, LibraryImage[]>;
  universals: LibraryImage[];
  emptyTags: string[];
  pools: Map<string, LibraryImage[]>;
  tagKeys: string[];
}

function buildContext(input: DrawInput): DrawContext {
  const random = input.random ?? Math.random;

  // Company trades, deduped by canonical key and keeping their written label.
  const labelByKey = new Map<string, string>();
  for (const raw of input.companyTags) {
    const key = serviceTagKey(raw);
    if (key && key !== MEDIA_LIBRARY_UNIVERSAL_TAG && !labelByKey.has(key)) labelByKey.set(key, raw);
  }
  const tagKeys = [...labelByKey.keys()];

  const pools = poolsByTag(input.library);
  // Shuffle each pool ONCE per draw: successive slots on the same trade then
  // walk distinct photos, and a re-draw reshuffles everything.
  const shuffled = new Map<string, LibraryImage[]>();
  for (const [key, pool] of pools) shuffled.set(key, shuffle(pool, random));
  const universals = shuffle(input.library.filter(isUniversal), random);

  const usable = tagKeys.filter((k) => (shuffled.get(k)?.length ?? 0) > 0);
  const emptyTags = tagKeys.filter((k) => (shuffled.get(k)?.length ?? 0) === 0).map((k) => labelByKey.get(k)!);

  return { labelByKey, usable, shuffled, universals, emptyTags, pools, tagKeys };
}

/** The trade slot `i` leads with — the round-robin that alternates the company's
 *  services down the band. */
function leadTagFor(ctx: DrawContext, slotIndex: number): string | null {
  return ctx.usable.length > 0 ? ctx.usable[slotIndex % ctx.usable.length] : null;
}

interface SlotBuild {
  slotIndex: number;
  leadTag: string | null;
  leadImage: LibraryImage | null;
  /** Tags written on the lead candidate. Defaults to the lead trade's label —
   *  `chooseSlotImage` passes several, so a hand-picked photo outscores (and
   *  never merely ties with) the candidates that follow it. */
  leadTags?: string[];
  fallbackAlt: string;
  imageForTag: (key: string) => LibraryImage;
}

/**
 * Assembles one slot's candidate list around an already-chosen lead image.
 *
 * Order is the whole mechanism: `pickCandidate` breaks a score tie on position,
 * so the lead trade's image comes first and is what the company sees. The other
 * trades follow — that is what lets the same set serve a company this draw was
 * not made for — and the universal images close the list.
 */
function assembleSlot(ctx: DrawContext, build: SlotBuild): DrawnSlot {
  const { slotIndex, leadTag, leadImage, leadTags, fallbackAlt, imageForTag } = build;
  const candidates: ImageSetCandidate[] = [];
  let chosen: LibraryImage | null = null;

  const order = leadTag ? [leadTag, ...ctx.usable.filter((k) => k !== leadTag)] : [];
  for (const key of order) {
    const isLead = key === leadTag;
    const img = isLead && leadImage ? leadImage : imageForTag(key);
    if (isLead) chosen = img;
    const tags = isLead && leadTags ? leadTags : [ctx.labelByKey.get(key)!];
    candidates.push(toCandidate(img, tags, fallbackAlt));
  }

  // A hand-picked photo carrying none of the company's trades still opens the
  // list: nothing in the loop above would have put it there.
  if (!leadTag && leadImage) {
    chosen = leadImage;
    candidates.push(toCandidate(leadImage, leadTags ?? [MEDIA_LIBRARY_UNIVERSAL_TAG], fallbackAlt));
  }

  for (const [key, pool] of ctx.shuffled) {
    if (ctx.labelByKey.has(key)) continue;
    candidates.push(toCandidate(pool[slotIndex % pool.length], [key], fallbackAlt));
  }

  if (ctx.universals.length > 0) {
    const img = ctx.universals[slotIndex % ctx.universals.length];
    candidates.push(toCandidate(img, [MEDIA_LIBRARY_UNIVERSAL_TAG], fallbackAlt));
    if (!chosen) chosen = img;
  }

  return { candidates, chosen, leadTag };
}

/**
 * Hands out the photos of a draw, slot after slot, so none is placed twice.
 *
 * Trade pools overlap: a photo tagged "climatisation" AND "ventilation" is in
 * both, and a per-trade cursor cannot see that the other trade already took it —
 * which is exactly how the same photo used to show up two or three times in a
 * six-photo band. The chooser keeps the ledgers a cursor cannot:
 *
 *  - `used` — every photo the DRAWN company already shows, all trades together.
 *    That is the band on screen, so this rule is the last one ever relaxed.
 *  - `servedByTag` — per trade, what that trade already served down the band
 *    (as a lead or as a fallback), so a company the design is merely CLONED for
 *    gets a repeat-free band too.
 *  - `inSlot` — what the current set already lists, so one slot never offers the
 *    same photo under two trades.
 *
 * When a pool runs dry these are dropped last-first and, as a last resort, the
 * pool wraps: a repeat beats a hole, and `pools` reports the shortage so the
 * operator knows to import more photos.
 */
function createChooser(ctx: DrawContext) {
  const used = new Set<string>();
  const servedByTag = new Map<string, Set<string>>();
  const wrapped = new Map<string, number>();
  let inSlot = new Set<string>();

  const servedBy = (key: string): Set<string> => {
    let seen = servedByTag.get(key);
    if (!seen) servedByTag.set(key, (seen = new Set<string>()));
    return seen;
  };

  /** First photo of `key`'s pool clearing every rule; then every rule but the
   *  last, and so on — the leading rules are the ones worth keeping. */
  const from = (key: string, rules: Array<(img: LibraryImage) => boolean>): LibraryImage => {
    const pool = ctx.shuffled.get(key)!;
    for (let kept = rules.length; kept > 0; kept--) {
      const hit = pool.find((img) => rules.slice(0, kept).every((rule) => rule(img)));
      if (hit) return hit;
    }
    const n = wrapped.get(key) ?? 0;
    wrapped.set(key, n + 1);
    return pool[n % pool.length];
  };

  const record = (key: string, img: LibraryImage): LibraryImage => {
    servedBy(key).add(img.url);
    inSlot.add(img.url);
    return img;
  };

  return {
    /** Opens a slot: its candidate list starts empty. */
    startSlot(): void {
      inSlot = new Set<string>();
    },
    /** The photo the drawn company sees on this slot. */
    lead(key: string): LibraryImage {
      const seen = servedBy(key);
      const img = from(key, [(i) => !used.has(i.url), (i) => !seen.has(i.url)]);
      used.add(img.url);
      return record(key, img);
    },
    /** The photo this slot offers a company whose trade is `key` — not what the
     *  drawn company sees, but it must not repeat down the band either. */
    fallback(key: string): LibraryImage {
      const seen = servedBy(key);
      const img = from(key, [(i) => !seen.has(i.url), (i) => !inSlot.has(i.url)]);
      return record(key, img);
    },
  };
}

/**
 * Builds one `:image_set` worth of candidates per slot.
 *
 * `altBySlot` supplies the export's own alt text as a fallback, so a library
 * item with no description does not leave the slot without one.
 */
export function drawImageSets(input: DrawInput, altBySlot: readonly string[] = []): DrawResult {
  const slotCount = Math.max(0, Math.floor(input.slotCount));
  if (slotCount === 0) return { slots: [], pools: [], emptyTags: [] };

  const ctx = buildContext(input);
  const { labelByKey, usable, pools, tagKeys, emptyTags } = ctx;

  // One ledger for the whole band — see createChooser: counting per trade would
  // hand the same photo out again as soon as it carries two of the tags.
  const chooser = createChooser(ctx);
  const slots: DrawnSlot[] = [];

  for (let i = 0; i < slotCount; i++) {
    chooser.startSlot();
    const leadTag = leadTagFor(ctx, i);
    slots.push(assembleSlot(ctx, {
      slotIndex: i,
      leadTag,
      leadImage: leadTag ? chooser.lead(leadTag) : null,
      fallbackAlt: altBySlot[i] ?? "",
      imageForTag: (key) => chooser.fallback(key),
    }));
  }

  // How many distinct photos each trade owes: its slots under the round-robin.
  const poolReport: PoolReport[] = tagKeys.map((key) => ({
    tag: key,
    label: labelByKey.get(key)!,
    available: pools.get(key)?.length ?? 0,
    needed: usable.length === 0 ? 0 : usable.includes(key)
      ? Math.ceil((slotCount - usable.indexOf(key)) / usable.length)
      : 0,
  }));

  return { slots, pools: poolReport, emptyTags };
}

export interface RedrawInput extends DrawInput {
  /** 0-based index of the only slot to rebuild. */
  slotIndex: number;
  /** Photos the OTHER slots currently show — the new one avoids them, so
   *  swapping one image never creates a duplicate in the band. */
  usedUrls?: readonly string[];
  /** What this slot shows right now: the redraw must land on something else,
   *  otherwise the button would visibly do nothing. */
  currentUrl?: string;
  /** The trade the slot shows right now. Defaults to its round-robin trade,
   *  which is the same thing — until the operator picked a photo of ANOTHER
   *  trade by hand, and re-rolling must then stay on the trade he chose rather
   *  than silently undo it. Ignored when the library cannot serve it. */
  leadTag?: string;
}

/**
 * Rebuilds a SINGLE slot, leaving the rest of the band alone — the operator
 * likes the selection but wants one photo swapped.
 *
 * The slot keeps the trade it shows (`leadTag`, its round-robin trade by
 * default): the alternation of the company's services down the band is what
 * makes it readable, and re-rolling one image should not collapse it — nor undo
 * a trade the operator chose by hand. Only the photo changes, drawn from that
 * trade's pool minus what the other slots already show.
 *
 * Returns `null` when nothing else is available (a one-photo pool), so the
 * caller can say so instead of writing an identical set.
 */
export function redrawSlot(input: RedrawInput, fallbackAlt = ""): DrawnSlot | null {
  const ctx = buildContext(input);
  const kept = input.leadTag ? serviceTagKey(input.leadTag) : "";
  const leadTag = kept && ctx.usable.includes(kept) ? kept : leadTagFor(ctx, input.slotIndex);
  if (!leadTag) {
    // No trade the library can serve: the slot only ever held a universal
    // image, and there is no alternative to offer.
    return null;
  }

  const pool = ctx.shuffled.get(leadTag)!;
  const used = new Set(input.usedUrls ?? []);
  // Already shuffled, so "the first acceptable one" IS the random pick.
  const fresh =
    pool.find((img) => img.url !== input.currentUrl && !used.has(img.url)) ??
    // Pool exhausted by the other slots: settle for anything but the current
    // photo — a visible change matters more than avoiding a repeat here.
    pool.find((img) => img.url !== input.currentUrl);
  if (!fresh) return null;

  return assembleSlot(ctx, {
    slotIndex: input.slotIndex,
    leadTag,
    leadImage: fresh,
    fallbackAlt,
    imageForTag: (key) => slotPhotoOf(ctx, key, input.slotIndex),
  });
}

export interface ChooseInput extends DrawInput {
  /** 0-based index of the slot the operator is editing. */
  slotIndex: number;
  /** Public url of the library photo they picked. */
  url: string;
}

/**
 * Rebuilds a SINGLE slot around a photo the operator picked BY HAND, rather than
 * one the draw chose. The band's other slots are untouched.
 *
 * The set is rebuilt whole — same shape as a drawn slot — so the design keeps
 * serving every other company: the picked photo opens the list, the company's
 * other trades follow, then the universal images.
 *
 * The lead candidate carries every trade of the company the photo actually
 * documents, so it beats the rest on score instead of merely tying on order. A
 * photo that documents NONE of them (a generic shot the operator wants there
 * anyway) is pinned with the company's own trades: it then wins for THIS company
 * and only for it, and any other company still resolves to its own candidate.
 *
 * Returns `null` when the url is not in the library it was given — the caller
 * says so rather than writing a set pointing nowhere.
 */
export function chooseSlotImage(input: ChooseInput, fallbackAlt = ""): DrawnSlot | null {
  const url = input.url?.trim();
  if (!url) return null;
  const picked = input.library.find((img) => img.url === url);
  if (!picked) return null;

  const ctx = buildContext(input);
  const own = new Set((picked.tags ?? []).map(serviceTagKey).filter(Boolean));
  const documented = ctx.tagKeys.filter((key) => own.has(key));
  const leadKeys = documented.length > 0 ? documented : ctx.tagKeys;

  return assembleSlot(ctx, {
    slotIndex: input.slotIndex,
    leadTag: leadKeys[0] ?? null,
    leadImage: picked,
    leadTags: leadKeys.map((key) => ctx.labelByKey.get(key)!),
    fallbackAlt,
    imageForTag: (key) => slotPhotoOf(ctx, key, input.slotIndex),
  });
}

/** The photo trade `key` offers on slot `slotIndex` when a single slot is
 *  rebuilt: the full draw's ledgers are gone, so the slot index alone spreads
 *  the pool — the same rule `assembleSlot` uses for the non-company trades. */
function slotPhotoOf(ctx: DrawContext, key: string, slotIndex: number): LibraryImage {
  const pool = ctx.shuffled.get(key)!;
  return pool[slotIndex % pool.length];
}

/**
 * A `[0,1)` generator seeded by an integer (mulberry32), so a draw can be
 * replayed from its seed — the API stores nothing, it just echoes the seed back
 * and the panel can show the same result twice.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
