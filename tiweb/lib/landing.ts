/* Il testo che spiega il companion a chi non l'ha mai visto: lo legge chi
   arriva da un link prima di scegliere la cartella, e lo leggono i motori di
   ricerca e gli LLM, che senza salvataggio non vedrebbero altro che la
   schermata d'avvio. Modulo senza React: lo usano anche il layout (JSON-LD,
   sempre in inglese) e public/llms.txt, da tenere allineato a mano.

   Ogni affermazione qui deve reggere sul codice: niente funzioni che non ci
   sono, niente promesse che il gioco non mantiene. */

import type { UiLang } from "./i18n";

export const SITE_URL = "https://terrainvicta-companion.b4p3p.it";

export interface Landing {
  tagline: string;
  lead: string;
  featuresTitle: string;
  features: { title: string; text: string }[];
  howTitle: string;
  /** l'ultimo passo e' l'invito alla demo: Landing ci aggiunge il pulsante */
  how: string[];
  faqTitle: string;
  faq: { q: string; a: string }[];
}

const en: Landing = {
  tagline: "A second-screen dashboard for Terra Invicta",
  lead:
    "Terra Invicta spreads what you need across dozens of screens you can't open together. " +
    "The companion reads the save the game writes, refreshes on every autosave, and puts nations, " +
    "councilors, missions and projects side by side: comparisons, turn-to-turn changes, " +
    "what a recruit would add to your council. It only uses what the game already shows you.",
  featuresTitle: "What it shows",
  features: [
    { title: "Alerts", text: "Rules checked on every save: what changed since the previous one and what needs attention now." },
    { title: "Council", text: "Attribute coverage, the missions nobody on your council can run, and which recruit candidates would cover them." },
    { title: "Missions", text: "The real attacking and defending factors of each mission, read from the game templates, and targets ranked with the raw values next to the score." },
    { title: "Nations", text: "Trends over time and a detail view for every nation, with not-yet-born separatist states filtered out." },
    { title: "YASS", text: "Yet Another Spreadsheet Simulator: the game's priorities panel with clickable pips, and spreadsheet-style nation calculators on the game's own formulas: cohesion, unrest, annexation, where the nation will be in 1 to 20 years with investment points growing with GDP and Mission Control up to its cap, and what splitting a nation does to IP and control point cost." },
    { title: "Factions", text: "Rival factions and their councilors compared only on what your intel unlocks, with the game's own intel thresholds." },
    { title: "Space", text: "Visible habitats, Earth orbits with free slots, buildable modules and when you can afford them; mining sites ranked by yield and the orgs with space bonuses." },
    { title: "Technologies", text: "What each available technology unlocks for your faction, with the unlock chance shown by the Research screen." },
    { title: "Presets", text: "Custom priority presets prepared as files to copy into the game: no mods, so achievements stay enabled." },
    { title: "History", text: "Every save archived: differences between turns, goals and notes, exportable to another browser." },
    { title: "14 languages", text: "Mission, nation and project names in all 14 languages of the game, read from its official localization." },
  ],
  howTitle: "How it works",
  how: [
    "Open this page in Chrome or Edge on the PC where you play.",
    "Choose My Games or TerraInvicta inside Documents: the companion finds the Saves folder by itself.",
    "Keep it on a second monitor. It reloads by itself every time the game saves.",
    "The first visit downloads about 13 MB (Python compiled to WebAssembly); after that it starts from the browser cache.",
    "Just curious? The demo opens a real campaign of the author's, in any browser.",
  ],
  faqTitle: "Questions",
  faq: [
    {
      q: "Is it a cheat?",
      a: "No. It is a reading tool: it shows only what the game already lets you see. Councilors' real loyalty, intel you haven't gathered and rival missions during the mission phase stay hidden. When a number is our own computation, like a target score, it says so and shows the raw values next to it.",
    },
    {
      q: "Are my saves uploaded anywhere?",
      a: "No. The companion runs entirely in your browser and reads the saves from the folder you choose. No account, no tracking scripts. History and notes stay in the browser; you can export them.",
    },
    {
      q: "Does it change my game or my saves?",
      a: "It never writes to saves. Priority presets are files you copy into the game yourself; they don't use the mod system, so achievements are not disabled.",
    },
    {
      q: "Which browsers work?",
      a: "Chrome and Edge on desktop: reading a folder of your PC needs the File System Access API, which Firefox and Safari don't offer. The demo works in any browser.",
    },
    {
      q: "Is it free? Is it official?",
      a: "Free, with no ads; donations are optional. It is a fan project, not affiliated with Pavonis Interactive or Hooded Horse.",
    },
  ],
};

