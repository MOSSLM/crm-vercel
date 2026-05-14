"use client";

import React from "react";
import type { SectionAnimation } from "@/types";

interface AnimationFieldEditorProps {
  type?: SectionAnimation;
  duration?: number;
  delay?: number;
  easing?: string;
  /** Called with { type, duration, delay, easing } on any field change */
  onUpdate: (values: { type?: SectionAnimation; duration?: number; delay?: number; easing?: string }) => void;
}

const ANIMATION_OPTIONS: { value: SectionAnimation; label: string }[] = [
  { value: "none", label: "Aucune" },
  { value: "fade-in", label: "Fondu" },
  { value: "slide-up", label: "Glisser ↑" },
  { value: "slide-down", label: "Glisser ↓" },
  { value: "slide-in-left", label: "Glisser ←" },
  { value: "slide-in-right", label: "Glisser →" },
  { value: "zoom-in", label: "Zoom +" },
  { value: "zoom-out", label: "Zoom −" },
];

const EASING_OPTIONS = [
  { value: "ease-out", label: "Ease out (naturel)" },
  { value: "ease-in-out", label: "Ease in-out (symétrique)" },
  { value: "ease-in", label: "Ease in (accélération)" },
  { value: "linear", label: "Linear (constant)" },
  { value: "cubic-bezier(0.34,1.56,0.64,1)", label: "Spring (rebond)" },
];

export function AnimationFieldEditor({
  type = "none",
  duration = 600,
  delay = 0,
  easing = "ease-out",
  onUpdate,
}: AnimationFieldEditorProps) {
  return (
    <div className="space-y-4">
      {/* Type grid */}
      <div>
        <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest block mb-2">
          Type d&apos;animation
        </label>
        <div className="grid grid-cols-2 gap-1">
          {ANIMATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ type: opt.value, duration, delay, easing })}
              className={`px-2 py-1.5 text-[10px] rounded border transition-colors text-left ${
                type === opt.value
                  ? "bg-blue-500/20 border-blue-400/40 text-blue-300"
                  : "border-white/10 text-white/40 hover:bg-white/5 hover:text-white/60"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Duration slider — only visible when an animation is selected */}
      {type !== "none" && (
        <>
          <div>
            <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest flex justify-between mb-1">
              <span>Durée</span>
              <span className="font-mono text-white/50">{duration}ms</span>
            </label>
            <input
              type="range"
              min={100}
              max={2000}
              step={100}
              value={duration}
              onChange={(e) => onUpdate({ type, duration: +e.target.value, delay, easing })}
              className="w-full accent-blue-400"
            />
            <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
              <span>100ms</span>
              <span>2000ms</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest flex justify-between mb-1">
              <span>Délai</span>
              <span className="font-mono text-white/50">{delay}ms</span>
            </label>
            <input
              type="range"
              min={0}
              max={1000}
              step={50}
              value={delay}
              onChange={(e) => onUpdate({ type, duration, delay: +e.target.value, easing })}
              className="w-full accent-blue-400"
            />
            <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
              <span>0ms</span>
              <span>1000ms</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest block mb-1.5">
              Easing
            </label>
            <select
              value={easing}
              onChange={(e) => onUpdate({ type, duration, delay, easing: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded text-white/70 text-xs px-2 py-1.5 focus:outline-none focus:border-white/30"
            >
              {EASING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}
