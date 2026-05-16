'use client';

import type { Form, FormLogicRule, FormLogicOp, FormLogicClause } from '@/types';
import { GitBranch, Plus, Trash2, ArrowRight } from 'lucide-react';

interface LogicViewProps {
  form: Form;
  onChangeLogic: (logic: FormLogicRule[]) => void;
  onAddLogicFrom: (fromId: string) => void;
}

const OP_LABELS: Record<FormLogicOp, string> = {
  eq: '=',
  neq: '≠',
  contains: 'contient',
  not_contains: 'ne contient pas',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  answered: 'a été répondue',
  empty: 'est vide',
};

const OPS: FormLogicOp[] = ['eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'answered', 'empty'];

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)',
  letterSpacing: '.06em', textTransform: 'uppercase', marginRight: 6,
};

const selectStyle: React.CSSProperties = {
  height: 26, padding: '0 6px', border: '1px solid var(--border-2)',
  borderRadius: 5, fontSize: 12, background: 'var(--surface)', color: 'var(--text)',
  outline: 'none', fontFamily: 'var(--font-ui)',
};

const inputStyle: React.CSSProperties = {
  height: 26, padding: '0 8px', border: '1px solid var(--border-2)',
  borderRadius: 5, fontSize: 12, background: 'var(--surface)', color: 'var(--text)',
  outline: 'none', fontFamily: 'var(--font-ui)', minWidth: 80,
};

export function LogicView({ form, onChangeLogic, onAddLogicFrom }: LogicViewProps) {
  function updateRule(id: string, patch: Partial<FormLogicRule>) {
    onChangeLogic(form.logic.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  function deleteRule(id: string) {
    onChangeLogic(form.logic.filter((r) => r.id !== id));
  }

  function updateClause(ruleId: string, idx: number, patch: Partial<FormLogicClause>) {
    const rule = form.logic.find((r) => r.id === ruleId);
    if (!rule) return;
    const clauses = [...(rule.cond?.all ?? rule.cond?.any ?? [])];
    clauses[idx] = { ...clauses[idx], ...patch };
    const mode = rule.cond?.any ? 'any' : 'all';
    updateRule(ruleId, { cond: { [mode]: clauses } });
  }

  function questionsWithoutWelcome() {
    return form.questions.filter((q) => q.type !== 'welcome' && q.type !== 'end' && q.type !== 'statement');
  }

  return (
    <div className="pane" style={{ flex: 1, background: 'var(--bg)' }}>
      <div className="pane-hd">
        <span>Logique conditionnelle</span>
        <div className="actions">
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{form.logic.length} règle{form.logic.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="pane-body" style={{ padding: 24, overflow: 'auto' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {form.logic.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontSize: 13 }}>
              <GitBranch size={32} style={{ opacity: 0.4, marginBottom: 12 }} />
              <div style={{ marginBottom: 8 }}>Aucune règle de logique</div>
              <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
                Ajoutez une règle depuis l&apos;inspecteur d&apos;une question (onglet Logique).
              </div>
            </div>
          )}

          {form.logic.map((rule) => {
            const fromQ = form.questions.find((q) => q.id === rule.from);
            const toQ = form.questions.find((q) => q.id === rule.to);
            const clauses = rule.cond?.all ?? rule.cond?.any ?? [];
            const mode = rule.cond?.any ? 'OU' : 'ET';

            return (
              <div
                key={rule.id}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border-2)',
                  borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: 'var(--shadow-1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{
                    fontSize: 10.5, fontFamily: 'var(--font-mono)', padding: '2px 6px',
                    background: 'var(--logic-cond-tint)', color: 'var(--logic-cond)',
                    borderRadius: 4, fontWeight: 600,
                  }}>{fromQ?.ref ?? '?'}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{fromQ?.title ?? 'Question introuvable'}</span>
                  <span style={{ flex: 1 }} />
                  <button
                    onClick={() => deleteRule(rule.id)}
                    style={{ background: 'transparent', border: 0, color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}
                    title="Supprimer la règle"
                  ><Trash2 size={14} /></button>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
                  <span style={labelStyle}>Si</span>
                </div>

                {clauses.map((cl, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 8 }}>
                    {idx > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: 'var(--logic-cond)',
                        padding: '1px 4px', background: 'var(--logic-cond-tint)', borderRadius: 3, marginRight: 4,
                      }}>{mode}</span>
                    )}
                    <select
                      value={cl.field}
                      onChange={(e) => updateClause(rule.id, idx, { field: e.target.value })}
                      style={{ ...selectStyle, maxWidth: 200 }}
                    >
                      {questionsWithoutWelcome().map((q) => (
                        <option key={q.id} value={q.id}>{q.ref} · {q.title.slice(0, 30)}</option>
                      ))}
                    </select>
                    <select
                      value={cl.op}
                      onChange={(e) => updateClause(rule.id, idx, { op: e.target.value as FormLogicOp })}
                      style={selectStyle}
                    >
                      {OPS.map((op) => (
                        <option key={op} value={op}>{OP_LABELS[op]}</option>
                      ))}
                    </select>
                    {cl.op !== 'answered' && cl.op !== 'empty' && (
                      <input
                        type="text"
                        value={String(cl.value ?? '')}
                        onChange={(e) => updateClause(rule.id, idx, { value: e.target.value })}
                        placeholder="valeur"
                        style={inputStyle}
                      />
                    )}
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={labelStyle}>Alors aller à</span>
                  <ArrowRight size={14} style={{ color: 'var(--text-3)' }} />
                  <select
                    value={rule.to}
                    onChange={(e) => updateRule(rule.id, { to: e.target.value })}
                    style={{ ...selectStyle, flex: 1, maxWidth: 280 }}
                  >
                    {form.questions.map((q) => (
                      <option key={q.id} value={q.id}>{q.ref} · {q.title.slice(0, 30)}</option>
                    ))}
                  </select>
                  <span style={{ flex: 1 }} />
                  {toQ && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{toQ.ref}</span>
                  )}
                </div>

                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-4)' }}>
                  <input
                    type="text"
                    value={rule.label ?? ''}
                    onChange={(e) => updateRule(rule.id, { label: e.target.value })}
                    placeholder="Étiquette de la règle (optionnel)"
                    style={{ ...inputStyle, width: '100%', fontSize: 11 }}
                  />
                </div>
              </div>
            );
          })}

          {form.questions.length > 0 && (
            <button
              onClick={() => {
                const firstNonEnd = form.questions.find((q) => q.type !== 'welcome' && q.type !== 'end' && q.type !== 'statement');
                if (firstNonEnd) onAddLogicFrom(firstNonEnd.id);
              }}
              style={{
                width: '100%', marginTop: 12, padding: '12px 16px',
                border: '1px dashed var(--border-2)', borderRadius: 8,
                background: 'transparent', color: 'var(--text-3)', fontSize: 12.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Ajouter une règle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
