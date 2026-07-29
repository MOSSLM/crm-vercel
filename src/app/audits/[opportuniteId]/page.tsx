'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { AuditWorkspace } from '@/components/audits/AuditWorkspace';

export default function AuditPage() {
  const { opportuniteId } = useParams<{ opportuniteId: string }>();
  return (
    <AppLayout>
      {opportuniteId ? <AuditWorkspace opportuniteId={opportuniteId} /> : null}
    </AppLayout>
  );
}
