"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { authedFetch } from "@/utils/authedFetch";
import { formatDate, type EmailLog } from "./emailTypes";

interface Props {
  contactId?: string;
  entrepriseId?: number;
  refreshKey: number;
}

export function EmailHistory({ contactId, entrepriseId, refreshKey }: Props) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (contactId) params.set("contact_id", contactId);
      else if (entrepriseId) params.set("entreprise_id", String(entrepriseId));
      const res = await authedFetch(`/api/email/logs?${params}`);
      const json = await res.json();
      setLogs(json.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [contactId, entrepriseId, refreshKey]);

  return (
    <div className="flex w-72 shrink-0 flex-col border-l">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Historique</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={load}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="space-y-2 p-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Aucun email envoyé{(contactId || entrepriseId) ? " pour cette sélection" : ""}
          </div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id} className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <span className="line-clamp-2 text-xs font-medium leading-tight">{log.subject}</span>
                  {log.status === "sent" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{log.to_email}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(log.sent_at)}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
