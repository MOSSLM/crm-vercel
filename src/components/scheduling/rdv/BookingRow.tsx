"use client";

/**
 * Rangée de réservation — portage de `BkRow` (rdv-screens-a.jsx) :
 * bloc date/heure/durée, invité + type, méta (statut, source, hôte) et
 * actions contextuelles.
 */

import { Av, Btn, Pill, RV_LOC, ST_LB, fmtDur } from "./atoms";
import { Icon } from "./Icon";
import type { BookingWithHost } from "@/lib/scheduling/client";
import {
  dayLabel,
  displayStatus,
  durationOf,
  hhmm,
  hostName,
  sourceIcon,
  sourceTitle,
} from "./shared";

export interface BookingRowProps {
  b: BookingWithHost;
  sel?: string | null;
  onSel?: (id: string) => void;
  compact?: boolean;
  showHost?: boolean;
  working?: boolean;
  onConfirm?: (b: BookingWithHost) => void;
  onDecline?: (b: BookingWithHost) => void;
  onReschedule?: (b: BookingWithHost) => void;
  typeColor?: string | null;
}

export default function BookingRow({
  b,
  sel,
  onSel,
  compact,
  showHost = true,
  working,
  onConfirm,
  onDecline,
  onReschedule,
  typeColor,
}: BookingRowProps) {
  const st = displayStatus(b);
  const [lb, kind] = ST_LB[st] ?? ST_LB.confirmed;
  const loc = RV_LOC[b.location_type] ?? RV_LOC.custom;

  return (
    <div
      className={`rv-bk ${st === "cancelled" ? "cancel" : ""}`.trim()}
      data-st={st}
      aria-selected={sel === b.id}
      onClick={() => onSel?.(b.id)}
    >
      <div className="when">
        <div className="d">{dayLabel(b.start_at)}</div>
        <div className="h">{hhmm(b.start_at)}</div>
        <div className="dur">{fmtDur(durationOf(b))}</div>
      </div>

      <div className="who">
        <div className="nm">
          {b.invitee_name}
          <i
            style={{
              width: 7,
              height: 7,
              borderRadius: 2,
              background: typeColor || "var(--accent)",
            }}
          />
          <span style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 400 }}>
            {b.event_title}
          </span>
        </div>
        <div className="sb">
          <span style={{ fontFamily: "var(--font-mono)" }}>{b.invitee_email}</span>
          <span className="dv" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name={loc.ic} className="ico-xs" />
            {loc.lb}
          </span>
          {b.invitee_phone ? (
            <>
              <span className="dv" />
              <span style={{ fontFamily: "var(--font-mono)" }}>{b.invitee_phone}</span>
            </>
          ) : null}
          {b.cancellation_reason ? (
            <>
              <span className="dv" />
              <span style={{ color: "var(--danger)" }}>{b.cancellation_reason}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="meta">
        {!compact && (
          <Pill kind={kind} dot>
            {lb}
          </Pill>
        )}
        <span className={`rv-src ${b.source}`} title={sourceTitle(b.source)}>
          <Icon name={sourceIcon(b.source)} className="ico-xs" />
        </span>
        {showHost ? <Av name={hostName(b)} size={24} /> : null}
      </div>

      <div className="acts" onClick={(e) => e.stopPropagation()}>
        {st === "pending" ? (
          <>
            <Btn
              kind="ok"
              size="xs"
              ic="check"
              disabled={working}
              onClick={() => onConfirm?.(b)}
            >
              Valider
            </Btn>
            <Btn kind="outline" size="xs" ic="x" disabled={working} onClick={() => onDecline?.(b)} />
          </>
        ) : st === "confirmed" ? (
          <>
            <Btn kind="outline" size="xs" ic="repeat" onClick={() => onReschedule?.(b)}>
              Reprogrammer
            </Btn>
            <Btn kind="outline" size="xs" ic="more" onClick={() => onSel?.(b.id)} />
          </>
        ) : (
          <Btn kind="outline" size="xs" ic="more" onClick={() => onSel?.(b.id)} />
        )}
      </div>
    </div>
  );
}
