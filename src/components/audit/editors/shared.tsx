import React from 'react';

export const labelStyle = 'text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1';
export const fieldGroupStyle = 'flex flex-col gap-1 mb-4';

export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={fieldGroupStyle}>
      <label className={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
