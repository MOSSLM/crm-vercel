"use client";

/**
 * sama — homepage FR.
 *
 * Portage React de la maquette « SAMA FR Homepage » (identité visuelle sama).
 * Les styles vivent dans src/app/sama-home.css, tous portés par `.sama-home`
 * pour ne pas entrer en conflit avec globals.css / studio.css du CRM.
 *
 * Note : l'onglet « Connexion » est volontairement absent de la navigation.
 * /login reste accessible directement par son URL.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DASH_BARS,
  INDUSTRIES,
  JOURNEY,
  MANIFESTO_COLS,
  SERVICES,
  TF_CHIPS,
  USE_CASES,
} from "./data";

const CONTACT_EMAIL = "contact@samadigitalstudio.fr";

/* ══════════════════════════ helpers ══════════════════════════ */

function SunMark({ className = "sun", spin = false }: { className?: string; spin?: boolean }) {
  const rect = <rect width="100" height="100" fill="currentColor" mask="url(#sama-sun-mask)" />;
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      {spin ? <g>{rect}</g> : rect}
    </svg>
  );
}

function ArrowRight({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7h10M8 4l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spark({ className = "spark", size = 22 }: { className?: string; size?: number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden="true">
      <path d="M12 0c1 7 4 10 11 11.5C16 13 13 16 12 24c-1-8-4-11-11-12.5C8 10 11 7 12 0Z" />
    </svg>
  );
}

function CheckDot() {
  return (
    <span className="c">
      <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ══════════════════════════ INTRO ══════════════════════════ */

function Intro() {
  const [visible, setVisible] = useState(true);
  const [done, setDone] = useState(false);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = sessionStorage.getItem("sama_intro_seen_fr");
    } catch {
      /* sessionStorage indisponible (navigation privée stricte) — on joue l'intro */
    }
    if (seen || prefersReducedMotion()) {
      setVisible(false);
      return;
    }

    document.body.classList.add("sama-intro-lock");
    let removeTimer = 0;

    const finish = () => {
      window.clearTimeout(autoTimer);
      document.body.classList.remove("sama-intro-lock");
      try {
        sessionStorage.setItem("sama_intro_seen_fr", "1");
      } catch {
        /* ignore */
      }
      setDone(true);
      removeTimer = window.setTimeout(() => setVisible(false), 850);
    };
    finishRef.current = finish;
    const autoTimer = window.setTimeout(finish, 2700);

    return () => {
      window.clearTimeout(autoTimer);
      window.clearTimeout(removeTimer);
      document.body.classList.remove("sama-intro-lock");
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`intro${done ? " done" : ""}`} id="intro">
      <div className="intro-bg" />
      <div className="intro-center">
        <SunMark className="intro-sun" spin />
        <div className="intro-word">
          {"sama".split("").map((c, i) => (
            <span key={i} style={{ animationDelay: `${(0.45 + i * 0.09).toFixed(2)}s` }}>
              {c}
            </span>
          ))}
        </div>
        <div className="intro-line" />
        <div className="intro-tag">Faites rayonner votre entreprise</div>
      </div>
      <button type="button" className="intro-skip" onClick={() => finishRef.current()}>
        Passer l&apos;intro →
      </button>
    </div>
  );
}

/* ══════════════════════════ TRANSFORM ══════════════════════════ */

function TransformSection() {
  const railRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const headARef = useRef<HTMLSpanElement>(null);
  const headBRef = useRef<HTMLSpanElement>(null);
  const subARef = useRef<HTMLSpanElement>(null);
  const subBRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const stage = stageRef.current;
    if (!rail || !stage) return;

    const reduce = prefersReducedMotion();
    const geom = TF_CHIPS.map((c, i) => ({
      ...c,
      ang: (i / TF_CHIPS.length) * Math.PI * 2 - Math.PI / 2,
      // déphasage déterministe : évite tout écart serveur / client
      phase: (i * 2.399963) % (Math.PI * 2),
    }));

    let dims = { w: 0, h: 0 };
    const measure = () => {
      const r = stage.getBoundingClientRect();
      dims = { w: r.width, h: r.height };
    };
    measure();

    let progress = 0;
    const readProgress = () => {
      const r = rail.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      progress = total > 0 ? clamp01(-r.top / total) : 0;
    };
    readProgress();

    const render = (time: number) => {
      if (!dims.w || !dims.h) measure();
      const W = dims.w;
      const H = dims.h;
      const cx = W * 0.5;
      const cy = H * 0.5;
      const radius = Math.min(W, H) * 0.44;
      const p = progress;

      const conv = smooth(clamp01((p - 0.36) / 0.5)); // 0 dispersé → 1 en orbite
      const hubT = smooth(clamp01((p - 0.42) / 0.3)); // apparition du hub
      const lineT = smooth(clamp01((p - 0.66) / 0.3)); // tracé des liaisons
      const swap = p > 0.58;

      const hub = hubRef.current;
      if (hub) {
        hub.style.opacity = String(hubT);
        hub.style.transform = `translate(-50%,-50%) scale(${lerp(0.4, 1, hubT)})`;
      }

      geom.forEach((c, i) => {
        const el = chipRefs.current[i];
        const path = pathRefs.current[i];
        if (!el) return;
        const sx = (c.sx / 100) * W;
        const sy = (c.sy / 100) * H;
        const ox = cx + Math.cos(c.ang) * radius;
        const oy = cy + Math.sin(c.ang) * radius;
        const fl = (1 - conv) * 6;
        const x = lerp(sx, ox, conv) + Math.sin(time / 1400 + c.phase) * fl;
        const y = lerp(sy, oy, conv) + Math.cos(time / 1600 + c.phase) * fl;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) rotate(${lerp(c.r, 0, conv)}deg)`;
        el.classList.toggle("warn", conv < 0.55);
        if (path) {
          path.setAttribute("d", `M ${cx} ${cy} L ${x} ${y}`);
          path.style.opacity = String(lineT * 0.8);
        }
      });

      const headA = headARef.current;
      const headB = headBRef.current;
      if (headA && headB) {
        headA.style.opacity = swap ? "0" : "1";
        headA.style.transform = swap ? "translateY(-12px)" : "translateY(0)";
        headB.style.opacity = swap ? "1" : "0";
        headB.style.transform = swap ? "translateY(0)" : "translateY(12px)";
      }
      const subA = subARef.current;
      const subB = subBRef.current;
      if (subA && subB) {
        subA.style.opacity = swap ? "0" : "1";
        subB.style.opacity = swap ? "1" : "0";
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        readProgress();
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);

    let raf = 0;
    if (reduce) {
      // état « après », figé
      progress = 1;
      measure();
      render(0);
    } else {
      const loop = (t: number) => {
        const r = rail.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) render(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="transform" id="transform">
      <div className="transform-rail" ref={railRef}>
        <div className="transform-sticky">
          <div className="tf-caption">
            <div className="tf-step">Nº 02 · Avant &amp; après</div>
            <div className="tf-head">
              <span className="a" ref={headARef}>
                Dix outils. <em>Rien</em> n&apos;est relié.
              </span>
              <span className="b" ref={headBRef} style={{ opacity: 0 }}>
                Un seul endroit. <em>Tout</em> est relié.
              </span>
            </div>
            <div className="tf-sub">
              <span ref={subARef}>
                Un site par ici, un compte de publicité par là, les avis dans une autre appli, une newsletter dont
                vous avez oublié le mot de passe. Le casse-tête de la plupart des entreprises.
              </span>
              <span ref={subBRef} style={{ opacity: 0, position: "absolute", left: 0, right: 0 }}>
                sama remplace ce casse-tête par un seul système relié : chaque canal, chaque client, chaque
                résultat, ensemble.
              </span>
            </div>
          </div>
          <div className="tf-stage" ref={stageRef}>
            <svg className="tf-lines" preserveAspectRatio="none" aria-hidden="true">
              {TF_CHIPS.map((_, i) => (
                <path
                  key={i}
                  ref={(el) => {
                    pathRefs.current[i] = el;
                  }}
                />
              ))}
            </svg>
            <div className="tf-hub" ref={hubRef}>
              <SunMark spin />
              <span className="tf-hub-label">Sama Studio</span>
            </div>
            {TF_CHIPS.map((c, i) => (
              <div
                key={c.t}
                className="tf-chip warn"
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
              >
                <span className="ic">{c.icon}</span>
                {c.t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════ CTA FORM ══════════════════════════ */

function CtaForm() {
  const [sent, setSent] = useState(false);

  const onSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    // Pas encore d'endpoint public de collecte : on pré-remplit un e-mail.
    // TODO: brancher sur une route serveur (ex. /api/public/contact) quand elle existera.
    const body = [
      `Prénom : ${get("prenom")}`,
      `Type d'entreprise : ${get("activite")}`,
      `E-mail : ${get("email")}`,
      `Téléphone : ${get("telephone") || "—"}`,
      "",
      "Je souhaite recevoir mon bilan gratuit.",
    ].join("\n");
    window.location.href =
      `mailto:${CONTACT_EMAIL}` +
      `?subject=${encodeURIComponent("Demande de bilan gratuit — sama")}` +
      `&body=${encodeURIComponent(body)}`;
    setSent(true);
  }, []);

  return (
    <form className="cta-form" onSubmit={onSubmit}>
      <div className="ff">
        <input className="cta-input" type="text" name="prenom" placeholder="Prénom" autoComplete="given-name" required />
        <input className="cta-input" type="text" name="activite" placeholder="Type d'entreprise" required />
      </div>
      <input
        className="cta-input"
        type="email"
        name="email"
        placeholder="Adresse e-mail"
        autoComplete="email"
        required
        style={{ marginBottom: 12 }}
      />
      <input className="cta-input" type="tel" name="telephone" placeholder="Téléphone (facultatif)" autoComplete="tel" />
      <button className="cta-submit" type="submit">
        Recevoir mon bilan gratuit →
      </button>
      <div className="cta-note" aria-live="polite">
        {sent ? "Merci ! Votre messagerie s'ouvre avec le message pré-rempli." : "Réponse sous 24 h · Sans engagement"}
      </div>
    </form>
  );
}

/* ══════════════════════════ PAGE ══════════════════════════ */

export default function SamaHome() {
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const maniRef = useRef<HTMLParagraphElement>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const [activeUc, setActiveUc] = useState(USE_CASES[0].id);

  /* nav : état « scrolled » */
  useEffect(() => {
    const onScroll = () => navRef.current?.classList.toggle("scrolled", window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* apparition au scroll */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* manifesto : le surligneur grandit au scroll */
  useEffect(() => {
    const stmt = maniRef.current;
    if (!stmt) return;
    if (prefersReducedMotion()) {
      stmt.style.setProperty("--mani-shine", "1");
      stmt.style.setProperty("--mani-hi", "106%");
      return;
    }
    let ticking = false;
    const update = () => {
      const r = stmt.getBoundingClientRect();
      const start = window.innerHeight * 0.88;
      const end = window.innerHeight * 0.4;
      const p = clamp01((start - r.top) / (start - end));
      stmt.style.setProperty("--mani-shine", p.toFixed(3));
      stmt.style.setProperty("--mani-hi", `${(p * 106).toFixed(1)}%`);
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* tableau de bord : foil holographique suivant le pointeur */
  useEffect(() => {
    const dash = dashRef.current;
    if (!dash || prefersReducedMotion()) return;
    const base = "perspective(1400px) rotateY(-7deg) rotateX(2deg)";
    let raf = 0;
    let ev: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!ev) return;
      const r = dash.getBoundingClientRect();
      const px = clamp01((ev.clientX - r.left) / r.width);
      const py = clamp01((ev.clientY - r.top) / r.height);
      dash.style.transform = `perspective(1400px) rotateY(${(-7 + (px - 0.5) * 18).toFixed(2)}deg) rotateX(${(
        2 -
        (py - 0.5) * 15
      ).toFixed(2)}deg)`;
      dash.style.setProperty("--pointer-x", `${(px * 100).toFixed(1)}%`);
      dash.style.setProperty("--pointer-y", `${(py * 100).toFixed(1)}%`);
      dash.style.setProperty("--bg-x", `${(25 + px * 50).toFixed(1)}%`);
      dash.style.setProperty("--bg-y", `${(25 + py * 50).toFixed(1)}%`);
    };
    const onEnter = () => {
      dash.style.transition = "transform .12s ease-out";
      dash.classList.add("holo-active");
    };
    const onMove = (e: PointerEvent) => {
      ev = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      dash.classList.remove("holo-active");
      dash.style.transition = "transform .5s var(--ease)";
      dash.style.transform = base;
    };
    dash.addEventListener("pointerenter", onEnter);
    dash.addEventListener("pointermove", onMove);
    dash.addEventListener("pointerleave", onLeave);
    return () => {
      dash.removeEventListener("pointerenter", onEnter);
      dash.removeEventListener("pointermove", onMove);
      dash.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* carte service : halo qui suit le pointeur */
  const onCardMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const card = e.currentTarget;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);

  const activePanel = USE_CASES.find((u) => u.id === activeUc) ?? USE_CASES[0];

  return (
    <div className="sama-home" ref={rootRef}>
      <div className="grain" />

      {/* defs SVG partagées */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <mask id="sama-sun-mask">
            <path
              d="M50,4 L55.85,20.58 L67.6,7.5 L66.67,25.06 L82.5,17.5 L74.95,33.33 L92.5,32.4 L79.42,44.15 L96,50 L79.42,55.85 L92.5,67.6 L74.95,66.67 L82.5,82.5 L66.67,74.94 L67.6,92.5 L55.85,79.42 L50,96 L44.15,79.42 L32.4,92.5 L33.33,74.94 L17.5,82.5 L25.05,66.67 L7.5,67.6 L20.58,55.85 L4,50 L20.58,44.15 L7.5,32.4 L25.05,33.33 L17.5,17.5 L33.33,25.06 L32.4,7.5 L44.15,20.58 Z"
              fill="white"
            />
            <circle cx="50" cy="50" r="15" fill="black" />
          </mask>
        </defs>
      </svg>

      <Intro />

      {/* ════════ NAV ════════ */}
      <nav ref={navRef} aria-label="Navigation principale">
        <a href="#top" className="nav-logo" aria-label="sama — retour en haut de page">
          <SunMark />
          <span className="nav-logo-text">sama</span>
        </a>
        <div className="nav-links">
          <a href="#manifesto">Pourquoi sama</a>
          <a href="#usecases">Pour qui</a>
          <a href="#how">Comment ça marche</a>
          <a href="#services">Services</a>
          <a href="#platform">Votre espace</a>
          <a href="#contact" className="nav-cta">
            Bilan gratuit
          </a>
        </div>
      </nav>

      {/* ════════ HERO ════════ */}
      <header className="hero" id="top">
        <div className="hero-grid-bg" />
        <div className="v-label l">Vol. 01 · MMXXVI</div>
        <div className="v-label r">Faire rayonner</div>
        <div className="hero-inner">
          <div className="hero-top reveal">
            <div className="hero-issue">Vol. 01 · Votre partenaire digital tout-en-un</div>
            <div className="hero-issue">
              Depuis <b>2026</b> · France
            </div>
          </div>
          <h1 className="hero-h1 reveal d1">
            Faites{" "}
            <span style={{ whiteSpace: "nowrap" }}>
              <em>rayonner</em>
              <Spark />
            </span>
            <br />
            votre entreprise.
          </h1>
          <div className="hero-body">
            <p className="hero-sub reveal d2">
              sama réunit toute votre présence en ligne au même endroit : site internet, publicité, avis clients,
              vidéo, messages, et un seul espace pour tout piloter. Une seule équipe, un seul outil, une seule
              facture. Vous vous concentrez sur votre métier, on s&apos;occupe du reste.
            </p>
            <div className="hero-aside reveal d3">
              <div className="lead-cap">Pensé pour les entreprises qui font vivre nos villes.</div>
              <div className="hero-actions">
                <a href="#contact" className="btn-primary">
                  Recevoir un bilan gratuit
                  <ArrowRight />
                </a>
                <a href="#how" className="btn-ghost">
                  Voir comment ça marche
                  <span className="ico">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M7 2v10M3 8l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </a>
              </div>
            </div>
          </div>
          <figure className="hero-figure reveal d3">
            <span className="reg" style={{ left: -7, top: -7 }} />
            <span className="reg" style={{ right: -7, bottom: -7 }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sama/hero-main.webp" alt="Une équipe au travail dans son entreprise" width={1600} height={900} />
            <figcaption className="figcap">Fig. 01 · Votre entreprise sous son meilleur jour</figcaption>
            <div className="corner">
              <div className="n">
                <em>8</em>+ canaux
              </div>
              <div className="l">gérés au même endroit</div>
            </div>
          </figure>
        </div>
      </header>

      {/* ════════ MARQUEE ════════ */}
      <div className="marquee-wrap">
        <div className="marquee-label">La confiance des entreprises qui font vivre nos quartiers</div>
        <div className="marquee" aria-hidden="true">
          {[...INDUSTRIES, ...INDUSTRIES].map((label, i) => (
            <span className="mq-item" key={`${label}-${i}`}>
              <span className="d" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ════════ MANIFESTO ════════ */}
      <section className="manifesto" id="manifesto">
        <span className="reg light" style={{ left: "var(--pad)", top: 60 }} />
        <span className="reg light" style={{ right: "var(--pad)", bottom: 60 }} />
        <div className="wrap">
          <div className="spec reveal">
            <span className="rule" />
            <span className="num">Nº 01</span> &nbsp;Notre conviction
          </div>
          <p className="manifesto-statement reveal d1" ref={maniRef}>
            Exister en ligne ne devrait pas demander{" "}
            <span className="dim">dix mots de passe et trois prestataires</span>. Juste <em>un seul partenaire</em>,
            et du temps pour faire ce que vous faites de mieux.
          </p>
          <div className="manifesto-grid">
            {MANIFESTO_COLS.map((col, i) => (
              <div className={`mani-col reveal d${i + 1}`} key={col.k}>
                <div className="k">{col.k}</div>
                <h4>{col.h}</h4>
                <p>{col.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ TRANSFORM ════════ */}
      <TransformSection />

      {/* ════════ POUR QUI ════════ */}
      <section className="block uc" id="usecases">
        <div className="wrap">
          <div className="section-head reveal">
            <div className="spec">
              <span className="rule" />
              <span className="num">Nº 03</span> &nbsp;Pour qui
            </div>
            <h2 className="h2">
              Adapté à <em>votre</em> type d&apos;entreprise.
            </h2>
            <p className="lead">
              Chaque entreprise gagne ses clients à sa manière. On adapte tout à la vôtre, et voici où sama entre en
              jeu.
            </p>
          </div>
          <div className="uc-layout reveal d1">
            <div className="uc-rail" role="tablist" aria-label="Types d'entreprise">
              {USE_CASES.map((uc) => (
                <button
                  type="button"
                  role="tab"
                  id={`uc-tab-${uc.id}`}
                  aria-selected={activeUc === uc.id}
                  aria-controls={`uc-panel-${uc.id}`}
                  className={`uc-tab${activeUc === uc.id ? " active" : ""}`}
                  key={uc.id}
                  onClick={() => setActiveUc(uc.id)}
                >
                  <span className="ti">{uc.index}</span>
                  <span className="tn">{uc.tab}</span>
                  <span className="arrow">
                    <ArrowRight size={18} />
                  </span>
                </button>
              ))}
            </div>
            <div className="uc-panels">
              <div
                className="uc-panel active"
                key={activePanel.id}
                id={`uc-panel-${activePanel.id}`}
                role="tabpanel"
                aria-labelledby={`uc-tab-${activePanel.id}`}
              >
                <figure className="uc-figure">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activePanel.img} alt={activePanel.imgAlt} width={1200} height={800} loading="lazy" />
                  <span className="cap">{activePanel.caption}</span>
                </figure>
                <h3>{activePanel.title}</h3>
                <p>{activePanel.body}</p>
                <div className="uc-chips">
                  {activePanel.chips.map((chip) => (
                    <span className="uc-chip" key={chip}>
                      <span className="gl" />
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ COMMENT ÇA MARCHE ════════ */}
      <section className="block journey" id="how">
        <div className="wrap">
          <div className="section-head reveal">
            <div className="spec">
              <span className="rule" />
              <span className="num">Nº 04</span> &nbsp;Comment on travaille avec vous
            </div>
            <h2 className="h2">
              Du premier appel à une <em>croissance régulière</em>, en quatre étapes simples.
            </h2>
          </div>
          <div className="journey-list">
            {JOURNEY.map((step) => (
              <div className="journey-step reveal" key={step.num}>
                <div className="jnum">{step.num}</div>
                <div className="jbody">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <span className="jtag">{step.tag}</span>
                </div>
                <div className="jfig">
                  <span className="jicon">{step.icon}</span>
                  <span className="tagcap">{step.figCaption}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ SERVICES ════════ */}
      <section className="block svc" id="services">
        <div className="wrap">
          <div className="section-head reveal">
            <div className="spec">
              <span className="rule" />
              <span className="num">Nº 05</span> &nbsp;Ce qu&apos;on fait
            </div>
            <h2 className="h2">
              Tout ce qui fait grandir votre entreprise, <em>pris en charge.</em>
            </h2>
            <p className="lead">
              Choisissez ce dont vous avez besoin aujourd&apos;hui, ajoutez le reste plus tard. Tout vit dans un seul
              espace.
            </p>
          </div>
          <div className="svc-grid">
            {SERVICES.map((s, i) => (
              <article
                key={s.name}
                className={`svc-card reveal d${(i % 4) + 1}${s.wide ? " wide" : ""}${s.feature ? " feature" : ""}`}
                onPointerMove={onCardMove}
              >
                <span className="svc-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="svc-ico">{s.icon}</div>
                <span className="svc-tag">{s.tag}</span>
                <div className="svc-name">{s.name}</div>
                <div className="svc-desc">{s.desc}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ VOTRE ESPACE ════════ */}
      <section className="block plat" id="platform">
        <div className="wrap plat-grid">
          <div>
            <div className="spec reveal">
              <span className="rule" />
              <span className="num">Nº 06</span> &nbsp;Sama Studio
            </div>
            <h2 className="h2 reveal d1" style={{ marginTop: 20 }}>
              Un seul espace pour <em>tout gérer.</em>
            </h2>
            <p className="lead reveal d2">
              Votre site, vos publicités, vos avis, vos messages et vos clients, réunis dans un seul outil. Voyez ce
              qui marche, répondez à un client, lancez une campagne et lisez vos avis sans changer d&apos;écran.
            </p>
            <div className="plat-list">
              <div className="plat-li reveal d2">
                <CheckDot />
                <span>
                  <b>Vos clients réunis au même endroit</b>
                  <small>Chaque formulaire, appel et message devient un contact que vous pouvez rappeler.</small>
                </span>
              </div>
              <div className="plat-li reveal d3">
                <CheckDot />
                <span>
                  <b>Publicités et messages intégrés</b>
                  <small>Lancez des publicités, envoyez SMS et e-mails, suivez les réponses, sans autre appli.</small>
                </span>
              </div>
              <div className="plat-li reveal d4">
                <CheckDot />
                <span>
                  <b>Des résultats vraiment lisibles</b>
                  <small>Des chiffres clairs sur vos appels, vos rendez-vous et vos avis, sans jargon.</small>
                </span>
              </div>
            </div>
          </div>
          <div className="reveal d2">
            <div className="dash" ref={dashRef}>
              <div className="dash-foil" />
              <div className="dash-glare" />
              <div className="dash-bar">
                <span className="dot" style={{ background: "#ff6058" }} />
                <span className="dot" style={{ background: "#ffbd2e" }} />
                <span className="dot" style={{ background: "#28c840" }} />
                <span className="u">studio.sama · Tableau de bord</span>
              </div>
              <div className="dash-body">
                <div className="dash-kpi">
                  <div className="k">Nouveaux contacts</div>
                  <div className="v">
                    <em>34</em>
                  </div>
                </div>
                <div className="dash-kpi">
                  <div className="k">Avis</div>
                  <div className="v">4,9★</div>
                </div>
                <div className="dash-kpi">
                  <div className="k">Rendez-vous</div>
                  <div className="v">
                    <em>19</em>
                  </div>
                </div>
                <div className="dash-chart">
                  <div className="lbl">Contacts ce mois-ci</div>
                  <div className="dash-bars">
                    {DASH_BARS.map((h, i) => (
                      <i key={i} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="dash-feed">
                  <div className="row">
                    <span className="av">
                      <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path
                          d="M2 4h10v7H2zM2 4l5 4 5-4"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>{" "}
                    Nouveau contact <span className="tt">2 min</span>
                  </div>
                  <div className="row">
                    <span className="av">
                      <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path
                          d="M7 1.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L7 10.6 3.6 12.5l.7-3.8L1.5 6l3.8-.5z"
                          stroke="currentColor"
                          strokeWidth="1"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>{" "}
                    Nouvel avis 5★ <span className="tt">1 h</span>
                  </div>
                  <div className="row">
                    <span className="av">
                      <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M2 3h10v8H2z" stroke="currentColor" strokeWidth="1.1" />
                        <path d="M5 6.5h4M5 8.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                      </svg>
                    </span>{" "}
                    SMS répondu <span className="tt">3 h</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════ CTA ════════ */}
      <section className="cta" id="contact">
        <div className="cta-glow" />
        <span className="reg white" style={{ left: "var(--pad)", top: 46 }} />
        <span className="reg white" style={{ right: "var(--pad)", top: 46 }} />
        <span className="reg white" style={{ left: "var(--pad)", bottom: 46 }} />
        <span className="reg white" style={{ right: "var(--pad)", bottom: 46 }} />
        <div className="cta-inner">
          <div className="reveal">
            <div className="spec">
              <span className="rule" />
              <span className="num">Nº 07</span> &nbsp;On commence ici
            </div>
            <h2>
              Voyons où vous en êtes.{" "}
              <span style={{ whiteSpace: "nowrap" }}>
                <em>Gratuitement.</em>
                <Spark className="spark d" size={18} />
              </span>
            </h2>
            <p>
              En 15 minutes, on regarde votre site, votre visibilité locale, vos avis et vos concurrents, puis on
              vous dit honnêtement ce qu&apos;on ferait. Sans pression, sans engagement.
            </p>
          </div>
          <div className="reveal d2">
            <CtaForm />
          </div>
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer>
        <div className="foot-top">
          <div className="foot-brand">
            <div className="logo">
              <SunMark />
              <span>sama</span>
            </div>
            <p>
              Le partenaire digital tout-en-un des entreprises qui veulent être trouvées, contactées et
              recommandées.
            </p>
          </div>
          <div className="foot-col">
            <h4>Services</h4>
            <a href="#services">Publicité Google</a>
            <a href="#services">Publicité Facebook &amp; Instagram</a>
            <a href="#services">Site internet</a>
            <a href="#services">Vidéo de présentation</a>
          </div>
          <div className="foot-col">
            <h4>Et aussi</h4>
            <a href="#services">Avis Google</a>
            <a href="#services">Fiche Google</a>
            <a href="#services">SMS &amp; e-mails</a>
            <a href="#platform">Sama Studio</a>
          </div>
          <div className="foot-col">
            <h4>L&apos;entreprise</h4>
            <a href="#manifesto">Pourquoi sama</a>
            <a href="#how">Comment ça marche</a>
            <a href="#contact">Bilan gratuit</a>
            <a href="/mentions-legales">Mentions légales</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 sama · Faites rayonner votre entreprise.</span>
          <span>France</span>
        </div>
      </footer>
    </div>
  );
}
