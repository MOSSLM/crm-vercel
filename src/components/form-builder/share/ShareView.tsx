'use client';

import { useState } from 'react';
import type { Form } from '@/types';
import { Link2, Globe, Send, Zap, Copy, Check } from 'lucide-react';

interface ShareViewProps {
  form: Form;
}

interface CardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  url?: string;
  mono?: boolean;
  disabled?: boolean;
}

function ShareCard({ icon, title, desc, cta, url, mono, disabled }: CardProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-2)',
      borderRadius: 12, padding: 22, boxShadow: 'var(--shadow-1)',
      opacity: disabled ? 0.6 : 1,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: 'var(--accent-tint)', color: 'var(--accent-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>
      {url && (
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 7, padding: '8px 10px',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
          fontSize: 11.5, color: 'var(--text-2)', marginBottom: 12,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>{url}</div>
      )}
      <button
        onClick={url ? handleCopy : undefined}
        disabled={disabled}
        style={{
          height: 32, padding: '0 14px', border: '1px solid var(--border-2)', borderRadius: 7,
          background: 'var(--surface)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        {url && (copied ? <Check size={13} /> : <Copy size={13} />)}
        {copied ? 'Copié !' : cta}
      </button>
    </div>
  );
}

export function ShareView({ form }: ShareViewProps) {
  const host = typeof window !== 'undefined' ? window.location.host : 'form.crm';
  const proto = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  const slug = form.slug ?? form.id;
  const publicUrl = `${proto}//${host}/f/${slug}`;
  const iframeSnippet = `<iframe src="${publicUrl}" style="width:100%;height:600px;border:0"></iframe>`;

  return (
    <div className="pane" style={{ flex: 1, background: 'var(--bg)' }}>
      <div className="pane-hd"><span>Partager &amp; Intégrer</span></div>
      <div className="pane-body" style={{ padding: 36, overflow: 'auto' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ShareCard
            icon={<Link2 size={16} />}
            title="Lien public"
            desc="Partagez ce lien partout. Le formulaire s'ouvre dans le navigateur (publié uniquement)."
            cta="Copier le lien"
            url={publicUrl}
          />
          <ShareCard
            icon={<Globe size={16} />}
            title="Intégrer sur site"
            desc="Snippet HTML iframe à coller dans n'importe quelle page web."
            cta="Copier le code"
            url={iframeSnippet}
            mono
          />
          <ShareCard
            icon={<Send size={16} />}
            title="Envoi par email"
            desc="Envoyer un lien personnalisé avec pré-remplissage par variables URL."
            cta="Bientôt"
            disabled
          />
          <ShareCard
            icon={<Zap size={16} />}
            title="Webhook & CRM"
            desc="Recevez chaque soumission par webhook ou dans HubSpot, Pipedrive, Notion."
            cta="Bientôt"
            disabled
          />
        </div>
        {!form.is_published && (
          <div style={{ maxWidth: 720, margin: '20px auto 0', padding: 12, background: 'var(--accent-tint)', border: '1px solid var(--accent)', color: 'var(--accent-2)', borderRadius: 8, fontSize: 12.5 }}>
            ⚠ Le formulaire n&apos;est pas publié. Le lien public ne sera accessible qu&apos;après publication.
          </div>
        )}
      </div>
    </div>
  );
}
