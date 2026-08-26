import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./studio.css";
import { Providers } from "./providers";
import { DM_Sans, DM_Mono, Cormorant_Garamond } from "next/font/google";

export const metadata: Metadata = {
  title: "Sama CRM",
  description: "CRM interne",
  // Le manifeste n'est déclaré QUE dans ce layout. `(public)` — les sites
  // publiés des clients et les aperçus — est un layout racine SŒUR, pas un
  // enfant : il n'hérite donc de rien d'ici, et n'a délibérément aucun
  // manifeste. Un site client installé sous la marque du CRM serait absurde.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sama",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/pwa/icone-192.png",
    apple: "/pwa/apple-touch-icon.png",
  },
};

// `themeColor` teinte la barre système une fois l'app installée. Deux valeurs :
// sans la variante sombre, la barre reste claire sur un thème sombre et le
// bandeau paraît collé au-dessus de l'écran.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F8F9" },
    { media: "(prefers-color-scheme: dark)", color: "#071426" },
  ],
};

const fontSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const fontMono = DM_Mono({ subsets: ["latin"], variable: "--font-dm-mono", weight: ["400", "500"] });
const fontSerif = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} ${fontSerif.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
