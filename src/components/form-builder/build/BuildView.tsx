'use client';

import type { Form, FormQuestion, FormChoice, FormQuestionType } from '@/types';
import { QuestionList } from './QuestionList';
import { QuestionEditor } from './QuestionEditor';
import { Inspector } from './Inspector';

interface BuildViewProps {
  form: Form;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChangeQ: (patch: Partial<FormQuestion>) => void;
  onChangeChoices: (choices: FormChoice[]) => void;
  onAdd: (typeId: FormQuestionType) => void;
  onReorder: (srcId: string, targetId: string, where: 'above' | 'below') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddLogicFrom: (fromId: string) => void;
}

export function BuildView({
  form, selectedId, onSelect, onChangeQ, onChangeChoices,
  onAdd, onReorder, onDuplicate, onDelete, onAddLogicFrom,
}: BuildViewProps) {
  const selectedQ = form.questions.find((q) => q.id === selectedId);

  return (
    <>
      <QuestionList
        form={form}
        selectedId={selectedId}
        onSelect={onSelect}
        onAdd={onAdd}
        onReorder={onReorder}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
        <div className="pane-hd">
          <span>Éditeur</span>
          {selectedQ && (
            <div className="actions">
              <button className="btn ghost sm" onClick={() => onDuplicate(selectedQ.id)} title="Dupliquer">Dupliquer</button>
              <button className="btn ghost sm" onClick={() => onDelete(selectedQ.id)} title="Supprimer" style={{ color: 'var(--danger)' }}>Supprimer</button>
            </div>
          )}
        </div>
        <QuestionEditor
          question={selectedQ}
          onChangeQ={onChangeQ}
          onChangeChoices={onChangeChoices}
        />
      </div>
      <div className="pane" style={{ width: 300, flexShrink: 0 }}>
        <Inspector
          form={form}
          question={selectedQ}
          onChangeQ={onChangeQ}
          onChangeChoices={onChangeChoices}
          onDeleteQuestion={onDelete}
          onDuplicate={onDuplicate}
          onAddLogicFrom={onAddLogicFrom}
        />
      </div>
    </>
  );
}
