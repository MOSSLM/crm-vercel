"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { THEME_PRESETS, THEME_PRESET_KEYS, THEME_PRESET_STORAGE_KEY, ThemePreset } from './themePresets';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  themePreset: ThemePreset;
  setThemePreset: (preset: ThemePreset) => void;
  customThemeColors: Record<string, string>;
  setCustomThemeColor: (key: string, value: string) => void;
  resetCustomThemeColors: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const CUSTOM_THEME_STORAGE_KEY = 'custom-theme-colors';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [themePreset, setThemePreset] = useState<ThemePreset>('default');
  const [customThemeColors, setCustomThemeColors] = useState<Record<string, string>>({});

  const applyThemePreset = (preset: ThemePreset, customColors: Record<string, string>) => {
    const root = document.documentElement;

    THEME_PRESET_KEYS.forEach((key) => {
      root.style.removeProperty(key);
    });

    const presetConfig = THEME_PRESETS.find((item) => item.id === preset);
    if (!presetConfig) return;

    Object.entries(presetConfig.cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    Object.entries(customColors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  };

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
        
        const theme = getStorageTheme() || 'system';
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
    const initialTheme = savedTheme && ['light', 'dark', 'system'].includes(savedTheme) ? savedTheme : 'system';
    const savedPreset = localStorage.getItem(THEME_PRESET_STORAGE_KEY) as ThemePreset;
    const initialPreset = THEME_PRESETS.some((preset) => preset.id === savedPreset) ? savedPreset : 'default';
    const savedCustomTheme = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    const initialCustomTheme = savedCustomTheme ? JSON.parse(savedCustomTheme) as Record<string, string> : {};
    
    // Set theme immediately to avoid flash
    setTheme(initialTheme);
    setThemePreset(initialPreset);
    setCustomThemeColors(initialCustomTheme);
    
    // Apply resolved theme to document immediately
    const resolved = resolveTheme(initialTheme);
    setResolvedTheme(resolved);
    
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    applyThemePreset(initialPreset, initialCustomTheme);
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

  useEffect(() => {
    applyThemePreset(themePreset, customThemeColors);
    localStorage.setItem(THEME_PRESET_STORAGE_KEY, themePreset);
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(customThemeColors));
  }, [themePreset, customThemeColors]);

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

  const setCustomThemeColor = (key: string, value: string) => {
    setCustomThemeColors((prev) => ({ ...prev, [key]: value }));
  };

  const resetCustomThemeColors = () => {
    setCustomThemeColors({});
  };

  const value = {
    theme,
    setTheme,
    resolvedTheme,
    themePreset,
    setThemePreset,
    customThemeColors,
    setCustomThemeColor,
    resetCustomThemeColors,
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
