/**
 * Contenu éditorial de la homepage sama (FR).
 *
 * Séparé du composant pour que le texte reste lisible / éditable sans toucher
 * à la mécanique d'animation (cf. SamaHome.tsx).
 */
import type { ReactNode } from "react";

/* ─────────────────────────── Marquee ─────────────────────────── */

export const INDUSTRIES = [
  "Couvreurs & façades",
  "Cliniques vétérinaires",
  "Chauffage & plomberie",
  "Cabinets dentaires",
  "Entreprises du bâtiment",
  "Restaurants & cafés",
  "Agences immobilières",
  "Instituts & spas",
  "Cabinets d'avocats",
  "Garages auto",
  "Paysagistes",
  "Salles de sport",
  "Institutions",
  "Commerces",
];

/* ─────────────────────────── Services ─────────────────────────── */

export type Service = {
  name: string;
  tag: string;
  desc: string;
  wide?: boolean;
  feature?: boolean;
  icon: ReactNode;
};

export const SERVICES: Service[] = [
  {
    name: "Publicité Google",
    tag: "Être trouvé",
    desc: "Apparaissez tout en haut de Google au moment précis où un client cherche ce que vous proposez, et ne payez que si on clique.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect className="an-bar b1" x="8" y="22" width="6" height="18" />
        <rect className="an-bar b2" x="21" y="14" width="6" height="26" />
        <rect className="an-bar b3" x="34" y="8" width="6" height="32" />
      </svg>
    ),
  },
  {
    name: "Publicité Facebook & Instagram",
    tag: "Être vu",
    desc: "On montre votre entreprise aux bonnes personnes sur Facebook et Instagram, avec des visuels qui donnent envie de s'arrêter.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle className="an-pulse" cx="17" cy="24" r="9" />
        <circle className="an-pulse" cx="31" cy="24" r="9" style={{ animationDelay: ".5s" }} />
      </svg>
    ),
  },
  {
    name: "Site internet",
    tag: "Transformer les visiteurs",
    desc: "Un site clair et rapide, parfait sur téléphone, avec un bouton pour vous appeler ou vous écrire en un clic.",
    wide: true,
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="9" width="34" height="30" rx="3" />
        <path d="M7 16h34" />
        <g className="an-form">
          <line x1="13" y1="23" x2="29" y2="23" />
          <line x1="13" y1="28" x2="25" y2="28" />
          <line x1="13" y1="33" x2="21" y2="33" />
        </g>
        <rect className="an-cta" x="31" y="29" width="6" height="6" rx="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: "Sama Studio",
    tag: "Tout au même endroit",
    desc: "Votre espace unique : vos clients, vos messages, vos avis et vos résultats réunis sur un seul écran, simple à utiliser.",
    feature: true,
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect className="an-tile t1" x="8" y="8" width="14" height="14" rx="2.5" />
        <rect className="an-tile t2" x="26" y="8" width="14" height="14" rx="2.5" />
        <rect className="an-tile t3" x="8" y="26" width="14" height="14" rx="2.5" />
        <rect className="an-tile t4" x="26" y="26" width="14" height="14" rx="2.5" />
      </svg>
    ),
  },
  {
    name: "Vidéo de présentation",
    tag: "Raconter votre histoire",
    desc: "Une belle vidéo qui présente votre entreprise et donne confiance, à partager partout.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="12" width="32" height="24" rx="3" />
        <g className="an-frame" fill="currentColor" stroke="none">
          <rect x="11" y="15" width="3" height="3" rx=".6" />
          <rect x="11" y="30" width="3" height="3" rx=".6" />
          <rect x="34" y="15" width="3" height="3" rx=".6" />
          <rect x="34" y="30" width="3" height="3" rx=".6" />
        </g>
        <path className="an-play" d="M21 19l8 5-8 5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: "Fiche Google",
    tag: "Être trouvé près de chez vous",
    desc: "On crée et on soigne votre fiche Google pour que vous apparaissiez sur la carte quand on cherche près de chez vous.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <g className="an-pin">
          <path d="M24 7c-7 0-12 5-12 12 0 9 12 22 12 22s12-13 12-22c0-7-5-12-12-12z" />
          <circle cx="24" cy="19" r="4.5" />
        </g>
      </svg>
    ),
  },
  {
    name: "Avis Google",
    tag: "Inspirer confiance",
    desc: "On transforme vos clients contents en avis 5 étoiles : ceux qui rassurent et déclenchent le prochain rendez-vous.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <g fill="currentColor" stroke="none" transform="translate(2,16)">
          <path className="an-star s1" d="M5 0l1.3 2.7L9 3l-2 1.9.5 2.8L5 6.4 2.5 7.7 3 4.9 1 3l2.7-.3z" />
          <path className="an-star s2" d="M17 0l1.3 2.7L21 3l-2 1.9.5 2.8L17 6.4 14.5 7.7 15 4.9 13 3l2.7-.3z" />
          <path className="an-star s3" d="M29 0l1.3 2.7L33 3l-2 1.9.5 2.8L29 6.4 26.5 7.7 27 4.9 25 3l2.7-.3z" />
          <path className="an-star s4" d="M41 0l1.3 2.7L45 3l-2 1.9.5 2.8L41 6.4 38.5 7.7 39 4.9 37 3l2.7-.3z" />
        </g>
      </svg>
    ),
  },
  {
    name: "SMS & e-mails",
    tag: "Rester dans les mémoires",
    desc: "Des messages automatiques qui font revenir vos clients : rappels, offres et nouvelles, sans que vous ayez à y penser.",
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path className="an-bub bb1" d="M9 12h18a3 3 0 013 3v8a3 3 0 01-3 3H17l-6 5v-5h-2a3 3 0 01-3-3v-8a3 3 0 013-3z" />
        <path className="an-bub bb2" d="M33 20h6a3 3 0 013 3v5a3 3 0 01-3 3v4l-5-4h-4" opacity=".55" />
      </svg>
    ),
  },
];

