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
    section_intro: "Vous avez une activité sérieuse, des clients satisfaits, et un vrai savoir-faire. Mais votre présence en ligne ne reflète pas encore tout ça — et vous passez à côté de clients qui vous cherchent.",
    problems: [
      { title: 'Invisible sur Google', desc: "Vos concurrents apparaissent avant vous sur les recherches locales, même quand vous êtes meilleur." },
      { title: 'Site vieillissant', desc: "Votre site actuel ne donne pas confiance au premier regard. Le visiteur repart sans contacter." },
      { title: 'Pas de leads entrants', desc: "Vous dépendez du bouche-à-oreille. Le digital ne vous apporte pas de clients de façon régulière." },
    ],
    quote: "J'ai cherché un plombier sur Google. J'en ai trouvé un avec un beau site clair. Je l'ai appelé lui, pas les autres.",
    quote_source: 'Comportement type du consommateur local, 2024',
  },
  page3: {
    section_intro: "Pas un site vitrine de plus. Un outil de développement commercial, pensé pour votre métier et vos clients.",
    solutions: [
      { num: '1', name: 'Site vitrine premium', desc: "Design sur-mesure, mobile-first, chargement ultra-rapide. Une image qui inspire confiance dès les 3 premières secondes.", tag: 'Design' },
      { num: '2', name: 'SEO local optimisé', desc: "Référencement Google Maps, mots-clés métier + ville, fiches Google Business. Apparaître quand ça compte.", tag: 'SEO' },
      { num: '3', name: 'Tunnel de conversion', desc: "Formulaires de devis, click-to-call, témoignages clients intégrés. Chaque visite devient une opportunité de contact.", tag: 'Conversion' },
      { num: '4', name: 'Suivi & reporting mensuel', desc: "Tableau de bord simple : trafic, appels générés, positions Google. Vous savez exactement ce que ça rapporte.", tag: 'Suivi' },
    ],
  },
  page4: {
    livrables: [
      { title: 'Site web complet', items: ["Page d'accueil optimisée", "Pages services (jusqu'à 5)", "Page contact + formulaire devis", "Design responsive mobile", "Hébergement 1 an inclus"] },
      { title: 'SEO & visibilité', items: ["Audit mots-clés local", "Optimisation on-page complète", "Fiche Google Business optimisée", "Intégration Google Search Console", "Rapport de positionnement"] },
      { title: 'Contenu & copywriting', items: ["Textes de vente rédigés", "Mise en valeur de vos réalisations", "Intégration avis clients", "Photos optimisées web"] },
      { title: 'Suivi & support', items: ["Rapport mensuel (trafic, leads)", "Maintenance incluse 6 mois", "Hotline réponse sous 24h", "Formations à la prise en main"] },
    ],
  },
  page5: {
    planning_steps: [
      { week: 'Sem. 1', title: 'Cadrage & stratégie', desc: "Réunion de lancement, audit concurrentiel, définition des mots-clés, validation du plan de site." },
      { week: 'Sem. 2', title: 'Design & contenu', desc: "Maquette validée, rédaction des textes, intégration photos et témoignages." },
      { week: 'Sem. 3', title: 'Développement & tests', desc: "Intégration technique, optimisation vitesse, tests mobile, SEO on-page." },
      { week: 'Mise en ligne', title: 'Lancement & suivi', desc: "Publication, indexation Google, formation, premier rapport J+30." },
    ],
    price_setup: '1 490 €',
    price_setup_label: 'Site web complet + SEO initial',
    price_setup_desc: 'Conception, développement, contenus, mise en ligne',
    price_monthly: '89 €/mois',
    price_monthly_label: 'Maintenance & suivi mensuel',
    price_monthly_desc: 'Optionnel — rapport, mises à jour, support',
    price_total: '2 558 €',
    price_total_label: 'Investissement total (an 1)',
    price_note: "Prix HT. Acompte de 40% à la commande, solde à la livraison. Sans engagement pour la maintenance mensuelle (résiliable à tout moment). Tarif indicatif — devis sur demande.",
  },
  page6: {
    next_steps: [
      { title: 'Valider cette proposition', desc: "Un appel de 15 min pour répondre à vos questions, ajuster si besoin, puis signature du bon de commande." },
      { title: 'Réunion de lancement', desc: "1h ensemble pour comprendre votre métier, vos clients, vos points forts. Tout ce dont on a besoin pour bien faire." },
      { title: 'Mise en ligne en 3 semaines', desc: "On s'occupe de tout. Vous relisez, validez, et votre site commence à travailler pour vous." },
    ],
    cta_title: 'Prêt à avancer ?',
    cta_sub: "Réservez un appel gratuit de 15 minutes — sans engagement.",
    contact_phone: '+33 6 XX XX XX XX',
    contact_email: 'contact@sama.fr',
    contact_website: 'sama.fr',
  },
};

export function getDefaultAuditContent(overrides?: Partial<{
  entreprise_nom: string;
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
  if (overrides?.entreprise_ville || overrides?.entreprise_secteur) {
    const parts = [overrides.entreprise_secteur, overrides.entreprise_ville ? `${overrides.entreprise_ville}, France` : ''].filter(Boolean);
    content.page1.client_meta = parts.join(' · ');
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
  return data as Audit | null;
}

export async function createAudit(params: {
  opportunite_id: string;
  template_id?: string;
  entreprise_nom?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
}): Promise<Audit> {
  const content = getDefaultAuditContent({
    entreprise_nom: params.entreprise_nom,
    entreprise_ville: params.entreprise_ville,
    entreprise_secteur: params.entreprise_secteur,
    demo_url: params.demo_site_url,
  });

  const { data, error } = await supabase
    .from('audits')
    .insert({
      ...params,
      content,
      statut: 'draft',
    })
    .select()
    .single();

  if (error) throw error;
  return data as Audit;
}

export async function upsertAudit(params: {
  opportunite_id: string;
  template_id?: string;
  entreprise_nom?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
}): Promise<Audit> {
  const existing = await fetchAuditByOpportunite(params.opportunite_id);
  if (existing) return existing;
  return createAudit(params);
}

export async function saveAuditContent(auditId: string, content: AuditContent): Promise<void> {
  const { error } = await supabase
    .from('audits')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) throw error;
}

export async function saveAuditMeta(auditId: string, meta: {
  entreprise_nom?: string;
  entreprise_ville?: string;
  entreprise_logo_url?: string;
  entreprise_secteur?: string;
  demo_site_url?: string;
  statut?: 'draft' | 'ready';
}): Promise<void> {
  const { error } = await supabase
    .from('audits')
    .update({ ...meta, updated_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) throw error;
}

export async function savePdfUrl(auditId: string, pdfUrl: string): Promise<void> {
  const { error } = await supabase
    .from('audits')
    .update({ pdf_url: pdfUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', auditId);
  if (error) throw error;
}
