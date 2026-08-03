'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { AuditWorkspace } from '@/components/audits/AuditWorkspace';

/**
 * Éditeur d'audit côté agent. Même composant que la page admin
 * (`/audits/[opportuniteId]`), monté dans la coque du portail agent : la page
 * admin passe par `AppLayout`, qui redirige un freelance vers son dashboard —
 * c'est ce qui faisait « sortir » l'agent du marketing pipeline dès qu'il
 * cliquait sur « Éditer l'audit ».
 *
 * L'accès aux données reste gardé par la RLS : un agent ne lit que ses
 * opportunités (`owner_id`), et la table `audits` est ouverte aux utilisateurs
 * authentifiés.
 */
export default function EspaceAgentAuditPage() {
  const { opportuniteId } = useParams<{ opportuniteId: string }>();
  if (!opportuniteId) return null;
  return <AuditWorkspace opportuniteId={opportuniteId} />;
}