/* ──────────────────── Transform : les outils éparpillés ──────────────────── */

const TF_ICONS: Record<string, ReactNode> = {
  web: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
    </svg>
  ),
  ads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 11l16-6-3 14-5-4-2 4-1-5z" />
    </svg>
  ),
  rev: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.5 7.1 18.2 8 12.7l-4-3.9L9.5 8z" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  crm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 9v11" />
    </svg>
  ),
  sms: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M4 5h16v10H9l-5 4z" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </svg>
  ),
  stat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />
    </svg>
  ),
  soc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3c-3.5 0-6 2.5-6 6 0 4.5 6 11 6 11s6-6.5 6-11c0-3.5-2.5-6-6-6z" />
      <circle cx="12" cy="9" r="2" />
    </svg>
  ),
};

export type TfChip = {
  /** libellé de l'outil */
  t: string;
  /** icône */
  icon: ReactNode;
  /** position de départ (dispersée), en % de la scène */
  sx: number;
  sy: number;
  /** rotation de départ, en degrés */
  r: number;
};

export const TF_CHIPS: TfChip[] = [
  { t: "Le webmaster", icon: TF_ICONS.web, sx: 16, sy: 20, r: -7 },
  { t: "Compte de publicité", icon: TF_ICONS.ads, sx: 70, sy: 14, r: 6 },
  { t: "Appli d'avis", icon: TF_ICONS.rev, sx: 84, sy: 40, r: 9 },
  { t: "Outil newsletter", icon: TF_ICONS.mail, sx: 24, sy: 46, r: 4 },
  { t: "Tableur clients", icon: TF_ICONS.crm, sx: 8, sy: 70, r: -5 },
  { t: "Appli SMS", icon: TF_ICONS.sms, sx: 40, sy: 80, r: 7 },
  { t: "Réservations", icon: TF_ICONS.book, sx: 66, sy: 74, r: -8 },
  { t: "Statistiques", icon: TF_ICONS.stat, sx: 88, sy: 66, r: 5 },
  { t: "Réseaux sociaux", icon: TF_ICONS.soc, sx: 50, sy: 30, r: -4 },
  { t: "Fiche Maps", icon: TF_ICONS.map, sx: 30, sy: 12, r: 8 },
];

/* ─────────────────────────── Pour qui ─────────────────────────── */

export type UseCase = {
  id: string;
  index: string;
  tab: string;
  img: string;
  imgAlt: string;
  caption: string;
  title: ReactNode;
  body: string;
  chips: string[];
};

