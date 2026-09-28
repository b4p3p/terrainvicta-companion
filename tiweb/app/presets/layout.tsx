import type { Metadata } from "next";

// la pagina e' "use client": il titolo della scheda sta qui
export const metadata: Metadata = { title: "Presets" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
