import type { ThemeConfig } from "@/types";

const themeConfig: ThemeConfig = {
  slug: "theme-default",
  name: "Artisan Pro",
  description: "Thème professionnel pour artisans, PME et prestataires de services locaux",
  version: "1.0.0",

  sections: [
    {
      type: "hero",
      label: "Hero / En-tête",
      description: "Grande bannière d'accroche avec titre, sous-titre et CTA",
      icon: "layout-template",
      defaultData: {
        title: "{{entreprise.nom}}",
        subtitle: "Votre partenaire de confiance depuis {{entreprise.annee_creation}}",
        backgroundImage: "",
        cta: { text: "Nous contacter", href: "#contact" },
        settings: { overlay: true, height: "large" },
      },
    },
    {
      type: "services",
      label: "Nos Services",
      description: "Grille de services ou prestations proposées",
      icon: "grid-2x2",
      defaultData: {
        title: "Nos prestations",
        subtitle: "Ce que nous proposons",
        items: [
          { title: "Service 1", description: "Description du service 1", icon: "wrench" },
          { title: "Service 2", description: "Description du service 2", icon: "shield" },
          { title: "Service 3", description: "Description du service 3", icon: "star" },
        ],
        settings: { columns: 3, style: "cards" },
      },
    },
    {
      type: "about",
      label: "À propos",
      description: "Présentation de l'entreprise avec image et texte",
      icon: "info",
      defaultData: {
        title: "Qui sommes-nous ?",
        content: "{{entreprise.description}}",
        image: "{{entreprise.logo_url}}",
        stats: [
          { label: "Années d'expérience", value: "{{entreprise.annee_creation}}" },
          { label: "Clients satisfaits", value: "500+" },
          { label: "Projets réalisés", value: "1000+" },
        ],
        settings: { imagePosition: "right" },
      },
    },
    {
      type: "testimonials",
      label: "Avis clients",
      description: "Carrousel ou grille d'avis Google / clients",
      icon: "message-square-quote",
      defaultData: {
        title: "Ce que disent nos clients",
        subtitle: "{{entreprise.note_moyenne}} / 5 sur {{entreprise.nombre_avis}} avis",
        reviews: [],
        settings: { style: "carousel", showRating: true },
      },
    },
    {
      type: "contact",
      label: "Contact",
      description: "Section coordonnées, formulaire ou carte",
      icon: "phone",
      defaultData: {
        title: "Contactez-nous",
        subtitle: "Nous sommes disponibles pour vous répondre",
        phone: "{{entreprise.telephone}}",
        email: "{{entreprise.email}}",
        address: "{{entreprise.adresse}}",
        city: "{{entreprise.ville}}",
        settings: { showMap: true, showForm: false },
      },
    },
    {
      type: "gallery",
      label: "Galerie",
      description: "Grille de photos ou réalisations",
      icon: "images",
      defaultData: {
        title: "Nos réalisations",
        images: [],
        settings: { columns: 3, lightbox: true },
      },
    },
    {
      type: "faq",
      label: "FAQ",
      description: "Questions fréquemment posées en accordéon",
      icon: "circle-help",
      defaultData: {
        title: "Questions fréquentes",
        items: [
          { question: "Question 1 ?", answer: "Réponse à la question 1." },
          { question: "Question 2 ?", answer: "Réponse à la question 2." },
        ],
        settings: {},
      },
    },
    {
      type: "blog",
      label: "Blog / Actualités",
      description: "Liste des derniers articles (source dynamique)",
      icon: "newspaper",
      defaultData: {
        title: "Nos actualités",
        subtitle: "Restez informés",
        settings: { postsPerPage: 3, showExcerpt: true },
      },
    },
    {
      type: "popup",
      label: "Popup",
      description: "Fenêtre modale promotionnelle ou d'information",
      icon: "square-arrow-up-right",
      defaultData: {
        show: false,
        title: "Offre spéciale",
        content: "Profitez de notre offre exclusive",
        cta: { text: "En savoir plus", href: "#contact" },
        settings: { delay: 3000, showOnce: true },
      },
    },
    {
      type: "cta-banner",
      label: "Bannière CTA",
      description: "Bannière d'appel à l'action avec fond coloré",
      icon: "megaphone",
      defaultData: {
        title: "Prêt à démarrer ?",
        subtitle: "Contactez-nous dès aujourd'hui pour un devis gratuit",
        cta: { text: "Devis gratuit", href: "#contact" },
        settings: { style: "gradient" },
      },
    },
  ],

  globalVariables: {
    colors: {
      primary: "#1a56db",
      secondary: "#6b7280",
      accent: "#f59e0b",
      background: "#ffffff",
      text: "#111827",
    },
    fonts: {
      heading: "Inter",
      body: "Inter",
    },
    borderRadius: "md",
    spacing: {
      sectionPadding: "80px",
      elementGap: "24px",
    },
  },

  enterpriseVariables: [
    "entreprise.nom",
    "entreprise.telephone",
    "entreprise.email",
    "entreprise.adresse",
    "entreprise.ville",
    "entreprise.code_postal",
    "entreprise.logo_url",
    "entreprise.site_web_canonique",
    "entreprise.note_moyenne",
    "entreprise.nombre_avis",
    "entreprise.description",
    "entreprise.annee_creation",
  ],
};

export default themeConfig;
