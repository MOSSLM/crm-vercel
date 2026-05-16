'use client';

import React from 'react';
import type { Form } from '@/types';

interface StatusBarProps {
  form: Form | null;
  tab: string;
}

export function StatusBar({ form }: StatusBarProps) {
  const qCount = form?.questions?.length ?? 0;
  const rCount = form?.logic?.length ?? 0;

  return (
    <div className="statusbar">
      <span>
        <span className="dot" />
        Connecté
      </span>
      <span className="sep" />
      <span>{qCount} question{qCount !== 1 ? 's' : ''}</span>
      <span className="sep" />
      <span>{rCount} règle{rCount !== 1 ? 's' : ''}</span>
      <span className="sep" />
      <span>auto-save activé</span>
      <span className="spacer" />
      <span>
        <kbd>?</kbd> Raccourcis
      </span>
      <span>
        <kbd>⌘K</kbd> Commandes
      </span>
    </div>
  );
}
