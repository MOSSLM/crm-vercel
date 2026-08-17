"use client";

import { useEffect, useState } from "react";
import { ARCHITECTURE_DIAGRAMS } from "@/lib/architecture/diagrams";
import { MermaidDiagram } from "./MermaidDiagram";

/**
 * L'architecture voulue, en schémas — la page qui rend
 * src/lib/architecture/diagrams.ts. Rien n'est écrit en dur ici : ajouter un
 * diagramme à ce fichier suffit à le faire apparaître, sommaire compris.
 */
export function ArchitecturePage() {
  const [active, setActive] = useState<string>(ARCHITECTURE_DIAGRAMS[0]?.id ?? "");

  // Le sommaire suit la lecture : le chip actif est celui de la section visible.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-88px 0px -70% 0px", threshold: 0 },
    );

    for (const d of ARCHITECTURE_DIAGRAMS) {
      const el = document.getElementById(d.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">L&apos;architecture voulue</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
          Les {ARCHITECTURE_DIAGRAMS.length} schémas qui décrivent la chaîne complète, des sources
          brutes jusqu&apos;à la vente. Ils sont versionnés dans le dépôt&nbsp;:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">
            src/lib/architecture/diagrams.ts
          </code>
          . Modifier ce fichier met la page à jour.
        </p>
      </header>

      <nav
        aria-label="Sommaire des schémas"
        className="sticky top-0 z-20 -mx-6 mb-8 border-b border-border bg-background/85 px-6 py-2.5 backdrop-blur"
      >
        <ul className="flex flex-wrap gap-1.5">
          {ARCHITECTURE_DIAGRAMS.map((d, i) => (
            <li key={d.id}>
              <a
                href={`#${d.id}`}
                aria-current={active === d.id ? "true" : undefined}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active === d.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}
              >
                <span className="font-mono tabular-nums opacity-60">{i + 1}</span>
                {d.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        {ARCHITECTURE_DIAGRAMS.map((d, i) => (
          <section key={d.id} id={d.id} className="scroll-mt-24">
            <div className="mb-3">
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="text-lg font-semibold tracking-tight">{d.title}</h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {d.summary}
              </p>
            </div>
            <MermaidDiagram source={d.source} title={d.title} />
          </section>
        ))}
      </div>
    </div>
  );
}
