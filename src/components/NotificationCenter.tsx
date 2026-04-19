"use client";

import React, { useState, useCallback } from 'react';
import { Bell, CheckCircle2, XCircle, Globe, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { cn } from './ui/utils';
import { getNotifications, type NotificationRecord } from '../utils/notificationsApi';
import type { EnrichmentLogEntry } from './EnrichmentProgressModal';

function StatusBadge({ status }: { status: NotificationRecord['status'] }) {
  if (status === 'success') {
    return <Badge variant="outline" className="border-green-300 text-green-700 dark:text-green-400 text-xs">Succès</Badge>;
  }
  if (status === 'partial') {
    return <Badge variant="outline" className="border-yellow-300 text-yellow-700 dark:text-yellow-400 text-xs">Partiel</Badge>;
  }
  return <Badge variant="outline" className="border-red-300 text-red-700 dark:text-red-400 text-xs">Erreur</Badge>;
}

function LogEntryRow({ entry }: { entry: EnrichmentLogEntry }) {
  const [showRaw, setShowRaw] = useState(false);
  const icon = entry.status === 'success'
    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
    : entry.status === 'error'
    ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
    : entry.status === 'no_website'
    ? <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    : <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;

  const showDetails = (entry.status === 'error' || entry.status === 'skipped') && Boolean(entry.rawData);

  return (
    <div className="py-1 text-xs">
      <div className="flex items-start gap-2">
        {icon}
        <div className="min-w-0 flex-1">
          <span className="font-medium">{entry.company_name}</span>
          {entry.message && <span className="text-muted-foreground"> — {entry.message}</span>}
          {showDetails && (
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="ml-2 text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {showRaw ? 'masquer' : 'détails bruts'}
            </button>
          )}
        </div>
      </div>
      {showRaw && Boolean(entry.rawData) && (
        <pre className="mt-1 ml-5.5 text-[10px] bg-muted rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
          {JSON.stringify(entry.rawData, null, 2)}
        </pre>
      )}
    </div>
  );
}

function NotificationItem({ notification }: { notification: NotificationRecord }) {
  const [expanded, setExpanded] = useState(false);
  const s = notification.summary;
  const date = new Date(notification.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <StatusBadge status={notification.status} />
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
          <p className="text-sm font-medium leading-tight truncate">{notification.title}</p>
          <p className="text-xs text-muted-foreground">
            {s.success > 0 && <span className="text-green-600 dark:text-green-400">{s.success} enrichi{s.success > 1 ? 's' : ''}</span>}
            {s.success > 0 && (s.errors > 0 || s.noWebsite > 0 || s.skipped > 0) && <span> · </span>}
            {s.noWebsite > 0 && <span>{s.noWebsite} sans site</span>}
            {s.noWebsite > 0 && (s.errors > 0 || s.skipped > 0) && <span> · </span>}
            {s.errors > 0 && <span className="text-red-500">{s.errors} erreur{s.errors > 1 ? 's' : ''}</span>}
            {s.errors > 0 && s.skipped > 0 && <span> · </span>}
            {s.skipped > 0 && <span className="text-muted-foreground">{s.skipped} ignoré{s.skipped > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {expanded && notification.logs.length > 0 && (
        <div className="ml-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2 space-y-0.5">
          {notification.logs.map((entry) => (
            <LogEntryRow key={entry.project_id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications(50);
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) loadNotifications();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 md:h-9 md:w-9">
          <Bell className="h-4 w-4" />
          {notifications.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Centre de notifications
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 py-3">
            {loading && (
              <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Aucune notification</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Les enrichissements apparaîtront ici
                </p>
              </div>
            )}

            {!loading && notifications.length > 0 && (
              <div className="space-y-1">
                {notifications.map((notif, idx) => (
                  <React.Fragment key={notif.id}>
                    <NotificationItem notification={notif} />
                    {idx < notifications.length - 1 && <Separator className="my-2" />}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
