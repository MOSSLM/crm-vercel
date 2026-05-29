"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { createClient } from '../utils/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';

import logger from '../utils/logger';
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'freelance' | 'client' | 'unknown';
  onboardedAt: string | null;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
  /**
   * True while either the auth session OR the user_profile row is still
   * loading. Components should treat `user.role` as untrusted until this is
   * false — otherwise admin content can flash before the role resolves.
   */
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const baseUserFromSession = (sessionUser: SupabaseUser): User => ({
  id: sessionUser.id,
  email: sessionUser.email || '',
  name: sessionUser.user_metadata?.name || sessionUser.email || 'Utilisateur',
  role: 'unknown',
  onboardedAt: null,
});

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const supabase = createClient();
  const currentUserIdRef = useRef<string | null>(null);

  const enrichUserFromProfile = useCallback(async (userId: string) => {
    try {
      const initial = await supabase
        .from('user_profiles')
        .select('role, full_name, onboarded_at, prenom')
        .eq('id', userId)
        .maybeSingle();
      let profile = initial.data;
      const profileError = initial.error;

      if (profileError) {
        logger.warn('Unable to load user profile role:', profileError);
        return;
      }

      // Safety net: the auth.users trigger may not have created the row
      // (insufficient privilege on the auth schema). Create it server-side
      // via service-role, then re-read — so the role never stays 'unknown'.
      if (!profile) {
        try {
          const { authedFetch } = await import('../utils/authedFetch');
          await authedFetch('/api/auth/ensure-profile', { method: 'POST' });
          const retry = await supabase
            .from('user_profiles')
            .select('role, full_name, onboarded_at, prenom')
            .eq('id', userId)
            .maybeSingle();
          profile = retry.data;
        } catch (e) {
          logger.warn('ensure-profile fallback failed:', e);
        }
      }

      if (!profile) {
        logger.warn('No user_profiles row found for connected user.');
        return;
      }

      setUser((prev) => {
        if (!prev || prev.id !== userId) return prev;
        const role: User['role'] =
          profile.role === 'admin' || profile.role === 'freelance' || profile.role === 'client'
            ? profile.role
            : prev.role;
        const prenom = typeof profile.prenom === 'string' ? profile.prenom.trim() : '';
        const fullName =
          typeof profile.full_name === 'string' && profile.full_name.trim().length > 0
            ? profile.full_name
            : prenom.length > 0
              ? prenom
              : prev.name;
        const onboardedAt = typeof profile.onboarded_at === 'string' ? profile.onboarded_at : null;
        return { ...prev, role, name: fullName, onboardedAt };
      });
    } catch (error) {
      logger.warn('Profile enrichment failed:', error);
    } finally {
      // Mark profileLoaded regardless of success/failure so the UI doesn't
      // hang forever; downstream guards should redirect away if role didn't resolve.
      setProfileLoaded(true);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const id = currentUserIdRef.current;
    if (id) {
      await enrichUserFromProfile(id);
    }
  }, [enrichUserFromProfile]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          currentUserIdRef.current = session.user.id;
          setUser(baseUserFromSession(session.user));
          // Keep profileLoaded=false while we fetch — UI must wait.
          setProfileLoaded(false);
          void enrichUserFromProfile(session.user.id);
        } else {
          // No session: nothing to enrich, mark as loaded so guards can decide.
          setProfileLoaded(true);
        }
      } catch (error) {
        logger.error('Error checking auth:', error);
        setProfileLoaded(true);
      } finally {
        setSessionLoading(false);
      }
    };

    const loadingTimeout = setTimeout(() => {
      setSessionLoading(false);
      setProfileLoaded(true);
    }, 5000);
    checkAuth().finally(() => clearTimeout(loadingTimeout));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        currentUserIdRef.current = session.user.id;
        setUser(baseUserFromSession(session.user));
        setProfileLoaded(false);
        void enrichUserFromProfile(session.user.id);
      } else {
        currentUserIdRef.current = null;
        setUser(null);
        setProfileLoaded(true);
      }
      setSessionLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [enrichUserFromProfile, supabase]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data.user && !error) return true;
      return false;
    } catch (error) {
      logger.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      logger.error('Logout error:', error);
    }
  };

  const isAuthenticated = user !== null;
  const loading = sessionLoading || (isAuthenticated && !profileLoaded);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshProfile, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
