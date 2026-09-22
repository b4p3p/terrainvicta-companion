import type { Metadata } from "next";
import { IBM_Plex_Sans, Saira_Semi_Condensed } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";
import { SettingsProvider } from "@/lib/settings";

/* Terra Invicta disegna la sua interfaccia con Arcon e CODE, nessuno dei due
   distribuito come webfont. Spedisce pero' anche IBM Plex Sans JP: Plex e'
   gia' nello stack del gioco, ed e' leggibile alle dimensioni dense che
   servono qui. Saira Semi Condensed regge titoli e intestazioni al posto di
   CODE, di cui condivide la costruzione squadrata. */
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

const saira = Saira_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-saira",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Terra Invicta Companion",
  description: "Companion di partita: allerte, consiglio, missioni, nazioni.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${plex.variable} ${saira.variable}`}>
      <body>
        <SettingsProvider>
          <Shell>{children}</Shell>
        </SettingsProvider>
      </body>
    </html>
  );
}
