"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { createClient } from '../utils/supabase/client';
import { User as SupabaseUser } from '@supabase/supabase-js';

import logger from '../utils/logger';
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'freelance' | 'unknown';
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const baseUserFromSession = (sessionUser: SupabaseUser): User => ({
      id: sessionUser.id,
      email: sessionUser.email || '',
      name: sessionUser.user_metadata?.name || sessionUser.email || 'Utilisateur',
      role: 'unknown',
    });

    const enrichUserFromProfile = async (sessionUser: SupabaseUser) => {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('role, full_name')
          .eq('id', sessionUser.id)
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
          if (!prev || prev.id !== sessionUser.id) return prev;
          const role: User['role'] =
            profile.role === 'admin' || profile.role === 'freelance' ? profile.role : prev.role;
          const fullName =
            typeof profile.full_name === 'string' && profile.full_name.trim().length > 0
              ? profile.full_name
              : prev.name;
          return { ...prev, role, name: fullName };
        });
      } catch (error) {
        logger.warn('Profile enrichment failed:', error);
      }
    };

    // Vérifier la session Supabase au démarrage
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(baseUserFromSession(session.user));
          // Fire-and-forget: don't block loading state on profile fetch
          void enrichUserFromProfile(session.user);
        }
      } catch (error) {
        logger.error('Error checking auth:', error);
      } finally {
        setLoading(false);
      }
    };

    // Safety valve: if Supabase hangs (e.g. network issue in production), unblock the UI after 5s
    const loadingTimeout = setTimeout(() => setLoading(false), 5000);
    checkAuth().finally(() => clearTimeout(loadingTimeout));

    // Écouter les changements d'authentification Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(baseUserFromSession(session.user));
        void enrichUserFromProfile(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (data.user && !error) {
        return true;
      }

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
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