export const USE_CASES: UseCase[] = [
  {
    id: "local",
    index: "01",
    tab: "Commerces & artisans",
    img: "/sama/uc-local.webp",
    imgAlt: "Un artisan au travail dans son atelier",
    caption: "Commerces & artisans",
    title: (
      <>
        Devenez la référence de <em>votre quartier</em>.
      </>
    ),
    body: "Artisans, commerces et professions de service vivent de leur réputation locale. On fait en sorte que, quand quelqu'un près de chez vous a besoin de vous, vous soyez le premier nom qu'il voit, et celui en qui il a confiance.",
    chips: [
      "Couvreurs & façades",
      "Chauffage & plomberie",
      "Cliniques vétérinaires",
      "Entreprises du bâtiment",
      "Paysagistes",
      "Garages auto",
      "Cabinets médicaux & dentaires",
      "Restaurants & cafés",
      "Salons & instituts",
    ],
  },
  {
    id: "inst",
    index: "02",
    tab: "Institutions & collectivités",
    img: "/sama/uc-inst.webp",
    imgAlt: "Bâtiment public accueillant du public",
    caption: "Institutions & collectivités",
    title: (
      <>
        Communiquez avec <em>clarté</em> et confiance.
      </>
    ),
    body: "Écoles, cliniques, mairies et associations ont besoin d'une présence fiable, accessible et facile à tenir à jour. On vous donne les outils et l'équipe pour bien informer votre public.",
    chips: [
      "Écoles & instituts",
      "Cliniques & centres de santé",
      "Mairies & collectivités",
      "Associations",
      "Fédérations",
      "Lieux culturels",
    ],
  },
  {
    id: "network",
    index: "03",
    tab: "Réseaux & franchises",
    img: "/sama/uc-network.webp",
    imgAlt: "Équipe d'une enseigne à plusieurs points de vente",
    caption: "Réseaux & franchises",
    title: (
      <>
        Une marque, <em>tous</em> vos points de vente, parfaitement alignés.
      </>
    ),
    body: "Pour un réseau ou une franchise, la cohérence est essentielle. Pilotez le site, la publicité, les avis et les messages de chaque point de vente depuis un seul endroit, avec la souplesse locale là où elle compte.",
    chips: [
      "Réseaux de franchises",
      "Enseignes & commerces",
      "Concessions auto",
      "Cliniques multi-sites",
      "Salles de sport",
      "Groupes hôteliers",
    ],
  },
];

/* ─────────────────────────── Journey ─────────────────────────── */

export type JourneyStep = {
  num: string;
  title: ReactNode;
  body: string;
  tag: string;
  icon: ReactNode;
  figCaption: string;
};

export const JOURNEY: JourneyStep[] = [
  {
    num: "01",
    title: (
      <>
        Le <em>bilan</em> gratuit
      </>
    ),
    body: "On regarde votre site, votre visibilité locale, vos avis et vos concurrents, puis on vous dit honnêtement où vous en êtes et ce qu'on ferait, en mots simples, sans engagement.",
    tag: "Semaine 1 · On écoute et on analyse",
    figCaption: "La discussion",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h12v8H7l-4 3z" />
        <path d="M9 10h13v8h-4l-3 3v-3" />
      </svg>
    ),
  },
  {
    num: "02",
    title: (
      <>
        On <em>construit</em> votre présence
      </>
    ),
    body: "Site internet, fiche Google, comptes de publicité, collecte d'avis et messages : tout est installé correctement et réglé selon la façon dont votre entreprise gagne ses clients.",
    tag: "Semaines 2–4 · On crée et on lance",
    figCaption: "La création",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 9v11" />
      </svg>
    ),
  },
  {
    num: "03",
    title: (
      <>
        Les clients <em>arrivent</em>
      </>
    ),
    body: "Appels, formulaires et rendez-vous arrivent au même endroit. La technologie et de vraies personnes répondent, pour qu'aucun contact ne soit perdu, même le soir et le week-end.",
    tag: "En continu · On capte et on convertit",
    figCaption: "L'élan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h4l1.5 4-2 1.5a11 11 0 0 0 5 5L17 11.5 21 13v4a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.2 2 2 0 0 1 7 3z" />
      </svg>
    ),
  },
  {
    num: "04",
    title: (
      <>
        On vous aide à <em>grandir</em>
      </>
    ),
    body: "Chaque mois, on lit les chiffres ensemble, on renforce ce qui marche et on fait monter votre réputation, pour que vous soyez le choix évident dans votre secteur.",
    tag: "Chaque mois · On mesure et on développe",
    figCaption: "La croissance",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 20V10M9 20V4M15 20v-7M21 20V8" />
      </svg>
    ),
  },
];

/* ─────────────────────────── Manifesto ─────────────────────────── */

export const MANIFESTO_COLS = [
  {
    k: "01",
    h: "Tout au même endroit",
    p: "Tous les services dont vous avez besoin, réunis dans une seule équipe et un seul outil, pensés pour fonctionner ensemble.",
  },
  {
    k: "02",
    h: "D'abord des humains",
    p: "De vraies personnes qui connaissent votre entreprise, aidées par la technologie pour que rien ne passe entre les mailles.",
  },
  {
    k: "03",
    h: "Des résultats clairs",
    p: "Pas de jargon, pas de chiffres inutiles. Des chiffres simples sur vos appels, vos rendez-vous et vos avis : ce qui compte vraiment.",
  },
];

/** Hauteurs (en %) des barres du mini-graphe du tableau de bord. */
export const DASH_BARS = [40, 55, 48, 68, 60, 82, 75, 95];
