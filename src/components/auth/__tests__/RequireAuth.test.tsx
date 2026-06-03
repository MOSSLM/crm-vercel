import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RequireAuth from '../RequireAuth';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
const mockUseAuth = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/protected/page',
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/AppLoading', () => ({
  __esModule: true,
  default: () => <div data-testid="app-loading">loading</div>,
}));

const Child = () => <div data-testid="child">protected content</div>;

describe('RequireAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders <AppLoading /> while auth is still loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });
    render(
      <RequireAuth>
        <Child />
      </RequireAuth>,
    );
    expect(screen.getByTestId('app-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders children for an authenticated admin', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: { role: 'admin' } });
    render(
      <RequireAuth>
        <Child />
      </RequireAuth>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects a freelance to the agent portal', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false, user: { role: 'freelance' } });
    render(
      <RequireAuth>
        <Child />
      </RequireAuth>,
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/espace-agent/dashboard'));
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('redirects to /login with the encoded next path when unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    render(
      <RequireAuth>
        <Child />
      </RequireAuth>,
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/login?next=%2Fprotected%2Fpage'),
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-loading')).not.toBeInTheDocument();
  });

  it('does not redirect again when re-rendered with the same auth state', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    const { rerender } = render(
      <RequireAuth>
        <Child />
      </RequireAuth>,
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    rerender(
      <RequireAuth>
        <Child />
      </RequireAuth>,
    );
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('does not redirect while loading is true even if isAuthenticated=false', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });
    render(
      <RequireAuth>
        <Child />
      </RequireAuth>,
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
