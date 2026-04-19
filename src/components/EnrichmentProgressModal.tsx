"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Progress } from './ui/progress';
import { CheckCircle2, XCircle, Globe, Loader2, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { cn } from './ui/utils';

export interface EnrichmentLogEntry {
  opportunite_id: string;
  company_name: string;
  project_id: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'no_website';
  message?: string;
}

interface EnrichmentProgressModalProps {
  open: boolean;
  logs: EnrichmentLogEntry[];
  current: number;
  total: number;
  isComplete: boolean;
  onClose: () => void;
}

function StatusIcon({ status }: { status: EnrichmentLogEntry['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case 'no_website':
      return <Globe className="h-4 w-4 text-muted-foreground shrink-0" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

function statusLabel(status: EnrichmentLogEntry['status']) {
  switch (status) {
    case 'running': return 'En cours…';
    case 'success': return 'Enrichi';
    case 'error': return 'Erreur';
    case 'no_website': return 'Site introuvable';
    default: return 'En attente';
  }
}

export function EnrichmentProgressModal({
  open,
  logs,
  current,
  total,
  isComplete,
  onClose,
}: EnrichmentProgressModalProps) {
  const progressPct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && isComplete) onClose(); }}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => { if (!isComplete) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            )}
            {isComplete ? 'Enrichissement terminé' : 'Enrichissement en cours…'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{isComplete ? 'Terminé' : `Traitement en cours`}</span>
              <span className="font-medium tabular-nums">{current} / {total}</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          <ScrollArea className="h-[280px] pr-2">
            <div className="space-y-1">
              {logs.map((entry) => (
                <div
                  key={entry.project_id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                    entry.status === 'running' && 'bg-blue-50 dark:bg-blue-950/30',
                    entry.status === 'success' && 'bg-green-50 dark:bg-green-950/30',
                    entry.status === 'error' && 'bg-red-50 dark:bg-red-950/30',
                  )}
                >
                  <StatusIcon status={entry.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium leading-tight">{entry.company_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.message ?? statusLabel(entry.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {isComplete && (
            <Button onClick={onClose} className="w-full">
              Fermer
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
