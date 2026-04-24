'use client';

import React from 'react';
import type { AuditContent } from '@/types';
import { AuditPage1 } from './audit/AuditPage1';
import { AuditPage2 } from './audit/AuditPage2';
import { AuditPage3 } from './audit/AuditPage3';
import { AuditPage4 } from './audit/AuditPage4';
import { AuditPage5 } from './audit/AuditPage5';
import { AuditPage6 } from './audit/AuditPage6';

interface Props {
  content: AuditContent;
  logoUrl?: string;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
}

export function AuditPreview({ content, logoUrl, activeField, onFieldClick }: Props) {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <AuditPage1 content={content} logoUrl={logoUrl} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <AuditPage2 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <AuditPage3 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <AuditPage4 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <AuditPage5 content={content} activeField={activeField} onFieldClick={onFieldClick} />
      <div style={{ height: 24, background: '#1a1a1e' }} />
      <AuditPage6 content={content} activeField={activeField} onFieldClick={onFieldClick} />
    </div>
  );
}
