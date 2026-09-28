import { ImageResponse } from "next/og";
import { LANDING } from "@/lib/landing";

/* L'anteprima che compare incollando il link su Reddit, Discord, Steam.
   Generata in build (export statico), coi colori di globals.css: satori non
   legge le variabili CSS. */

export const dynamic = "force-static";
export const alt = "Terra Invicta Companion — a second-screen dashboard for Terra Invicta";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = { void: "#0b1114", panel: "#172227", edge: "#32434f", ink: "#d6e2e8", dim: "#7f95a1", accent: "#73a1e6" };

export default function Image() {
  const l = LANDING.en;
  const chips = l.features.slice(0, 7).map((f) => f.title);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", padding: "0 90px", color: C.ink, backgroundColor: C.void,
          backgroundImage: `linear-gradient(${C.edge}55 1px, transparent 1px), linear-gradient(90deg, ${C.edge}55 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 12, color: C.dim }}>TERRA INVICTA</div>
        <div style={{ display: "flex", fontSize: 104, letterSpacing: 10, color: C.accent, fontWeight: 700, lineHeight: 1.05 }}>
          COMPANION
        </div>
        <div style={{ display: "flex", width: 160, height: 4, backgroundColor: C.accent, margin: "26px 0 30px" }} />
        <div style={{ display: "flex", fontSize: 40, lineHeight: 1.3 }}>{l.tagline}</div>
        <div style={{ display: "flex", fontSize: 26, color: C.dim, marginTop: 12 }}>
          Reads your save in the browser · only what the game already shows you
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 44 }}>
          {chips.map((c) => (
            <div key={c} style={{
              display: "flex", fontSize: 22, padding: "8px 16px", backgroundColor: C.panel,
              borderLeft: `4px solid ${C.accent}`,
            }}>{c}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
