/**
 * SAMA — Landing page (one-page).
 *
 * Placeholders à compléter (recherche "TODO:" pour les trouver) :
 *  - Calendly URL (#contact, bouton "Réserver un échange")
 *  - Téléphone (lien tel:)
 *  - Email (lien mailto:)
 *  - LinkedIn de SAMA (footer)
 *  - Fiche Google Business (footer)
 *  - Page mentions légales (footer)
 *  - Captures des réalisations : remplacer les <img src="" alt=...> de la section #realisations
 *  - JSON-LD : ajuster `url`, `telephone`, `email`, `sameAs`, `address` si besoin
 *  - Formulaire de contact : à brancher plus tard vers une edge function Supabase
 *    (cf. commentaire dans la section #contact)
 */

import type { Metadata } from "next";
import Link from "next/link";
import "./landing.css";
import ScrollEffects from "@/components/landing/ScrollEffects";

const SITE_URL = "https://samadigitalstudio.fr";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "SAMA — Sites web pour artisans CVC & photovoltaïque qui génèrent des clients",
  description:
    "SAMA conçoit des sites vitrines pour les artisans et PME du chauffage, de la climatisation et du photovoltaïque — pensés pour transformer vos visiteurs en demandes de devis.",
  keywords: [
    "site web artisan",
    "site internet chauffagiste",
    "site internet climatisation",
    "site internet photovoltaïque",
    "référencement local",
    "SEO artisan",
    "agence web CVC",
    "SAMA",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: "SAMA",
    title: "SAMA — Sites web pour artisans CVC & photovoltaïque qui génèrent des clients",
    description:
      "Sites vitrines clé en main, référencement local et avis Google pour les artisans CVC, climatisation et photovoltaïque.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SAMA — Sites web qui génèrent des clients",
    description:
      "Agence web pour artisans CVC et photovoltaïque. Sites qui convertissent, SEO local, avis Google, tableau de bord.",
  },
};

const SUN_PATH =
  "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z";

// TODO: remplacer par les vrais coordonnées + liens
const CONTACT = {
  calendlyUrl: "https://calendly.com/REPLACE-ME/echange-15min",
  phone: "+33 1 23 45 67 89",
  phoneHref: "tel:+33123456789",
  email: "contact@samadigitalstudio.fr",
  linkedin: "https://www.linkedin.com/company/REPLACE-ME",
  googleBusiness: "https://g.page/REPLACE-ME",
  legal: "/mentions-legales",
};

const SERVICES: Array<{
  title: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    title: "Sites vitrines qui convertissent",
    desc:
      "Un site rapide, soigné et conçu pour pousser le visiteur à vous contacter. Clé en main : vous êtes en ligne en quelques jours.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M3 8h18" />
        <circle cx="6" cy="6" r="0.5" fill="currentColor" />
        <circle cx="8" cy="6" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Référencement local (SEO)",
    desc:
      "On vous rend visible sur Google quand un client de votre secteur cherche un chauffagiste, un installateur clim ou photovoltaïque près de chez lui.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    title: "Avis Google",
    desc:
      "On transforme vos clients satisfaits en avis 5 étoiles — le premier levier de confiance et de référencement local.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17l-5.9 3.1 1.2-6.6L2.5 8.9 9.1 8z" />
      </svg>
    ),
  },
  {
    title: "Votre espace SAMA",
    desc:
      "Suivez en temps réel les demandes reçues via votre site, vos statistiques et votre réputation, depuis un tableau de bord simple.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    num: "1",
    title: "On crée votre site",
    desc: "On conçoit et met en ligne un site à votre image, optimisé pour la conversion.",
  },
  {
    num: "2",
    title: "On vous rend visible",
    desc: "Référencement local et avis Google pour apparaître quand vos clients cherchent.",
  },
  {
    num: "3",
    title: "Vous recevez des demandes",
    desc: "Les demandes de devis arrivent dans votre espace, vous suivez tout en direct.",
  },
];

