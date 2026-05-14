"use client";

import React from "react";
import type { SectionAnimation } from "@/types";

interface AnimatedSectionProps {
  animation?: SectionAnimation;
  duration?: number;
  delay?: number;
  easing?: string;
  children: React.ReactNode;
  className?: string;
}

const INITIAL_STYLES: Record<SectionAnimation, React.CSSProperties> = {
  none: {},
  "fade-in": { opacity: 0 },
  "slide-up": { opacity: 0, transform: "translateY(32px)" },
  "slide-down": { opacity: 0, transform: "translateY(-32px)" },
  "slide-in-left": { opacity: 0, transform: "translateX(-40px)" },
  "slide-in-right": { opacity: 0, transform: "translateX(40px)" },
  "zoom-in": { opacity: 0, transform: "scale(0.92)" },
  "zoom-out": { opacity: 0, transform: "scale(1.08)" },
};

const VISIBLE_STYLES: React.CSSProperties = { opacity: 1, transform: "none" };

export default function AnimatedSection({
  animation = "none",
  duration = 600,
  delay = 0,
  easing = "ease-out",
  children,
  className,
}: AnimatedSectionProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(animation === "none");

  React.useEffect(() => {
    if (animation === "none") {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animation]);

  const initial = INITIAL_STYLES[animation] ?? {};
  const style: React.CSSProperties =
    animation === "none"
      ? {}
      : {
          ...(visible ? VISIBLE_STYLES : initial),
          transition: visible
            ? `opacity ${duration}ms ${easing} ${delay}ms, transform ${duration}ms ${easing} ${delay}ms`
            : "none",
          willChange: "opacity, transform",
        };

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
