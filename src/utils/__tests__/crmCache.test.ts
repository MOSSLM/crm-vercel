import { clearCrmCache, loadCrmCache, saveCrmCache } from '../crmCache';
import { CACHE_KEY, CACHE_TTL_MS } from '../constants';

const USER = 'user-1';
const OTHER_USER = 'user-2';

const FRESH_DATA = {
  opportunities: [],
  pipelines: [],
  pipelineStages: [],
  offers: [],
};

const entry = (overrides: Record<string, unknown> = {}) => ({
  ...FRESH_DATA,
  cached_at: Date.now(),
  user_id: USER,
  ...overrides,
});

describe('loadCrmCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when localStorage is empty', () => {
    expect(loadCrmCache(USER)).toBeNull();
  });

  it('returns data when cached_at is within TTL', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry({ cached_at: Date.now() - 5 * 60 * 1000 })));
    expect(loadCrmCache(USER)).not.toBeNull();
  });

  it('returns null when cached_at is older than TTL', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry({ cached_at: Date.now() - (CACHE_TTL_MS + 1000) })));
    expect(loadCrmCache(USER)).toBeNull();
  });

  it('returns null when cached_at field is missing', () => {
    const { ...noTimestamp } = entry();
    delete (noTimestamp as Record<string, unknown>).cached_at;
    localStorage.setItem(CACHE_KEY, JSON.stringify(noTimestamp));
    expect(loadCrmCache(USER)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem(CACHE_KEY, 'not-valid-json{{');
    expect(loadCrmCache(USER)).toBeNull();
  });

  it('refuses an entry cached by another user', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry({ user_id: OTHER_USER })));
    expect(loadCrmCache(USER)).toBeNull();
  });

  it('refuses a legacy entry with no owner', () => {
    const { ...legacy } = entry();
    delete (legacy as Record<string, unknown>).user_id;
    localStorage.setItem(CACHE_KEY, JSON.stringify(legacy));
    expect(loadCrmCache(USER)).toBeNull();
  });

  it('returns null when there is no signed-in user', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry()));
    expect(loadCrmCache(null)).toBeNull();
    expect(loadCrmCache(undefined)).toBeNull();
  });
});

describe('saveCrmCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes cached_at as a recent timestamp and stamps the owner', () => {
    const before = Date.now();
    saveCrmCache(USER, FRESH_DATA);
    const after = Date.now();

    const raw = localStorage.getItem(CACHE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.cached_at).toBeGreaterThanOrEqual(before);
    expect(parsed.cached_at).toBeLessThanOrEqual(after);
    expect(parsed.user_id).toBe(USER);
  });

  it('saved data is immediately loadable by its owner', () => {
    saveCrmCache(USER, FRESH_DATA);
    expect(loadCrmCache(USER)).not.toBeNull();
  });

  it('saved data is not loadable by anyone else', () => {
    saveCrmCache(USER, FRESH_DATA);
    expect(loadCrmCache(OTHER_USER)).toBeNull();
  });

  it('writes nothing when there is no signed-in user', () => {
    saveCrmCache(null, FRESH_DATA);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe('clearCrmCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes a cached entry', () => {
    saveCrmCache(USER, FRESH_DATA);
    clearCrmCache();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(loadCrmCache(USER)).toBeNull();
  });

  it('is a no-op when nothing is cached', () => {
    expect(() => clearCrmCache()).not.toThrow();
  });
});