// TODO: remplacer par les vraies captures — `src` est laissé vide, un placeholder s'affichera.
const REALISATIONS: Array<{ title: string; sub: string; src: string; alt: string }> = [
  {
    title: "Site vitrine — Chauffagiste",
    sub: "Lyon (69)",
    src: "",
    alt: "Capture d'écran du site d'un chauffagiste basé à Lyon",
  },
  {
    title: "Site vitrine — Installateur photovoltaïque",
    sub: "Bordeaux (33)",
    src: "",
    alt: "Capture d'écran du site d'un installateur photovoltaïque à Bordeaux",
  },
  {
    title: "Site vitrine — Climaticien",
    sub: "Marseille (13)",
    src: "",
    alt: "Capture d'écran du site d'un installateur de climatisation à Marseille",
  },
];

const FAQ = [
  {
    q: "Suis-je propriétaire de mon site ?",
    a: "Oui, le site vous appartient.",
  },
  {
    q: "En combien de temps suis-je en ligne ?",
    a: "En quelques jours, pas en plusieurs mois.",
  },
  {
    q: "Et si je veux des modifications ?",
    a: "Elles sont prévues dans notre accompagnement.",
  },
  {
    q: "Je n'y connais rien en technique.",
    a: "C'est notre métier. Vous n'avez rien à gérer, on s'occupe de tout.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "SAMA",
  description:
    "Agence web spécialisée dans la création de sites vitrines pour les artisans et PME du chauffage, de la climatisation et du photovoltaïque.",
  url: SITE_URL,
  telephone: CONTACT.phone,
  email: CONTACT.email,
  areaServed: { "@type": "Country", name: "France" },
  serviceType: [
    "Création de sites web",
    "Référencement local (SEO)",
    "Gestion de la réputation en ligne",
  ],
  // TODO: ajouter sameAs (LinkedIn, GBP), address postale si pertinente.
  sameAs: [CONTACT.linkedin, CONTACT.googleBusiness],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // schema.org JSON-LD — sérialisé en JSON pur, pas d'interpolation utilisateur.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="sama-landing">
        <div className="grain-overlay" />

        {/* SVG defs */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <mask id="sun-ring-light">
              <path d={SUN_PATH} fill="white" />
              <circle cx="50" cy="50" r="15" fill="black" />
            </mask>
            <pattern
              id="hatch-cream"
              x="0"
              y="0"
              width="9"
              height="9"
              patternTransform="rotate(42)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="9" stroke="#FBF7EF" strokeWidth="0.7" />
            </pattern>
            <filter id="cloud-grain" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.85"
                numOctaves={4}
                stitchTiles="stitch"
                result="noise"
              />
              <feColorMatrix in="noise" type="saturate" values="0" result="grayNoise" />
              <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blended" />
              <feComposite in="blended" in2="SourceGraphic" operator="in" />
            </filter>
            <clipPath id="cloud-main">
              <circle cx="340" cy="340" r="145" />
              <circle cx="260" cy="378" r="108" />
              <circle cx="420" cy="372" r="125" />
              <circle cx="200" cy="415" r="78" />
              <circle cx="490" cy="405" r="95" />
              <circle cx="340" cy="450" r="155" />
              <circle cx="230" cy="460" r="88" />
              <circle cx="448" cy="455" r="105" />
              <circle cx="340" cy="530" r="120" />
            </clipPath>
            <clipPath id="cloud-back">
              <circle cx="500" cy="160" r="88" />
              <circle cx="445" cy="192" r="68" />
              <circle cx="555" cy="188" r="78" />
              <circle cx="400" cy="215" r="55" />
              <circle cx="610" cy="210" r="62" />
              <circle cx="500" cy="238" r="98" />
            </clipPath>
            <clipPath id="cloud-small">
              <circle cx="580" cy="490" r="55" />
              <circle cx="535" cy="510" r="44" />
              <circle cx="625" cy="508" r="50" />
              <circle cx="580" cy="535" r="60" />
            </clipPath>
          </defs>
        </svg>

        {/* NAV */}
        <nav id="sama-nav" className="nav" aria-label="Navigation principale">
          <a href="#hero" className="nav-logo" aria-label="SAMA — retour en haut">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="100" height="100" fill="#D6E4F0" mask="url(#sun-ring-light)" />
            </svg>
            <span className="nav-logo-text">SAMA</span>
          </a>
          <div className="nav-links">
            <a href="#services">Services</a>
            <a href="#methode">Méthode</a>
            <a href="#realisations">Réalisations</a>
            <Link href="/login" className="nav-login">
              Connexion
            </Link>
            <a href="#contact" className="nav-cta">
              Discutons
            </a>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero" id="hero">
          <div className="hero-glow" />
          <svg
            id="sama-hero-clouds"
            className="hero-clouds"
            viewBox="0 0 700 700"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <radialGradient id="cloud-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#5AA9E6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0A1A40" stopOpacity="0" />
            </radialGradient>
            <ellipse cx="340" cy="380" rx="280" ry="230" fill="url(#cloud-glow)" />
            <g opacity="0.55" filter="url(#cloud-grain)">
              <rect width="700" height="700" fill="rgba(214,228,240,0.14)" clipPath="url(#cloud-back)" />
              <rect width="700" height="700" fill="url(#hatch-cream)" opacity="0.18" clipPath="url(#cloud-back)" />
            </g>
            <g filter="url(#cloud-grain)">
              <rect width="700" height="700" fill="rgba(251,247,239,0.22)" clipPath="url(#cloud-main)" />
              <rect width="700" height="700" fill="url(#hatch-cream)" opacity="0.32" clipPath="url(#cloud-main)" />
            </g>
            <g opacity="0.4" filter="url(#cloud-grain)">
              <rect width="700" height="700" fill="rgba(214,228,240,0.12)" clipPath="url(#cloud-small)" />
              <rect width="700" height="700" fill="url(#hatch-cream)" opacity="0.14" clipPath="url(#cloud-small)" />
            </g>
            <line x1="60" y1="590" x2="640" y2="590" stroke="rgba(214,228,240,0.08)" strokeWidth="1" />
            <line x1="100" y1="608" x2="600" y2="608" stroke="rgba(214,228,240,0.04)" strokeWidth="1" />
          </svg>

          <div className="hero-content">
            <div className="hero-eyebrow">Agence digitale · France</div>
            <h1 className="hero-h1">
              Des sites web qui <em>génèrent des clients</em>,<br />
              pas juste de la présence.
            </h1>
            <p className="hero-sub">
              SAMA conçoit des sites vitrines pour les artisans et PME du chauffage, de la climatisation et du
              photovoltaïque — pensés pour transformer vos visiteurs en demandes de devis.
            </p>
            <div className="hero-actions">
              <a href="#contact" className="btn-primary">
                Discutons de votre projet
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M2 7h10M8 4l4 3-4 3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a href="#realisations" className="btn-ghost">
                Voir nos réalisations →
              </a>
            </div>
          </div>
          <div className="hero-scroll" aria-hidden="true">
            <div className="scroll-line" />
            <span>Scroll</span>
          </div>
        </section>

        {/* BANDEAU PROBLÈME */}
        <section className="problem-banner" aria-label="Notre conviction">
          <div className="problem-banner-inner fade-up">
            <p className="problem-banner-text">
              Un site qui ne vous ramène aucun client n&apos;est qu&apos;une carte de visite numérique.
              <br />
              <strong>Le nôtre travaille pour vous</strong> : visibilité locale, demandes de devis, réputation.
            </p>
          </div>
        </section>

        {/* SERVICES */}
        <section className="section-light" id="services">
          <div className="section-header fade-up">
            <div className="eyebrow">Nos services</div>
            <h2 className="section-title-light">
              Tout ce qu&apos;il faut pour <em>attirer et convaincre</em>
              <br />
              vos prochains clients.
            </h2>
          </div>
          <div className="services-grid">
            {SERVICES.map((s, i) => (
              <article className={`service-card fade-up d${(i % 4) + 1}`} key={s.title}>
                <div className="service-icon" aria-hidden="true">
                  {s.icon}
                </div>
                <h3 className="service-title">{s.title}</h3>
                <p className="service-desc">{s.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* COMMENT ÇA MARCHE */}
        <section className="section-dark" id="methode">
          <div className="section-header fade-up">
            <div className="eyebrow">Comment ça marche</div>
            <h2 className="section-title-dark">
              Trois étapes,
              <br />
              <em>aucune mauvaise surprise.</em>
            </h2>
          </div>
          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div className={`step-item fade-up d${i + 1}`} key={step.num}>
                <div className="step-item-glow" />
                <div className="step-num">{step.num}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* RÉALISATIONS */}
        <section className="section-bright" id="realisations">
          <div className="section-header fade-up">
            <div className="eyebrow">Réalisations</div>
            <h2 className="section-title-light">
              Quelques sites <em>déjà en ligne.</em>
            </h2>
            <p className="section-intro-light">
              Des artisans et PME que nous accompagnons, partout en France.
            </p>
          </div>
          <div className="realisations-grid">
            {REALISATIONS.map((r, i) => (
              <article className={`realisation-card fade-up d${(i % 3) + 1}`} key={r.title}>
                <div className="realisation-img-wrap">
                  {r.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.src} alt={r.alt} loading="lazy" />
                  ) : (
                    <div className="realisation-img-placeholder" role="img" aria-label={r.alt}>
                      À venir
                    </div>
                  )}
                </div>
                <div className="realisation-body">
                  <div className="realisation-title">{r.title}</div>
                  <div className="realisation-sub">{r.sub}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="section-light" id="faq">
          <div className="section-header fade-up">
            <div className="eyebrow">Vos questions</div>
            <h2 className="section-title-light">
              Tout ce que vous voulez <em>savoir avant</em> de nous parler.
            </h2>
          </div>
          <div className="faq-list">
            {FAQ.map((item, i) => (
              <details className={`faq-item fade-up d${(i % 4) + 1}`} key={item.q}>
                <summary>
                  <span>{item.q}</span>
                  <span className="faq-icon" aria-hidden="true">
                    <svg viewBox="0 0 18 18" fill="none">
                      <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="faq-answer">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA FINAL + CONTACT */}
        <section className="cta-section" id="contact" aria-label="Nous contacter">
          <div className="cta-bg-glow" />
          <div className="cta-sun-wrap fade-up" aria-hidden="true">
            <svg className="cta-sun-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="rgba(90,169,230,0.25)" mask="url(#sun-ring-light)" />
            </svg>
          </div>
          <div className="cta-content fade-up d2">
            <div className="eyebrow">Parlons de votre projet</div>
            <h2 className="cta-title">
              Prêt à transformer votre site en <em>machine à devis ?</em>
            </h2>
            <p className="cta-sub">
              15 minutes d&apos;échange pour comprendre votre activité, votre zone, vos objectifs. Aucune
              obligation.
            </p>

            {/*
              TODO: Brancher un formulaire de contact pointant vers une edge function Supabase
              (ex. /functions/v1/contact). En attendant, on propose Calendly + lien tel: + lien mailto:.
            */}

            <div className="contact-actions">
              <a className="btn-primary" href={CONTACT.calendlyUrl} target="_blank" rel="noopener noreferrer">
                Réserver un échange (15 min)
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M2 7h10M8 4l4 3-4 3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <div className="contact-direct">
                <a className="contact-link" href={CONTACT.phoneHref}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {CONTACT.phone}
                </a>
                <a className="contact-link" href={`mailto:${CONTACT.email}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  {CONTACT.email}
                </a>
              </div>
              <div className="cta-note">Réponse sous 24h ouvrées</div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer-logo">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="100" height="100" fill="currentColor" mask="url(#sun-ring-light)" />
            </svg>
            <span>SAMA</span>
          </div>
          <div className="footer-links">
            <a href={CONTACT.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            <a href={CONTACT.googleBusiness} target="_blank" rel="noopener noreferrer">
              Google Business
            </a>
            <Link href="/login">Connexion</Link>
            <a href={CONTACT.legal}>Mentions légales</a>
          </div>
          <div className="footer-tagline">© 2026 SAMA · Agence digitale française</div>
        </footer>
      </div>
      <ScrollEffects />
    </>
  );
}
