'use client';

import React, { useState, useRef } from 'react';
import type { Form, FormQuestion, FormQuestionType } from '@/types';
import { QUESTION_TYPES, QT_GROUPS } from '@/lib/form-builder/question-types';
import { ICON_SLUG_TO_LUCIDE } from '@/lib/form-builder/icons';
import { GripVertical, Plus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

interface QuestionListProps {
  form: Form;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (typeId: FormQuestionType) => void;
  onReorder: (srcId: string, targetId: string, where: 'above' | 'below') => void;
}

function getIcon(iconSlug: string): React.ReactNode {
  const iconName = ICON_SLUG_TO_LUCIDE[iconSlug];
  if (!iconName) return null;
  const Icon = (LucideIcons as unknown as Record<string, React.FC<{ size?: number }>>)[iconName];
  if (!Icon) return null;
  return <Icon size={13} />;
}

export function QuestionList({ form, selectedId, onSelect, onAdd, onReorder }: QuestionListProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; where: 'above' | 'below' } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOver({ id, where: e.clientY < midY ? 'above' : 'below' });
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const where = e.clientY < midY ? 'above' : 'below';
    onReorder(dragId, targetId, where);
    setDragId(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOver(null);
  }

  const hasLogic = (q: FormQuestion) =>
    form.logic.some((r) => r.from === q.id || r.to === q.id);

  return (
    <div className="pane" style={{ width: 260, flexShrink: 0 }}>
      <div className="pane-hd">
        <span>Questions</span>
        <div className="actions">
          <span style={{ color: 'var(--text-4)', fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>
            {form.questions.length}
          </span>
        </div>
      </div>
      <div className="pane-body">
        <div className="q-list" style={{ padding: '4px 0' }}>
          {form.questions.map((q) => {
            const typeDef = QUESTION_TYPES.find((t) => t.id === q.type);
            const iconSlug = typeDef?.icon ?? 'textShort';
            const isSelected = selectedId === q.id;
            const isDragging = dragId === q.id;
            const dropAbove = dragOver?.id === q.id && dragOver.where === 'above';
            const dropBelow = dragOver?.id === q.id && dragOver.where === 'below';

            return (
              <div
                key={q.id}
                draggable
                onDragStart={(e) => handleDragStart(e, q.id)}
                onDragOver={(e) => handleDragOver(e, q.id)}
                onDrop={(e) => handleDrop(e, q.id)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelect(q.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 34,
                  padding: '0 8px 0 4px',
                  cursor: 'default',
                  background: isSelected ? 'var(--accent-tint)' : 'transparent',
                  borderRadius: 5,
                  margin: '1px 4px',
                  opacity: isDragging ? 0.4 : 1,
                  position: 'relative',
                  borderTop: dropAbove ? '2px solid var(--accent)' : '2px solid transparent',
                  borderBottom: dropBelow ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'background .1s',
                }}
              >
                <span style={{ color: 'var(--text-4)', display: 'flex', cursor: 'grab' }}>
                  <GripVertical size={13} />
                </span>
                <span
                  style={{
                    color: isSelected ? 'var(--accent-2)' : 'var(--text-3)',
                    display: 'flex',
                    flexShrink: 0,
                  }}
                >
                  {getIcon(iconSlug)}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    color: isSelected ? 'var(--accent-2)' : 'var(--text)',
                    fontWeight: isSelected ? 500 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {q.title || '(Sans titre)'}
                </span>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {q.required && (
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        display: 'inline-block',
                      }}
                      title="Requis"
                    />
                  )}
                  {hasLogic(q) && (
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--logic-cond)',
                        display: 'inline-block',
                      }}
                      title="A une logique"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add button */}
      <div
        style={{
          padding: '8px',
          borderTop: '1px solid var(--border)',
          position: 'relative',
        }}
      >
        <button
          className="btn outline"
          style={{ width: '100%', justifyContent: 'center', gap: 6 }}
          onClick={() => setPickerOpen((v) => !v)}
        >
          <Plus size={13} />
          Ajouter une question
        </button>

        {pickerOpen && (
          <div
            ref={pickerRef}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 8,
              right: 8,
              background: 'var(--surface)',
              border: '1px solid var(--border-2)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-pop)',
              zIndex: 100,
              overflow: 'hidden',
              maxHeight: 340,
              overflowY: 'auto',
              marginBottom: 4,
            }}
          >
            {QT_GROUPS.map((group) => (
              <div key={group.id}>
                <div
                  style={{
                    padding: '8px 12px 4px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--text-4)',
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {group.label}
                </div>
                {group.items.map((typeId) => {
                  const typeDef = QUESTION_TYPES.find((t) => t.id === typeId);
                  if (!typeDef) return null;
                  return (
                    <button
                      key={typeId}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        background: 'transparent',
                        border: 0,
                        cursor: 'default',
                        fontSize: 12.5,
                        color: 'var(--text)',
                        textAlign: 'left',
                        fontFamily: 'var(--font-ui)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--hover)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                      onClick={() => {
                        onAdd(typeId);
                        setPickerOpen(false);
                      }}
                    >
                      <span style={{ color: 'var(--text-3)', display: 'flex' }}>
                        {getIcon(typeDef.icon)}
                      </span>
                      {typeDef.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
