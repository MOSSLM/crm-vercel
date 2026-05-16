import { useState, useCallback } from 'react';
import type { Form } from '@/types';

export function useFormState(initial: Form) {
  const [history, setHistory] = useState<Form[]>([initial]);
  const [cursor, setCursor] = useState(0);
  const form = history[cursor];

  const setForm = useCallback(
    (updater: Form | ((prev: Form) => Form)) => {
      setHistory((prev) => {
        const cur = prev[cursor];
        const next = typeof updater === 'function' ? updater(cur) : updater;
        const newHistory = prev.slice(0, cursor + 1);
        newHistory.push(next);
        return newHistory.slice(-50);
      });
      setCursor((c) => Math.min(c + 1, 49));
    },
    [cursor],
  );

  const undo = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const redo = useCallback(
    () => setCursor((c) => Math.min(history.length - 1, c + 1)),
    [history.length],
  );
  const canUndo = cursor > 0;
  const canRedo = cursor < history.length - 1;

  return { form, setForm, undo, redo, canUndo, canRedo };
}
