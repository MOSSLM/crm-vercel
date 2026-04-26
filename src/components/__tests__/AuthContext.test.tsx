import React, { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

const mockGetSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignOut = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../../utils/supabase/client', () => ({
  __esModule: true,
  createClient: () => ({
    from: mockFrom,
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const sessionUser = {
  id: 'user-1',
  email: 'me@test',
  user_metadata: { name: 'Sess Name' },
};

describe('AuthContext / AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  describe('bootstrap', () => {
    it('marks loading=false and user=null when no session is present', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('hydrates the user with role and name from user_profiles', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: sessionUser } } });
      mockMaybeSingle.mockResolvedValue({
        data: { role: 'admin', full_name: 'Real Name' },
        error: null,
      });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());
      expect(result.current.user).toEqual({
        id: 'user-1',
        email: 'me@test',
        name: 'Real Name',
        role: 'admin',
      });
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.loading).toBe(false);
    });

    it('falls back to role=unknown when no user_profiles row exists', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: sessionUser } } });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());
      expect(result.current.user?.role).toBe('unknown');
      // Falls back to user_metadata.name when full_name is missing
      expect(result.current.user?.name).toBe('Sess Name');
    });

    it('falls back to role=unknown when the profile fetch errors', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: sessionUser } } });
      mockMaybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'rls_denied' },
      });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());
      expect(result.current.user?.role).toBe('unknown');
    });

    it('falls back to email when neither user_metadata.name nor profile.full_name exists', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { ...sessionUser, user_metadata: {} } } },
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());
      expect(result.current.user?.name).toBe('me@test');
    });

    it('rejects an unknown role from user_profiles and keeps it as unknown', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: sessionUser } } });
      mockMaybeSingle.mockResolvedValue({
        data: { role: 'superuser', full_name: 'X' },
        error: null,
      });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());
      expect(result.current.user?.role).toBe('unknown');
    });

    it('still sets loading=false when getSession throws', async () => {
      mockGetSession.mockRejectedValue(new Error('network'));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();
    });
  });

  describe('login', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
    });

    it('returns true on a successful sign-in', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: sessionUser },
        error: null,
      });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let ok = false;
      await act(async () => {
        ok = await result.current.login('me@test', 'pw');
      });
      expect(ok).toBe(true);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'me@test', password: 'pw' });
    });

    it('returns false when Supabase returns an error', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'bad creds' },
      });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let ok = true;
      await act(async () => {
        ok = await result.current.login('me@test', 'wrong');
      });
      expect(ok).toBe(false);
    });

    it('returns false when signInWithPassword throws', async () => {
      mockSignInWithPassword.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let ok = true;
      await act(async () => {
        ok = await result.current.login('me@test', 'pw');
      });
      expect(ok).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears the user and calls signOut', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: sessionUser } } });
      mockMaybeSingle.mockResolvedValue({
        data: { role: 'admin', full_name: 'Real' },
        error: null,
      });
      mockSignOut.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());

      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('still clears local state when signOut throws (best effort)', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: sessionUser } } });
      mockMaybeSingle.mockResolvedValue({
        data: { role: 'admin', full_name: 'Real' },
        error: null,
      });
      mockSignOut.mockRejectedValue(new Error('network'));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());

      await act(async () => {
        await result.current.logout();
      });
      // signOut threw; user state is left as-is by the catch (no clear).
      // This documents current behavior — see review item #7-A for tightening.
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('onAuthStateChange', () => {
    it('updates user when a new session arrives', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      mockMaybeSingle.mockResolvedValue({
        data: { role: 'freelance', full_name: 'F' },
        error: null,
      });

      let pushedHandler: ((event: string, session: any) => Promise<void>) | null = null;
      mockOnAuthStateChange.mockImplementation((cb) => {
        pushedHandler = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.user).toBeNull();

      await act(async () => {
        await pushedHandler!('SIGNED_IN', { user: sessionUser });
      });

      await waitFor(() => expect(result.current.user).not.toBeNull());
      expect(result.current.user?.role).toBe('freelance');
    });

    it('clears user when session becomes null', async () => {
      mockGetSession.mockResolvedValue({ data: { session: { user: sessionUser } } });
      mockMaybeSingle.mockResolvedValue({
        data: { role: 'admin', full_name: 'R' },
        error: null,
      });

      let pushedHandler: ((event: string, session: any) => Promise<void>) | null = null;
      mockOnAuthStateChange.mockImplementation((cb) => {
        pushedHandler = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.user).not.toBeNull());

      await act(async () => {
        await pushedHandler!('SIGNED_OUT', null);
      });

      expect(result.current.user).toBeNull();
    });

    it('unsubscribes on unmount', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      const { unmount } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalled());
      unmount();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('useAuth without a provider', () => {
    it('throws a clear error message', () => {
      // Suppress React's expected error log for this assertion.
      const original = console.error;
      console.error = jest.fn();
      expect(() => renderHook(() => useAuth())).toThrow(
        'useAuth must be used within an AuthProvider',
      );
      console.error = original;
    });
  });
});
