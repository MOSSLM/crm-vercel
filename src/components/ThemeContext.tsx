"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  // Script to prevent theme flash - inject inline script in head
  useEffect(() => {
    const script = document.createElement('script');
    script.innerHTML = `
      (function() {
        function getStorageTheme() {
          try {
            return localStorage.getItem('theme');
          } catch (e) {
            return null;
          }
        }
        
        function getSystemTheme() {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        
        const theme = getStorageTheme() || 'dark';
        const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
        
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(resolvedTheme);
      })();
    `;
    
    if (!document.querySelector('#theme-script')) {
      script.id = 'theme-script';
      document.head.appendChild(script);
    }

    return () => {
      const existingScript = document.querySelector('#theme-script');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  // Function to get system preference
  const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  };

  // Function to resolve the actual theme
  const resolveTheme = (currentTheme: Theme): 'light' | 'dark' => {
    if (currentTheme === 'system') {
      return getSystemTheme();
    }
    return currentTheme;
  };

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    // Get initial theme
    const savedTheme = localStorage.getItem('theme') as Theme;
    const initialTheme = savedTheme && ['light', 'dark', 'system'].includes(savedTheme) ? savedTheme : 'dark';
    
    // Set theme immediately to avoid flash
    setTheme(initialTheme);
    
    // Apply resolved theme to document immediately
    const resolved = resolveTheme(initialTheme);
    setResolvedTheme(resolved);
    
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
  }, []);

  // Update resolved theme when theme changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);

    // Apply to document
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);

    // Save to localStorage
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        const resolved = resolveTheme(theme);
        setResolvedTheme(resolved);
        
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(resolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const value = {
    theme,
    setTheme,
    resolvedTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
