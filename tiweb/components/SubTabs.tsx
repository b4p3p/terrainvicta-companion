"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import { YassIcon } from "@/components/YassIcon";

/** Sotto-schede di una sezione: stesso spigolo vivo della navigazione
    principale, più piccole. */
export function SubTabs({ tabs }: { tabs: { href: string; label: ReactNode }[] }) {
  // l'export statico serve /space/mining/: la barra finale non conta
  const path = usePathname().replace(/(.)\/$/, "$1");
  return (
    <nav className="flex flex-wrap border-b border-edge mb-4 -mt-1">
      {tabs.map((tab) => {
        const active = path === tab.href;
        return (
          <Link key={tab.href} href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`display text-[11.5px] uppercase tracking-[.07em]
              px-3.5 h-7 flex items-center gap-1.5 border-b-2 transition-colors
              ${active ? "text-ink border-b-accent" : "text-dim hover:text-ink border-b-transparent"}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SpaceTabs() {
  const { t } = useSettings();
  return <SubTabs tabs={[
    { href: "/space", label: t.space.tabHabs },
    { href: "/space/mining", label: t.tabs.mining },
  ]} />;
}

export function NationTabs() {
  const { t } = useSettings();
  return <SubTabs tabs={[
    { href: "/nations", label: t.tabs.nations },
    { href: "/nations/yass", label: <><YassIcon size={12} />YASS</> },
  ]} />;
}
