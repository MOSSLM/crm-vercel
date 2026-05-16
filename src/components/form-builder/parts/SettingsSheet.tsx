'use client';

import React, { useState, useEffect } from 'react';
import type { Form } from '@/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface SettingsSheetProps {
  open: boolean;
  form: Form | null;
  onClose: () => void;
  onSave: (patch: Partial<Form>) => void;
}

const PRESET_COLORS = ['#E2552B', '#2B7FB8', '#1F8A5B', '#6B5BD9', '#C8881F'];

export function SettingsSheet({ open, form, onClose, onSave }: SettingsSheetProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#E2552B');
  const [logoUrl, setLogoUrl] = useState('');
  const [progressBar, setProgressBar] = useState(true);
  const [showQuestionNumber, setShowQuestionNumber] = useState(true);
  const [submitLabel, setSubmitLabel] = useState('Envoyer');
  const [renderMode, setRenderMode] = useState<'step' | 'scroll'>('step');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [density, setDensity] = useState<'compact' | 'regular' | 'cozy'>('regular');
  const [accent, setAccent] = useState('');
  const [tags, setTags] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    if (form) {
      setName(form.brand?.name ?? form.name);
      setColor(form.brand?.color ?? '#E2552B');
      setLogoUrl(form.brand?.logo_url ?? '');
      setProgressBar(form.settings?.progressBar ?? true);
      setShowQuestionNumber(form.settings?.showQuestionNumber ?? true);
      setSubmitLabel(form.settings?.submitLabel ?? 'Envoyer');
      setRenderMode(form.settings?.renderMode ?? 'step');
      setRedirectUrl(form.settings?.redirect_url ?? '');
      setDensity(form.style?.density ?? 'regular');
      setAccent(form.style?.accent ?? '');
      setTags((form.tags ?? []).join(', '));
      setSlug(form.slug ?? '');
    }
  }, [form, open]);

  function handleSave() {
    const tagArr = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({
      name,
      brand: { name, color, logo_url: logoUrl || undefined },
      settings: {
        progressBar,
        showQuestionNumber,
        submitLabel,
        renderMode,
        redirect_url: redirectUrl || undefined,
      },
      style: { density, accent: accent || undefined },
      tags: tagArr,
      slug: slug || undefined,
    });
    onClose();
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-3)',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    marginBottom: 6,
    display: 'block',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 32,
    padding: '0 10px',
    border: '1px solid var(--border-2)',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--text)',
    background: 'var(--surface)',
    outline: 'none',
    fontFamily: 'var(--font-ui)',
  };
  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-3)',
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingBottom: 6,
    borderBottom: '1px solid var(--border)',
  };
  const fieldStyle: React.CSSProperties = {
    marginBottom: 12,
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" style={{ width: 380, padding: 0, display: 'flex', flexDirection: 'column' }}>
        <SheetHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <SheetTitle style={{ fontSize: 14, fontWeight: 600 }}>Paramètres du formulaire</SheetTitle>
        </SheetHeader>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {/* Brand */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Marque</div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Nom de la marque</label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Couleur</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: c,
                      border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                      cursor: 'default',
                      outline: 'none',
                      flexShrink: 0,
                    }}
                  />
                ))}
                <input
                  type="text"
                  style={{ ...inputStyle, flex: 1 }}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#E2552B"
                />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Logo URL</label>
              <input
                style={inputStyle}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          {/* Settings */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Paramètres</div>
            <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 13, color: 'var(--text)' }}>Barre de progression</label>
              <input
                type="checkbox"
                checked={progressBar}
                onChange={(e) => setProgressBar(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
            </div>
            <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 13, color: 'var(--text)' }}>Numéro de question</label>
              <input
                type="checkbox"
                checked={showQuestionNumber}
                onChange={(e) => setShowQuestionNumber(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Label du bouton de soumission</label>
              <input
                style={inputStyle}
                value={submitLabel}
                onChange={(e) => setSubmitLabel(e.target.value)}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Mode de rendu</label>
              <select
                style={{ ...inputStyle, cursor: 'default' }}
                value={renderMode}
                onChange={(e) => setRenderMode(e.target.value as 'step' | 'scroll')}
              >
                <option value="step">Étape par étape</option>
                <option value="scroll">Défilement</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>URL de redirection après envoi</label>
              <input
                style={inputStyle}
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          {/* Style */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Style</div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Densité</label>
              <select
                style={{ ...inputStyle, cursor: 'default' }}
                value={density}
                onChange={(e) => setDensity(e.target.value as 'compact' | 'regular' | 'cozy')}
              >
                <option value="compact">Compact</option>
                <option value="regular">Normal</option>
                <option value="cozy">Spacieux</option>
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Couleur d&apos;accent</label>
              <input
                style={inputStyle}
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                placeholder="Ex: #E2552B"
              />
            </div>
          </div>

          {/* Tags */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Tags</div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Tags (séparés par des virgules)</label>
              <input
                style={inputStyle}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="hvac, solaire, lead"
              />
            </div>
          </div>

          {/* Slug */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Slug</div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Slug URL</label>
              <input
                style={inputStyle}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="mon-formulaire"
              />
              {slug && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
                  /f/{slug}
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button className="btn outline" onClick={onClose}>
            Annuler
          </button>
          <button className="btn accent" onClick={handleSave}>
            Enregistrer
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
