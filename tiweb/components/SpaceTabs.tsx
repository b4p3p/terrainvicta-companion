"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettings } from "@/lib/settings";

/** Sotto-schede di Spazio: stesso spigolo vivo della navigazione principale, più piccole. */
export function SpaceTabs() {
  const { t } = useSettings();
  const path = usePathname();
  const tabs = [
    { href: "/space", label: t.space.tabHabs },
    { href: "/space/mining", label: t.tabs.mining },
  ];
  return (
    <nav className="flex flex-wrap border-b border-edge mb-4 -mt-1">
      {tabs.map((tab) => {
        const active = path === tab.href;
        return (
          <Link key={tab.href} href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`display text-[11.5px] uppercase tracking-[.07em]
              px-3.5 h-7 flex items-center border-b-2 transition-colors
              ${active ? "text-ink border-b-accent" : "text-dim hover:text-ink border-b-transparent"}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
