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

/* Decide prima dell'idratazione se il motore gira nel browser, con la stessa
   regola di lib/engine.ts (engineMode): cosi' la schermata d'avvio c'e' dal
   primo fotogramma invece di comparire dopo che la pagina si e' vista. */
const ENGINE_MODE_SCRIPT = `try{var q=new URLSearchParams(location.search).get("engine");
if(q==="browser"||q==="server")localStorage.setItem("ti.engine",q);
var m=localStorage.getItem("ti.engine")||${JSON.stringify(process.env.NEXT_PUBLIC_ENGINE ?? "")}||
(["localhost","127.0.0.1"].indexOf(location.hostname)>=0?"server":"browser");
document.documentElement.dataset.engine=m}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${plex.variable} ${saira.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENGINE_MODE_SCRIPT }} />
      </head>
      <body>
        <SettingsProvider>
          <Shell>{children}</Shell>
        </SettingsProvider>
      </body>
    </html>
  );
}
