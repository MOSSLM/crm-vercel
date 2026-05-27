import Link from "next/link";
import "./landing.css";
import ScrollEffects from "@/components/landing/ScrollEffects";
import CtaForm from "@/components/landing/CtaForm";

export const metadata = {
  title: "SAMA — Des sites qui génèrent de vrais clients",
  description:
    "Agence digitale française. Sites professionnels et référencement local pour artisans CVC, énergie solaire et pros de l'habitat.",
};

const SUN_PATH =
  "M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z";

export default function LandingPage() {
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
            <pattern
              id="hatch-cream"
              x="0"
              y="0"
              width="9"
              height="9"
              patternTransform="rotate(42)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="9" stroke="#F4F1EB" strokeWidth="0.7" />
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
        <nav id="sama-nav" className="nav">
          <a href="#" className="nav-logo">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="#B5D0F0" mask="url(#sun-ring-light)" />
            </svg>
            <span className="nav-logo-text">SAMA</span>
          </a>
          <div className="nav-links">
            <a href="#probleme">Services</a>
            <a href="#methode">Méthode</a>
            <a href="#livrables">Livrables</a>
            <Link href="/login" className="nav-login">
              Connexion
            </Link>
            <a href="#contact" className="nav-cta">
              Audit gratuit
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
              <stop offset="0%" stopColor="#3A7BD5" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0B1D3A" stopOpacity="0" />
            </radialGradient>
            <ellipse cx="340" cy="380" rx="280" ry="230" fill="url(#cloud-glow)" />

            <g opacity="0.55" filter="url(#cloud-grain)">
              <rect width="700" height="700" fill="rgba(181,208,240,0.14)" clipPath="url(#cloud-back)" />
              <rect width="700" height="700" fill="url(#hatch-cream)" opacity="0.18" clipPath="url(#cloud-back)" />
            </g>
            <g filter="url(#cloud-grain)">
              <rect width="700" height="700" fill="rgba(232,243,255,0.22)" clipPath="url(#cloud-main)" />
              <rect width="700" height="700" fill="url(#hatch-cream)" opacity="0.32" clipPath="url(#cloud-main)" />
            </g>
            <g opacity="0.4" filter="url(#cloud-grain)">
              <rect width="700" height="700" fill="rgba(181,208,240,0.12)" clipPath="url(#cloud-small)" />
              <rect width="700" height="700" fill="url(#hatch-cream)" opacity="0.14" clipPath="url(#cloud-small)" />
            </g>
            <line x1="60" y1="590" x2="640" y2="590" stroke="rgba(181,208,240,0.08)" strokeWidth="1" />
            <line x1="100" y1="608" x2="600" y2="608" stroke="rgba(181,208,240,0.04)" strokeWidth="1" />
          </svg>

          <div className="hero-content">
            <div className="hero-eyebrow">Agence digitale · France</div>
            <h1 className="hero-h1">
              Des sites qui<br />
              <em>génèrent</em>
              <br />
              de vrais clients.
            </h1>
            <p className="hero-sub">
              Artisans CVC, énergie solaire, pros de l&apos;habitat — on construit votre présence en ligne pour
              qu&apos;elle travaille pour vous, 24h/24.
            </p>
            <div className="hero-actions">
              <a href="#contact" className="btn-primary">
                Audit gratuit
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 7h10M8 4l4 3-4 3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a href="#methode" className="btn-ghost">
                Voir la méthode →
              </a>
            </div>
          </div>
          <div className="hero-scroll">
            <div className="scroll-line" />
            <span>Scroll</span>
          </div>
        </section>

        {/* PROOF BAR */}
        <div className="proof-bar">
          <div className="proof-item">Artisans CVC</div>
          <div className="proof-item">Énergie solaire &amp; PV</div>
          <div className="proof-item">Pros de l&apos;habitat</div>
          <div className="proof-item">Restaurants &amp; commerces</div>
          <div className="proof-item">Référencement local</div>
        </div>

        {/* PROBLÈME */}
        <section className="section-light" id="probleme">
          <div className="section-header fade-up">
            <div className="eyebrow">Le constat</div>
            <h2 className="section-title-light">
              Vos concurrents
              <br />
              vous <em>prennent vos clients</em>
              <br />
              en ligne.
            </h2>
            <p className="section-intro-light">
              Vous avez le savoir-faire. Le problème, c&apos;est que votre présence digitale ne le reflète pas
              encore — et vos prospects le voient.
            </p>
          </div>
          <div className="prob-grid">
            <div className="prob-card fade-up d1">
              <div className="prob-num">01</div>
              <div className="prob-title">Invisible sur Google</div>
              <div className="prob-desc">
                Un client qui cherche &quot;plombier Paris 15&quot; ne vous trouve pas. Il appelle votre concurrent
                avec un meilleur site.
              </div>
            </div>
            <div className="prob-card fade-up d2">
              <div className="prob-num">02</div>
              <div className="prob-title">Site qui n&apos;inspire pas confiance</div>
              <div className="prob-desc">
                3 secondes. C&apos;est le temps qu&apos;a votre site pour convaincre. Un design vieilli, et le
                visiteur repart sans rappeler.
              </div>
            </div>
            <div className="prob-card fade-up d3">
              <div className="prob-num">03</div>
              <div className="prob-title">Pas de flux de leads</div>
              <div className="prob-desc">
                Le bouche-à-oreille, ça fonctionne. Mais ça ne se pilote pas. Un site optimisé, ça génère des
                demandes chaque semaine.
              </div>
            </div>
          </div>
        </section>

        {/* MÉTHODE */}
        <section className="section-dark" id="methode" style={{ paddingBottom: 80 }}>
          <div className="section-header fade-up">
            <div className="eyebrow">Notre méthode</div>
            <h2 className="section-title-dark">
              Quatre étapes,
              <br />
              un seul <em>objectif</em> : vos clients.
            </h2>
            <p className="section-intro-dark">
              Pas de jargon, pas de promesse floue. Une méthode éprouvée sur des dizaines d&apos;artisans et pros
              du bâtiment.
            </p>
          </div>
          <div className="methode-grid">
            {[
              {
                step: "01 · Stratégie",
                title: (
                  <>
                    Comprendre votre
                    <br />
                    <em>marché local</em>
                  </>
                ),
                desc: "Audit de vos concurrents, analyse des recherches de vos futurs clients, définition du positionnement qui vous démarque.",
                d: "d1",
              },
              {
                step: "02 · Design",
                title: (
                  <>
                    Un site qui
                    <br />
                    <em>inspire confiance</em>
                  </>
                ),
                desc: "Design sur-mesure, mobile-first, chargement rapide. Conçu pour que le visiteur appelle, pas pour faire joli.",
                d: "d2",
              },
              {
                step: "03 · SEO local",
                title: (
                  <>
                    Apparaître quand
                    <br />
                    ça <em>compte</em>
                  </>
                ),
                desc: "Optimisation Google Maps, mots-clés métier + ville, fiche Google Business. Vos clients vous trouvent avant les autres.",
                d: "d1",
              },
              {
                step: "04 · Suivi",
                title: (
                  <>
                    Des résultats
                    <br />
                    <em>mesurables</em>
                  </>
                ),
                desc: "Rapport mensuel simple : trafic, appels, positions. Vous savez exactement ce que votre site vous rapporte.",
                d: "d2",
              },
            ].map((item, i) => (
              <div className={`methode-item fade-up ${item.d}`} key={i}>
                <div className="methode-item-glow" />
                <div className="methode-step">{item.step}</div>
                <div className="methode-title">{item.title}</div>
                <div className="methode-desc">{item.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* LIVRABLES */}
        <section className="section-light" id="livrables">
          <div className="livrables-layout">
            <div className="fade-up">
              <div className="eyebrow">Ce que vous recevez</div>
              <h2 className="section-title-light">
                Tout est <em>inclus</em>,<br />
                rien n&apos;est flou.
              </h2>
              <p className="section-intro-light">Un prix, une liste claire. Pas de mauvaise surprise au devis final.</p>
              <div className="livrables-quote">
                <div className="livrables-quote-text">
                  &quot;En 3 semaines, mon site était en ligne et j&apos;avais déjà 4 demandes de devis depuis
                  Google.&quot;
                </div>
                <div className="livrables-quote-attr">Client SAMA · Installateur CVC · Île-de-France</div>
              </div>
            </div>
            <div className="livrables-list">
              {[
                {
                  name: "Site vitrine complet (jusqu'à 6 pages)",
                  sub: "Accueil · Services · Réalisations · À propos · Contact · Devis",
                  d: "d1",
                },
                {
                  name: "Copywriting et textes de vente",
                  sub: "Rédigés par nos soins, orientés conversion, ton professionnel et accessible",
                  d: "d1",
                },
                {
                  name: "SEO local complet",
                  sub: "Optimisation on-page, Google Business, Search Console, sitemap",
                  d: "d2",
                },
                {
                  name: "Hébergement + nom de domaine (1 an)",
                  sub: "Serveur rapide, SSL inclus, maintenance mensuelle",
                  d: "d2",
                },
                {
                  name: "Rapport mensuel de performance",
                  sub: "Trafic, appels générés, positions Google — clair et sans jargon",
                  d: "d3",
                },
                {
                  name: "Support réactif (réponse sous 24h)",
                  sub: "Modification de contenu, questions, évolutions incluses 6 mois",
                  d: "d3",
                },
              ].map((item, i) => (
                <div className={`livrable-row fade-up ${item.d}`} key={i}>
                  <div className="livrable-check">
                    <svg viewBox="0 0 11 11" fill="none">
                      <path
                        d="M2 5.5L4.5 8L9 3"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="livrable-name">{item.name}</div>
                    <div className="livrable-sub">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-section" id="contact">
          <div className="cta-bg-glow" />
          <div className="cta-sun-wrap fade-up">
            <svg className="cta-sun-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="rgba(58,123,213,0.25)" mask="url(#sun-ring-light)" />
            </svg>
          </div>
          <div className="cta-content fade-up d2">
            <div className="eyebrow">Audit gratuit</div>
            <h2 className="cta-title">
              On regarde votre situation.
              <br />
              <em>Sans engagement.</em>
            </h2>
            <p className="cta-sub">
              15 minutes d&apos;appel. On analyse votre visibilité locale, votre site actuel, vos concurrents. Et
              on vous dit honnêtement ce qu&apos;on peut faire.
            </p>
            <CtaForm />
          </div>
        </section>

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer-logo">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="currentColor" mask="url(#sun-ring-light)" />
            </svg>
            <span>SAMA</span>
          </div>
          <div className="footer-links">
            <a href="#probleme">Services</a>
            <a href="#methode">Méthode</a>
            <a href="#contact">Contact</a>
            <Link href="/login">Connexion</Link>
            <a href="#">Mentions légales</a>
          </div>
          <div className="footer-tagline">© {new Date().getFullYear()} SAMA · Agence digitale française</div>
        </footer>
      </div>
      <ScrollEffects />
    </>
  );
}
