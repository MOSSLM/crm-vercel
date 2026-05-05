"use client";

import React from "react";
import type { SectionAnimation } from "@/types";

interface AnimatedSectionProps {
  animation?: SectionAnimation;
  children: React.ReactNode;
  className?: string;
}

const ANIMATION_CLASSES: Record<SectionAnimation, string> = {
  none: "",
  "fade-in": "sb-anim-fade-in",
  "slide-up": "sb-anim-slide-up",
  "slide-in-left": "sb-anim-slide-in-left",
  "slide-in-right": "sb-anim-slide-in-right",
};

export default function AnimatedSection({ animation = "none", children, className }: AnimatedSectionProps) {
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

  const animClass = ANIMATION_CLASSES[animation];

  return (
    <div
      ref={ref}
      className={[
        className,
        animClass ? `${animClass} ${visible ? `${animClass}--visible` : ""}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
