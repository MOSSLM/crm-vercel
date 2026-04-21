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
    const buildUserFromSession = async (sessionUser: SupabaseUser): Promise<User> => {
      let role: User['role'] = 'unknown';
      let fullName = sessionUser.user_metadata?.name || sessionUser.email || 'Utilisateur';

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, full_name')
        .eq('id', sessionUser.id)
        .maybeSingle();

      if (profileError) {
        logger.warn('Unable to load user profile role:', profileError);
      } else if (profile) {
        if (profile.role === 'admin' || profile.role === 'freelance') {
          role = profile.role;
        }
        if (typeof profile.full_name === 'string' && profile.full_name.trim().length > 0) {
          fullName = profile.full_name;
        }
      } else {
        logger.warn('No user_profiles row found for connected user. RLS may hide all CRM data.');
      }

      return {
        id: sessionUser.id,
        email: sessionUser.email || '',
        name: fullName,
        role,
      };
    };

    // Vérifier la session Supabase au démarrage
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          setUser(await buildUserFromSession(session.user));
        }
      } catch (error) {
        logger.error('Error checking auth:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Écouter les changements d'authentification Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(await buildUserFromSession(session.user));
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
