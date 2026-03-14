"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type SectionTabItem = {
  label: string;
  href: string;
  activeMatch?: (pathname: string) => boolean;
};

type SectionTabsNavProps = {
  items: SectionTabItem[];
};

export function SectionTabsNav({ items }: SectionTabsNavProps) {
  const pathname = usePathname();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const scrollBy = (direction: "left" | "right") => {
    const element = containerRef.current;
    if (!element) return;
    const delta = direction === "left" ? -220 : 220;
    element.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative flex items-center px-2 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 h-8 w-8 shrink-0 md:hidden"
          onClick={() => scrollBy("left")}
          aria-label="Faire défiler vers la gauche"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div
          ref={containerRef}
          className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto py-2"
        >
          {items.map((item) => {
            const active = item.activeMatch
              ? item.activeMatch(pathname)
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-1 h-8 w-8 shrink-0 md:hidden"
          onClick={() => scrollBy("right")}
          aria-label="Faire défiler vers la droite"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default SectionTabsNav;
