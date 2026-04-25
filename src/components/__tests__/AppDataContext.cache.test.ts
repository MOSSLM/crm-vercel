import { loadCachedData, saveCachedData } from '../AppDataContext';
import { CACHE_KEY, CACHE_TTL_MS } from '../../utils/constants';

const FRESH_DATA = {
  opportunities: [],
  pipelines: [],
  pipelineStages: [],
  offers: [],
};

describe('loadCachedData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when localStorage is empty', () => {
    expect(loadCachedData()).toBeNull();
  });

  it('returns data when cached_at is within TTL', () => {
    const freshEntry = { ...FRESH_DATA, cached_at: Date.now() - 5 * 60 * 1000 }; // 5 min ago
    localStorage.setItem(CACHE_KEY, JSON.stringify(freshEntry));
    expect(loadCachedData()).not.toBeNull();
  });

  it('returns null when cached_at is older than TTL', () => {
    const staleEntry = { ...FRESH_DATA, cached_at: Date.now() - (CACHE_TTL_MS + 1000) };
    localStorage.setItem(CACHE_KEY, JSON.stringify(staleEntry));
    expect(loadCachedData()).toBeNull();
  });

  it('returns null when cached_at field is missing', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(FRESH_DATA)); // no cached_at
    expect(loadCachedData()).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem(CACHE_KEY, 'not-valid-json{{');
    expect(loadCachedData()).toBeNull();
  });
});

describe('saveCachedData', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes cached_at as a recent timestamp', () => {
    const before = Date.now();
    saveCachedData(FRESH_DATA);
    const after = Date.now();

    const raw = localStorage.getItem(CACHE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.cached_at).toBeGreaterThanOrEqual(before);
    expect(parsed.cached_at).toBeLessThanOrEqual(after);
  });

  it('saved data is immediately loadable', () => {
    saveCachedData(FRESH_DATA);
    expect(loadCachedData()).not.toBeNull();
  });
});
