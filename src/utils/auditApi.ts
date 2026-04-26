import { supabase } from './supabase/client';
import type { Audit, AuditContent, AuditTemplate } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
    problems: [
      { title: 'Site vieillissant', desc: "La première impression est décisive. Un site au design daté ou difficile à naviguer réduit fortement les chances qu'un visiteur passe à l'action." },
      { title: 'Éléments mal positionnés', desc: "Des textes peu lisibles, des boutons difficiles à trouver ou une navigation confuse créent des obstacles qui découragent l'action, même chez un visiteur intéressé." },
      { title: 'Vos avis clients ne sont pas mis en avant', desc: "Vous avez d'excellents retours clients, mais ils n'apparaissent pas sur votre site. C'est pourtant un élément clé qui rassure et convainc les visiteurs hésitants." },
      { title: "Peu d'appels à l'action visibles", desc: "Sans formulaire express ou numéro de téléphone en un clic bien placé, un visiteur intéressé peut repartir sans laisser ses coordonnées." },
    ],
    quote: "75 % des internautes jugent la crédibilité d'une entreprise sur la base de son site web — la conception visuelle est le premier signal de confiance.",
    quote_source: 'Stanford Web Credibility Research · Comportement utilisateur web',
  },
  page3: {
    header_section: 'Notre solution',
    section_label: "02 · Ce que l'on fait",
    section_title: 'Un site conçu pour',
    section_title_em: 'convertir',
    section_intro: "Pas un site vitrine de plus. Un outil de développement commercial, pensé pour votre métier et vos clients.",
    solutions: [
      { num: '1', name: 'Site vitrine premium', desc: "Design sur-mesure, mobile-first, chargement ultra-rapide. Une image qui inspire confiance dès les 3 premières secondes.", tag: 'Design' },
      { num: '2', name: 'SEO local optimisé', desc: "Référencement Google Maps, mots-clés métier + ville, intégration Google Search Console. Apparaître quand ça compte.", tag: 'SEO' },
      { num: '3', name: 'Action simplifiée et capture des prospects', desc: "Formulaires de devis express, appel en un clic, témoignages clients intégrés. Réduire les frictions pour transformer chaque visite en opportunité de contact.", tag: 'Conversion' },
      { num: '4', name: 'Audit SEO local', desc: "Nous analysons les opportunités de référencement local et vous informons tout au long de l'année des mots-clés stratégiques sur lesquels vous positionner pour capter plus de clients dans votre zone.", tag: 'SEO' },
    ],
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
      { label: 'Site web complet + SEO initial', sub_label: 'Conception, développement, contenus, mise en ligne', amount: 1490, is_mrr: false, enabled: true },
      { label: 'Maintenance & suivi mensuel', sub_label: 'Rapport, mises à jour, support — sans engagement', amount: 89, is_mrr: true, enabled: true },
    ],
    pricing_subtitle: 'Solution conseillée',
    show_grain: true,
    flatten_grain_for_pdf: false,
    price_note: 'Prix HT. Acompte de 40 % à la commande, solde à la livraison. Maintenance mensuelle sans engagement (résiliable à tout moment). Tarif indicatif — devis définitif sur demande.',
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
    contact_phone: '+33 6 XX XX XX XX',
    contact_email: 'contact@votreagence.fr',
    contact_website: '',
  },
};

function normalizeAuditContent(content: Partial<AuditContent> | null | undefined): AuditContent {
  const defaults = getDefaultAuditContent();
  const source = content ?? {};

  return {
    page1: { ...defaults.page1, ...(source.page1 ?? {}) },
    page2: {
      ...defaults.page2,
      ...(source.page2 ?? {}),
      problems: source.page2?.problems?.length ? source.page2.problems : defaults.page2.problems,
    },
    page3: {
      ...defaults.page3,
      ...(source.page3 ?? {}),
      solutions: source.page3?.solutions?.length ? source.page3.solutions : defaults.page3.solutions,
    },
    page4: {
      ...defaults.page4,
      ...(source.page4 ?? {}),
      livrables: source.page4?.livrables?.length ? source.page4.livrables : defaults.page4.livrables,
    },
    page5: {
      ...defaults.page5,
      ...(source.page5 ?? {}),
      planning_steps: source.page5?.planning_steps?.length ? source.page5.planning_steps : defaults.page5.planning_steps,
      services: source.page5?.services?.length ? source.page5.services : defaults.page5.services,
    },
    page6: {
      ...defaults.page6,
      ...(source.page6 ?? {}),
      next_steps: source.page6?.next_steps?.length ? source.page6.next_steps : defaults.page6.next_steps,
    },
    global_style: {
      ...(defaults.global_style ?? {}),
      ...(source.global_style ?? {}),
    },
  };
}

function hydrateAudit(audit: Audit): Audit {
  return {
    ...audit,
    content: normalizeAuditContent(audit.content),
  };
}

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

export async function fetchAuditTemplates(): Promise<AuditTemplate[]> {
  const { data, error } = await supabase
    .from('audit_templates')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as AuditTemplate[];
}

export async function fetchAuditByOpportunite(opportuniteId: string): Promise<Audit | null> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('opportunite_id', opportuniteId)
    .maybeSingle();
  if (error) throw error;
  return data ? hydrateAudit(data as Audit) : null;
}

export async function createAudit(params: {
  opportunite_id: string;
  template_id?: string;
  entreprise_nom?: string;
  entreprise_adresse?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
}): Promise<Audit> {
  const content = getDefaultAuditContent({
    entreprise_nom: params.entreprise_nom,
    entreprise_adresse: params.entreprise_adresse,
    entreprise_ville: params.entreprise_ville,
    entreprise_secteur: params.entreprise_secteur,
    demo_url: params.demo_site_url,
  });

  const { entreprise_adresse: _unusedAddress, ...insertableParams } = params;

  const { data, error } = await supabase
    .from('audits')
    .insert({
      ...insertableParams,
      content,
      statut: 'draft',
    })
    .select()
    .single();

  if (error) throw error;
  return hydrateAudit(data as Audit);
}

export async function upsertAudit(params: {
  opportunite_id: string;
  template_id?: string;
  entreprise_nom?: string;
  entreprise_adresse?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
}): Promise<Audit> {
  const existing = await fetchAuditByOpportunite(params.opportunite_id);
  if (existing) return existing;
  return createAudit(params);
}

function isAuthError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST301' ||
    !!error.message?.includes('JWT') ||
    !!error.message?.includes('expired')
  );
}

export async function saveAudit(
  auditId: string,
  content: AuditContent,
  meta: { entreprise_logo_url?: string; statut: 'draft' | 'ready' }
): Promise<void> {
  const { error } = await supabase
    .from('audits')
    .update({ content, ...meta, updated_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) {
    if (isAuthError(error)) throw new Error('SESSION_EXPIRED');
    throw error;
  }
}

export async function savePdfUrl(auditId: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase
    .from('audits')
    .update({ pdf_url: pdfUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) throw error;
}
