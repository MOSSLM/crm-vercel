"use client";

import React from "react";

interface PanZoomOptions {
  initialPan?: { x: number; y: number };
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
}

export function useCanvasPanZoom({
  initialPan = { x: 60, y: 60 },
  initialScale = 1,
  minScale = 0.15,
  maxScale = 2,
}: PanZoomOptions = {}) {
  const [pan, setPan] = React.useState(initialPan);
  const [scale, setScale] = React.useState(initialScale);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isPanning = React.useRef(false);
  const lastPos = React.useRef({ x: 0, y: 0 });
  const spaceHeld = React.useRef(false);

  // Space key for pan mode
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        spaceHeld.current = true;
        if (containerRef.current) containerRef.current.style.cursor = "grab";
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
        isPanning.current = false;
        if (containerRef.current) containerRef.current.style.cursor = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Non-passive wheel event for zoom
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.min(maxScale, Math.max(minScale, s * delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minScale, maxScale]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || spaceHeld.current) {
      isPanning.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      if (containerRef.current) containerRef.current.style.cursor = "grabbing";
      e.preventDefault();
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan((p) => ({ x: p.x + e.clientX - lastPos.current.x, y: p.y + e.clientY - lastPos.current.y }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = () => {
    isPanning.current = false;
    if (containerRef.current) {
      containerRef.current.style.cursor = spaceHeld.current ? "grab" : "";
    }
  };

  const resetView = () => {
    setPan(initialPan);
    setScale(initialScale);
  };

  return { pan, scale, containerRef, onMouseDown, onMouseMove, onMouseUp, resetView };
}
