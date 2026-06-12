import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "./freelance.css";
import ScrollEffects from "@/components/landing/ScrollEffects";

export const metadata: Metadata = {
  title: "Collaboration freelance — SAMA",
  robots: { index: false, follow: false },
};

const SUN_PATH =
  "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z";

const MAILTO =
  "mailto:contact@samadigitalstudio.fr?subject=Collaboration%20freelance%20%E2%80%94%20prise%20de%20rendez-vous";

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const DotIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const FOURNI: Array<{ title: string; desc: string; icon: React.ReactNode }> = [
  {
    title: "Des prospects qualifiés, prêts à appeler",
    desc:
      "Une base d'artisans du bâtiment — CVC, plomberie, solaire — avec téléphone et contact décisionnaire. Pas de scraping, pas de fichier à acheter, pas de ciblage à faire.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  {
    title: "Votre espace agent dans le CRM",
    desc:
      "Un accès personnel : fiches prospects, pipeline, calendrier et notes d'appel au même endroit. Vous vous connectez, vous appelez, vous posez des rendez-vous.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    title: "Le catalogue des offres SAMA",
    desc:
      "Les offres, les prix et les argumentaires sont fournis. Vous savez exactement quoi proposer à chaque artisan, sans rien préparer vous-même.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    title: "Un calendrier branché sur l'équipe",
    desc:
      "Vous posez le créneau directement dans le calendrier du CRM : SAMA prend le relais et présente ses offres au prospect lors du rendez-vous.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    num: "1",
    title: "Vous vous connectez",
    desc: "Votre accès à l'espace agent est créé. La base de prospects, les offres et le calendrier vous attendent.",
  },
  {
    num: "2",
    title: "Vous appelez, vous posez des rendez-vous",
    desc: "Vous contactez les artisans, vous qualifiez l'intérêt et vous confirmez un créneau avec un décisionnaire.",
  },
  {
    num: "3",
    title: "Vous facturez en fin de mois",
    desc: "Une facture récapitule vos rendez-vous honorés. SAMA valide sur le calendrier et les enregistrements, puis règle.",
  },
];

const VALIDITE = [
  "Pris avec un décisionnaire : gérant ou personne habilitée à engager l'entreprise.",
  "Le prospect sait pourquoi il a rendez-vous : intérêt confirmé pour les services SAMA, pas un créneau accepté pour raccrocher plus vite.",
  "Créneau confirmé avec le prospect et enregistré dans le calendrier du CRM.",
  "Honoré : le prospect est présent au créneau convenu.",
];

const FAQ = [
  {
    q: "Que se passe-t-il en cas de no-show ?",
    a: "Un rendez-vous où le prospect ne se présente pas n'est pas payé : il est remplacé par un nouveau rendez-vous, sans facturation supplémentaire. D'où l'importance du rappel par SMS ou e-mail avant chaque échéance.",
  },
  {
    q: "Quels sont mes engagements ?",
    a: "Enregistrer les appels de prise de rendez-vous (mis à disposition de SAMA pour le contrôle qualité), rappeler chaque prospect avant son rendez-vous, remplacer les no-shows et tenir le CRM à jour : statuts, notes d'appel, coordonnées vérifiées.",
  },
  {
    q: "Comment se passe la facturation ?",
    a: "Statut indépendant requis (auto-entrepreneur ou société, avec SIRET). En fin de mois, vous envoyez une facture récapitulant les rendez-vous honorés. SAMA la valide en croisant avec le calendrier et les enregistrements d'appels, puis procède au règlement.",
  },
  {
    q: "Pourquoi 50 € alors que d'autres facturent 150 € ?",
    a: "Sur les plateformes équivalentes, le setter constitue lui-même son fichier et son ciblage. Ici, SAMA fournit les prospects et tout l'outillage : la différence vous revient en temps gagné, pas en travail en plus. La rémunération dépend du résultat, pas du volume d'appels.",
  },
  {
    q: "Et côté déontologie ?",
    a: "Pas de promesses non tenables faites au prospect pour décrocher un créneau, pas de pression abusive ni de relances déraisonnables. La base de prospects reste la propriété de SAMA : pas d'export, pas de réutilisation, confidentialité des données.",
  },
];

