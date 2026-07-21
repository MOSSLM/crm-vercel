"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/utils/authedFetch";
import { formatDate, type EmailLog } from "@/components/messaging/emailTypes";
import { Mail, MessageCircle, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Compact email + WhatsApp exchange history for a company, shown on the agent's
 * company detail page. Reads /api/agent/history (no time filter), so exchanges
 * made before the company was assigned to the agent are visible too.
 */
export function AgentExchangeHistory({ entrepriseId }: { entrepriseId: number }) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await authedFetch(`/api/agent/history?entreprise_id=${entrepriseId}`);
        const json = await res.json().catch(() => ({}));
        if (active) setLogs(res.ok ? (json.logs ?? []) : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [entrepriseId]);

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (logs.length === 0)
    return <p className="text-sm text-muted-foreground">Aucun échange enregistré pour l’instant.</p>;

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const isWa = log.channel === "whatsapp";
        return (
          <div key={log.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
            {isWa ? (
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" />
            ) : (
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {isWa ? log.body_text?.slice(0, 100) || "Message WhatsApp" : log.subject}
                </span>
                {log.status === "sent" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {isWa ? "WhatsApp" : "Email"}
                {log.to_email ? ` · ${log.to_email}` : log.to_name ? ` · ${log.to_name}` : ""} ·{" "}
                {formatDate(log.sent_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
