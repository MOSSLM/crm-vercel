'use client';

import React from 'react';
import type { Form } from '@/types';
import {
  Settings,
  Undo2,
  Redo2,
  AlignLeft,
  GitBranch,
  Eye,
  Share2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface TopBarProps {
  form: Form | null;
  tab: string;
  onTab: (tab: string) => void;
  saving: boolean;
  onPublish: () => void;
  onSettings: () => void;
}

const TABS = [
  { id: 'build',   label: 'Build',    icon: AlignLeft, key: '1' },
  { id: 'logic',   label: 'Logique',  icon: GitBranch, key: '2' },
  { id: 'preview', label: 'Preview',  icon: Eye,       key: '3' },
  { id: 'share',   label: 'Partager', icon: Share2,    key: '4' },
];

export function TopBar({ form, tab, onTab, saving, onPublish, onSettings }: TopBarProps) {
  return (
    <div className="topbar">
      {/* Left */}
      <div className="left-group">
        <div
          style={{
            width: 28,
            height: 28,
            background: 'var(--accent)',
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          T
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-3)',
            letterSpacing: '.02em',
            whiteSpace: 'nowrap',
          }}
        >
          Form Studio
        </span>
        <span style={{ color: 'var(--border-2)', fontSize: 12 }}>/</span>
        <span
          style={{
            fontSize: 12.5,
            color: 'var(--text-2)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Formulaires
        </span>
        {form && (
          <>
            <span style={{ color: 'var(--border-2)', fontSize: 12 }}>/</span>
            <span
              style={{
                fontSize: 12.5,
                color: 'var(--text)',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {form.name}
            </span>
          </>
        )}
        {saving ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-3)', fontSize: 11 }}>
            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </span>
        ) : (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--ok)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <CheckCircle2 size={11} />
            enregistré
          </span>
        )}
      </div>

      {/* Center tabs */}
      <div className="tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
            >
              <Icon size={13} />
              {t.label}
              <kbd>{t.key}</kbd>
            </button>
          );
        })}
      </div>

      {/* Right */}
      <div className="right">
        <button className="btn icon ghost" onClick={onSettings} title="Paramètres">
          <Settings size={14} />
        </button>
        <button className="btn icon ghost" disabled title="Annuler">
          <Undo2 size={14} />
        </button>
        <button className="btn icon ghost" disabled title="Rétablir">
          <Redo2 size={14} />
        </button>
        <button className="btn outline" onClick={() => {}}>
          {form?.is_published ? 'Publié' : 'Brouillon'}
        </button>
        <button className="btn accent" onClick={onPublish}>
          Publier
        </button>
      </div>
    </div>
  );
}
