import type { Metadata } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import { SettingsProvider } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Terra Invicta Companion",
  description: "Companion di partita: allerte, consiglio, missioni, nazioni.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <SettingsProvider>
          <Shell>{children}</Shell>
        </SettingsProvider>
      </body>
    </html>
  );
}
