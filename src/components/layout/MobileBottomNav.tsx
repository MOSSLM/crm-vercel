"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TOP_CATEGORIES, getCategoryFromPath } from "./navigation";

export function MobileBottomNav() {
  const pathname = usePathname();
  const activeCategory = getCategoryFromPath(pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 px-1 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-1 backdrop-blur md:hidden">
      <ul className="grid grid-cols-5 gap-1">
        {TOP_CATEGORIES.map((item) => {
          const active = activeCategory === item.key;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center rounded-lg px-1 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="mb-0.5 h-4 w-4" />
                <span className="truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileBottomNav;
