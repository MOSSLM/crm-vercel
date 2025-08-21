"use client";
import React, { createContext, useContext } from "react";

// Tu peux garder cette export si ailleurs tu importes PageType depuis ici
export type PageType = string;

// Contexte "inutile" désormais, on laisse pour compat.
type NavContextValue = {
  currentPage: PageType;
  setCurrentPage: (p: PageType) => void;
};

const NavigationContext = createContext<NavContextValue | null>(null);

// Provider no-op (ne fait rien, juste rend ses enfants)
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// Hook qui ne jette plus et renvoie des valeurs neutres
export function useNavigation(): NavContextValue {
  return {
    currentPage: "",
    setCurrentPage: () => {},
  };
}
