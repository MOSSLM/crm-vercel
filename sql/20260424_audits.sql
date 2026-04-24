-- Audit templates: base template configs (one per design template)
CREATE TABLE IF NOT EXISTS audit_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  template_key TEXT NOT NULL UNIQUE,
  default_content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default Proposition Commerciale template
INSERT INTO audit_templates (nom, template_key, default_content) VALUES (
  'Proposition Commerciale SAMA',
  'proposition_commerciale',
  '{
    "page1": {
      "date": "",
      "eyebrow": "Audit digital",
      "title_line1": "Votre présence",
      "title_line2": "en ligne,",
      "title_line3": "analysée.",
      "subtitle": "Un audit complet de votre situation digitale actuelle — pour construire une stratégie qui génère de vrais clients.",
      "client_name": "",
      "client_meta": "",
      "demo_url": ""
    },
    "page2": {
      "section_intro": "Vous avez une activité sérieuse, des clients satisfaits, et un vrai savoir-faire. Mais votre présence en ligne ne reflète pas encore tout ça — et vous passez à côté de clients qui vous cherchent.",
      "problems": [
        {"title": "Invisible sur Google", "desc": "Vos concurrents apparaissent avant vous sur les recherches locales, même quand vous êtes meilleur."},
        {"title": "Site vieillissant", "desc": "Votre site actuel ne donne pas confiance au premier regard. Le visiteur repart sans contacter."},
        {"title": "Pas de leads entrants", "desc": "Vous dépendez du bouche-à-oreille. Le digital ne vous apporte pas de clients de façon régulière."}
      ],
      "quote": "J''ai cherché un plombier sur Google. J''en ai trouvé un avec un beau site clair. Je l''ai appelé lui, pas les autres.",
      "quote_source": "Comportement type du consommateur local, 2024"
    },
    "page3": {
      "section_intro": "Pas un site vitrine de plus. Un outil de développement commercial, pensé pour votre métier et vos clients.",
      "solutions": [
        {"num": "1", "name": "Site vitrine premium", "desc": "Design sur-mesure, mobile-first, chargement ultra-rapide. Une image qui inspire confiance dès les 3 premières secondes.", "tag": "Design"},
        {"num": "2", "name": "SEO local optimisé", "desc": "Référencement Google Maps, mots-clés métier + ville, fiches Google Business. Apparaître quand ça compte.", "tag": "SEO"},
        {"num": "3", "name": "Tunnel de conversion", "desc": "Formulaires de devis, click-to-call, témoignages clients intégrés. Chaque visite devient une opportunité de contact.", "tag": "Conversion"},
        {"num": "4", "name": "Suivi & reporting mensuel", "desc": "Tableau de bord simple : trafic, appels générés, positions Google. Vous savez exactement ce que ça rapporte.", "tag": "Suivi"}
      ]
    },
    "page4": {
      "livrables": [
        {"title": "Site web complet", "items": ["Page d''accueil optimisée", "Pages services (jusqu''à 5)", "Page contact + formulaire devis", "Design responsive mobile", "Hébergement 1 an inclus"]},
        {"title": "SEO & visibilité", "items": ["Audit mots-clés local", "Optimisation on-page complète", "Fiche Google Business optimisée", "Intégration Google Search Console", "Rapport de positionnement"]},
        {"title": "Contenu & copywriting", "items": ["Textes de vente rédigés", "Mise en valeur de vos réalisations", "Intégration avis clients", "Photos optimisées web"]},
        {"title": "Suivi & support", "items": ["Rapport mensuel (trafic, leads)", "Maintenance incluse 6 mois", "Hotline réponse sous 24h", "Formations à la prise en main"]}
      ]
    },
    "page5": {
      "planning_steps": [
        {"week": "Sem. 1", "title": "Cadrage & stratégie", "desc": "Réunion de lancement, audit concurrentiel, définition des mots-clés, validation du plan de site."},
        {"week": "Sem. 2", "title": "Design & contenu", "desc": "Maquette validée, rédaction des textes, intégration photos et témoignages."},
        {"week": "Sem. 3", "title": "Développement & tests", "desc": "Intégration technique, optimisation vitesse, tests mobile, SEO on-page."},
        {"week": "Mise en ligne", "title": "Lancement & suivi", "desc": "Publication, indexation Google, formation, premier rapport J+30."}
      ],
      "price_setup": "1 490 €",
      "price_setup_label": "Site web complet + SEO initial",
      "price_setup_desc": "Conception, développement, contenus, mise en ligne",
      "price_monthly": "89 €/mois",
      "price_monthly_label": "Maintenance & suivi mensuel",
      "price_monthly_desc": "Optionnel — rapport, mises à jour, support",
      "price_total": "2 558 €",
      "price_total_label": "Investissement total (an 1)",
      "price_note": "Prix HT. Acompte de 40% à la commande, solde à la livraison. Sans engagement pour la maintenance mensuelle (résiliable à tout moment). Tarif indicatif — devis sur demande."
    },
    "page6": {
      "next_steps": [
        {"title": "Valider cette proposition", "desc": "Un appel de 15 min pour répondre à vos questions, ajuster si besoin, puis signature du bon de commande."},
        {"title": "Réunion de lancement", "desc": "1h ensemble pour comprendre votre métier, vos clients, vos points forts. Tout ce dont on a besoin pour bien faire."},
        {"title": "Mise en ligne en 3 semaines", "desc": "On s''occupe de tout. Vous relisez, validez, et votre site commence à travailler pour vous."}
      ],
      "cta_title": "Prêt à avancer ?",
      "cta_sub": "Réservez un appel gratuit de 15 minutes — sans engagement.",
      "contact_phone": "+33 6 XX XX XX XX",
      "contact_email": "contact@sama.fr",
      "contact_website": "sama.fr"
    }
  }'::jsonb
) ON CONFLICT (template_key) DO NOTHING;

-- Audits: one per opportunity
CREATE TABLE IF NOT EXISTS audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunite_id TEXT NOT NULL,
  template_id UUID REFERENCES audit_templates(id),
  entreprise_nom TEXT,
  entreprise_ville TEXT,
  entreprise_logo_url TEXT,
  entreprise_secteur TEXT,
  demo_site_url TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  statut TEXT DEFAULT 'draft' CHECK (statut IN ('draft', 'ready')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(opportunite_id)
);

ALTER TABLE audit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON audit_templates;
DROP POLICY IF EXISTS "Allow all for authenticated" ON audits;

CREATE POLICY "Allow all for authenticated" ON audit_templates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON audits FOR ALL USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_audits_updated_at ON audits;
CREATE TRIGGER update_audits_updated_at BEFORE UPDATE ON audits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
