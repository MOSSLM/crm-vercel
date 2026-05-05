import Link from "next/link";
import React from "react";

interface ThemeLayoutProps {
  children: React.ReactNode;
  variables: Record<string, string>;
  settings: {
    colors: { primary: string; secondary: string; accent: string; background: string; text: string };
    fonts: { heading: string; body: string };
    borderRadius?: string;
    spacing?: string;
  };
  companyName?: string;
  logoUrl?: string;
  phone?: string;
}

const ThemeLayout: React.FC<ThemeLayoutProps> = ({
  children,
  settings,
  companyName,
  logoUrl,
  phone,
}) => {
  const cssVars = {
    "--color-primary": settings.colors.primary,
    "--color-secondary": settings.colors.secondary,
    "--color-accent": settings.colors.accent,
    "--color-background": settings.colors.background,
    "--color-text": settings.colors.text,
    "--font-heading": settings.fonts.heading,
    "--font-body": settings.fonts.body,
  } as React.CSSProperties;

  return (
    <div style={{ ...cssVars, fontFamily: "var(--font-body, Inter, sans-serif)", color: "var(--color-text)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName ?? "Logo"} className="h-10 w-auto object-contain" />
            ) : (
              <span
                className="font-bold text-xl"
                style={{ color: "var(--color-primary)", fontFamily: "var(--font-heading, Inter, sans-serif)" }}
              >
                {companyName ?? "Entreprise"}
              </span>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <a href="#services" className="text-sm font-medium text-gray-600 hover:text-[var(--color-primary)] transition-colors">
              Services
            </a>
            <a href="#about" className="text-sm font-medium text-gray-600 hover:text-[var(--color-primary)] transition-colors">
              À propos
            </a>
            <a href="#contact" className="text-sm font-medium text-gray-600 hover:text-[var(--color-primary)] transition-colors">
              Contact
            </a>
          </nav>

          {phone && (
            <a
              href={`tel:${phone}`}
              className="hidden sm:flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ backgroundColor: "var(--color-primary)", color: "white" }}
            >
              📞 {phone}
            </a>
          )}
        </div>
      </header>

      {/* Main content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-10 px-6 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-semibold text-lg">{companyName ?? "Entreprise"}</p>
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} {companyName} — Tous droits réservés
          </p>
          {phone && (
            <a href={`tel:${phone}`} className="text-sm text-gray-300 hover:text-white transition-colors">
              📞 {phone}
            </a>
          )}
        </div>
      </footer>
    </div>
  );
};

export default ThemeLayout;
