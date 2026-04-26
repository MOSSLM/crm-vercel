-- ============================================================
-- Email signature settings (one row per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_signature_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  job_title    TEXT NOT NULL DEFAULT '',
  company      TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  website      TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  accent_color TEXT NOT NULL DEFAULT '#6366f1',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE email_signature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own signature settings" ON email_signature_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Email templates (user-created + global read-only defaults)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'autre',
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can read defaults; users read their own
CREATE POLICY "Read templates" ON email_templates
  FOR SELECT TO authenticated
  USING (is_default = true OR auth.uid() = user_id);

-- Users can only create non-default templates for themselves
CREATE POLICY "Insert own templates" ON email_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_default = false);

-- Users can only update their own non-default templates
CREATE POLICY "Update own templates" ON email_templates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND is_default = false)
  WITH CHECK (auth.uid() = user_id AND is_default = false);

-- Users can only delete their own non-default templates
CREATE POLICY "Delete own templates" ON email_templates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND is_default = false);

-- ============================================================
-- Seed the 3 default templates (global, user_id = NULL)
-- ============================================================
INSERT INTO email_templates (user_id, name, type, subject, body, is_default, sort_order)
VALUES
  (
    NULL,
    'Premier contact',
    'premier_contact',
    'Développer la visibilité de {{company_name}} en ligne',
    E'Bonjour {{contact_name}},\n\nJe me permets de vous contacter car j''ai identifié plusieurs opportunités pour renforcer la présence en ligne de {{company_name}}.\n\nJe serais ravi(e) de vous présenter notre approche en quelques minutes — auriez-vous un créneau cette semaine ?\n\nCordialement,',
    true,
    1
  ),
  (
    NULL,
    'Relance / Suivi',
    'relance',
    'Suite à notre conversation — {{company_name}}',
    E'Bonjour {{contact_name}},\n\nJe me permets de revenir vers vous suite à notre dernier échange concernant {{company_name}}.\n\nAvez-vous eu l''occasion de réfléchir à notre proposition ? Je serais ravi(e) d''échanger avec vous pour répondre à vos éventuelles questions.\n\nDans l''attente de vous lire,',
    true,
    2
  ),
  (
    NULL,
    'Envoi Lead Magnet',
    'lead_magnet',
    'Votre audit gratuit est prêt — {{company_name}}',
    E'Bonjour {{contact_name}},\n\nJ''espère que vous allez bien.\n\nSuite à notre échange, j''ai le plaisir de vous partager votre audit personnalisé pour {{company_name}} :\n\n👉 {{lead_magnet_url}}\n\nCe document vous donne une vision claire de vos opportunités d''amélioration et des leviers concrets pour développer votre activité.\n\nN''hésitez pas à me faire part de vos questions — je reste disponible pour en discuter.\n\nBonne lecture,',
    true,
    3
  )
ON CONFLICT DO NOTHING;
