"use client";

import { usePathname } from "next/navigation";
import { SectionTabsNav } from "./SectionTabsNav";
import { getCategoryFromPath, getTopTabsForCategory } from "./navigation";

export function TopSubNav() {
  const pathname = usePathname();
  const category = getCategoryFromPath(pathname);
  const items = getTopTabsForCategory(category);

  return <SectionTabsNav items={items.map((item) => ({ label: item.title, href: item.href }))} />;
}

export default TopSubNav;