const it: Landing = {
  tagline: "Una dashboard da secondo monitor per Terra Invicta",
  lead:
    "Terra Invicta sparge quello che ti serve su decine di schermate che non si possono aprire insieme. " +
    "Il companion legge il salvataggio che scrive il gioco, si aggiorna a ogni autosave e mette " +
    "nazioni, consiglieri, missioni e progetti uno accanto all'altro: confronti, differenze fra un " +
    "turno e l'altro, cosa porterebbe un candidato al tuo consiglio. Usa solo quello che il gioco ti mostra già.",
  featuresTitle: "Cosa mostra",
  features: [
    { title: "Allerte", text: "Regole controllate a ogni salvataggio: cosa è cambiato dal precedente e cosa richiede attenzione adesso." },
    { title: "Consiglio", text: "Copertura degli attributi, le missioni che nessuno nel consiglio sa fare e quali candidati le coprirebbero." },
    { title: "Missioni", text: "I fattori veri di attacco e difesa di ogni missione, letti dai template del gioco, e i bersagli ordinati coi valori grezzi accanto al punteggio." },
    { title: "Nazioni", text: "Andamento nel tempo e scheda di dettaglio per ogni nazione, senza gli stati separatisti non ancora nati." },
    { title: "YASS", text: "Yet Another Spreadsheet Simulator: il pannello Priorità del gioco coi pallini cliccabili e calcolatori di nazione in stile foglio di calcolo, sulle formule del gioco: coesione, disordini, annessione, dove sarà la nazione fra 1 e 20 anni coi punti di investimento che crescono col PIL e il Controllo missioni fino al tetto, e cosa fa dividere una nazione a IP e costo dei punti di controllo." },
    { title: "Fazioni", text: "Le fazioni rivali e i loro consiglieri confrontati solo su ciò che la tua intel sblocca, con le soglie del gioco." },
    { title: "Spazio", text: "Habitat visibili, orbite terrestri coi posti liberi, moduli costruibili e quando te li puoi permettere; siti di estrazione ordinati per resa e org con bonus spaziali." },
    { title: "Tecnologie", text: "Cosa sblocca ogni tecnologia avviabile per la tua fazione, con la probabilità mostrata dalla schermata Ricerca." },
    { title: "Preset", text: "Preset di priorità personali preparati come file da copiare nel gioco: niente mod, gli achievement restano attivi." },
    { title: "Storico", text: "Ogni salvataggio archiviato: differenze fra turni, obiettivi e note, esportabili in un altro browser." },
    { title: "14 lingue", text: "Nomi di missioni, nazioni e progetti in tutte le 14 lingue del gioco, dalla sua localizzazione ufficiale." },
  ],
  howTitle: "Come funziona",
  how: [
    "Apri questa pagina con Chrome o Edge sul PC dove giochi.",
    "In Documenti scegli My Games o TerraInvicta: alla cartella Saves ci arriva da solo.",
    "Tienilo sul secondo monitor. Si ricarica da solo ogni volta che il gioco salva.",
    "La prima visita scarica circa 13 MB (Python compilato in WebAssembly); poi parte dalla cache del browser.",
    "Solo curioso? La demo apre una partita vera dell'autore, in qualunque browser.",
  ],
  faqTitle: "Domande",
  faq: [
    {
      q: "È un cheat?",
      a: "No. È uno strumento di lettura: mostra solo quello che il gioco ti fa già vedere. La lealtà reale dei consiglieri, l'intel che non hai e le missioni rivali durante la fase missioni restano nascoste. Quando un numero è un'elaborazione nostra, come il punteggio di un bersaglio, lo dice e mostra accanto i valori grezzi.",
    },
    {
      q: "I miei salvataggi vengono caricati da qualche parte?",
      a: "No. Il companion gira tutto nel tuo browser e legge i salvataggi dalla cartella che scegli. Niente account, niente script di tracciamento. Storico e note restano nel browser; puoi esportarli.",
    },
    {
      q: "Modifica il gioco o i salvataggi?",
      a: "Non scrive mai nei salvataggi. I preset di priorità sono file che copi tu nel gioco; non usano il sistema delle mod, quindi gli achievement non si disattivano.",
    },
    {
      q: "Con quali browser funziona?",
      a: "Chrome ed Edge su desktop: leggere una cartella del PC richiede la File System Access API, che Firefox e Safari non offrono. La demo funziona in qualunque browser.",
    },
    {
      q: "È gratis? È ufficiale?",
      a: "Gratis e senza pubblicità; le donazioni sono facoltative. È un progetto amatoriale, non affiliato a Pavonis Interactive né a Hooded Horse.",
    },
  ],
};

export const LANDING: Record<UiLang, Landing> = { it, en };
