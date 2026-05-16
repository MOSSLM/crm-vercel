'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { Form, FormQuestion } from '@/types';
import { resolveFlow } from '@/lib/form-builder/evaluate-logic';
import { ProgressBar } from './ProgressBar';
import { FormIcon } from './FormIcon';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FormRuntimeProps {
  form: Form;
  variables?: Record<string, string>;
  mode?: 'step' | 'scroll';
  device?: 'desktop' | 'mobile';
  siteId?: string;
  embedded?: boolean;
  onSubmit?: (payload: { answers: Record<string, unknown>; contact: Record<string, string> }) => void;
}

// ─── Variable interpolation ───────────────────────────────────────────────────

function interpolate(text: string | undefined, variables: Record<string, string> | undefined): string {
  if (!text) return '';
  if (!variables) return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? `{{${key}}}`);
}

// ─── AnswerInput ──────────────────────────────────────────────────────────────

interface AnswerInputProps {
  q: FormQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  onSubmit?: () => void;
}

function AnswerInput({ q, value, onChange, onSubmit }: AnswerInputProps) {
  switch (q.type) {
    case 'short_text':
    case 'email':
    case 'phone':
      return (
        <input
          className="pv-text-input"
          type={q.type === 'email' ? 'email' : 'text'}
          placeholder={q.placeholder || 'Votre réponse…'}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      );

    case 'long_text':
      return (
        <textarea
          className="pv-text-input"
          placeholder={q.placeholder || 'Votre réponse…'}
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      );

    case 'number':
      return (
        <input
          className="pv-text-input"
          type="number"
          placeholder={q.placeholder || '0'}
          value={(value as string) ?? ''}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
          autoFocus
        />
      );

    case 'multi_choice':
    case 'single_choice': {
      const isMulti = q.type === 'multi_choice';
      const sel = isMulti ? ((value as string[]) || []) : (value as string);
      const toggle = (id: string) => {
        if (isMulti) {
          const arr = (sel as string[]);
          const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
          onChange(next);
        } else {
          onChange(id);
          setTimeout(() => onSubmit?.(), 200);
        }
      };
      return (
        <div className="pv-choices">
          {(q.choices || []).map((c, i) => {
            const on = isMulti
              ? (sel as string[]).includes(c.id)
              : sel === c.id;
            return (
              <div
                key={c.id}
                className={`pv-choice${on ? ' selected' : ''}`}
                onClick={() => toggle(c.id)}
              >
                {c.icon && (
                  <div className="ch-icon">
                    <FormIcon name={c.icon} className="ico-lg" />
                  </div>
                )}
                <div className="ch-text">
                  <div className="lbl">{c.label}</div>
                  {c.desc && <div className="desc">{c.desc}</div>}
                </div>
                <div className="ch-key">{String.fromCharCode(65 + i)}</div>
              </div>
            );
          })}
        </div>
      );
    }

    case 'dropdown': {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [open, setOpen] = useState(false);
      const sel = (q.choices || []).find((c) => c.id === value);
      return (
        <div>
          <div
            className={`pv-dropdown${sel ? '' : ' placeholder'}`}
            onClick={() => setOpen(!open)}
          >
            {sel ? sel.label : (q.placeholder || 'Sélectionner une option…')}
            <FormIcon name="chevdown" className="ico" />
          </div>
          {open && (
            <div className="pv-dropdown-list">
              {(q.choices || []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    case 'yes_no':
      return (
        <div className="pv-yesno">
          <button
            className={value === 'yes' ? 'on' : ''}
            onClick={() => {
              onChange('yes');
              setTimeout(() => onSubmit?.(), 200);
            }}
          >
            <FormIcon name="check" className="ico" />
            Oui <span className="k">Y</span>
          </button>
          <button
            className={value === 'no' ? 'on' : ''}
            onClick={() => {
              onChange('no');
              setTimeout(() => onSubmit?.(), 200);
            }}
          >
            <FormIcon name="x" className="ico" />
            Non <span className="k">N</span>
          </button>
        </div>
      );

    case 'rating': {
      const max = q.ratingMax ?? q.max ?? 5;
      const v = (value as number) || 0;
      const labels = ['', 'Très insatisfait', 'Insatisfait', 'Correct', 'Bien', 'Excellent'];
      return (
        <div className="pv-stars">
          {Array.from({ length: max }).map((_, i) => (
            <span
              key={i}
              className={`pv-star${i < v ? ' on' : ''}`}
              onClick={() => onChange(i + 1)}
            >
              <FormIcon name="rating" />
            </span>
          ))}
          {v > 0 && (
            <span className="pv-star-label">{labels[v] || `${v}/${max}`}</span>
          )}
        </div>
      );
    }

    case 'scale': {
      const scaleMax = q.scaleMax ?? 10;
      return (
        <div className="pv-scale">
          {Array.from({ length: scaleMax }).map((_, i) => (
            <button
              key={i}
              className={value === i + 1 ? 'on' : ''}
              onClick={() => onChange(i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      );
    }

    case 'slider': {
      const min = q.min ?? 0;
      const max = q.max ?? 100;
      const step = q.step ?? 1;
      const def = q.default ?? Math.round((min + max) / 2);
      const v = (value as number) ?? def;
      return (
        <div>
          <div className="pv-slider-value">
            {v}{q.unit ? ` ${q.unit}` : ''}
          </div>
          <input
            className="pv-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <div className="pv-slider-marks">
            <span>{min}{q.unit ? ` ${q.unit}` : ''}</span>
            <span>{max}{q.unit ? ` ${q.unit}` : ''}</span>
          </div>
        </div>
      );
    }

    case 'date': {
      const v = (value as { d?: string; m?: string; y?: string }) || {};
      return (
        <div className="pv-date">
          <input
            type="text"
            placeholder="JJ"
            maxLength={2}
            value={v.d || ''}
            onChange={(e) =>
              onChange({ ...v, d: e.target.value.replace(/\D/g, '') })
            }
          />
          <input
            type="text"
            placeholder="MM"
            maxLength={2}
            value={v.m || ''}
            onChange={(e) =>
              onChange({ ...v, m: e.target.value.replace(/\D/g, '') })
            }
          />
          <input
            className="y"
            type="text"
            placeholder="AAAA"
            maxLength={4}
            value={v.y || ''}
            onChange={(e) =>
              onChange({ ...v, y: e.target.value.replace(/\D/g, '') })
            }
          />
        </div>
      );
    }

    case 'file':
      return (
        <div className="pv-file">
          <FormIcon name="upload" className="ico" />
          <br />
          <strong style={{ color: '#14120E' }}>Glissez un fichier</strong> ou cliquez pour parcourir
          <br />
          <span style={{ fontSize: 12, opacity: 0.6 }}>Max 10 Mo · PDF, JPG, PNG</span>
        </div>
      );

    case 'statement':
      return null;

    default:
      return null;
  }
}

// ─── QuestionRenderer ─────────────────────────────────────────────────────────

interface QuestionRendererProps {
  form: Form;
  q: FormQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  onSubmit?: () => void;
  showNumber: boolean;
  total: number;
  index: number;
  inline?: boolean;
  variables?: Record<string, string>;
}

function QuestionRenderer({
  form,
  q,
  value,
  onChange,
  onSubmit,
  showNumber,
  total,
  index,
  inline,
  variables,
}: QuestionRendererProps) {
  const isStruct = q.type === 'welcome' || q.type === 'end' || q.type === 'statement';
  const title = interpolate(q.title, variables);
  const subtitle = interpolate(q.subtitle, variables);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (q.type === 'long_text') return;
      e.preventDefault();
      onSubmit?.();
    }
  };

  const hasValue =
    value !== undefined &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0);

  if (q.type === 'welcome') {
    return (
      <div className="pv-card pv-welcome">
        <h1 className="pv-title" style={{ fontSize: 38 }}>{title}</h1>
        {subtitle && <p className="pv-subtitle" style={{ fontSize: 17 }}>{subtitle}</p>}
        <div className="pv-footer">
          <button className="pv-cta" onClick={onSubmit}>
            {q.cta || 'Commencer'} <span className="k">↵</span>
          </button>
          <span className="pv-hint">prend <b>~2 minutes</b></span>
        </div>
      </div>
    );
  }

  if (q.type === 'end') {
    return (
      <div className="pv-card pv-end">
        <div className="ok-icon">
          <FormIcon name="check" className="ico" />
        </div>
        <h1 className="pv-title">{title}</h1>
        {subtitle && <p className="pv-subtitle">{subtitle}</p>}
        <div className="pv-footer">
          <button className="pv-cta">{q.cta || 'Terminer'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pv-card">
      {showNumber && (
        <div className="pv-step">
          <FormIcon name="chevright" className="ico-sm" />
          {index}{' '}
          <span style={{ opacity: 0.5 }}>
            · {q.required ? 'obligatoire' : 'optionnel'}
          </span>
        </div>
      )}
      <h2 className="pv-title">{title}</h2>
      {subtitle && <p className="pv-subtitle">{subtitle}</p>}

      <div className="pv-answer" onKeyDown={onKeyDown}>
        <AnswerInput q={q} value={value} onChange={onChange} onSubmit={onSubmit} />
      </div>

      {!inline && !isStruct && (
        <div className="pv-footer">
          <button
            className="pv-cta"
            onClick={onSubmit}
            disabled={q.required && !hasValue}
          >
            OK <span className="k">↵</span>
          </button>
          <span className="pv-hint">
            appuyer <b>Entrée ↵</b>
          </span>
        </div>
      )}

      {inline && q.type === 'statement' && (
        <div className="pv-footer">
          <button className="pv-cta" onClick={onSubmit}>
            Continuer <span className="k">↵</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FormRuntime ──────────────────────────────────────────────────────────────

export function FormRuntime({
  form,
  variables,
  mode,
  device = 'desktop',
  siteId,
  embedded = false,
  onSubmit,
}: FormRuntimeProps) {
  const resolvedMode = mode ?? form.settings.renderMode ?? 'step';

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [idx, setIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const flow = useMemo(() => resolveFlow(form, answers), [form, answers]);
  const safeIdx = Math.min(idx, flow.length - 1);
  const currentId = flow[safeIdx];
  const current = form.questions.find((q) => q.id === currentId);

  const total = form.questions.filter(
    (q) => q.type !== 'welcome' && q.type !== 'end',
  ).length;

  const progressIdx = flow.slice(0, safeIdx + 1).filter((id) => {
    const q = form.questions.find((x) => x.id === id);
    return q && q.type !== 'welcome' && q.type !== 'end';
  }).length;

  const progressPct = total === 0 ? 0 : Math.min(100, (progressIdx / total) * 100);

  const setAnswer = (qid: string, val: unknown) =>
    setAnswers((a) => ({ ...a, [qid]: val }));

  const goNext = useCallback(() => {
    if (safeIdx >= flow.length - 1) {
      // Submit
      if (submitted) return;
      setSubmitted(true);
      const payload = {
        answers,
        contact: {} as Record<string, string>,
      };
      if (embedded) {
        onSubmit?.(payload);
      } else {
        fetch(`/api/forms/${form.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers,
            source_url: typeof window !== 'undefined' ? window.location.href : '',
            site_id: siteId,
          }),
        }).catch(console.error);
        onSubmit?.(payload);
      }
    } else {
      setIdx(safeIdx + 1);
    }
  }, [safeIdx, flow.length, submitted, answers, embedded, onSubmit, form.id, siteId]);

  const goPrev = useCallback(() => {
    if (safeIdx > 0) setIdx(safeIdx - 1);
  }, [safeIdx]);

  // Reset when form id changes
  useEffect(() => {
    setIdx(0);
    setAnswers({});
    setSubmitted(false);
  }, [form.id]);

  // Clamp idx if flow shrinks
  useEffect(() => {
    if (safeIdx !== idx) setIdx(safeIdx);
  }, [flow.length, safeIdx, idx]);

  if (submitted) {
    const endQ = form.questions.find((q) => q.type === 'end');
    return (
      <div
        data-form-builder
        className={`preview-frame device-${device}`}
        style={{ minHeight: 480 }}
      >
        <div className="pv-body">
          <div className="pv-card pv-end">
            <div className="ok-icon">
              <FormIcon name="check" className="ico" />
            </div>
            <h1 className="pv-title">
              {endQ ? interpolate(endQ.title, variables) : 'Merci pour votre réponse !'}
            </h1>
            {endQ?.subtitle && (
              <p className="pv-subtitle">{interpolate(endQ.subtitle, variables)}</p>
            )}
            <div className="pv-footer">
              <button className="pv-cta" onClick={() => { setSubmitted(false); setIdx(0); setAnswers({}); }}>
                {endQ?.cta || 'Terminer'}
              </button>
            </div>
          </div>
        </div>
        {form.brand?.name && (
          <div className="pv-brand">
            <i>T</i> propulsé par{' '}
            <b style={{ color: 'rgba(20,18,14,.6)' }}>{form.brand.name}</b>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-form-builder
      className={`preview-frame device-${device}`}
    >
      <ProgressBar
        pct={progressPct}
        current={progressIdx}
        total={total}
        show={form.settings.progressBar}
      />

      {resolvedMode === 'step' ? (
        <div className="pv-body">
          {current && (
            <QuestionRenderer
              form={form}
              q={current}
              value={answers[current.id]}
              onChange={(v) => setAnswer(current.id, v)}
              onSubmit={goNext}
              showNumber={form.settings.showQuestionNumber}
              total={total}
              index={progressIdx}
              variables={variables}
            />
          )}
        </div>
      ) : (
        <div className="pv-scroll">
          {flow.map((id, i) => {
            const q = form.questions.find((x) => x.id === id);
            if (!q) return null;
            const isStruct = q.type === 'welcome' || q.type === 'end';
            return (
              <div key={id} className="pv-card-block">
                <QuestionRenderer
                  form={form}
                  q={q}
                  value={answers[id]}
                  onChange={(v) => setAnswer(id, v)}
                  onSubmit={() => {}}
                  showNumber={form.settings.showQuestionNumber && !isStruct}
                  total={total}
                  index={i + 1}
                  inline
                  variables={variables}
                />
              </div>
            );
          })}
        </div>
      )}

      {resolvedMode === 'step' && (
        <div className="pv-nav">
          <button onClick={goPrev} disabled={safeIdx === 0} title="Précédent">
            <FormIcon name="chevup" className="ico-sm" />
          </button>
          <button
            onClick={goNext}
            disabled={safeIdx >= flow.length - 1 && submitted}
            title="Suivant"
          >
            <FormIcon name="chevdown" className="ico-sm" />
          </button>
        </div>
      )}

      {form.brand?.name && (
        <div className="pv-brand">
          <i>T</i> propulsé par{' '}
          <b style={{ color: 'rgba(20,18,14,.6)' }}>{form.brand.name}</b>
        </div>
      )}
    </div>
  );
}
