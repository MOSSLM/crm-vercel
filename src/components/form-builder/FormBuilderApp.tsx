'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Form, FormQuestion, FormChoice, FormQuestionType, FormLogicRule } from '@/types';
import { TopBar } from './parts/TopBar';
import { StatusBar } from './parts/StatusBar';
import { SettingsSheet } from './parts/SettingsSheet';
import { BuildView } from './build/BuildView';
import { LogicView } from './logic/LogicView';
import { PreviewView } from './preview/PreviewView';
import { ShareView } from './share/ShareView';
import { authedFetch } from "@/utils/authedFetch";

const SAVE_DEBOUNCE_MS = 1000;

function uid(prefix: string) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

function reRefs(qs: FormQuestion[]): FormQuestion[] {
  return qs.map((q, i) => ({ ...q, ref: q.ref || `Q${String(i + 1).padStart(2, '0')}` }));
}

interface FormBuilderAppProps {
  formId: string;
}

export default function FormBuilderApp({ formId }: FormBuilderAppProps) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [tab, setTab] = useState<'build' | 'logic' | 'preview' | 'share'>('build');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lastSavedRef = useRef<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  // Load form
  useEffect(() => {
    authedFetch(`/api/forms/${formId}`)
      .then((r) => r.json())
      .then((d: Form) => {
        setForm(d);
        const firstNonWelcome = d.questions.find((q) => q.type !== 'welcome') ?? d.questions[0];
        setSelectedId(firstNonWelcome?.id ?? null);
        lastSavedRef.current = JSON.stringify(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [formId]);

  // Auto-save (debounced)
  useEffect(() => {
    if (!form) return;
    if (initialLoadRef.current) { initialLoadRef.current = false; return; }
    const serialized = JSON.stringify(form);
    if (serialized === lastSavedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await authedFetch(`/api/forms/${formId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            slug: form.slug,
            description: form.description,
            tags: form.tags,
            questions: form.questions,
            logic: form.logic,
            brand: form.brand,
            settings: form.settings,
            style: form.style,
            is_published: form.is_published,
          }),
        });
        lastSavedRef.current = serialized;
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [form, formId]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches('input, textarea, [contenteditable=true]')) return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === '1') setTab('build');
      if (e.key === '2') setTab('logic');
      if (e.key === '3') setTab('preview');
      if (e.key === '4') setTab('share');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedIndex = form?.questions.findIndex((q) => q.id === selectedId) ?? -1;

  const updateQuestion = useCallback((id: string, patch: Partial<FormQuestion>) => {
    setForm((f) => f ? ({
      ...f,
      questions: f.questions.map((q) => q.id === id ? { ...q, ...patch } : q),
    }) : f);
  }, []);

  const updateChoices = useCallback((id: string, choices: FormChoice[]) => {
    setForm((f) => f ? ({
      ...f,
      questions: f.questions.map((q) => q.id === id ? { ...q, choices } : q),
    }) : f);
  }, []);

  const reorderQuestion = useCallback((srcId: string, targetId: string, where: 'above' | 'below') => {
    setForm((f) => {
      if (!f) return f;
      const arr = [...f.questions];
      const srcIdx = arr.findIndex((q) => q.id === srcId);
      if (srcIdx < 0) return f;
      const [m] = arr.splice(srcIdx, 1);
      const tgtIdx = arr.findIndex((q) => q.id === targetId);
      const insertAt = tgtIdx + (where === 'below' ? 1 : 0);
      arr.splice(insertAt, 0, m);
      return { ...f, questions: reRefs(arr) };
    });
  }, []);

  const addQuestion = useCallback((typeId: FormQuestionType) => {
    setForm((f) => {
      if (!f) return f;
      const refNum = (f.questions.length + 1).toString().padStart(2, '0');
      const id = uid('q');
      const base: FormQuestion = {
        id, ref: `Q${refNum}`, type: typeId, required: false,
        title: 'Nouvelle question', subtitle: '',
      };
      if (typeId === 'multi_choice' || typeId === 'single_choice' || typeId === 'dropdown') {
        base.multi = typeId === 'multi_choice';
        base.choices = [
          { id: uid('c'), label: 'Option 1' },
          { id: uid('c'), label: 'Option 2' },
        ];
      } else if (typeId === 'slider') {
        base.min = 0; base.max = 100; base.step = 1; base.default = 50; base.unit = '';
      } else if (typeId === 'welcome' || typeId === 'end') {
        base.cta = typeId === 'welcome' ? 'Commencer' : 'Retour au site';
      } else if (typeId === 'rating') {
        base.ratingMax = 5;
      } else if (typeId === 'scale') {
        base.scaleMax = 10;
      }
      const insertAfter = selectedIndex >= 0 ? selectedIndex : f.questions.length - 1;
      const next = [...f.questions];
      next.splice(insertAfter + 1, 0, base);
      setSelectedId(id);
      return { ...f, questions: reRefs(next) };
    });
  }, [selectedIndex]);

  const duplicateQuestion = useCallback((id: string) => {
    setForm((f) => {
      if (!f) return f;
      const idx = f.questions.findIndex((q) => q.id === id);
      if (idx < 0) return f;
      const src = f.questions[idx];
      const newQ: FormQuestion = { ...JSON.parse(JSON.stringify(src)), id: uid('q') };
      if (newQ.choices) newQ.choices = newQ.choices.map((c) => ({ ...c, id: uid('c') }));
      const next = [...f.questions];
      next.splice(idx + 1, 0, newQ);
      return { ...f, questions: reRefs(next) };
    });
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setForm((f) => {
      if (!f) return f;
      const idx = f.questions.findIndex((q) => q.id === id);
      const next = f.questions.filter((q) => q.id !== id);
      const nextLogic = f.logic.filter((r) => r.from !== id && r.to !== id);
      if (id === selectedId) {
        const fallback = f.questions[idx + 1] ?? f.questions[idx - 1];
        setSelectedId(fallback?.id ?? null);
      }
      return { ...f, questions: reRefs(next), logic: nextLogic };
    });
  }, [selectedId]);

  const addLogicFrom = useCallback((fromId: string) => {
    setForm((f) => {
      if (!f) return f;
      const fromQ = f.questions.find((q) => q.id === fromId);
      const nextQ = f.questions[f.questions.findIndex((q) => q.id === fromId) + 1];
      if (!fromQ || !nextQ) return f;
      const firstChoice = fromQ.choices?.[0];
      const rule: FormLogicRule = {
        id: uid('r'), from: fromId, to: nextQ.id,
        cond: firstChoice
          ? { all: [{ field: fromId, op: 'eq', value: firstChoice.id }] }
          : { all: [{ field: fromId, op: 'answered' }] },
        label: firstChoice ? `si ${firstChoice.label}` : 'si répondue',
      };
      return { ...f, logic: [...f.logic, rule] };
    });
  }, []);

  const handlePublish = useCallback(() => {
    setForm((f) => f ? ({ ...f, is_published: !f.is_published }) : f);
  }, []);

  const handleSettingsSave = useCallback((patch: Partial<Form>) => {
    setForm((f) => f ? ({ ...f, ...patch }) : f);
  }, []);

  if (loading || !form) {
    return (
      <div data-form-builder style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-3)', fontSize: 13 }}>
        Chargement du formulaire…
      </div>
    );
  }

  const selectedQ = form.questions.find((q) => q.id === selectedId);

  return (
    <div data-form-builder data-density="regular" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <TopBar
        form={form}
        tab={tab}
        onTab={(t) => setTab(t as 'build' | 'logic' | 'preview' | 'share')}
        saving={saving}
        onPublish={handlePublish}
        onSettings={() => setSettingsOpen(true)}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {tab === 'build' && (
          <BuildView
            form={form}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChangeQ={(patch) => selectedId && updateQuestion(selectedId, patch)}
            onChangeChoices={(c) => selectedId && updateChoices(selectedId, c)}
            onAdd={addQuestion}
            onReorder={reorderQuestion}
            onDuplicate={duplicateQuestion}
            onDelete={deleteQuestion}
            onAddLogicFrom={addLogicFrom}
          />
        )}
        {tab === 'logic' && (
          <LogicView
            form={form}
            onChangeLogic={(logic) => setForm((f) => f ? ({ ...f, logic }) : f)}
            onAddLogicFrom={addLogicFrom}
          />
        )}
        {tab === 'preview' && <PreviewView form={form} />}
        {tab === 'share' && <ShareView form={form} />}
      </div>
      <StatusBar form={form} tab={tab} />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        form={form}
        onSave={handleSettingsSave}
      />
      {/* Suppress unused router warning */}
      {false && router && <span />}
      {/* Suppress unused selectedQ warning */}
      {false && selectedQ && <span />}
    </div>
  );
}
