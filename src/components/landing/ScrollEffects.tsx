"use client";

import { useEffect } from "react";

export default function ScrollEffects() {
  useEffect(() => {
    const nav = document.getElementById("sama-nav");
    const cloud = document.getElementById("sama-hero-clouds");

    const onScroll = () => {
      if (!nav) return;
      nav.classList.toggle("scrolled", window.scrollY > 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const cloudTimer = window.setTimeout(() => {
      cloud?.classList.add("loaded");
    }, 100);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".sama-landing .fade-up").forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(cloudTimer);
      observer.disconnect();
    };
  }, []);

  return null;
}
