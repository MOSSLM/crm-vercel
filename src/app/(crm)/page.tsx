/**
 * SAMA — homepage publique (samadigitalstudio.fr).
 *
 * Le rendu vit dans <SamaHome /> (composant client : intro animée, scroll
 * transformation, onglets « Pour qui », foil du tableau de bord). Cette page
 * ne porte que les métadonnées SEO et le JSON-LD.
 *
 * L'onglet « Connexion » est volontairement absent de la navigation :
 * /login reste accessible directement par son URL.
 */

import type { Metadata } from "next";
import "./sama-home.css";
import SamaHome from "@/components/sama-home/SamaHome";

const SITE_URL = "https://samadigitalstudio.fr";

const TITLE = "sama — Faites rayonner votre entreprise";
const DESCRIPTION =
  "sama réunit toute votre présence en ligne au même endroit : site internet, publicité Google et Meta, fiche et avis Google, vidéo, SMS et e-mails, pilotés depuis un seul espace.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "agence digitale",
    "site internet entreprise",
    "publicité Google",
    "publicité Facebook Instagram",
    "fiche Google",
    "avis Google",
    "référencement local",
    "artisans",
    "commerces",
    "franchises",
    "sama",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: "sama",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/sama/hero-main.webp", width: 1600, height: 900, alt: "sama — votre partenaire digital tout-en-un" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/sama/hero-main.webp"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "sama",
  description: DESCRIPTION,
  url: SITE_URL,
  email: "contact@samadigitalstudio.fr",
  slogan: "Faites rayonner votre entreprise",
  areaServed: { "@type": "Country", name: "France" },
  serviceType: [
    "Création de sites internet",
    "Publicité en ligne (Google, Facebook, Instagram)",
    "Référencement local et fiche Google",
    "Gestion des avis clients",
    "Vidéo de présentation",
    "Campagnes SMS et e-mail",
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD schema.org — objet statique sérialisé, aucune entrée utilisateur.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SamaHome />
    </>
  );
}
