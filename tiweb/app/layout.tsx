import type { Metadata } from "next";
import { IBM_Plex_Sans, Saira_Semi_Condensed } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";
import { SettingsProvider } from "@/lib/settings";
import { LANDING, SITE_URL } from "@/lib/landing";
import { SITE } from "@/lib/site";

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

/* ~155 caratteri: oltre, Google taglia lo snippet */
const DESCRIPTION =
  "Free second-screen companion for Terra Invicta: reads your save in the browser and " +
  "compares nations, councilors, missions and techs. No cheats, no uploads.";

/* il nome da solo Google tende a riscriverlo: il titolo dice anche cos'e' */
const TITLE = "Terra Invicta Companion: second-screen save dashboard";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Terra Invicta Companion" },
  description: DESCRIPTION,
  robots: "index, follow, max-image-preview:large",
  applicationName: "Terra Invicta Companion",
  authors: [{ name: SITE.author }],
  /* senza salvataggio ogni scheda mostra la stessa presentazione: una sola
     pagina da indicizzare, le altre rimandano qui */
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Terra Invicta Companion",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_GB",
    alternateLocale: ["it_IT"],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/* Dati strutturati per motori di ricerca e LLM: cos'e' e le domande della
   presentazione, in inglese come l'HTML statico. */
const L = LANDING.en;
const AUTHOR = {
  "@type": "Person",
  "@id": `${SITE_URL}/#author`,
  name: SITE.author,
  url: `https://github.com/${SITE.author}`,
  sameAs: [`https://github.com/${SITE.author}`, SITE.repo],
};
const JSON_LD = JSON.stringify([
  {
    // il nome del sito che Google mostra sopra il risultato
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "Terra Invicta Companion",
    url: `${SITE_URL}/`,
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}/#author` },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE_URL}/#app`,
    name: "Terra Invicta Companion",
    url: SITE_URL,
    description: DESCRIPTION,
    applicationCategory: "GameApplication",
    operatingSystem: "Windows, macOS, Linux (Chrome or Edge)",
    browserRequirements: "Requires the File System Access API (Chrome or Edge on desktop)",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    inLanguage: ["en", "it"],
    featureList: L.features.map((f) => `${f.title}: ${f.text}`),
    author: AUTHOR,
    sameAs: [SITE.repo],
    about: { "@type": "VideoGame", name: "Terra Invicta", author: { "@type": "Organization", name: "Pavonis Interactive" } },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: L.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
]).replace(/</g, "\u003c");

/* Decide prima dell'idratazione se il motore gira nel browser, con la stessa
   regola di lib/engine.ts (engineMode): cosi' la schermata d'avvio c'e' dal
   primo fotogramma invece di comparire dopo che la pagina si e' vista.
   (LOCKED_ENGINE non si importa da li': in un server component un modulo
   "use client" arriva come riferimento, non come valore.) */
const LOCKED_ENGINE = ["browser", "server"].includes(process.env.NEXT_PUBLIC_ENGINE ?? "")
  ? process.env.NEXT_PUBLIC_ENGINE : "";
const ENGINE_MODE_SCRIPT = `try{var m=${JSON.stringify(LOCKED_ENGINE)};
if(!m){localStorage.removeItem("ti.engine");
var q=new URLSearchParams(location.search).get("engine");
if(q==="browser"||q==="server")sessionStorage.setItem("ti.engine",q);
m=sessionStorage.getItem("ti.engine")||
(["localhost","127.0.0.1"].indexOf(location.hostname)>=0?"server":"browser")}
document.documentElement.dataset.engine=m}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plex.variable} ${saira.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENGINE_MODE_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      </head>
      {/* le estensioni del browser (es. ColorZilla: cz-shortcut-listen) aggiungono
          attributi al body prima di React: non e' un errore nostro */}
      <body suppressHydrationWarning>
        <SettingsProvider>
          <Shell>{children}</Shell>
        </SettingsProvider>
      </body>
    </html>
  );
}
