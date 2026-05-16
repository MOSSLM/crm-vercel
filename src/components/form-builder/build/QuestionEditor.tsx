'use client';

import React, { useState } from 'react';
import type { FormQuestion, FormChoice } from '@/types';
import { QUESTION_TYPES } from '@/lib/form-builder/question-types';
import { ICON_SLUG_TO_LUCIDE } from '@/lib/form-builder/icons';
import { GripVertical, Plus, Trash2, ChevronDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

interface QuestionEditorProps {
  question: FormQuestion | undefined;
  onChangeQ: (patch: Partial<FormQuestion>) => void;
  onChangeChoices: (choices: FormChoice[]) => void;
}

function getLucideIcon(slug: string): React.ReactNode {
  const name = ICON_SLUG_TO_LUCIDE[slug];
  if (!name) return null;
  const Icon = (LucideIcons as unknown as Record<string, React.FC<{ size?: number }>>)[name];
  return Icon ? <Icon size={14} /> : null;
}

// ── ChoiceEditorInline ───────────────────────────────────────────────────────

interface ChoiceEditorInlineProps {
  choices: FormChoice[];
  onChange: (choices: FormChoice[]) => void;
  readonly?: boolean;
}

function newId() {
  return 'c_' + Math.random().toString(36).slice(2, 8);
}

const ICON_OPTIONS = Object.keys(ICON_SLUG_TO_LUCIDE).slice(0, 20);

function ChoiceEditorInline({ choices, onChange, readonly }: ChoiceEditorInlineProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDropIdx(idx);
  }
  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const reordered = [...choices];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    onChange(reordered);
    setDragIdx(null);
    setDropIdx(null);
  }
  function handleDragEnd() { setDragIdx(null); setDropIdx(null); }

  const inputStyle: React.CSSProperties = {
    height: 28,
    padding: '0 8px',
    border: '1px solid var(--border-2)',
    borderRadius: 5,
    fontSize: 12.5,
    color: 'var(--text)',
    background: 'var(--surface)',
    outline: 'none',
    fontFamily: 'var(--font-ui)',
  };

  if (readonly) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {choices.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              border: '1.5px solid var(--border-2)',
              borderRadius: 8,
            }}
          >
            {c.icon && (
              <span style={{ color: 'var(--accent-2)' }}>{getLucideIcon(c.icon)}</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 500 }}>{c.label || '—'}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {choices.map((c, idx) => (
        <div
          key={c.id}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={() => handleDrop(idx)}
          onDragEnd={handleDragEnd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 6,
            opacity: dragIdx === idx ? 0.4 : 1,
            borderTop: dropIdx === idx ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          <span style={{ color: 'var(--text-4)', cursor: 'grab', display: 'flex' }}>
            <GripVertical size={13} />
          </span>
          {/* Icon picker */}
          <select
            style={{ ...inputStyle, width: 80, cursor: 'default' }}
            value={c.icon ?? ''}
            onChange={(e) => {
              const updated = [...choices];
              updated[idx] = { ...c, icon: e.target.value || undefined };
              onChange(updated);
            }}
          >
            <option value="">—</option>
            {ICON_OPTIONS.map((slug) => (
              <option key={slug} value={slug}>{slug}</option>
            ))}
          </select>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Label"
            value={c.label}
            onChange={(e) => {
              const updated = [...choices];
              updated[idx] = { ...c, label: e.target.value };
              onChange(updated);
            }}
          />
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Description (opt.)"
            value={c.desc ?? ''}
            onChange={(e) => {
              const updated = [...choices];
              updated[idx] = { ...c, desc: e.target.value || undefined };
              onChange(updated);
            }}
          />
          <button
            className="btn icon sm danger"
            onClick={() => onChange(choices.filter((_, i) => i !== idx))}
            title="Supprimer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button
        className="btn outline sm"
        style={{ marginTop: 4, gap: 5 }}
        onClick={() => onChange([...choices, { id: newId(), label: '' }])}
      >
        <Plus size={12} />
        Ajouter un choix
      </button>
    </div>
  );
}

// ── Answer area ──────────────────────────────────────────────────────────────

function AnswerArea({ question, onChangeChoices }: {
  question: FormQuestion;
  onChangeChoices: (choices: FormChoice[]) => void;
}) {
  const choices = question.choices ?? [];

  switch (question.type) {
    case 'multi_choice':
    case 'single_choice':
    case 'dropdown':
      return (
        <ChoiceEditorInline
          choices={choices}
          onChange={onChangeChoices}
        />
      );
    case 'yes_no':
      return (
        <ChoiceEditorInline
          choices={[{ id: 'yes', label: 'Oui' }, { id: 'no', label: 'Non' }]}
          onChange={() => {}}
          readonly
        />
      );
    case 'short_text':
    case 'email':
    case 'phone':
      return (
        <div
          style={{
            marginTop: 12,
            borderBottom: '2px solid var(--border-2)',
            padding: '8px 0',
            fontSize: 16,
            color: 'var(--text-4)',
          }}
        >
          {question.placeholder || 'Votre réponse…'}
        </div>
      );
    case 'long_text':
      return (
        <div
          style={{
            marginTop: 12,
            borderBottom: '2px solid var(--border-2)',
            padding: '8px 0',
            fontSize: 15,
            color: 'var(--text-4)',
            minHeight: 60,
            lineHeight: 1.5,
          }}
        >
          {question.placeholder || 'Votre réponse longue…'}
        </div>
      );
    case 'number':
      return (
        <div
          style={{
            marginTop: 12,
            borderBottom: '2px solid var(--border-2)',
            padding: '8px 0',
            fontSize: 22,
            color: 'var(--text-4)',
          }}
        >
          0
        </div>
      );
    case 'slider': {
      const min = question.min ?? 0;
      const max = question.max ?? 100;
      const def = question.default ?? min;
      const unit = question.unit ?? '';
      return (
        <div style={{ marginTop: 16 }}>
          <div className="pv-slider-value">{def}{unit}</div>
          <input type="range" className="pv-slider" min={min} max={max} defaultValue={def} readOnly />
          <div className="pv-slider-marks">
            <span>{min}{unit}</span>
            <span>{max}{unit}</span>
          </div>
        </div>
      );
    }
    case 'rating': {
      const max = question.ratingMax ?? 5;
      return (
        <div className="pv-stars" style={{ marginTop: 12 }}>
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className="pv-star">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
              </svg>
            </span>
          ))}
        </div>
      );
    }
    case 'scale': {
      const max = question.scaleMax ?? 10;
      return (
        <div className="pv-scale" style={{ marginTop: 12 }}>
          {Array.from({ length: max }, (_, i) => (
            <button key={i} className="pv-scale">{i + 1}</button>
          ))}
        </div>
      );
    }
    case 'date':
      return (
        <div className="pv-date" style={{ marginTop: 12 }}>
          <input placeholder="DD" disabled />
          <input placeholder="MM" disabled />
          <input className="y" placeholder="YYYY" disabled />
        </div>
      );
    case 'file':
      return (
        <div className="pv-file" style={{ marginTop: 12 }}>
          <div className="ico" style={{ margin: '0 auto 8px' }}>↑</div>
          <div>Glissez-déposez un fichier ou cliquez pour sélectionner</div>
        </div>
      );
    case 'welcome':
    case 'end':
    case 'statement':
    default:
      return null;
  }
}

