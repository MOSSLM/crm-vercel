import { companiesApi, statisticsApi } from './api';

jest.mock('./supabase/client', () => {
  const from = jest.fn();
  return {
    __esModule: true,
    supabase: { from },
    createClient: jest.fn(),
    default: { from },
  };
});

describe('companiesApi.update', () => {
  it('converts enum values before updating', async () => {
    const { supabase } = await import('./supabase/client');
    const fromMock = supabase.from as jest.Mock;

    const updateMock = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
        }),
      }),
    });

    fromMock.mockReturnValue({ update: updateMock });

    await companiesApi.update(1, {
      ca_estime_band: '500k-1m',
      nb_employes_band: '1-10',
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ca_estime_band: '500k_1m',
        nb_employes_band: '1_10',
      })
    );
  });
});

describe('statisticsApi.getKeywordStats', () => {
  it('reduces keyword stats correctly', async () => {
    const { supabase } = await import('./supabase/client');
    const fromMock = supabase.from as jest.Mock;

    fromMock.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data: [
          { keyword: 'restaurant', nb_trouves: 3 },
          { keyword: 'restaurant', nb_trouves: 2 },
          { keyword: 'coiffeur', nb_trouves: 1 },
        ],
        error: null,
      }),
    });

    const result = await statisticsApi.getKeywordStats();
    expect(result).toEqual({ restaurant: 5, coiffeur: 1 });
  });

  it('returns fallback data on error', async () => {
    const { supabase } = await import('./supabase/client');
    const fromMock = supabase.from as jest.Mock;

    fromMock.mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: null, error: new Error('fail') }),
    });

    const result = await statisticsApi.getKeywordStats();
    expect(result).toEqual({ restaurant: 5, coiffeur: 5 });
  });
});

describe('statisticsApi.getLocationStats', () => {
  it('reduces location stats correctly', async () => {
    const { supabase } = await import('./supabase/client');
    const fromMock = supabase.from as jest.Mock;

    fromMock.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        data: [
          { location: 'Paris', nb_trouves: 2 },
          { location: 'Paris', nb_trouves: 3 },
          { location: 'Lyon', nb_trouves: 1 },
        ],
        error: null,
      }),
    });

    const result = await statisticsApi.getLocationStats();
    expect(result).toEqual({ Paris: 5, Lyon: 1 });
  });

  it('returns fallback data on error', async () => {
    const { supabase } = await import('./supabase/client');
    const fromMock = supabase.from as jest.Mock;

    fromMock.mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: null, error: new Error('fail') }),
    });

    const result = await statisticsApi.getLocationStats();
    expect(result).toEqual({ Paris: 5, Lyon: 5 });
  });
});
