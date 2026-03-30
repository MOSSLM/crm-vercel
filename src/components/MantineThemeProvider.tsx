"use client";

import React from "react";
import { MantineProvider, createTheme } from "@mantine/core";
import { useTheme } from "@/components/ThemeContext";

const theme = createTheme({
  fontFamily: "Clash Display, Inter, ui-sans-serif, system-ui, sans-serif",
  primaryColor: "indigo",
  radius: {
    md: "14px",
    lg: "20px",
    xl: "24px",
  },
  defaultRadius: "md",
  headings: {
    fontFamily: "Clash Display, Inter, ui-sans-serif, system-ui, sans-serif",
  },
});

export function MantineThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme={resolvedTheme === "dark" ? "dark" : "light"}
      forceColorScheme={resolvedTheme === "dark" ? "dark" : "light"}
      cssVariablesSelector=":root"
    >
      {children}
    </MantineProvider>
  );
}
