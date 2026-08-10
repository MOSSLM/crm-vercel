import type { AuditContent } from '@/types';
import { DEFAULT_SELECTED_ISSUE_KEYS, problemsFromKeys, solutionsFromKeys } from '@/data/auditIssues';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Contenu par défaut d'un audit — module pur, sans client Supabase, donc
 * utilisable depuis une route API aussi bien que depuis le navigateur.
 *
 * Extrait de `src/utils/auditApi.ts` (qui importe le client navigateur) pour
 * que la création d'audit côté agent, qui passe par le serveur, produise
 * exactement le même document que la création côté admin. `auditApi` réexporte
 * `getDefaultAuditContent`, les appelants existants n'ont pas changé.
 */

const DEFAULT_CONTENT: AuditContent = {
  page1: {
    date: '',
    eyebrow: 'Audit digital',
    title_line1: 'Votre présence',
    title_line2: 'en ligne,',
    title_line3: 'analysée.',
    subtitle: "Un audit complet de votre situation digitale actuelle — pour construire une stratégie qui génère de vrais clients.",
    client_name: '',
    client_meta: '',
    demo_url: '',
  },
  page2: {
    header_section: 'Votre situation',
    section_label: '01 · Contexte',
    section_title: 'Ce que nous avons',
    section_title_em: 'observé',
    section_intro: "Vous avez une activité sérieuse, des clients satisfaits, et un vrai savoir-faire. Mais votre présence en ligne ne reflète pas encore tout ça — et vous passez potentiellement à côté de clients qui vous cherchent.",
    problems: problemsFromKeys(DEFAULT_SELECTED_ISSUE_KEYS),
    quote: "75 % des internautes jugent la crédibilité d'une entreprise sur la base de son site web — la conception visuelle est le premier signal de confiance.",
    quote_source: 'Stanford Web Credibility Research · Comportement utilisateur web',
  },
  page3: {
    header_section: 'Notre solution',
    section_label: "02 · Ce que l'on fait",
    section_title: 'Un site conçu pour',
    section_title_em: 'convertir',
    section_intro: "Pas un site vitrine de plus. Un outil de développement commercial, pensé pour votre métier et vos clients. À chaque problème relevé, sa réponse.",
    solutions: solutionsFromKeys(DEFAULT_SELECTED_ISSUE_KEYS),
  },
  page4: {
    header_section: 'Ce que vous recevez',
    section_label: '03 · Ce que vous recevez',
    section_title: 'Ce qui change,',
    section_title_em: 'concrètement',
    section_subtitle: 'Trois volets — et à chaque fois, le point faible qu\u2019il corrige.',
    recu_head: ['Le volet', 'Ce que vous recevez', 'Ce que ça corrige'],
    /**
     * Trois phrases, pas dix-huit puces, et aucun mot technique.
     *
     * L'ancienne liste annonçait « Optimisation on-page complète », « Audit
     * mots-clés local », « Design responsive mobile » et « Contenu &
     * copywriting » — du vocabulaire que la règle éditoriale du document
     * interdit, et sur lequel un artisan décroche en trois mots. Une liste de
     * prestations énumère d'ailleurs des MOYENS ; le lecteur, lui, achète un
     * état final. La colonne « ce que ça corrige » rattache chaque volet au
     * constat qui le justifie — c'est la seule chose qui distingue ce bloc
     * d'une plaquette.
     */
    livrables: [
      {
        title: 'Le site',
        fix: 'Lenteur\nCrédibilité\nBase technique',
        items: [
          'Un site actuel qui s\u2019affiche en une seconde sur téléphone et met votre travail en valeur : réalisations, avis clients et certifications visibles dès l\u2019accueil. Chaque photo et chaque page sont décrites pour que Google les comprenne.',
        ],
      },
      {
        title: 'Sur Google',
        fix: 'Visibilité locale',
        items: [
          'Votre fiche d\u2019entreprise complétée et soignée pour donner envie de cliquer, et une page dédiée à chaque métier et chaque commune que vous couvrez.',
        ],
      },
      {
        title: 'Le suivi',
        fix: 'Rien à gérer',
        items: [
          'Hébergement, sauvegardes et mises à jour compris. Une question, une modification : vous écrivez, on s\u2019en occupe — et un point chaque mois.',
        ],
      },
    ],
  },
  page5: {
    header_section: 'Tarifs',
    section_label: '04 · Investissement',
    planning_steps: [
      { week: 'Appel', title: 'Appel de lancement', desc: 'Nous recueillons toutes les informations nécessaires en un seul appel : vos objectifs, votre identité, vos clients cibles.' },
      { week: 'Production', title: 'Production', desc: 'Notre équipe conçoit et développe votre site : design, textes, photos, intégration. Efficacement et sans allers-retours inutiles.' },
      { week: 'Validation', title: 'Validation', desc: 'Vous relisez et validez chaque détail. Les ajustements sont rapides — jusqu\'à satisfaction complète.' },
      { week: 'Transfert', title: 'Transfert du site', desc: 'Votre site est mis en ligne sous 7 jours. Vous en êtes propriétaire à vie.' },
    ],
    services: [
      { label: 'Site clé en main (base démo)', sub_label: 'On part de votre site démo — copy, images, services & certifications adaptés', amount: 490, is_mrr: false, enabled: true, from: true },
      { label: 'Hébergement & maintenance', sub_label: 'Nom de domaine, hébergement, mises à jour', amount: 19, is_mrr: true, enabled: true },
    ],
    pricing_subtitle: 'Solution conseillée',
    hide_total: true,
    // Pas de carte alternative en dur : c'est le catalogue d'offres qui décide
    // s'il y en a une, et laquelle. Une copie ici la réinjecterait à chaque
    // recalcul, y compris après l'avoir retirée du catalogue.
    show_grain: true,
    flatten_grain_for_pdf: false,
    price_note: 'Prix HT. Hébergement & maintenance mensuels sans engagement (résiliable à tout moment). Tarif indicatif — devis définitif sur demande.',
  },
  page6: {
    header_section: 'Prochaines étapes',
    section_label: '05 · Pour démarrer',
    section_title: 'Simple, rapide,',
    section_title_line2: "et c'est",
    section_title_em: 'lancé',
    section_subtitle: 'Pas de processus compliqué. On travaille vite et bien — vous avez une entreprise à faire tourner.',
    next_steps: [
      { title: 'Appel de lancement', desc: "On s'appelle pour recueillir toutes les informations nécessaires au projet en une seule conversation." },
      { title: 'Production en 1 semaine', desc: 'Notre équipe conçoit et développe votre site rapidement et efficacement.' },
      { title: 'Mise en ligne sous 7 jours', desc: 'Votre site est mis en ligne. Vous en êtes propriétaire à vie.' },
    ],
    cta_title: 'Prêt à avancer ?',
    cta_sub: 'Réservez un appel gratuit — sans engagement.',
    contact_phone: '07 49 19 67 15',
    contact_email: 'matteos@samadigitalstudio.fr',
    contact_website: 'samadigitalstudio.fr',
  },
};

export function getDefaultAuditContent(overrides?: Partial<{
  entreprise_nom: string;
  entreprise_adresse: string;
  entreprise_ville: string;
  entreprise_secteur: string;
  demo_url: string;
}>): AuditContent {
  const now = format(new Date(), 'MMMM yyyy', { locale: fr });
  const capitalized = now.charAt(0).toUpperCase() + now.slice(1);

  const content = structuredClone(DEFAULT_CONTENT);
  content.page1.date = `Audit · ${capitalized}`;

  if (overrides?.entreprise_nom) {
    content.page1.client_name = overrides.entreprise_nom;
  }
  if (overrides?.entreprise_adresse) {
    content.page1.client_meta = overrides.entreprise_adresse;
  } else if (overrides?.entreprise_ville) {
    content.page1.client_meta = overrides.entreprise_ville;
  }
  if (overrides?.demo_url) {
    content.page1.demo_url = overrides.demo_url;
  }

  return content;
}
