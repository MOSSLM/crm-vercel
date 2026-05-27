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
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const currentUserIdRef = useRef<string | null>(null);

  const enrichUserFromProfile = useCallback(async (userId: string) => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, full_name, onboarded_at, prenom')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        logger.warn('Unable to load user profile role:', profileError);
        return;
      }

      if (!profile) {
        logger.warn('No user_profiles row found for connected user. RLS may hide all CRM data.');
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
          void enrichUserFromProfile(session.user.id);
        }
      } catch (error) {
        logger.error('Error checking auth:', error);
      } finally {
        setLoading(false);
      }
    };

    const loadingTimeout = setTimeout(() => setLoading(false), 5000);
    checkAuth().finally(() => clearTimeout(loadingTimeout));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        currentUserIdRef.current = session.user.id;
        setUser(baseUserFromSession(session.user));
        void enrichUserFromProfile(session.user.id);
      } else {
        currentUserIdRef.current = null;
        setUser(null);
      }
      setLoading(false);
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

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshProfile, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
