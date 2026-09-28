import type { Metadata } from "next";

// prova di fattibilita', fuori dal menu: non va nei motori di ricerca
export const metadata: Metadata = { title: "Prova cartella", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
