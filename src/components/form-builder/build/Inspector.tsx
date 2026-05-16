'use client';

import React, { useState } from 'react';
import type { Form, FormQuestion, FormChoice, FormQuestionType } from '@/types';
import { QUESTION_TYPES } from '@/lib/form-builder/question-types';
import { Plus } from 'lucide-react';

interface InspectorProps {
  form: Form;
  question: FormQuestion | undefined;
  onChangeQ: (patch: Partial<FormQuestion>) => void;
  onChangeChoices: (choices: FormChoice[]) => void;
  onDeleteQuestion: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddLogicFrom: (fromId: string) => void;
}

type SubTab = 'content' | 'settings' | 'logic';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 30,
  padding: '0 8px',
  border: '1px solid var(--border-2)',
  borderRadius: 5,
  fontSize: 12.5,
  color: 'var(--text)',
  background: 'var(--surface)',
  outline: 'none',
  fontFamily: 'var(--font-ui)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--text-3)',
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  marginBottom: 5,
  display: 'block',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: 12,
};

const OP_LABELS: Record<string, string> = {
  eq: '=',
  neq: '≠',
  contains: 'contient',
  not_contains: 'ne contient pas',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  answered: 'a répondu',
  empty: 'est vide',
};

export function Inspector({
  form,
  question,
  onChangeQ,
  onDeleteQuestion,
  onDuplicate,
  onAddLogicFrom,
}: InspectorProps) {
  const [subTab, setSubTab] = useState<SubTab>('content');

  const logicRules = form.logic.filter((r) => r.from === question?.id);

  const subTabStyle = (t: SubTab): React.CSSProperties => ({
    flex: 1,
    height: 28,
    background: subTab === t ? 'var(--surface)' : 'transparent',
    border: 0,
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 500,
    color: subTab === t ? 'var(--text)' : 'var(--text-3)',
    cursor: 'default',
    boxShadow: subTab === t ? 'var(--shadow-1)' : 'none',
    fontFamily: 'var(--font-ui)',
  });

  if (!question) {
    return (
      <div className="pane" style={{ width: 300, flexShrink: 0 }}>
        <div className="pane-hd"><span>Inspecteur</span></div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-4)',
            fontSize: 12,
            padding: 20,
            textAlign: 'center',
          }}
        >
          Sélectionnez une question
        </div>
      </div>
    );
  }

  return (
    <div className="pane" style={{ width: 300, flexShrink: 0 }}>
      <div className="pane-hd"><span>Inspecteur</span></div>

      {/* Sub-tabs */}
      <div
        style={{
          display: 'flex',
          padding: '6px 8px',
          gap: 2,
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--border)',
          borderRadius: 0,
        }}
      >
        <button style={subTabStyle('content')} onClick={() => setSubTab('content')}>Contenu</button>
        <button style={subTabStyle('settings')} onClick={() => setSubTab('settings')}>Réglages</button>
        <button style={subTabStyle('logic')} onClick={() => setSubTab('logic')}>
          Logique
          {logicRules.length > 0 && (
            <span
              style={{
                marginLeft: 5,
                background: 'var(--logic-cond)',
                color: '#fff',
                borderRadius: 9,
                fontSize: 10,
                padding: '0 5px',
                lineHeight: '16px',
                display: 'inline-block',
              }}
            >
              {logicRules.length}
            </span>
          )}
        </button>
      </div>

      <div className="pane-body" style={{ padding: '12px' }}>
        {subTab === 'content' && (
          <>
            <div style={fieldStyle}>
              <label style={labelStyle}>Référence</label>
              <input
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                value={question.ref}
                onChange={(e) => onChangeQ({ ref: e.target.value })}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Type</label>
              <select
                style={{ ...inputStyle, cursor: 'default' }}
                value={question.type}
                onChange={(e) => onChangeQ({ type: e.target.value as FormQuestionType })}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: 12.5, color: 'var(--text)' }}>Requis</label>
              <input
                type="checkbox"
                checked={question.required ?? false}
                onChange={(e) => onChangeQ({ required: e.target.checked })}
                style={{ width: 15, height: 15 }}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Titre</label>
              <input
                style={inputStyle}
                value={question.title}
                onChange={(e) => onChangeQ({ title: e.target.value })}
                placeholder="Titre"
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Sous-titre</label>
              <input
                style={inputStyle}
                value={question.subtitle ?? ''}
                onChange={(e) => onChangeQ({ subtitle: e.target.value || undefined })}
                placeholder="Sous-titre (opt.)"
              />
            </div>
            {['short_text', 'long_text', 'email', 'phone', 'number'].includes(question.type) && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Placeholder</label>
                <input
                  style={inputStyle}
                  value={question.placeholder ?? ''}
                  onChange={(e) => onChangeQ({ placeholder: e.target.value || undefined })}
                />
              </div>
            )}
            {(question.type === 'welcome' || question.type === 'end') && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Label CTA</label>
                <input
                  style={inputStyle}
                  value={question.cta ?? ''}
                  onChange={(e) => onChangeQ({ cta: e.target.value || undefined })}
                  placeholder="Commencer"
                />
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: 6,
              }}
            >
              <button
                className="btn outline sm"
                style={{ flex: 1 }}
                onClick={() => onDuplicate(question.id)}
              >
                Dupliquer
              </button>
              <button
                className="btn danger sm"
                onClick={() => onDeleteQuestion(question.id)}
              >
                Supprimer
              </button>
            </div>
          </>
        )}

        {subTab === 'settings' && (
          <>
            {question.type === 'slider' && (
              <>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Min</label>
                  <input
                    style={inputStyle}
                    type="number"
                    value={question.min ?? 0}
                    onChange={(e) => onChangeQ({ min: Number(e.target.value) })}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Max</label>
                  <input
                    style={inputStyle}
                    type="number"
                    value={question.max ?? 100}
                    onChange={(e) => onChangeQ({ max: Number(e.target.value) })}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Pas</label>
                  <input
                    style={inputStyle}
                    type="number"
                    value={question.step ?? 1}
                    onChange={(e) => onChangeQ({ step: Number(e.target.value) })}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Unité</label>
                  <input
                    style={inputStyle}
                    value={question.unit ?? ''}
                    onChange={(e) => onChangeQ({ unit: e.target.value || undefined })}
                    placeholder="m², kg, €…"
                  />
                </div>
              </>
            )}
            {['short_text', 'long_text', 'email'].includes(question.type) && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Longueur max</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={question.maxLen ?? ''}
                  onChange={(e) => onChangeQ({ maxLen: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Illimité"
                />
              </div>
            )}
            {question.type === 'rating' && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Nombre d&apos;étoiles</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  max={10}
                  value={question.ratingMax ?? 5}
                  onChange={(e) => onChangeQ({ ratingMax: Number(e.target.value) })}
                />
              </div>
            )}
            {question.type === 'scale' && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Max de l&apos;échelle</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={2}
                  max={20}
                  value={question.scaleMax ?? 10}
                  onChange={(e) => onChangeQ({ scaleMax: Number(e.target.value) })}
                />
              </div>
            )}
            {['multi_choice', 'single_choice'].includes(question.type) && (
              <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 12.5, color: 'var(--text)' }}>Choix multiple</label>
                <input
                  type="checkbox"
                  checked={question.multi ?? false}
                  onChange={(e) => onChangeQ({ multi: e.target.checked })}
                  style={{ width: 15, height: 15 }}
                />
              </div>
            )}
            {!['slider', 'short_text', 'long_text', 'email', 'rating', 'scale', 'multi_choice', 'single_choice'].includes(question.type) && (
              <div style={{ color: 'var(--text-4)', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
                Pas de réglages spécifiques pour ce type.
              </div>
            )}
          </>
        )}

        {subTab === 'logic' && (
          <>
            {logicRules.length === 0 ? (
              <div
                style={{
                  color: 'var(--text-4)',
                  fontSize: 12,
                  textAlign: 'center',
                  marginTop: 24,
                  marginBottom: 16,
                }}
              >
                Aucune règle depuis cette question.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {logicRules.map((rule) => {
                  const toQ = form.questions.find((q) => q.id === rule.to);
                  const clauses = rule.cond?.all ?? rule.cond?.any ?? [];
                  return (
                    <div
                      key={rule.id}
                      style={{
                        background: 'var(--logic-cond-tint)',
                        border: '1px solid rgba(107,91,217,.2)',
                        borderRadius: 7,
                        padding: '8px 10px',
                        fontSize: 11.5,
                        color: 'var(--text)',
                        lineHeight: 1.5,
                      }}
                    >
                      {rule.label && (
                        <div style={{ fontWeight: 600, color: 'var(--logic-cond)', marginBottom: 4, fontSize: 11 }}>
                          {rule.label}
                        </div>
                      )}
                      {clauses.map((c, i) => (
                        <div key={i} style={{ color: 'var(--text-2)', fontSize: 11 }}>
                          Si <strong>{c.field}</strong> {OP_LABELS[c.op] ?? c.op}
                          {c.value !== undefined ? <> <em>{String(c.value)}</em></> : null}
                        </div>
                      ))}
                      <div style={{ marginTop: 4, color: 'var(--logic-action)', fontSize: 11 }}>
                        → {toQ ? `${toQ.ref}: ${toQ.title.slice(0, 30)}` : rule.to}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              className="btn outline sm"
              style={{ width: '100%', justifyContent: 'center', gap: 5 }}
              onClick={() => onAddLogicFrom(question.id)}
            >
              <Plus size={12} />
              Ajouter règle
            </button>
          </>
        )}
      </div>
    </div>
  );
}
