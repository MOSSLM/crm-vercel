'use client';

interface ProgressBarProps {
  pct: number;      // 0-100
  current: number;
  total: number;
  show: boolean;
}

export function ProgressBar({ pct, current, total, show }: ProgressBarProps) {
  return (
    <div className="pv-progress">
      <div className="fill" style={{ width: `${pct}%` }} />
      {show && <span className="meta">{current} / {total}</span>}
    </div>
  );
}
