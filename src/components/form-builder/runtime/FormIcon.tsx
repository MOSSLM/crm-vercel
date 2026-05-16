'use client';

import { ICON_SLUG_TO_LUCIDE } from '@/lib/form-builder/icons';
import * as LucideIcons from 'lucide-react';

export function FormIcon({ name, className }: { name: string; className?: string }) {
  const lucideName = ICON_SLUG_TO_LUCIDE[name] ?? 'Circle';
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; size?: number }>>)[lucideName];
  if (!Icon) return null;
  return <Icon className={className} size={16} />;
}