/**
 * Page non référencée, sans lien dans la navigation — à partager en direct
 * avec les freelances setters pour cadrer la collaboration.
 */
export default function CollaborationFreelancePage() {
  return (
    <>
      <div className="sama-landing">
        <div className="grain-overlay" />

        {/* SVG defs */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <mask id="sun-ring-light">
              <path d={SUN_PATH} fill="white" />
              <circle cx="50" cy="50" r="15" fill="black" />
            </mask>
          </defs>
        </svg>

        {/* NAV */}
        <nav id="sama-nav" className="nav" aria-label="Navigation">
          <a href="#hero" className="nav-logo" aria-label="SAMA — retour en haut">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect width="100" height="100" fill="#D6E4F0" mask="url(#sun-ring-light)" />
            </svg>
            <span className="nav-logo-text">SAMA</span>
          </a>
          <div className="nav-links">
            <a href="#remuneration">Rémunération</a>
            <a href="#regles">Les règles</a>
            <Link href="/login" className="nav-login">
              Espace agent
            </Link>
            <a href={MAILTO} className="nav-cta">
              Candidater
            </a>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero" id="hero">
          <div className="hero-glow" />
          <div className="hero-content">
            <div className="hero-eyebrow">Collaboration freelance · Prise de rendez-vous</div>
            <h1 className="hero-h1">
              Vous posez les rendez-vous,
              <br />
              <em>on fournit tout le reste.</em>
            </h1>
            <p className="hero-sub">
              SAMA vend des services web aux artisans du bâtiment — CVC, plomberie, solaire. Votre
              mission : décrocher des rendez-vous qualifiés avec ces artisans. Les prospects, le CRM
              et les argumentaires sont déjà prêts.
            </p>
            <div className="hero-actions">
              <a href="#remuneration" className="btn-primary">
                Voir la rémunération
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
              <a href={MAILTO} className="btn-ghost">
                Proposer ma candidature →
              </a>
            </div>
          </div>
          <div className="hero-scroll" aria-hidden="true">
            <div className="scroll-line" />
            <span>Scroll</span>
          </div>
        </section>

        {/* BANDEAU */}
        <section className="problem-banner" aria-label="Le principe">
          <div className="problem-banner-inner fade-up">
            <p className="problem-banner-text">
              Pas de fichier à acheter, pas de scraping, pas de ciblage à faire.
              <br />
              <strong>Vous vous connectez, vous appelez, vous posez des rendez-vous.</strong>
            </p>
          </div>
        </section>

        {/* CE QUE SAMA FOURNIT */}
        <section className="section-light" id="fourni">
          <div className="section-header fade-up">
            <div className="eyebrow">Ce que SAMA fournit</div>
            <h2 className="section-title-light">
              Tout est préparé en amont.
              <br />
              <em>Il n&apos;y a qu&apos;à appeler.</em>
            </h2>
          </div>
          <div className="services-grid">
            {FOURNI.map((s, i) => (
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
              <em>zéro préparation.</em>
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

        {/* RÉMUNÉRATION */}
        <section className="section-bright" id="remuneration">
          <div className="pricing-grid">
            <div className="fade-up">
              <div className="eyebrow">Rémunération</div>
              <h2 className="section-title-light">
                Payé au résultat,
                <br />
                <em>pas au volume d&apos;appels.</em>
              </h2>
              <p className="pricing-intro">
                Chaque rendez-vous honoré — c&apos;est-à-dire un rendez-vous où le prospect se
                présente effectivement — vous rapporte 50 € HT. Chaque prospect fourni mérite
                d&apos;être travaillé à fond : c&apos;est le résultat qui paie.
              </p>
              <div className="pricing-compare">
                <span>
                  Les plateformes équivalentes facturent <strong>~150 € le rendez-vous</strong> —
                  mais vous devez tout constituer vous-même. Ici, la différence vous revient en
                  temps gagné.
                </span>
              </div>

              <h3 className="validity-title">Ce qui fait un rendez-vous valide</h3>
              <div className="validity-list">
                {VALIDITE.map((v, i) => (
                  <div className="validity-item" key={v}>
                    <span className="validity-num">{i + 1}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pricing-card fade-up d2">
              <div className="pricing-card-glow" />
              <div className="pricing-card-label">Le tarif</div>
              <div className="pricing-price">
                50&nbsp;€<sup>HT</sup>
              </div>
              <div className="pricing-price-unit">par rendez-vous honoré</div>

              <div className="pricing-divider" />

              <div className="pricing-includes-title">Ce que ça inclut</div>
              <div className="pricing-includes">
                <div className="pricing-include">
                  {CheckIcon}
                  <span>Prospects qualifiés fournis — téléphone et décisionnaire identifié</span>
                </div>
                <div className="pricing-include">
                  {CheckIcon}
                  <span>Accès personnel à l&apos;espace agent du CRM</span>
                </div>
                <div className="pricing-include">
                  {CheckIcon}
                  <span>Catalogue des offres, prix et argumentaires prêts à l&apos;emploi</span>
                </div>
                <div className="pricing-include">
                  {CheckIcon}
                  <span>Pipeline et calendrier intégrés pour poser vos créneaux</span>
                </div>
              </div>

              <div className="pricing-divider" />

              <div className="pricing-includes-title">Les conditions</div>
              <div className="pricing-conditions">
                <div className="pricing-condition">
                  {DotIcon}
                  <span>Payé uniquement si le prospect se présente — un no-show est remplacé, sans facturation</span>
                </div>
                <div className="pricing-condition">
                  {DotIcon}
                  <span>Appels enregistrés et rappel SMS / e-mail avant chaque rendez-vous</span>
                </div>
                <div className="pricing-condition">
                  {DotIcon}
                  <span>Facture en fin de mois, validée sur le calendrier et les enregistrements</span>
                </div>
              </div>

              <a className="btn-primary" href={MAILTO}>
                Je me lance
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
            </div>
          </div>
        </section>

        {/* LES RÈGLES */}
        <section className="section-light" id="regles">
          <div className="section-header fade-up">
            <div className="eyebrow">Les règles du jeu</div>
            <h2 className="section-title-light">
              Tout ce qu&apos;il faut savoir <em>avant de commencer.</em>
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

        {/* CTA FINAL */}
        <section className="cta-section" id="contact" aria-label="Démarrer">
          <div className="cta-bg-glow" />
          <div className="cta-sun-wrap fade-up" aria-hidden="true">
            <svg className="cta-sun-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="rgba(90,169,230,0.25)" mask="url(#sun-ring-light)" />
            </svg>
          </div>
          <div className="cta-content fade-up d2">
            <div className="eyebrow">Pour démarrer</div>
            <h2 className="cta-title">
              Prêt à passer <em>vos premiers appels ?</em>
            </h2>
            <p className="cta-sub">
              Écrivez-nous : un accès à l&apos;espace agent vous est créé, puis vous vous connectez
              et vous pouvez commencer à appeler. Statut indépendant requis (auto-entrepreneur ou
              société, avec SIRET).
            </p>
            <div className="contact-actions">
              <a className="btn-primary" href={MAILTO}>
                Proposer ma candidature
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
                <a className="contact-link" href="mailto:contact@samadigitalstudio.fr">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  contact@samadigitalstudio.fr
                </a>
                <Link className="contact-link" href="/login">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <path d="m10 17 5-5-5-5M15 12H3" />
                  </svg>
                  Se connecter à l&apos;espace agent
                </Link>
              </div>
              <div className="cta-note">
                Conditions indicatives — précisées ou ajustées dans le contrat de prestation conclu
                individuellement avec chaque freelance.
              </div>
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
            <Link href="/login">Espace agent</Link>
            <a href="/mentions-legales">Mentions légales</a>
            <a href="mailto:contact@samadigitalstudio.fr">Contact</a>
          </div>
          <div className="footer-tagline">© 2026 SAMA · Agence digitale française</div>
        </footer>
      </div>
      <ScrollEffects />
    </>
  );
}