// ── QuestionEditor ───────────────────────────────────────────────────────────

export function QuestionEditor({ question, onChangeQ, onChangeChoices }: QuestionEditorProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: 'var(--font-form)',
    color: 'var(--text)',
    resize: 'none',
  };

  if (!question) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-4)',
          fontSize: 13,
        }}
      >
        Sélectionnez une question
      </div>
    );
  }

  const typeDef = QUESTION_TYPES.find((t) => t.id === question.type);
  const isContentOnly = ['welcome', 'end', 'statement'].includes(question.type);
  const showCTA = question.type === 'welcome' || question.type === 'end';

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '32px 24px',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-2)',
          overflow: 'hidden',
        }}
      >
        {/* Meta bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
            {question.ref}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500 }}>
            {typeDef?.label ?? question.type}
          </span>
          {question.required && (
            <span className="pill req" style={{ marginLeft: 'auto' }}>
              Requis
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '24px 24px 20px' }}>
          {/* Title */}
          <input
            style={{
              ...inputStyle,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-.02em',
              lineHeight: 1.2,
              marginBottom: 10,
            }}
            value={question.title}
            onChange={(e) => onChangeQ({ title: e.target.value })}
            placeholder="Titre de la question"
          />

          {/* Subtitle */}
          <textarea
            style={{
              ...inputStyle,
              fontSize: 14,
              color: 'var(--text-2)',
              lineHeight: 1.55,
              marginBottom: 4,
              minHeight: 40,
            }}
            value={question.subtitle ?? ''}
            onChange={(e) => onChangeQ({ subtitle: e.target.value || undefined })}
            placeholder="Sous-titre (optionnel)"
            rows={2}
          />

          {/* Answer area */}
          <AnswerArea question={question} onChangeChoices={onChangeChoices} />

          {/* CTA for welcome/end */}
          {showCTA && (
            <div style={{ marginTop: 20 }}>
              <input
                style={{
                  ...inputStyle,
                  display: 'inline-block',
                  width: 'auto',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  padding: '12px 24px',
                  borderRadius: 8,
                  cursor: 'text',
                }}
                value={question.cta ?? ''}
                onChange={(e) => onChangeQ({ cta: e.target.value })}
                placeholder="Label du bouton"
              />
            </div>
          )}
        </div>

        {/* OK footer for non-structural questions */}
        {!isContentOnly && (
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              className="btn accent"
              style={{ height: 36, paddingLeft: 20, paddingRight: 20 }}
            >
              OK <ChevronDown size={12} style={{ transform: 'rotate(-90deg)' }} />
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
              ou appuyez <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>Entrée</kbd>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
