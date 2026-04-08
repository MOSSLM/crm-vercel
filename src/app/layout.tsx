import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { DM_Sans, DM_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

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
    <html lang="fr" suppressHydrationWarning className={cn(fontSans.variable, fontMono.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
