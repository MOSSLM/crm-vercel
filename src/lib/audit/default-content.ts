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
    header_section: 'Livrables inclus',
    section_label: '03 · Ce que vous recevez',
    section_title: 'Tout est',
    section_title_em: 'inclus',
    section_subtitle: 'Aucune mauvaise surprise. Voici exactement ce que comprend la prestation.',
    livrables: [
      { title: 'Site web complet', items: ["Page d'accueil optimisée", "Pages services (jusqu'à 5)", "Page à propos", 'Page contact + formulaire devis', 'Design responsive mobile'] },
      { title: 'SEO & visibilité', items: ['Audit mots-clés local', 'Optimisation on-page complète', 'Intégration Google Search Console', 'Plan de redirection (si nécessaire)', 'Rapport de positionnement initial'] },
      { title: 'Contenu & copywriting', items: ['Textes de vente rédigés', 'Mise en valeur de vos réalisations', 'Intégration avis clients', 'Photos optimisées web'] },
      { title: 'Suivi & support', items: ['Rapport mensuel (trafic, leads)', 'Maintenance incluse 6 mois'] },
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
