import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { DM_Sans, DM_Mono } from "next/font/google";

export const metadata: Metadata = {
  title: "Sama CRM",
  description: "CRM interne",
};

const fontSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const fontMono = DM_Mono({ subsets: ["latin"], variable: "--font-dm-mono", weight: "400" });

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${fontSans.variable} ${fontMono.variable}`}>
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
