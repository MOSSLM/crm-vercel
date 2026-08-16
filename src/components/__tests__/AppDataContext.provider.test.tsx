import React, { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { CACHE_KEY } from '../../utils/constants';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockUseAuth = jest.fn();
jest.mock('../AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};
jest.mock('sonner', () => ({ toast: mockToast }));

const mockSearchResultsGetAll = jest.fn();
const mockCompaniesGetPerimetre = jest.fn();
const mockOpportunitiesGetAll = jest.fn();
const mockPipelinesGetAll = jest.fn();
const mockOffersGetAll = jest.fn();
const mockPipelineStagesGetAll = jest.fn();
const mockAchievementsGetAll = jest.fn();
const mockKeywordStats = jest.fn();
const mockLocationStats = jest.fn();
const mockNetworksGetAll = jest.fn();
const mockBlacklistGetAll = jest.fn();
const mockGetManyByCompanyIds = jest.fn();

jest.mock('../../utils/api', () => ({
  searchResultsApi: { getAll: (...a: unknown[]) => mockSearchResultsGetAll(...a) },
  companiesApi: {
    getPerimetreActif: (...a: unknown[]) => mockCompaniesGetPerimetre(...a),
  },
  contactsApi: {
    getManyByCompanyIds: (...a: unknown[]) => mockGetManyByCompanyIds(...a),
  },
  opportunitiesApi: { getAll: (...a: unknown[]) => mockOpportunitiesGetAll(...a) },
  offersApi: { getAll: (...a: unknown[]) => mockOffersGetAll(...a) },
  pipelinesApi: { getAll: (...a: unknown[]) => mockPipelinesGetAll(...a) },
  pipelineStagesApi: { getAll: (...a: unknown[]) => mockPipelineStagesGetAll(...a) },
  notesApi: {},
  achievementsApi: { getAll: (...a: unknown[]) => mockAchievementsGetAll(...a) },
  statisticsApi: {
    getKeywordStats: (...a: unknown[]) => mockKeywordStats(...a),
    getLocationStats: (...a: unknown[]) => mockLocationStats(...a),
  },
  networksApi: { getAll: (...a: unknown[]) => mockNetworksGetAll(...a) },
  urlBlacklistApi: { getAll: (...a: unknown[]) => mockBlacklistGetAll(...a) },
  canonicalizeDomain: (s: string) => s,
  isSearchResultRow: (r: unknown) => !!r,
  isOpportunityRow: (r: unknown) => !!r,
  isAchievementRow: (r: unknown) => !!r,
  isOpportunityNoteRow: (r: unknown) => !!r,
  isFullStageRow: (r: unknown) => !!r,
}));

jest.mock('../../utils/displayHelpers', () => ({
  getCompanyDisplayName: (c: { name?: string }) => c?.name ?? '',
  extractDomainNameOnly: (s: string) => s,
  extractDomainFromUrl: (s: string) => s,
  canonicalizeUrl: (s: string) => s,
}));

jest.mock('../../utils/journalApi', () => ({
  journalApi: {
    getJournalKpiTotals: jest.fn(),
  },
}));

// Now import the provider AFTER the mocks are registered.
import { AppDataProvider, useAppData } from '../AppDataContext';
import { COMPTEURS_VIDES } from '@/lib/entreprises/colonnes';

// ── Helpers ────────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppDataProvider>{children}</AppDataProvider>
);

const setAllPrimaryFetchesEmpty = () => {
  mockSearchResultsGetAll.mockResolvedValue([]);
  mockCompaniesGetPerimetre.mockResolvedValue({ entreprises: [], compteurs: COMPTEURS_VIDES });
  mockOpportunitiesGetAll.mockResolvedValue([]);
  mockPipelinesGetAll.mockResolvedValue([]);
  mockOffersGetAll.mockResolvedValue([]);
  mockPipelineStagesGetAll.mockResolvedValue([]);
};

const setAllSecondaryFetchesEmpty = () => {
  mockAchievementsGetAll.mockResolvedValue([]);
  mockKeywordStats.mockResolvedValue({});
  mockLocationStats.mockResolvedValue({});
  mockNetworksGetAll.mockResolvedValue([]);
  mockBlacklistGetAll.mockResolvedValue([]);
  mockGetManyByCompanyIds.mockResolvedValue({});
};

const adminUser = { id: 'u1', email: 'a@b', name: 'Admin', role: 'admin' as const };
const unknownUser = { id: 'u1', email: 'a@b', name: 'X', role: 'unknown' as const };

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AppDataProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    setAllPrimaryFetchesEmpty();
    setAllSecondaryFetchesEmpty();
  });

  describe('gating', () => {
    it('does not call any data API while authLoading is true', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true, user: null });
      renderHook(() => useAppData(), { wrapper });
      // Give React + microtasks a chance to settle.
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockCompaniesGetPerimetre).not.toHaveBeenCalled();
      expect(mockOpportunitiesGetAll).not.toHaveBeenCalled();
    });

    it('does not call any data API when not authenticated', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false, user: null });
      renderHook(() => useAppData(), { wrapper });
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockCompaniesGetPerimetre).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('runs the 6 primary fetches in parallel and ends with loading=false', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: adminUser });
      const { result } = renderHook(() => useAppData(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockSearchResultsGetAll).toHaveBeenCalledTimes(1);
      expect(mockCompaniesGetPerimetre).toHaveBeenCalledTimes(1);
      expect(mockOpportunitiesGetAll).toHaveBeenCalledTimes(1);
      expect(mockPipelinesGetAll).toHaveBeenCalledTimes(1);
      expect(mockOffersGetAll).toHaveBeenCalledTimes(1);
      expect(mockPipelineStagesGetAll).toHaveBeenCalledTimes(1);
    });

    it('populates companies and opportunities from the fetches', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: adminUser });
      mockCompaniesGetPerimetre.mockResolvedValue({
        entreprises: [
          { id: 1, name: 'Acme', created_at: '2026-01-01', canonical_url: 'https://acme.com' },
        ],
        compteurs: { ...COMPTEURS_VIDES, stock_total: 60687, qualifiees: 361 },
      });
      mockOpportunitiesGetAll.mockResolvedValue([
        { id: 'opp-1', name: 'Deal', entreprise_id: 1, stage_id: 1 },
      ]);

      const { result } = renderHook(() => useAppData(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.companies).toHaveLength(1);
      expect(result.current.companies[0].id).toBe(1);
      expect(result.current.opportunities).toHaveLength(1);
      expect(result.current.opportunities[0].id).toBe('opp-1');
    });

    it('tire les compteurs de stock de la base, pas de la longueur du tableau', async () => {
      // Le point de toute la bascule : `companies` ne porte plus que le
      // périmètre actif (~1 100 fiches), donc le stock (~60 000) ne peut plus
      // s'en déduire. Si quelqu'un rebranche `totalCompanies` sur
      // `companies.length`, ce test tombe.
      mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: adminUser });
      mockCompaniesGetPerimetre.mockResolvedValue({
        entreprises: [{ id: 1, name: 'Acme', created_at: '2026-01-01' }],
        compteurs: { ...COMPTEURS_VIDES, stock_total: 60687, qualifiees: 361 },
      });

      const { result } = renderHook(() => useAppData(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.companies).toHaveLength(1);
      expect(result.current.totalCompanies).toBe(60687);
      expect(result.current.totalQualifiedCompanies).toBe(361);
      expect(result.current.compteurs.a_qualifier).toBe(0);
    });

    it('persists primary slices to localStorage for next-load hydration', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: adminUser });
      mockOpportunitiesGetAll.mockResolvedValue([{ id: 'opp-1', name: 'D' }]);
      mockOffersGetAll.mockResolvedValue([{ id: 'offer-1', actif: true }]);

      const { result } = renderHook(() => useAppData(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      const cached = window.localStorage.getItem(CACHE_KEY);
      expect(cached).not.toBeNull();
      const parsed = JSON.parse(cached as string);
      expect(parsed.opportunities).toEqual([{ id: 'opp-1', name: 'D' }]);
      expect(parsed.offers).toHaveLength(1);
      expect(parsed.cached_at).toBeGreaterThan(0);
    });
  });

  describe('per-slice failure (current silent-swallow shape — see review #7-A)', () => {
    it('falls back to [] for the failed slice and keeps other slices populated', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: adminUser });
      mockCompaniesGetPerimetre.mockRejectedValue(new Error('rls denied'));
      mockOpportunitiesGetAll.mockResolvedValue([{ id: 'opp-1', name: 'D' }]);

      const { result } = renderHook(() => useAppData(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Failed slice → empty; other slices → populated
      expect(result.current.companies).toEqual([]);
      expect(result.current.opportunities).toHaveLength(1);
      // Today: no user-facing toast on per-slice failure (this is what #7-A
      // formalizes via per-slice {loading,ok,error} state).
      expect(mockToast.error).not.toHaveBeenCalled();
    });
  });

  describe('role-incomplete warning', () => {
    it('fires toast.warning when user.role === "unknown"', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: unknownUser });
      renderHook(() => useAppData(), { wrapper });
      await waitFor(() => expect(mockToast.warning).toHaveBeenCalledTimes(1));
      expect(mockToast.warning.mock.calls[0][0]).toMatch(/Profil utilisateur incomplet/i);
    });

    it('does not fire the warning for admin/freelance roles', async () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: adminUser });
      renderHook(() => useAppData(), { wrapper });
      // Wait for the data load to complete to confirm no warning fires.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(mockToast.warning).not.toHaveBeenCalled();
    });
  });
});
