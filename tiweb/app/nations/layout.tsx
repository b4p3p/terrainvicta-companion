import type { Metadata } from "next";
import { NationTabs } from "@/components/SubTabs";

// la pagina e' "use client": il titolo della scheda sta qui
export const metadata: Metadata = { title: "Nations" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><NationTabs />{children}</>;
}
